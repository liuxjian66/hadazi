const $ = (selector) => document.querySelector(selector);
const adminPasswordKey = "hadaziAdminPassword";

let adminPassword = localStorage.getItem(adminPasswordKey) || "";
let adminUsers = [];
let adminPosts = [];
let adminMessages = [];

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;"
  }[char]));
}

function formatTime(value) {
  if (!value) return "未记录";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("zh-CN", { hour12: false });
}

async function adminApi(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "x-admin-password": adminPassword,
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(data?.error || `管理接口失败：${response.status}`);
  return data;
}

function setMessage(text, isError = false) {
  const box = $("#adminLoginMsg");
  if (!box) return;
  box.textContent = text || "";
  box.classList.toggle("error", isError);
}

function showApp() {
  $("#adminLogin")?.classList.add("hidden");
  $("#adminApp")?.classList.remove("hidden");
}

function showLogin() {
  $("#adminLogin")?.classList.remove("hidden");
  $("#adminApp")?.classList.add("hidden");
}

async function handleLogin(event) {
  event.preventDefault();
  adminPassword = $("#adminPassword").value.trim();
  if (!adminPassword) return setMessage("请输入管理员密码。", true);
  try {
    await adminApi("/api/admin/login", {
      method: "POST",
      body: JSON.stringify({ password: adminPassword })
    });
    localStorage.setItem(adminPasswordKey, adminPassword);
    showApp();
    await loadAdminData();
  } catch (error) {
    setMessage(error.message, true);
  }
}

async function loadAdminData() {
  try {
    const [summary, users, posts, messages] = await Promise.all([
      adminApi("/api/admin/summary"),
      adminApi("/api/admin/users"),
      adminApi("/api/admin/posts"),
      adminApi("/api/admin/messages")
    ]);
    adminUsers = users;
    adminPosts = posts;
    adminMessages = messages;
    renderSummary(summary);
    renderUsers();
    renderPosts();
    renderMessages();
  } catch (error) {
    alert(error.message);
    if (/密码|401/.test(error.message)) lockAdmin();
  }
}

function renderSummary(summary) {
  $("#adminSummary").innerHTML = `
    <article class="section admin-stat"><span>用户</span><strong>${summary.users}</strong></article>
    <article class="section admin-stat"><span>广场内容</span><strong>${summary.posts}</strong></article>
    <article class="section admin-stat"><span>消息</span><strong>${summary.messages}</strong></article>
    <article class="section admin-stat"><span>数据库</span><strong>${escapeHtml(summary.database)}</strong></article>
  `;
}

function renderUsers() {
  $("#adminUsers").innerHTML = adminUsers.length ? adminUsers.map((user) => `
    <tr>
      <td>
        <strong>${escapeHtml(user.nickname || user.id)}</strong>
        <small>${escapeHtml(user.id)}</small>
      </td>
      <td>${escapeHtml(user.phone || "未绑定")}</td>
      <td>${escapeHtml(user.mbti || "未设置")}</td>
      <td>${escapeHtml(user.school || "未设置")} / ${escapeHtml(user.major || "未填写")}</td>
      <td>动态 ${user.postCount || 0}，消息 ${user.messageCount || 0}</td>
      <td><button class="btn danger-btn" type="button" data-delete-user="${escapeHtml(user.id)}">删除用户</button></td>
    </tr>
  `).join("") : `<tr><td colspan="6">暂无用户</td></tr>`;
}

function renderPosts() {
  $("#adminPosts").innerHTML = adminPosts.length ? adminPosts.map((post) => `
    <article class="admin-item">
      <div>
        <strong>${escapeHtml(post.authorName || post.person?.nickname || "用户")}</strong>
        <span>${escapeHtml(post.id)} · ${formatTime(post.createdAt)}</span>
        <p>${escapeHtml(post.content || "无内容")}</p>
        <small>${(post.tags || []).map(escapeHtml).join("、") || "无标签"}</small>
      </div>
      <button class="btn danger-btn" type="button" data-delete-post="${escapeHtml(post.id)}">删除内容</button>
    </article>
  `).join("") : `<p class="empty">暂无用户广场内容。</p>`;
}

function renderMessages() {
  $("#adminMessages").innerHTML = adminMessages.length ? adminMessages.map((message) => `
    <article class="admin-item">
      <div>
        <strong>${escapeHtml(message.senderName || message.fromUserId || message.userId || "用户")}</strong>
        <span>${escapeHtml(message.id)} · ${formatTime(message.time)}</span>
        <p>${message.revoked ? "已撤回" : escapeHtml(message.text || (message.kind === "image" ? "图片消息" : "无内容"))}</p>
        <small>${escapeHtml(message.fromUserId || message.userId || "")} → ${escapeHtml(message.toUserId || message.personId || "")}</small>
      </div>
      <div class="admin-item-actions">
        <button class="btn ghost" type="button" data-revoke-message="${escapeHtml(message.id)}">撤回</button>
        <button class="btn danger-btn" type="button" data-delete-message="${escapeHtml(message.id)}">删除</button>
      </div>
    </article>
  `).join("") : `<p class="empty">暂无消息。</p>`;
}

async function deleteUser(userId) {
  if (!confirm("确认删除这个用户吗？该用户的动态、好友关系和聊天记录也会被清理。")) return;
  await adminApi(`/api/admin/users/${encodeURIComponent(userId)}`, { method: "DELETE" });
  await loadAdminData();
}

async function deletePost(postId) {
  if (!confirm("确认删除这条广场内容吗？")) return;
  await adminApi(`/api/admin/posts/${encodeURIComponent(postId)}`, { method: "DELETE" });
  await loadAdminData();
}

async function revokeMessage(messageId) {
  if (!confirm("确认撤回这条消息吗？")) return;
  await adminApi(`/api/admin/messages/${encodeURIComponent(messageId)}/revoke`, { method: "POST" });
  await loadAdminData();
}

async function deleteMessage(messageId) {
  if (!confirm("确认彻底删除这条消息吗？")) return;
  await adminApi(`/api/admin/messages/${encodeURIComponent(messageId)}`, { method: "DELETE" });
  await loadAdminData();
}

function lockAdmin() {
  adminPassword = "";
  localStorage.removeItem(adminPasswordKey);
  showLogin();
}

document.addEventListener("click", async (event) => {
  const target = event.target.closest("button");
  if (!target) return;
  try {
    if (target.dataset.deleteUser) await deleteUser(target.dataset.deleteUser);
    if (target.dataset.deletePost) await deletePost(target.dataset.deletePost);
    if (target.dataset.revokeMessage) await revokeMessage(target.dataset.revokeMessage);
    if (target.dataset.deleteMessage) await deleteMessage(target.dataset.deleteMessage);
  } catch (error) {
    alert(error.message);
  }
});

$("#adminLoginForm")?.addEventListener("submit", handleLogin);
$("#refreshAdminBtn")?.addEventListener("click", loadAdminData);
$("#lockAdminBtn")?.addEventListener("click", lockAdmin);

if (adminPassword) {
  showApp();
  loadAdminData();
}
