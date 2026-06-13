const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const storageKey = "hadaziProfile";
const legacyProfileKey = "campusSoulProfile";
const friendKey = "hadaziFriends";
const legacyFriendKey = "campusSoulFriends";
const chatKey = "hadaziChats";
const legacyChatKey = "campusSoulChats";
const postKey = "hadaziPosts";
const userIdKey = "hadaziUserId";
const currentUserId = localStorage.getItem(userIdKey) || `user_${Date.now()}_${Math.random().toString(16).slice(2)}`;
localStorage.setItem(userIdKey, currentUserId);

const backendEnabled = location.protocol.startsWith("http");
let socket = null;
let currentFilter = "all";

const zodiacList = [
  "白羊座", "金牛座", "双子座", "巨蟹座", "狮子座", "处女座",
  "天秤座", "天蝎座", "射手座", "摩羯座", "水瓶座", "双鱼座"
];

const mbtiPairs = {
  INTJ: ["ENFP", "ENTP", "INFJ", "INTP"],
  INTP: ["ENTJ", "ENFJ", "ENTP", "INTJ"],
  ENTJ: ["INTP", "INFP", "ENTP", "ENFJ"],
  ENTP: ["INFJ", "INTJ", "ENFP", "INTP"],
  INFJ: ["ENTP", "ENFP", "INTJ", "ENFJ"],
  INFP: ["ENFJ", "ENTJ", "INFJ", "ENFP"],
  ENFJ: ["INFP", "INTP", "INFJ", "ENFP"],
  ENFP: ["INTJ", "INFJ", "ENTP", "INFP"],
  ISTJ: ["ESFP", "ESTP", "ISFJ", "ESTJ"],
  ISFJ: ["ESFP", "ESTP", "ISTJ", "ESFJ"],
  ESTJ: ["ISFP", "ISTP", "ISTJ", "ENTJ"],
  ESFJ: ["ISFP", "ISTP", "ISFJ", "ENFJ"],
  ISTP: ["ESFJ", "ESTJ", "ESTP", "ISFP"],
  ISFP: ["ESTJ", "ESFJ", "ENFP", "ISTP"],
  ESTP: ["ISFJ", "ISTJ", "ESFP", "ISTP"],
  ESFP: ["ISTJ", "ISFJ", "ESTP", "ESFJ"]
};

const people = [
  {
    id: "linxia",
    name: "林夏",
    mbti: "ENFP",
    zodiac: "射手座",
    school: "海城大学",
    major: "新闻传播",
    gender: "女",
    age: 20,
    birthday: "2005-12-06",
    goal: "旅行搭子",
    time: "周末白天",
    interests: ["摄影", "City Walk", "Livehouse", "探店"],
    bio: "喜欢记录生活，想找能一起拍照、看展和探索城市的朋友。",
    greeting: "我看你也喜欢新鲜活动，周末要不要一起去市集？"
  },
  {
    id: "chengmo",
    name: "程墨",
    mbti: "INTP",
    zodiac: "水瓶座",
    school: "北岸理工",
    major: "人工智能",
    gender: "男",
    age: 21,
    birthday: "2004-02-02",
    goal: "游戏搭子",
    time: "工作日晚上",
    interests: ["编程", "桌游", "原神", "科幻电影"],
    bio: "慢热但好聊，喜欢技术脑洞和策略游戏。",
    greeting: "你平时玩什么游戏？可以一起开黑或者聊点技术脑洞。"
  },
  {
    id: "qiyue",
    name: "祁月",
    mbti: "ISFJ",
    zodiac: "巨蟹座",
    school: "海城大学",
    major: "临床医学",
    gender: "女",
    age: 22,
    birthday: "2003-07-01",
    goal: "学习搭子",
    time: "每天都可以",
    interests: ["自习", "咖啡", "纪录片", "慢跑"],
    bio: "想找固定自习搭子，互相监督，也可以一起吃饭。",
    greeting: "我最近在图书馆三楼自习，你有固定学习时间吗？"
  },
  {
    id: "haoran",
    name: "浩然",
    mbti: "ESTP",
    zodiac: "白羊座",
    school: "东湖学院",
    major: "体育教育",
    gender: "男",
    age: 20,
    birthday: "2005-04-03",
    goal: "运动搭子",
    time: "周末晚上",
    interests: ["篮球", "健身", "骑行", "桌球"],
    bio: "行动派，喜欢运动和线下活动，想找长期球友。",
    greeting: "你喜欢运动的话，周五晚上一起打球？"
  },
  {
    id: "nanzhi",
    name: "南栀",
    mbti: "INFP",
    zodiac: "双鱼座",
    school: "海城艺术学院",
    major: "视觉传达",
    gender: "女",
    age: 19,
    birthday: "2006-03-08",
    goal: "饭搭子",
    time: "周末白天",
    interests: ["插画", "电影", "甜品", "猫"],
    bio: "喜欢安静但不无聊的相处，想找一起探店和看电影的朋友。",
    greeting: "你喜欢甜品吗？我收藏了几家很适合拍照的小店。"
  },
  {
    id: "yuchen",
    name: "俞辰",
    mbti: "ENTJ",
    zodiac: "狮子座",
    school: "南川大学",
    major: "工商管理",
    gender: "男",
    age: 22,
    birthday: "2003-08-12",
    goal: "学习搭子",
    time: "工作日晚上",
    interests: ["创业", "辩论", "健身", "效率工具"],
    bio: "目标感比较强，想找能一起备赛、做项目的伙伴。",
    greeting: "我正在组一个商业案例比赛队伍，你有兴趣一起试试吗？"
  }
];

const seedPosts = [
  {
    id: "post_linxia_1",
    personId: "linxia",
    time: "10 分钟前",
    content: "今天下午想去老城区 City Walk，顺便拍几张校园写真，有没有同学一起？我可以帮你拍头像。",
    tags: ["摄影", "City Walk", "周末搭子"],
    likes: 42,
    comments: ["想去！", "这个路线我熟"],
    photos: 3
  },
  {
    id: "post_qiyue_1",
    personId: "qiyue",
    time: "28 分钟前",
    content: "图书馆三楼靠窗位置真的很适合复习。想找一个长期自习搭子，互相打卡，不卷但别鸽。",
    tags: ["自习", "考研", "学习搭子"],
    likes: 36,
    comments: ["我也在三楼", "求加入"],
    photos: 1
  },
  {
    id: "post_haoran_1",
    personId: "haoran",
    time: "1 小时前",
    content: "今晚 7 点东操场打半场，缺 2 个。新手也可以，主要是运动一下。",
    tags: ["篮球", "运动搭子", "今晚"],
    likes: 58,
    comments: ["报名", "带水！"],
    photos: 2
  }
];

const defaultProfile = {
  nickname: "我",
  gender: "未设置",
  age: "",
  birthday: "",
  zodiac: "天秤座",
  mbti: "ENFP",
  school: "我的大学",
  major: "未填写",
  goal: "饭搭子",
  time: "周末白天",
  interests: ["电影", "自习", "奶茶", "羽毛球"],
  resume: "大二学生，想找合得来的校园搭子。",
  bio: "想找合得来的校园搭子。"
};

let profile = loadProfile();
let friends = loadArray(friendKey, legacyFriendKey);
let chats = loadObject(chatKey, legacyChatKey);
let localPosts = loadArray(postKey);

function loadProfile() {
  try {
    const current = JSON.parse(localStorage.getItem(storageKey) || "null");
    const legacy = JSON.parse(localStorage.getItem(legacyProfileKey) || "null");
    return { ...defaultProfile, ...(legacy || {}), ...(current || {}) };
  } catch {
    return { ...defaultProfile };
  }
}

function saveProfile() {
  localStorage.setItem(storageKey, JSON.stringify(profile));
  if (!backendEnabled) return;
  fetch("/api/profile", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...profile, id: currentUserId })
  }).catch(() => {});
}

function loadArray(key, legacyKey = "") {
  try {
    const current = JSON.parse(localStorage.getItem(key) || "null");
    const legacy = legacyKey ? JSON.parse(localStorage.getItem(legacyKey) || "null") : null;
    return Array.isArray(current) ? current : Array.isArray(legacy) ? legacy : [];
  } catch {
    return [];
  }
}

function loadObject(key, legacyKey = "") {
  try {
    const current = JSON.parse(localStorage.getItem(key) || "null");
    const legacy = legacyKey ? JSON.parse(localStorage.getItem(legacyKey) || "null") : null;
    return current && typeof current === "object" ? current : legacy && typeof legacy === "object" ? legacy : {};
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
  if (!response.ok) throw new Error(`接口请求失败：${response.status}`);
  return response.json();
}

function getPerson(personId) {
  if (personId === "me") {
    return {
      id: "me",
      name: profile.nickname || "我",
      mbti: profile.mbti || "未设置",
      zodiac: profile.zodiac || "未设置",
      school: profile.school || "我的大学",
      major: profile.major || "未填写",
      gender: profile.gender || "未设置",
      age: profile.age || "",
      birthday: profile.birthday || "",
      goal: profile.goal || "饭搭子",
      time: profile.time || "周末白天",
      interests: profile.interests || [],
      bio: profile.bio || "",
      greeting: "这是你发布的动态。"
    };
  }
  return people.find((item) => item.id === personId);
}

function isFriend(personId) {
  return friends.includes(personId);
}

function addFriend(personId, silent = false) {
  const person = getPerson(personId);
  if (!person || personId === "me") return;
  if (!friends.includes(personId)) {
    friends.push(personId);
    saveFriends();
    api("/api/friends", {
      method: "POST",
      body: JSON.stringify({ userId: currentUserId, personId })
    }).catch(() => {});
    if (!silent) toast(`已添加 ${person.name} 到联系人`);
  } else if (!silent) {
    toast(`${person.name} 已经在联系人里`);
  }
}

function calcMatch(person) {
  let score = 48;
  const reasons = [];
  const bestPairs = mbtiPairs[profile.mbti] || [];
  const interests = Array.isArray(profile.interests) ? profile.interests : [];
  if (person.mbti === profile.mbti) {
    score += 18;
    reasons.push("人格相同");
  } else if (bestPairs.includes(person.mbti)) {
    score += 28;
    reasons.push("MBTI 合拍");
  }
  const common = person.interests.filter((tag) => interests.includes(tag));
  score += Math.min(common.length * 8, 24);
  if (common.length) reasons.push(`共同兴趣：${common.join("、")}`);
  if (person.goal === profile.goal) {
    score += 14;
    reasons.push(`都想找${person.goal}`);
  }
  if (person.zodiac === profile.zodiac) {
    score += 5;
    reasons.push("星座相同");
  }
  return { score: Math.max(58, Math.min(99, score)), reasons: reasons.slice(0, 3) };
}

function sortedPeople() {
  return people
    .map((person) => ({ ...person, match: calcMatch(person) }))
    .filter((person) => currentFilter === "all" || person.goal === currentFilter)
    .sort((a, b) => b.match.score - a.match.score);
}

function renderHome() {
  const list = $("#matchList");
  if (!list) return;
  list.innerHTML = sortedPeople().map((person) => `
    <article class="person-card">
      <button class="person-top" data-chat="${person.id}" type="button">
        <div class="avatar">${person.name.slice(0, 1)}</div>
        <div>
          <h3>${person.name} · ${person.mbti}</h3>
          <span>${person.gender}｜${person.age}岁｜${person.zodiac}｜${person.school}</span>
        </div>
      </button>
      <div class="score-line"><span>合拍指数</span><strong>${person.match.score}%</strong></div>
      <div class="bar"><span style="width:${person.match.score}%"></span></div>
      <p>${person.bio}</p>
      <div class="tag-row">${person.interests.map((tag) => `<span>${tag}</span>`).join("")}</div>
      <div class="score-detail">${person.match.reasons.join("｜") || "完善个人资料后推荐更准"}</div>
      <div class="match-actions">
        <button class="btn primary" data-chat="${person.id}">聊天</button>
        <button class="btn ghost" data-add-friend="${person.id}">${isFriend(person.id) ? "已是好友" : "添加好友"}</button>
      </div>
    </article>
  `).join("");

  list.querySelectorAll("[data-chat]").forEach((btn) => {
    btn.addEventListener("click", () => {
      addFriend(btn.dataset.chat);
      location.href = `chat.html?id=${encodeURIComponent(btn.dataset.chat)}`;
    });
  });
  list.querySelectorAll("[data-add-friend]").forEach((btn) => {
    btn.addEventListener("click", () => {
      addFriend(btn.dataset.addFriend);
      renderHome();
    });
  });

  $$(".chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      $$(".chip").forEach((item) => item.classList.remove("active"));
      chip.classList.add("active");
      currentFilter = chip.dataset.filter;
      renderHome();
    });
  });
}

function renderContacts() {
  const list = $("#contactsList");
  if (!list) return;
  const contactPeople = friends.map(getPerson).filter(Boolean);
  list.innerHTML = contactPeople.length ? contactPeople.map((person) => `
    <article class="contact-card" data-chat="${person.id}">
      <div class="contact-main">
        <span class="avatar">${person.name.slice(0, 1)}</span>
        <span class="contact-info">
          <h3>${person.name} · ${person.mbti}</h3>
          <span>${person.gender}｜${person.age}岁｜${person.zodiac}｜${person.goal}</span>
        </span>
      </div>
      <div class="contact-actions">
        <a class="btn primary" href="chat.html?id=${person.id}">聊天</a>
      </div>
    </article>
  `).join("") : `<p class="empty">还没有联系人。先去首页匹配朋友，点击“添加好友”后会出现在这里。</p>`;
  list.querySelectorAll(".contact-card").forEach((card) => {
    card.addEventListener("click", (event) => {
      if (event.target.closest("a")) return;
      location.href = `chat.html?id=${encodeURIComponent(card.dataset.chat)}`;
    });
  });
}

function seedChat(personId) {
  if (chats[personId]?.length) return;
  const person = getPerson(personId);
  chats[personId] = [{ from: "other", text: person?.greeting || "你好呀，很高兴认识你。", time: nowTime() }];
  saveChats();
}

function renderChat() {
  const params = new URLSearchParams(location.search);
  const personId = params.get("id") || friends[0] || people[0].id;
  const person = getPerson(personId);
  if (!person) return;
  addFriend(personId, true);
  seedChat(personId);
  $("#chatTitle").textContent = `${person.name} · ${person.mbti}`;
  $("#chatMeta").textContent = `${person.gender}｜${person.age}岁｜${person.zodiac}｜${person.goal}`;
  const messages = $("#messages");
  const render = () => {
    messages.innerHTML = (chats[personId] || []).map((msg) => `
      <p class="bubble ${msg.from === "me" ? "me" : ""}">${msg.text}<br><small>${msg.time}</small></p>
    `).join("");
    messages.scrollTop = messages.scrollHeight;
  };
  render();
  $("#chatForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const input = $("#messageInput");
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    sendMessage(personId, text, render);
  });
}

function sendMessage(personId, text, render) {
  chats[personId] = chats[personId] || [];
  chats[personId].push({ from: "me", text, time: nowTime() });
  saveChats();
  api("/api/messages", {
    method: "POST",
    body: JSON.stringify({ userId: currentUserId, personId, from: "me", text })
  }).catch(() => {});
  render();
  setTimeout(() => {
    const person = getPerson(personId);
    const replies = [
      "可以呀，我觉得这个安排挺合适的。",
      "听起来不错！你一般什么时候有空？",
      `哈哈我也喜欢${person.interests[0]}，可以一起试试。`,
      "那我们先约一个校园里比较方便的地方？"
    ];
    chats[personId].push({ from: "other", text: replies[Math.floor(Math.random() * replies.length)], time: nowTime() });
    saveChats();
    render();
  }, 700);
}

function renderPlaza() {
  const feed = $("#plazaFeed");
  if (!feed) return;
  const posts = [...localPosts, ...seedPosts];
  feed.innerHTML = posts.map((post) => {
    const person = getPerson(post.personId) || getPerson("me");
    return `
      <article class="post-card">
        <div class="post-head">
          <button class="person-trigger" data-chat="${person.id}" type="button">
            <span class="avatar">${person.name.slice(0, 1)}</span>
            <span><h3>${person.name} · ${person.mbti}</h3><span>${person.school}｜${post.time}</span></span>
          </button>
        </div>
        <p class="post-content">${escapeHtml(post.content)}</p>
        ${Number(post.photos) > 0 ? `<div class="post-photo-grid">${Array.from({ length: Number(post.photos) }, () => `<div class="post-photo"></div>`).join("")}</div>` : ""}
        <div class="tag-row">${(post.tags || []).map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div>
        <p>❤️ ${post.likes || 0}　💬 ${(post.comments || []).slice(0, 2).join(" / ")}</p>
        <div class="post-actions">
          ${person.id !== "me" ? `<button class="btn primary" data-chat="${person.id}">聊天</button><button class="btn ghost" data-add-friend="${person.id}">${isFriend(person.id) ? "已是好友" : "添加好友"}</button>` : `<a class="btn ghost" href="profile.html">查看个人页面</a>`}
          <button class="btn subtle" data-like-post>点赞</button>
        </div>
      </article>
    `;
  }).join("");
  feed.querySelectorAll("[data-chat]").forEach((btn) => {
    btn.addEventListener("click", () => {
      addFriend(btn.dataset.chat);
      location.href = `chat.html?id=${encodeURIComponent(btn.dataset.chat)}`;
    });
  });
  feed.querySelectorAll("[data-add-friend]").forEach((btn) => {
    btn.addEventListener("click", () => {
      addFriend(btn.dataset.addFriend);
      renderPlaza();
    });
  });
  feed.querySelectorAll("[data-like-post]").forEach((btn) => {
    btn.addEventListener("click", () => {
      btn.textContent = "已点赞";
      btn.disabled = true;
    });
  });
}

function initPublish() {
  const form = $("#publishForm");
  if (!form) return;
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const content = $("#postContent").value.trim();
    if (!content) {
      toast("先写一点动态内容");
      return;
    }
    const post = {
      id: `post_me_${Date.now()}`,
      personId: "me",
      time: "刚刚",
      content,
      tags: $("#postTags").value.split(/[,，]/).map((item) => item.trim()).filter(Boolean),
      likes: 0,
      comments: [],
      photos: Number($("#postPhotos").value || 0)
    };
    localPosts.unshift(post);
    savePosts();
    api("/api/posts", {
      method: "POST",
      body: JSON.stringify({ ...post, userId: currentUserId, authorName: profile.nickname })
    }).catch(() => {});
    location.href = "plaza.html";
  });
}

function initProfile() {
  const form = $("#profileForm");
  if (!form) return;
  $("#zodiac").innerHTML = zodiacList.map((z) => `<option>${z}</option>`).join("");
  Object.entries(profile).forEach(([key, value]) => {
    const input = $(`#${key}`);
    if (!input) return;
    input.value = Array.isArray(value) ? value.join(",") : value;
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    profile = {
      ...profile,
      nickname: $("#nickname").value.trim() || "我",
      gender: $("#gender").value,
      age: $("#age").value,
      birthday: $("#birthday").value,
      zodiac: $("#zodiac").value,
      mbti: $("#mbti").value,
      school: $("#school").value.trim() || "我的大学",
      major: $("#major").value.trim() || "未填写",
      goal: $("#goal").value,
      time: $("#time").value,
      interests: $("#interests").value.split(/[,，]/).map((item) => item.trim()).filter(Boolean),
      resume: $("#resume").value.trim(),
      bio: $("#bio").value.trim()
    };
    saveProfile();
    toast("个人资料已保存");
  });
}

function initSocket() {
  if (backendEnabled && window.io) {
    socket = io();
    socket.emit("join", currentUserId);
  }
}

function nowTime() {
  return new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

function toast(message) {
  const old = $(".toast");
  if (old) old.remove();
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2000);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[char]));
}

function init() {
  initSocket();
  saveProfile();
  const page = document.body.dataset.page;
  if (page === "home") renderHome();
  if (page === "contacts") renderContacts();
  if (page === "chat") renderChat();
  if (page === "plaza") renderPlaza();
  if (page === "publish") initPublish();
  if (page === "profile") initProfile();
}

init();
