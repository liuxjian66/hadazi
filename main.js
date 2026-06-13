const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const storageKey = "hadaziProfile";
const sessionKey = "hadaziSession";
const legacyProfileKey = "campusSoulProfile";
const friendKey = "hadaziFriends";
const chatKey = "hadaziChats";
const postKey = "hadaziPosts";
const groupNotifyKey = "hadaziGroupNotify";
const unreadKey = "hadaziUnread";
const resetDevKey = "hadaziLastResetCode";
const backendEnabled = location.protocol.startsWith("http");
const GROUP_ID = "group_public";
const DAY = 24 * 60 * 60 * 1000;
let deferredInstallPrompt = null;

if ("serviceWorker" in navigator && location.protocol === "https:") {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/service-worker.js").catch(() => {});
  });
}

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  renderInstallButton();
});

window.addEventListener("appinstalled", () => {
  deferredInstallPrompt = null;
  document.querySelector(".install-app-btn")?.remove();
});

function renderInstallButton() {
  if (!deferredInstallPrompt || document.querySelector(".install-app-btn")) return;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "install-app-btn";
  button.textContent = "安装 App";
  button.addEventListener("click", async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice.catch(() => null);
    deferredInstallPrompt = null;
    button.remove();
  });
  document.body.appendChild(button);
}

const zodiacList = [
  "白羊座", "金牛座", "双子座", "巨蟹座", "狮子座", "处女座",
  "天秤座", "天蝎座", "射手座", "摩羯座", "水瓶座", "双鱼座"
];

const defaultProfile = {
  id: "",
  phone: "",
  nickname: "我",
  avatar: "",
  avatarUrl: "",
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
let unreadState = loadObject(unreadKey);
let localPosts = loadArray(postKey).filter((post) => isFresh(post.createdAt, 7));
let peopleCache = [];
let groupMessages = [];
let socket = null;
let currentFilter = "all";
let activePrivateRender = null;
let activeGroupRender = null;

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
  Object.keys(chats).forEach((key) => {
    chats[key] = (chats[key] || []).filter((msg) => isFresh(msg.rawTime || msg.time, 3));
  });
  localStorage.setItem(chatKey, JSON.stringify(chats));
}

function saveUnread() {
  unreadState.private ||= {};
  unreadState.group ||= false;
  localStorage.setItem(unreadKey, JSON.stringify(unreadState));
  updateNavBadges();
}

function hasPrivateUnread() {
  return Object.values(unreadState.private || {}).some(Boolean);
}

function markPrivateUnread(personId, value = true) {
  unreadState.private ||= {};
  if (value) unreadState.private[personId] = true;
  else delete unreadState.private[personId];
  saveUnread();
}

function markGroupUnread(value = true) {
  unreadState.group = Boolean(value);
  saveUnread();
}

function updateNavBadges() {
  $$(".topnav a").forEach((link) => {
    const href = link.getAttribute("href");
    link.classList.toggle("has-unread", href === "contacts.html" && hasPrivateUnread());
    link.classList.toggle("has-group-unread", href === "groups.html" && Boolean(unreadState.group));
  });
}

function savePosts() {
  localPosts = localPosts.filter((post) => isFresh(post.createdAt, 7));
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

function isFresh(value, days) {
  const time = new Date(value || 0).getTime();
  return Number.isFinite(time) && Date.now() - time <= days * DAY;
}

function requireLogin() {
  if (isLoggedIn()) return true;
  alert("请先用手机号登录或注册。");
  $("#phone")?.focus();
  return false;
}

function requireMbti() {
  if (!requireLogin()) return false;
  if (hasMbti()) return true;
  alert("做完 MBTI 并保存资料后才能匹配、聊天和进群唠嗑。");
  location.href = "profile.html";
  return false;
}

function myPerson() {
  return {
    id: currentUserId || "me",
    name: profile.nickname || "我",
    avatar: profile.avatar || "",
    avatarUrl: profile.avatarUrl || "",
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

function getPerson(personId) {
  if (personId === "me" || personId === currentUserId) return myPerson();
  return peopleCache.find((item) => item.id === personId) || null;
}

function avatarHtml(person, className = "avatar") {
  const name = person?.name || person?.nickname || "同学";
  const avatar = person?.avatar || "";
  const avatarUrl = person?.avatarUrl || "";
  if (avatarUrl) return `<span class="${className} avatar-img" style="background-image:url('${escapeAttr(avatarUrl)}')"></span>`;
  return `<span class="${className}">${escapeHtml(avatar || name.slice(0, 1))}</span>`;
}

function isFriend(personId) {
  return friends.includes(personId);
}

async function addFriend(personId, silent = false) {
  if (!requireMbti()) return false;
  const person = getPerson(personId);
  if (!person || personId === currentUserId || personId === "system_plaza") return false;
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

async function deleteFriend(personId) {
  friends = friends.filter((id) => id !== personId);
  saveFriends();
  await api("/api/friends", {
    method: "DELETE",
    body: JSON.stringify({ userId: currentUserId, personId })
  }).catch((error) => toast(error.message));
  toast("已删除好友");
}

async function loadMatches() {
  if (!requireMbti()) return [];
  try {
    const matches = await api(`/api/matches/${encodeURIComponent(currentUserId)}`);
    peopleCache = mergePeople(peopleCache, Array.isArray(matches) ? matches : []);
    return Array.isArray(matches) ? matches : [];
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
  extra.forEach((person) => person?.id && map.set(person.id, person));
  return [...map.values()];
}

function renderAuthBox() {
  const box = $("#authBox");
  if (!box) return;
  if (isLoggedIn()) {
    box.innerHTML = `
      <div class="auth-status">
        <div class="identity-row">
          ${avatarHtml(myPerson(), "avatar")}
          <div>
            <p class="eyebrow">已登录</p>
            <h3>${escapeHtml(profile.nickname || `用户${profile.phone.slice(-4)}`)}</h3>
            <p>手机号：${escapeHtml(profile.phone)} ${hasMbti() ? `｜MBTI：${escapeHtml(profile.mbti)}` : "｜还没完成 MBTI"}</p>
          </div>
        </div>
        <div class="page-actions">
          <a class="btn ghost" href="profile.html">${hasMbti() ? "个人主页" : "去做 MBTI"}</a>
        </div>
      </div>
    `;
    return;
  }
  box.innerHTML = `
    <form id="phoneAuthForm" class="auth-form">
      <div>
        <p class="eyebrow">手机号登录/注册</p>
        <h3>登录后才能匹配唠嗑</h3>
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
      <button class="btn subtle" type="button" id="forgotPasswordBtn">忘记密码</button>
    </form>
    <form id="resetPasswordForm" class="auth-form reset-form hidden">
      <div>
        <p class="eyebrow">找回密码</p>
        <h3>用验证码修改密码</h3>
        <p>输入手机号获取验证码，再设置新密码。</p>
      </div>
      <label>手机号
        <input id="resetPhone" type="tel" placeholder="请输入 11 位手机号" maxlength="11" />
      </label>
      <label>验证码
        <input id="resetCode" type="text" placeholder="6 位验证码" maxlength="6" />
      </label>
      <label>新密码
        <input id="resetPassword" type="password" placeholder="至少 6 位" />
      </label>
      <button class="btn ghost" type="button" id="getResetCodeBtn">获取验证码</button>
      <button class="btn primary" type="submit">修改密码</button>
    </form>
  `;
  $("#phoneAuthForm").addEventListener("submit", handlePhoneAuth);
  $("#forgotPasswordBtn")?.addEventListener("click", () => $("#resetPasswordForm")?.classList.toggle("hidden"));
  $("#getResetCodeBtn")?.addEventListener("click", requestResetCode);
  $("#resetPasswordForm")?.addEventListener("submit", handleResetPassword);
}

async function requestResetCode() {
  const phone = $("#resetPhone").value.trim();
  try {
    const result = await api("/api/auth/reset-code", {
      method: "POST",
      body: JSON.stringify({ phone })
    });
    localStorage.setItem(resetDevKey, result.code);
    $("#resetCode").value = result.code;
    toast(`验证码已生成：${result.code}`);
  } catch (error) {
    alert(error.message);
  }
}

async function handleResetPassword(event) {
  event.preventDefault();
  try {
    await api("/api/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({
        phone: $("#resetPhone").value.trim(),
        code: $("#resetCode").value.trim(),
        newPassword: $("#resetPassword").value.trim()
      })
    });
    toast("密码已修改，请用新密码登录");
    $("#resetPasswordForm").classList.add("hidden");
  } catch (error) {
    alert(error.message);
  }
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
    list.innerHTML = `<p class="empty">请先用手机号登录或注册，登录后才能看到匹配列表。</p>`;
    return;
  }
  if (!hasMbti()) {
    list.innerHTML = `
      <article class="empty-card">
        <h3>先完成 MBTI，才能开始匹配唠嗑</h3>
        <p>系统会根据 MBTI、兴趣和资料推荐更合适的朋友。点击下面按钮去个人页设置头像、MBTI 和简历。</p>
        <button class="btn primary" type="button" id="needMbtiBtn">去个人页</button>
      </article>
    `;
    $("#needMbtiBtn")?.addEventListener("click", () => requireMbti());
    return;
  }
  list.innerHTML = `<p class="empty">正在加载匹配...</p>`;
  const matches = await loadMatches();
  const visible = matches.filter((person) => currentFilter === "all" || person.goal === currentFilter);
  if (!visible.length) {
    list.innerHTML = `
      <article class="empty-card">
        <h3>暂时没有可匹配的同学</h3>
        <p>等更多同学登录并保存 MBTI 后，这里会自动出现匹配对象。你也可以先去大厅。</p>
        <a class="btn primary" href="groups.html">去大厅</a>
      </article>
    `;
    return;
  }
  list.innerHTML = visible.map((person) => `
    <article class="person-card">
      <button class="person-top" data-chat="${person.id}" type="button">
        ${avatarHtml(person)}
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
    list.innerHTML = `<p class="empty">做完 MBTI 后，才能查看联系人和聊天。</p>`;
    return;
  }
  const contactPeople = await loadFriends();
  list.innerHTML = contactPeople.length ? contactPeople.map((person) => `
    <article class="contact-card ${unreadState.private?.[person.id] ? "has-person-unread" : ""}" data-chat="${person.id}">
      <div class="contact-main">
        <span class="avatar-wrap">${avatarHtml(person)}${unreadState.private?.[person.id] ? "<i class=\"person-unread-dot\"></i>" : ""}</span>
        <span class="contact-info">
          <h3>${escapeHtml(person.name || "同学")} · ${escapeHtml(person.mbti || "MBTI")}</h3>
          <span>${unreadState.private?.[person.id] ? "有新消息｜" : ""}${escapeHtml(person.gender || "未设置")}｜${escapeHtml(String(person.age || ""))}岁｜${escapeHtml(person.zodiac || "未设置")}｜${escapeHtml(person.goal || "搭子")}</span>
        </span>
      </div>
      <div class="contact-actions">
        <a class="btn primary" href="chat.html?id=${encodeURIComponent(person.id)}">聊天</a>
      </div>
    </article>
  `).join("") : `<p class="empty">还没有联系人。去首页匹配，或去大厅里添加同学。</p>`;
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
    $("#chatMeta").textContent = "完成后才能匹配聊天";
    messages.innerHTML = `<p class="empty">做完 MBTI 并保存资料后，才能唠嗑。</p>`;
    input.disabled = true;
    return;
  }
  const personId = new URLSearchParams(location.search).get("id");
  if (!personId) {
    messages.innerHTML = `<p class="empty">请先从首页、广场或联系人页面选择一个聊天对象。</p>`;
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
  peopleCache = mergePeople(peopleCache, [person]);
  await addFriend(personId, true);
  markPrivateUnread(personId, false);
  $("#chatTitle").innerHTML = `<button class="title-person" data-open-person="${person.id}" type="button">${avatarHtml(person, "avatar small-avatar")}${escapeHtml(person.name)} · ${escapeHtml(person.mbti)}</button>`;
  $("#chatMeta").textContent = `${person.gender || "未设置"}｜${person.age || ""}岁｜${person.zodiac || "未设置"}｜${person.goal || "搭子"}`;

  const render = () => {
    chats[personId] = (chats[personId] || []).filter((msg) => isFresh(msg.rawTime || msg.time, 3));
    messages.innerHTML = chats[personId].length ? chats[personId].map((msg) => privateMessageHtml(msg, person)).join("") : `<p class="empty">你们还没有消息，发一句开始聊天吧。</p>`;
    messages.scrollTop = messages.scrollHeight;
    bindMessageAvatarClicks();
  };
  activePrivateRender = render;

  try {
    const remoteMessages = await api(`/api/messages/${encodeURIComponent(currentUserId)}/${encodeURIComponent(personId)}`);
    chats[personId] = (Array.isArray(remoteMessages) ? remoteMessages : []).filter((msg) => isFresh(msg.time, 3)).map((msg) => ({
      id: msg.id,
      from: isMessageMine(msg) ? "me" : "other",
      fromUserId: msg.fromUserId,
      userId: msg.userId,
      toUserId: msg.toUserId,
      personId: msg.personId,
      text: msg.text,
      kind: msg.kind || "text",
      imageData: msg.imageData || "",
      revoked: Boolean(msg.revoked),
      rawTime: msg.time,
      time: formatTime(msg.time)
    }));
    saveChats();
  } catch {
    chats[personId] ||= [];
  }
  render();
  $("#chatTitle [data-open-person]")?.addEventListener("click", () => openPersonModal(personId));
  $("#emojiBtn")?.addEventListener("click", () => {
    input.value += "😊";
    input.focus();
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    sendMessage(personId, text, render);
  });
}

function privateMessageHtml(msg, person) {
  const mine = isMessageMine(msg);
  const sender = mine ? myPerson() : person;
  const body = msg.revoked ? "这条消息已撤回" : msg.kind === "image" && msg.imageData ? `<img class="chat-image" src="${escapeAttr(msg.imageData)}" alt="聊天图片" />` : escapeHtml(msg.text);
  return `
    <div class="message-row ${mine ? "me" : "other"}">
      ${!mine ? `<button class="avatar-button" data-open-person="${person.id}" type="button">${avatarHtml(sender, "avatar chat-avatar")}</button>` : ""}
      <div class="message-stack">
        <span class="message-name">${mine ? "我" : escapeHtml(sender.name || "同学")}</span>
        <p class="bubble ${mine ? "me" : ""}">${body}<br><small>${escapeHtml(msg.time)}</small></p>
      </div>
      ${mine ? `<button class="avatar-button" data-open-person="${currentUserId}" type="button">${avatarHtml(sender, "avatar chat-avatar")}</button>` : ""}
    </div>
  `;
}

function isMessageMine(msg) {
  const fromId = msg.fromUserId || msg.userId;
  if (fromId) return fromId === currentUserId;
  return msg.from === "me";
}

function bindMessageAvatarClicks() {
  $$("[data-open-person]").forEach((btn) => {
    btn.addEventListener("click", () => openPersonModal(btn.dataset.openPerson));
  });
}

async function sendMessage(personId, text, render) {
  if (!requireMbti()) return;
  const pending = {
    id: `local_${Date.now()}`,
    from: "me",
    fromUserId: currentUserId,
    userId: currentUserId,
    toUserId: personId,
    personId,
    text,
    kind: "text",
    rawTime: new Date().toISOString(),
    time: nowTime()
  };
  chats[personId] = chats[personId] || [];
  chats[personId].push(pending);
  saveChats();
  render();
  try {
    const saved = await api("/api/messages", {
      method: "POST",
      body: JSON.stringify({
        userId: currentUserId,
        personId,
        fromUserId: currentUserId,
        toUserId: personId,
        from: "me",
        senderName: profile.nickname,
        senderAvatar: profile.avatar,
        senderAvatarUrl: profile.avatarUrl,
        kind: "text",
        text
      })
    });
    pending.id = saved.id;
    pending.rawTime = saved.time;
    saveChats();
  } catch (error) {
    toast(error.message);
  }
}

async function openPersonModal(personId) {
  const modal = $("#personModal");
  const body = $("#personModalBody");
  if (!modal || !body) return;
  const person = getPerson(personId) || myPerson();
  let posts = [];
  if (personId !== currentUserId && personId !== "me") {
    posts = await api(`/api/profile/${encodeURIComponent(personId)}/posts`).catch(() => []);
  } else {
    posts = localPosts.filter((post) => post.personId === currentUserId);
  }
  body.innerHTML = `
    <div class="profile-pop-head">
      ${avatarHtml(person, "avatar big-avatar")}
      <div>
        <h2>${escapeHtml(person.name || "同学")} · ${escapeHtml(person.mbti || "MBTI")}</h2>
        <p>${escapeHtml(person.school || "学校未填")}｜${escapeHtml(person.major || "专业未填")}｜${escapeHtml(person.goal || "搭子")}</p>
      </div>
    </div>
    <p class="profile-bio">${escapeHtml(person.bio || "这个同学还没有填写介绍。")}</p>
    <div class="tag-row">${(person.interests || []).map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div>
    <div class="profile-actions">
      ${person.id !== currentUserId ? `<button class="btn primary" id="modalAddFriend" type="button">${isFriend(person.id) ? "已是好友" : "添加好友"}</button><button class="btn subtle danger" id="modalDeleteFriend" type="button">删除好友</button>` : ""}
    </div>
    <div class="section-head compact">
      <p class="eyebrow">广场动态</p>
      <h2>TA 发过的广场消息</h2>
    </div>
    <div class="mini-posts">${posts.length ? posts.map((post) => `<article><strong>${escapeHtml(post.time || "刚刚")}</strong><p>${escapeHtml(post.content)}</p></article>`).join("") : "<p class='empty'>还没有广场消息。</p>"}</div>
  `;
  modal.classList.remove("hidden");
  $("#modalAddFriend")?.addEventListener("click", async () => {
    await addFriend(person.id);
    await openPersonModal(person.id);
  });
  $("#modalDeleteFriend")?.addEventListener("click", async () => {
    await deleteFriend(person.id);
    modal.classList.add("hidden");
    await renderContacts();
  });
  $$("[data-close-person]").forEach((btn) => btn.addEventListener("click", () => modal.classList.add("hidden")));
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
  const posts = mergePosts(remotePosts, localPosts).filter((post) => isFresh(post.createdAt, 7) || String(post.id).startsWith("weekly_"));
  peopleCache = mergePeople(peopleCache, posts.map((post) => post.person).filter(Boolean));
  feed.innerHTML = posts.map((post) => {
    const isSystem = post.personId === "system_plaza";
    const person = isSystem ? { id: "system_plaza", name: post.authorName || "HaDaZi 广场", avatar: "HD", mbti: "系统", school: "本周广场" } : post.person || getPerson(post.personId) || getPerson("me");
    const isMine = post.personId === "me" || post.personId === currentUserId;
    return `
      <article class="post-card">
        <div class="post-head">
          <button class="person-trigger" ${!isSystem ? `data-chat="${person.id}"` : ""} type="button">
            ${avatarHtml(person)}
            <span><h3>${escapeHtml(person.name || "同学")} · ${escapeHtml(person.mbti || "MBTI")}</h3><span>${escapeHtml(person.school || "学校未填")}｜${escapeHtml(post.time || "刚刚")}</span></span>
          </button>
        </div>
        <p class="post-content">${escapeHtml(post.content)}</p>
        ${Number(post.photos) > 0 ? `<div class="post-photo-grid">${Array.from({ length: Number(post.photos) }, () => `<div class="post-photo"></div>`).join("")}</div>` : ""}
        <div class="tag-row">${(post.tags || []).map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div>
        <p>❤️ ${post.likes || 0}　💬 ${(post.comments || []).slice(0, 2).map(escapeHtml).join(" / ")}</p>
        <div class="post-actions">
          ${!isSystem && !isMine ? `<button class="btn primary" data-chat="${person.id}">聊天</button><button class="btn ghost" data-add-friend="${person.id}">${isFriend(person.id) ? "已是好友" : "添加好友"}</button>` : isMine ? `<a class="btn ghost" href="profile.html">查看个人页面</a>` : `<a class="btn ghost" href="groups.html">去大厅</a>`}
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
      photos: Number($("#postPhotos").value || 0),
      createdAt: new Date().toISOString()
    };
    localPosts.unshift(post);
    savePosts();
    await api("/api/posts", { method: "POST", body: JSON.stringify(post) }).catch((error) => toast(error.message));
    location.href = "plaza.html";
  });
}

function renderProfileResume() {
  const box = $("#profileResume");
  if (!box) return;
  if (!isLoggedIn()) {
    box.innerHTML = `<p class="empty">请先在首页用手机号登录或注册。</p>`;
    setTimeout(() => { location.href = "index.html"; }, 800);
    return;
  }
  box.innerHTML = `
    <div class="resume-head">
      ${avatarHtml(myPerson(), "avatar resume-avatar")}
      <div>
        <p class="eyebrow">我的简历</p>
        <h2>${escapeHtml(profile.nickname || "我")} · ${escapeHtml(profile.mbti || "未设置 MBTI")}</h2>
        <p>${escapeHtml(profile.school || "我的大学")}｜${escapeHtml(profile.major || "未填写")}｜${escapeHtml(profile.gender || "未设置")}｜${escapeHtml(String(profile.age || ""))}岁</p>
      </div>
    </div>
    <div class="resume-grid">
      <article><span>想找</span><strong>${escapeHtml(profile.goal || "饭搭子")}</strong></article>
      <article><span>可约时间</span><strong>${escapeHtml(profile.time || "周末白天")}</strong></article>
      <article><span>星座</span><strong>${escapeHtml(profile.zodiac || "未设置")}</strong></article>
      <article><span>手机号</span><strong>${escapeHtml(profile.phone || "未登录")}</strong></article>
    </div>
    <section class="resume-section">
      <h3>一句话介绍</h3>
      <p>${escapeHtml(profile.bio || "还没有填写一句话介绍。")}</p>
    </section>
    <section class="resume-section">
      <h3>个人简历</h3>
      <p>${escapeHtml(profile.resume || "还没有填写简历。")}</p>
    </section>
    <section class="resume-section">
      <h3>兴趣标签</h3>
      <div class="tag-row">${(profile.interests || []).length ? profile.interests.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("") : "<span>暂未填写</span>"}</div>
    </section>
  `;
}

function initProfile() {
  const form = $("#profileForm");
  if (!form) return;
  if (!isLoggedIn()) {
    renderProfileResume();
    return;
  }
  renderProfileResume();
  $("#accountPhone").textContent = profile.phone ? `当前账号：${profile.phone}` : "当前账号：未登录";
  $("#zodiac").innerHTML = zodiacList.map((z) => `<option>${z}</option>`).join("");
  Object.entries(profile).forEach(([key, value]) => {
    const input = $(`#${key}`);
    if (!input) return;
    input.value = Array.isArray(value) ? value.join(",") : value;
  });
  $("#editProfileBtn")?.addEventListener("click", () => $("#profileEditModal").classList.remove("hidden"));
  $$("[data-close-profile]").forEach((btn) => btn.addEventListener("click", () => $("#profileEditModal").classList.add("hidden")));
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    profile = {
      ...profile,
      id: currentUserId,
      avatar: $("#avatar").value.trim(),
      avatarUrl: $("#avatarUrl").value.trim(),
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
      const oldPassword = $("#oldPassword")?.value.trim();
      const newPassword = $("#newPassword")?.value.trim();
      if (oldPassword || newPassword) {
        await api("/api/auth/password", {
          method: "POST",
          body: JSON.stringify({ userId: currentUserId, oldPassword, newPassword })
        });
      }
      await saveProfileRemote();
      $("#profileEditModal").classList.add("hidden");
      renderProfileResume();
      toast("资料已更新");
    } catch (error) {
      alert(error.message);
    }
  });
}

async function renderGroups() {
  if (!requireMbti()) return;
  markGroupUnread(false);
  const memberBox = $("#groupMembers");
  const messagesBox = $("#groupMessages");
  const form = $("#groupForm");
  const input = $("#groupInput");
  const notify = $("#groupNotify");
  if (!memberBox || !messagesBox || !form) return;
  notify.checked = localStorage.getItem(groupNotifyKey) !== "off";
  notify.addEventListener("change", () => localStorage.setItem(groupNotifyKey, notify.checked ? "on" : "off"));
  socket?.emit("group:join", GROUP_ID);

  const members = await api(`/api/groups/${GROUP_ID}/members`).catch(() => []);
  peopleCache = mergePeople(peopleCache, members);
  $("#groupMeta").textContent = `${members.length} 位已完成 MBTI 的同学在大厅`;
  memberBox.innerHTML = members.length ? members.map((member) => `
    <article class="member-card">
      ${avatarHtml(member, "avatar small-avatar")}
      <div><strong>${escapeHtml(member.name)}</strong><span>${escapeHtml(member.mbti)}｜${escapeHtml(member.goal || "搭子")}</span></div>
      ${member.id !== currentUserId ? `<button class="btn subtle" data-add-member="${member.id}" type="button">${isFriend(member.id) ? "已加" : "加好友"}</button>` : ""}
    </article>
  `).join("") : `<p class="empty">暂时没有其他群成员。</p>`;
  memberBox.querySelectorAll("[data-add-member]").forEach((btn) => btn.addEventListener("click", async () => {
    await addFriend(btn.dataset.addMember);
    await renderGroups();
  }));

  const render = () => {
    groupMessages = groupMessages.filter((msg) => isFresh(msg.time, 3));
    messagesBox.innerHTML = groupMessages.length ? groupMessages.map(groupMessageHtml).join("") : `<p class="empty">大厅还没有消息，发一句开始唠嗑吧。</p>`;
    messagesBox.scrollTop = messagesBox.scrollHeight;
    messagesBox.querySelectorAll("[data-revoke-group]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const msg = await api(`/api/groups/${GROUP_ID}/messages/${btn.dataset.revokeGroup}/revoke`, { method: "POST" });
        groupMessages = groupMessages.map((item) => item.id === msg.id ? msg : item);
        render();
      });
    });
  };
  activeGroupRender = render;
  groupMessages = await api(`/api/groups/${GROUP_ID}/messages`).catch(() => []);
  render();

  $("#groupEmojiBtn")?.addEventListener("click", () => {
    input.value += "😊";
    input.focus();
  });
  $("#groupImage")?.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 800 * 1024) {
      alert("图片请控制在 800KB 以内。");
      return;
    }
    const imageData = await fileToDataUrl(file);
    await sendGroupMessage({ kind: "image", text: "[图片]", imageData }, render);
    event.target.value = "";
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    await sendGroupMessage({ kind: "text", text }, render);
  });
}

function groupMessageHtml(msg) {
  const mine = msg.fromUserId === currentUserId || msg.userId === currentUserId;
  const sender = mine ? myPerson() : getPerson(msg.fromUserId) || { name: msg.senderName || "同学", avatar: msg.senderAvatar, avatarUrl: msg.senderAvatarUrl };
  const body = msg.revoked ? "这条消息已撤回" : msg.kind === "image" && msg.imageData ? `<img class="chat-image" src="${escapeAttr(msg.imageData)}" alt="大厅图片" />` : escapeHtml(msg.text);
  return `
    <div class="message-row ${mine ? "me" : "other"}">
      ${!mine ? avatarHtml(sender, "avatar chat-avatar") : ""}
      <div class="message-stack">
        <span class="message-name">${mine ? "我" : escapeHtml(sender.name || "同学")}</span>
        <p class="bubble ${mine ? "me" : ""}">${body}<br><small>${formatTime(msg.time)}</small></p>
        ${mine && !msg.revoked ? `<button class="revoke-btn" data-revoke-group="${msg.id}" type="button">撤回</button>` : ""}
      </div>
      ${mine ? avatarHtml(sender, "avatar chat-avatar") : ""}
    </div>
  `;
}

async function sendGroupMessage(payload, render) {
  if (!requireMbti()) return;
  const saved = await api(`/api/groups/${GROUP_ID}/messages`, {
    method: "POST",
    body: JSON.stringify({
      userId: currentUserId,
      senderName: profile.nickname,
      senderAvatar: profile.avatar,
      senderAvatarUrl: profile.avatarUrl,
      ...payload
    })
  }).catch((error) => {
    toast(error.message);
    return null;
  });
  if (saved) {
    groupMessages.push(saved);
    render();
  }
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
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
    chats[otherId].push({
      id: msg.id,
      from: "other",
      fromUserId: msg.fromUserId,
      userId: msg.userId,
      toUserId: msg.toUserId,
      personId: msg.personId,
      text: msg.text,
      kind: msg.kind || "text",
      imageData: msg.imageData || "",
      revoked: Boolean(msg.revoked),
      rawTime: msg.time,
      time: formatTime(msg.time)
    });
    saveChats();
    if (document.body.dataset.page !== "chat" || new URLSearchParams(location.search).get("id") !== otherId) {
      markPrivateUnread(otherId, true);
    }
    if (activePrivateRender) activePrivateRender();
  });
  socket.on("chat:revoke", (msg) => {
    Object.keys(chats).forEach((key) => {
      chats[key] = (chats[key] || []).map((item) => item.id === msg.id ? { ...item, revoked: true, text: "这条消息已撤回", imageData: "", kind: "text" } : item);
    });
    saveChats();
    if (activePrivateRender) activePrivateRender();
  });
  socket.on("group:message", (msg) => {
    if (msg.fromUserId === currentUserId) return;
    groupMessages.push(msg);
    if (document.body.dataset.page !== "groups") markGroupUnread(true);
    if (localStorage.getItem(groupNotifyKey) !== "off") toast(`大厅新消息：${msg.senderName || "同学"}`);
    if (activeGroupRender) activeGroupRender();
  });
  socket.on("group:revoke", (msg) => {
    groupMessages = groupMessages.map((item) => item.id === msg.id ? msg : item);
    if (activeGroupRender) activeGroupRender();
  });
}

function nowTime() {
  return new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

function formatTime(value) {
  if (!value) return nowTime();
  return new Date(value).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
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

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, "&#096;");
}

async function init() {
  initSocket();
  if (isLoggedIn()) await refreshProfile().catch(() => {});
  updateNavBadges();
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
  if (page === "groups") await renderGroups();
}

init();
