const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const storageKey = "hadaziProfile";
const sessionKey = "hadaziSession";
const legacyProfileKey = "campusSoulProfile";
const friendKey = "hadaziFriends";
const chatKey = "hadaziChats";
const postKey = "hadaziPosts";
const backendEnabled = location.protocol.startsWith("http");

const zodiacList = [
  "白羊座", "金牛座", "双子座", "巨蟹座", "狮子座", "处女座",
  "天秤座", "天蝎座", "射手座", "摩羯座", "水瓶座", "双鱼座"
];

const defaultProfile = {
  id: "",
  phone: "",
  nickname: "我",
  gender: "未设置",
  age: "",
  birthday: "",
  zodiac: "天秤座",
  mbti: "",
  school: "我的大学",
  major: "未填写",
  goal: "饭搭子",
  time: "周末白天",
  interests: [],
  resume: "",
  bio: ""
};

let session = loadSession();
let currentUserId = session?.userId || "";
let profile = loadProfile();
let friends = loadArray(friendKey);
let chats = loadObject(chatKey);
let localPosts = loadArray(postKey);
let peopleCache = [];
let socket = null;
let currentFilter = "all";

function loadSession() {
  try {
    return JSON.parse(localStorage.getItem(sessionKey) || "null");
  } catch {
    return null;
  }
}

function saveSession(nextSession) {
  session = nextSession;
  currentUserId = nextSession?.userId || "";
  if (nextSession) localStorage.setItem(sessionKey, JSON.stringify(nextSession));
  else localStorage.removeItem(sessionKey);
}

function loadProfile() {
  try {
    const current = JSON.parse(localStorage.getItem(storageKey) || "null");
    const legacy = JSON.parse(localStorage.getItem(legacyProfileKey) || "null");
    return { ...defaultProfile, ...(legacy || {}), ...(current || {}), ...(session?.profile || {}) };
  } catch {
    return { ...defaultProfile, ...(session?.profile || {}) };
  }
}

function persistProfile() {
  localStorage.setItem(storageKey, JSON.stringify(profile));
  if (currentUserId) saveSession({ userId: currentUserId, profile });
}

async function saveProfileRemote() {
  persistProfile();
  if (!backendEnabled || !currentUserId) return profile;
  const saved = await api("/api/profile", {
    method: "POST",
    body: JSON.stringify({ ...profile, id: currentUserId })
  });
  profile = { ...profile, ...(saved || {}) };
  persistProfile();
  return profile;
}

function loadArray(key) {
  try {
    const current = JSON.parse(localStorage.getItem(key) || "null");
    return Array.isArray(current) ? current : [];
  } catch {
    return [];
  }
}

function loadObject(key) {
  try {
    const current = JSON.parse(localStorage.getItem(key) || "null");
    return current && typeof current === "object" ? current : {};
  } catch {
    return {};
  }
}

function saveFriends() {
  localStorage.setItem(friendKey, JSON.stringify(friends));
}

function saveChats() {
  localStorage.setItem(chatKey, JSON.stringify(chats));
}

function savePosts() {
  localStorage.setItem(postKey, JSON.stringify(localPosts));
}

async function api(path, options = {}) {
  if (!backendEnabled) return null;
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(data?.error || `接口请求失败：${response.status}`);
  return data;
}

async function refreshProfile() {
  if (!backendEnabled || !currentUserId) return profile;
  const remote = await api(`/api/profile/${encodeURIComponent(currentUserId)}`);
  if (remote) {
    profile = { ...defaultProfile, ...profile, ...remote };
    persistProfile();
  }
  return profile;
}

function isLoggedIn() {
  return Boolean(currentUserId && profile.phone);
}

function hasMbti() {
  return Boolean(profile.mbti);
}

function requireLogin() {
  if (isLoggedIn()) return true;
  alert("请先用手机号登录或注册，登录后才能匹配真人唠嗑。");
  $("#phone")?.focus();
  return false;
}

function requireMbti() {
  if (!requireLogin()) return false;
  if (hasMbti()) return true;
  alert("做完 MBTI 并保存个人资料后才能匹配唠嗑。");
  location.href = "profile.html";
  return false;
}

function getPerson(personId) {
  if (personId === "me" || personId === currentUserId) {
    return {
      id: currentUserId || "me",
      name: profile.nickname || "我",
      mbti: profile.mbti || "未设置",
      zodiac: profile.zodiac || "未设置",
      school: profile.school || "我的大学",
      major: profile.major || "未填写",
      gender: profile.gender || "未设置",
      age: profile.age || "",
      goal: profile.goal || "饭搭子",
      interests: profile.interests || [],
      bio: profile.bio || profile.resume || "这是你发布的动态。"
    };
  }
  return peopleCache.find((item) => item.id === personId) || null;
}

function isFriend(personId) {
  return friends.includes(personId);
}

async function addFriend(personId, silent = false) {
  if (!requireMbti()) return false;
  const person = getPerson(personId);
  if (!person || personId === currentUserId) return false;
  if (!friends.includes(personId)) {
    friends.push(personId);
    saveFriends();
    await api("/api/friends", {
      method: "POST",
      body: JSON.stringify({ userId: currentUserId, personId })
    }).catch((error) => toast(error.message));
    if (!silent) toast(`已添加 ${person.name} 到联系人`);
  } else if (!silent) {
    toast(`${person.name} 已经在联系人里`);
  }
  return true;
}

async function loadMatches() {
  if (!requireMbti()) return [];
  try {
    const matches = await api(`/api/matches/${encodeURIComponent(currentUserId)}`);
    peopleCache = Array.isArray(matches) ? matches : [];
    return peopleCache;
  } catch (error) {
    alert(error.message);
    return [];
  }
}

async function loadFriends() {
  if (!isLoggedIn()) return [];
  try {
    const list = await api(`/api/friends/${encodeURIComponent(currentUserId)}`);
    peopleCache = mergePeople(peopleCache, Array.isArray(list) ? list : []);
    friends = (Array.isArray(list) ? list : []).map((person) => person.id);
    saveFriends();
    return list;
  } catch {
    return friends.map(getPerson).filter(Boolean);
  }
}

function mergePeople(base, extra) {
  const map = new Map(base.map((person) => [person.id, person]));
  extra.forEach((person) => map.set(person.id, person));
  return [...map.values()];
}

function renderAuthBox() {
  const box = $("#authBox");
  if (!box) return;
  if (isLoggedIn()) {
    box.innerHTML = `
      <div class="auth-status">
        <div>
          <p class="eyebrow">已登录</p>
          <h3>${escapeHtml(profile.nickname || `用户${profile.phone.slice(-4)}`)}</h3>
          <p>手机号：${escapeHtml(profile.phone)} ${hasMbti() ? `｜MBTI：${escapeHtml(profile.mbti)}` : "｜还没完成 MBTI"}</p>
        </div>
        <div class="page-actions">
          <a class="btn ghost" href="profile.html">${hasMbti() ? "修改资料" : "去做 MBTI"}</a>
          <button class="btn subtle" type="button" id="logoutBtn">退出登录</button>
        </div>
      </div>
    `;
    $("#logoutBtn")?.addEventListener("click", () => {
      saveSession(null);
      profile = { ...defaultProfile };
      persistProfile();
      location.reload();
    });
    return;
  }

  box.innerHTML = `
    <form id="phoneAuthForm" class="auth-form">
      <div>
        <p class="eyebrow">手机号登录/注册</p>
        <h3>登录后才能匹配真人唠嗑</h3>
        <p>首次输入手机号和密码会自动注册；已有账号会校验密码登录。</p>
      </div>
      <label>手机号
        <input id="phone" type="tel" placeholder="请输入 11 位手机号" maxlength="11" autocomplete="tel" />
      </label>
      <label>密码
        <input id="password" type="password" placeholder="至少 6 位" minlength="6" autocomplete="current-password" />
      </label>
      <label>昵称
        <input id="authNickname" type="text" placeholder="首次注册可填写" maxlength="16" />
      </label>
      <button class="btn primary" type="submit">登录 / 注册</button>
    </form>
  `;
  $("#phoneAuthForm").addEventListener("submit", handlePhoneAuth);
}

async function handlePhoneAuth(event) {
  event.preventDefault();
  const phone = $("#phone").value.trim();
  const password = $("#password").value.trim();
  const nickname = $("#authNickname").value.trim();
  try {
    const result = await api("/api/auth/phone", {
      method: "POST",
      body: JSON.stringify({ phone, password, nickname })
    });
    profile = { ...defaultProfile, ...(result.profile || {}) };
    saveSession({ userId: result.userId, profile });
    persistProfile();
    initSocket();
    toast("登录成功");
    await renderHome();
  } catch (error) {
    alert(error.message);
  }
}

async function renderHome() {
  const list = $("#matchList");
  if (!list) return;
  renderAuthBox();

  if (!isLoggedIn()) {
    list.innerHTML = `<p class="empty">请先用手机号登录或注册，登录后才能看到真人匹配列表。</p>`;
    return;
  }
  if (!hasMbti()) {
    list.innerHTML = `
      <article class="empty-card">
        <h3>先完成 MBTI，才能开始匹配唠嗑</h3>
        <p>系统只给完成 MBTI 的真实用户互相推荐。点击下面按钮去个人页选择 MBTI 并保存。</p>
        <button class="btn primary" type="button" id="needMbtiBtn">去做 MBTI</button>
      </article>
    `;
    $("#needMbtiBtn")?.addEventListener("click", () => requireMbti());
    return;
  }

  list.innerHTML = `<p class="empty">正在加载真人匹配...</p>`;
  const matches = await loadMatches();
  const visible = matches.filter((person) => currentFilter === "all" || person.goal === currentFilter);
  if (!visible.length) {
    list.innerHTML = `
      <article class="empty-card">
        <h3>暂时没有可匹配的真人</h3>
        <p>等更多同学用手机号登录并保存 MBTI 后，这里会自动出现真人匹配对象。</p>
      </article>
    `;
    return;
  }

  list.innerHTML = visible.map((person) => `
    <article class="person-card">
      <button class="person-top" data-chat="${person.id}" type="button">
        <div class="avatar">${escapeHtml((person.name || "同").slice(0, 1))}</div>
        <div>
          <h3>${escapeHtml(person.name || "同学")} · ${escapeHtml(person.mbti || "MBTI")}</h3>
          <span>${escapeHtml(person.gender || "未设置")}｜${escapeHtml(String(person.age || ""))}岁｜${escapeHtml(person.zodiac || "未设置")}｜${escapeHtml(person.school || "学校未填")}</span>
        </div>
      </button>
      <div class="score-line"><span>合拍指数</span><strong>${person.match?.score || 80}%</strong></div>
      <div class="bar"><span style="width:${person.match?.score || 80}%"></span></div>
      <p>${escapeHtml(person.bio || "想找合得来的校园搭子。")}</p>
      <div class="tag-row">${(person.interests || []).map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div>
      <div class="score-detail">${escapeHtml((person.match?.reasons || []).join("｜") || "资料越完整，推荐越准")}</div>
      <div class="match-actions">
        <button class="btn primary" data-chat="${person.id}">聊天</button>
        <button class="btn ghost" data-add-friend="${person.id}">${isFriend(person.id) ? "已是好友" : "添加好友"}</button>
      </div>
    </article>
  `).join("");

  list.querySelectorAll("[data-chat]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (await addFriend(btn.dataset.chat, true)) location.href = `chat.html?id=${encodeURIComponent(btn.dataset.chat)}`;
    });
  });
  list.querySelectorAll("[data-add-friend]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await addFriend(btn.dataset.addFriend);
      await renderHome();
    });
  });
}

function initHomeFilters() {
  $$(".chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      $$(".chip").forEach((item) => item.classList.remove("active"));
      chip.classList.add("active");
      currentFilter = chip.dataset.filter;
      renderHome();
    });
  });
}

async function renderContacts() {
  const list = $("#contactsList");
  if (!list) return;
  if (!requireMbti()) {
    list.innerHTML = `<p class="empty">做完 MBTI 并保存个人资料后，才能查看联系人和聊天。</p>`;
    return;
  }
  const contactPeople = await loadFriends();
  list.innerHTML = contactPeople.length ? contactPeople.map((person) => `
    <article class="contact-card" data-chat="${person.id}">
      <div class="contact-main">
        <span class="avatar">${escapeHtml((person.name || "同").slice(0, 1))}</span>
        <span class="contact-info">
          <h3>${escapeHtml(person.name || "同学")} · ${escapeHtml(person.mbti || "MBTI")}</h3>
          <span>${escapeHtml(person.gender || "未设置")}｜${escapeHtml(String(person.age || ""))}岁｜${escapeHtml(person.zodiac || "未设置")}｜${escapeHtml(person.goal || "搭子")}</span>
        </span>
      </div>
      <div class="contact-actions">
        <a class="btn primary" href="chat.html?id=${encodeURIComponent(person.id)}">聊天</a>
      </div>
    </article>
  `).join("") : `<p class="empty">还没有联系人。去首页匹配真人，点击“添加好友”后会出现在这里。</p>`;
  list.querySelectorAll(".contact-card").forEach((card) => {
    card.addEventListener("click", (event) => {
      if (event.target.closest("a")) return;
      location.href = `chat.html?id=${encodeURIComponent(card.dataset.chat)}`;
    });
  });
}

async function renderChat() {
  const messages = $("#messages");
  const form = $("#chatForm");
  const input = $("#messageInput");
  if (!messages || !form) return;
  if (!requireMbti()) {
    $("#chatTitle").textContent = "请先完成登录和 MBTI";
    $("#chatMeta").textContent = "完成后才能匹配真人聊天";
    messages.innerHTML = `<p class="empty">做完 MBTI 并保存个人资料后，才能和真人唠嗑。</p>`;
    input.disabled = true;
    return;
  }
  const params = new URLSearchParams(location.search);
  const personId = params.get("id");
  if (!personId) {
    messages.innerHTML = `<p class="empty">请先从首页匹配或联系人页面选择一个真人聊天对象。</p>`;
    input.disabled = true;
    return;
  }
  await loadFriends();
  let person = getPerson(personId);
  if (!person) {
    const matches = await loadMatches();
    person = matches.find((item) => item.id === personId);
  }
  if (!person) {
    messages.innerHTML = `<p class="empty">这个聊天对象不存在，可能对方还没完成 MBTI 或账号资料已变化。</p>`;
    input.disabled = true;
    return;
  }
  await addFriend(personId, true);
  $("#chatTitle").textContent = `${person.name} · ${person.mbti}`;
  $("#chatMeta").textContent = `${person.gender || "未设置"}｜${person.age || ""}岁｜${person.zodiac || "未设置"}｜${person.goal || "搭子"}`;

  const render = () => {
    messages.innerHTML = (chats[personId] || []).map((msg) => `
      <p class="bubble ${msg.from === "me" ? "me" : ""}">${escapeHtml(msg.text)}<br><small>${escapeHtml(msg.time)}</small></p>
    `).join("") || `<p class="empty">你们还没有消息，发一句开始真人聊天吧。</p>`;
    messages.scrollTop = messages.scrollHeight;
  };

  try {
    const remoteMessages = await api(`/api/messages/${encodeURIComponent(currentUserId)}/${encodeURIComponent(personId)}`);
    chats[personId] = (Array.isArray(remoteMessages) ? remoteMessages : []).map((msg) => ({
      from: msg.fromUserId === currentUserId || msg.from === "me" ? "me" : "other",
      text: msg.text,
      time: formatTime(msg.time)
    }));
    saveChats();
  } catch {
    chats[personId] ||= [];
  }
  render();

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    sendMessage(personId, text, render);
  });
}

async function sendMessage(personId, text, render) {
  if (!requireMbti()) return;
  chats[personId] = chats[personId] || [];
  chats[personId].push({ from: "me", text, time: nowTime() });
  saveChats();
  render();
  try {
    await api("/api/messages", {
      method: "POST",
      body: JSON.stringify({
        userId: currentUserId,
        personId,
        fromUserId: currentUserId,
        toUserId: personId,
        from: "me",
        text
      })
    });
  } catch (error) {
    toast(error.message);
  }
}

async function renderPlaza() {
  const feed = $("#plazaFeed");
  if (!feed) return;
  let remotePosts = [];
  try {
    remotePosts = (await api("/api/posts")) || [];
  } catch {
    remotePosts = [];
  }
  const posts = mergePosts(remotePosts, localPosts);
  if (!posts.length) {
    feed.innerHTML = `<p class="empty">广场暂时没有真人动态。登录后可以发布第一条动态。</p>`;
    return;
  }
  peopleCache = mergePeople(peopleCache, posts.map((post) => post.person).filter(Boolean));
  feed.innerHTML = posts.map((post) => {
    const person = post.person || getPerson(post.personId) || getPerson("me");
    const isMine = post.personId === "me" || post.personId === currentUserId;
    return `
      <article class="post-card">
        <div class="post-head">
          <button class="person-trigger" data-chat="${person.id}" type="button">
            <span class="avatar">${escapeHtml((person.name || "我").slice(0, 1))}</span>
            <span><h3>${escapeHtml(person.name || "同学")} · ${escapeHtml(person.mbti || "MBTI")}</h3><span>${escapeHtml(person.school || "学校未填")}｜${escapeHtml(post.time || "刚刚")}</span></span>
          </button>
        </div>
        <p class="post-content">${escapeHtml(post.content)}</p>
        ${Number(post.photos) > 0 ? `<div class="post-photo-grid">${Array.from({ length: Number(post.photos) }, () => `<div class="post-photo"></div>`).join("")}</div>` : ""}
        <div class="tag-row">${(post.tags || []).map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div>
        <p>❤️ ${post.likes || 0}　💬 ${(post.comments || []).slice(0, 2).map(escapeHtml).join(" / ")}</p>
        <div class="post-actions">
          ${!isMine ? `<button class="btn primary" data-chat="${person.id}">聊天</button><button class="btn ghost" data-add-friend="${person.id}">${isFriend(person.id) ? "已是好友" : "添加好友"}</button>` : `<a class="btn ghost" href="profile.html">查看个人页面</a>`}
          <button class="btn subtle" data-like-post>点赞</button>
        </div>
      </article>
    `;
  }).join("");
  feed.querySelectorAll("[data-chat]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (await addFriend(btn.dataset.chat, true)) location.href = `chat.html?id=${encodeURIComponent(btn.dataset.chat)}`;
    });
  });
  feed.querySelectorAll("[data-add-friend]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await addFriend(btn.dataset.addFriend);
      await renderPlaza();
    });
  });
  feed.querySelectorAll("[data-like-post]").forEach((btn) => {
    btn.addEventListener("click", () => {
      btn.textContent = "已点赞";
      btn.disabled = true;
    });
  });
}

function mergePosts(remotePosts, localOnlyPosts) {
  const map = new Map();
  [...remotePosts, ...localOnlyPosts].forEach((post) => {
    if (post?.id && !map.has(post.id)) map.set(post.id, post);
  });
  return [...map.values()];
}

function initPublish() {
  const form = $("#publishForm");
  if (!form) return;
  if (!isLoggedIn()) {
    alert("请先用手机号登录或注册，再发布动态。");
    location.href = "index.html";
    return;
  }
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const content = $("#postContent").value.trim();
    if (!content) {
      toast("先写一点动态内容");
      return;
    }
    const post = {
      id: `post_${currentUserId}_${Date.now()}`,
      personId: currentUserId,
      userId: currentUserId,
      authorName: profile.nickname,
      time: "刚刚",
      content,
      tags: $("#postTags").value.split(/[,，]/).map((item) => item.trim()).filter(Boolean),
      likes: 0,
      comments: [],
      photos: Number($("#postPhotos").value || 0)
    };
    localPosts.unshift(post);
    savePosts();
    await api("/api/posts", { method: "POST", body: JSON.stringify(post) }).catch((error) => toast(error.message));
    location.href = "plaza.html";
  });
}

function initProfile() {
  const form = $("#profileForm");
  if (!form) return;
  if (!isLoggedIn()) {
    alert("请先在首页用手机号登录或注册，再完善个人资料。");
    location.href = "index.html";
    return;
  }
  $("#accountPhone").textContent = profile.phone ? `当前账号：${profile.phone}` : "当前账号：未登录";
  $("#zodiac").innerHTML = zodiacList.map((z) => `<option>${z}</option>`).join("");
  Object.entries(profile).forEach(([key, value]) => {
    const input = $(`#${key}`);
    if (!input) return;
    input.value = Array.isArray(value) ? value.join(",") : value;
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    profile = {
      ...profile,
      id: currentUserId,
      nickname: $("#nickname").value.trim() || `用户${profile.phone.slice(-4)}`,
      gender: $("#gender").value,
      age: $("#age").value,
      birthday: $("#birthday").value,
      zodiac: $("#zodiac").value,
      mbti: $("#mbti").value,
      mbtiComplete: Boolean($("#mbti").value),
      school: $("#school").value.trim() || "我的大学",
      major: $("#major").value.trim() || "未填写",
      goal: $("#goal").value,
      time: $("#time").value,
      interests: $("#interests").value.split(/[,，]/).map((item) => item.trim()).filter(Boolean),
      resume: $("#resume").value.trim(),
      bio: $("#bio").value.trim()
    };
    if (!profile.mbti) {
      alert("请选择 MBTI 并保存，之后才能匹配唠嗑。");
      return;
    }
    try {
      await saveProfileRemote();
      toast("个人资料和 MBTI 已保存，可以开始匹配唠嗑了");
      setTimeout(() => { location.href = "index.html"; }, 700);
    } catch (error) {
      alert(error.message);
    }
  });
}

function initSocket() {
  if (!backendEnabled || !window.io || !currentUserId) return;
  if (socket) socket.disconnect();
  socket = io();
  socket.emit("join", currentUserId);
  socket.on("chat:message", (msg) => {
    const otherId = msg.fromUserId === currentUserId ? msg.toUserId || msg.personId : msg.fromUserId || msg.userId;
    if (!otherId || msg.fromUserId === currentUserId) return;
    chats[otherId] = chats[otherId] || [];
    chats[otherId].push({ from: "other", text: msg.text, time: formatTime(msg.time) });
    saveChats();
    if (document.body.dataset.page === "chat") location.reload();
  });
}

function nowTime() {
  return new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

function formatTime(value) {
  if (!value) return nowTime();
  return new Date(value).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

function toast(message) {
  const old = $(".toast");
  if (old) old.remove();
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2400);
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[char]));
}

async function init() {
  initSocket();
  if (isLoggedIn()) await refreshProfile().catch(() => {});
  const page = document.body.dataset.page;
  if (page === "home") {
    initHomeFilters();
    await renderHome();
  }
  if (page === "contacts") await renderContacts();
  if (page === "chat") await renderChat();
  if (page === "plaza") await renderPlaza();
  if (page === "publish") initPublish();
  if (page === "profile") initProfile();
}

init();
