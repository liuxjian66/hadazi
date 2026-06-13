const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const storageKey = "campusSoulProfile";
const chatKey = "campusSoulChats";
const friendKey = "campusSoulFriends";
const userIdKey = "campusSoulUserId";
const currentUserId = localStorage.getItem(userIdKey) || `user_${Date.now()}_${Math.random().toString(16).slice(2)}`;
localStorage.setItem(userIdKey, currentUserId);
const backendEnabled = location.protocol.startsWith("http");
let socket = null;

const zodiacList = [
  "白羊座", "金牛座", "双子座", "巨蟹座", "狮子座", "处女座",
  "天秤座", "天蝎座", "射手座", "摩羯座", "水瓶座", "双鱼座"
];

const mbtiText = {
  INTJ: "独立、目标感强，适合找能一起深度学习和做项目的搭子。",
  INTP: "好奇、理性，适合找能讨论脑洞、游戏和技术的朋友。",
  ENTJ: "行动力强、喜欢组织，适合找一起比赛、创业、社团活动的伙伴。",
  ENTP: "点子多、喜欢新鲜事，适合找能一起探索城市和玩梗的同学。",
  INFJ: "敏感真诚、重视深度关系，适合慢热但稳定的交友方式。",
  INFP: "浪漫、有共情力，适合找一起看电影、写作、散步的朋友。",
  ENFJ: "热情会照顾人，适合社交活动、社团和团队学习场景。",
  ENFP: "外向有感染力，适合找一起拍照、旅行、参加活动的朋友。",
  ISTJ: "可靠、自律，适合找学习搭子、考证搭子和规律运动搭子。",
  ISFJ: "温和细心，适合稳定吃饭、自习、互相照顾的校园关系。",
  ESTJ: "直接高效，适合找执行力强的运动、项目和竞赛搭子。",
  ESFJ: "亲和、重视氛围，适合饭搭子、宿舍圈、社团圈交友。",
  ISTP: "冷静、动手能力强，适合游戏、运动、摄影和户外体验。",
  ISFP: "审美好、随性，适合拍照、音乐、逛展和轻松陪伴。",
  ESTP: "活力高、爱体验，适合运动、桌游、旅行和线下活动。",
  ESFP: "开朗、会带动气氛，适合找娱乐、聚会和探店搭子。"
};

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

const questions = [
  { text: "周末你更想参加热闹活动，而不是一个人充电。", a: "E", b: "I" },
  { text: "认识新同学时，你通常会主动开启话题。", a: "E", b: "I" },
  { text: "你更关注现实细节，而不是抽象可能性。", a: "S", b: "N" },
  { text: "做选择时，你更相信经验和可验证的信息。", a: "S", b: "N" },
  { text: "发生矛盾时，你更先看逻辑是否合理。", a: "T", b: "F" },
  { text: "朋友难过时，你会先共情再分析问题。", a: "F", b: "T" },
  { text: "你喜欢提前计划行程，而不是临时决定。", a: "J", b: "P" },
  { text: "DDL 前你更愿意按计划推进，而不是最后冲刺。", a: "J", b: "P" },
  { text: "你会被新奇脑洞、未来可能性强烈吸引。", a: "N", b: "S" },
  { text: "社交中你更在意关系氛围和对方感受。", a: "F", b: "T" },
  { text: "你喜欢边做边调整，而不是先把规则定死。", a: "P", b: "J" },
  { text: "大型聚会结束后，你通常还会觉得有能量。", a: "E", b: "I" }
];

const samplePeople = [
  {
    id: "linxia",
    name: "林夏",
    mbti: "ENFP",
    zodiac: "射手座",
    school: "海城大学",
    major: "新闻传播",
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
    goal: "学习搭子",
    time: "工作日晚上",
    interests: ["创业", "辩论", "健身", "效率工具"],
    bio: "目标感比较强，想找能一起备赛、做项目的伙伴。",
    greeting: "我正在组一个商业案例比赛队伍，你有兴趣一起试试吗？"
  }
];

const plazaPosts = [
  {
    id: "post_linxia_1",
    personId: "linxia",
    time: "10 分钟前",
    content: "今天下午想去老城区 City Walk，顺便拍几张校园写真，有没有同学一起？我可以帮你拍头像。",
    tags: ["摄影", "City Walk", "周末搭子"],
    likes: 42,
    comments: ["想去！", "这个路线我熟", "可以带胶片机吗"],
    photos: 3
  },
  {
    id: "post_qiyue_1",
    personId: "qiyue",
    time: "28 分钟前",
    content: "图书馆三楼靠窗位置真的很适合复习。想找一个长期自习搭子，互相打卡，不卷但别鸽。",
    tags: ["自习", "考研", "学习搭子"],
    likes: 36,
    comments: ["我也在三楼", "求加入", "晚上还在吗"],
    photos: 1
  },
  {
    id: "post_haoran_1",
    personId: "haoran",
    time: "1 小时前",
    content: "今晚 7 点东操场打半场，缺 2 个。新手也可以，主要是运动一下。",
    tags: ["篮球", "运动搭子", "今晚"],
    likes: 58,
    comments: ["报名", "有女生局吗", "带水！"],
    photos: 2
  },
  {
    id: "post_nanzhi_1",
    personId: "nanzhi",
    time: "2 小时前",
    content: "新开的甜品店试吃成功，适合聊天也适合拍照。想找一个周末饭搭子，慢慢认识也可以。",
    tags: ["甜品", "饭搭子", "拍照"],
    likes: 64,
    comments: ["店名求私", "看起来好吃", "周末有空"],
    photos: 3
  }
];

const defaultProfile = {
  nickname: "我",
  school: "我的大学",
  major: "未填写",
  zodiac: "天秤座",
  goal: "饭搭子",
  time: "周末白天",
  interests: ["电影", "自习", "奶茶", "羽毛球"],
  bio: "想找合得来的校园搭子。",
  mbti: ""
};

let profile = loadProfile();
let chats = loadChats();
let friends = loadFriends();
let currentChatId = samplePeople[0].id;
let currentModalChatId = "";
let currentFilter = "all";

function loadProfile() {
  try {
    return { ...defaultProfile, ...JSON.parse(localStorage.getItem(storageKey) || "{}") };
  } catch {
    return { ...defaultProfile };
  }
}

function saveProfile() {
  localStorage.setItem(storageKey, JSON.stringify(profile));
  syncProfileToBackend();
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

function syncProfileToBackend() {
  if (!backendEnabled) return;
  const body = JSON.stringify({ ...profile, id: currentUserId });
  fetch("/api/profile", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body
  }).catch(() => {
    console.warn("后端同步失败，当前仍可使用本地模式。");
  });
}

function loadChats() {
  try {
    return JSON.parse(localStorage.getItem(chatKey) || "{}");
  } catch {
    return {};
  }
}

function saveChats() {
  localStorage.setItem(chatKey, JSON.stringify(chats));
}

function loadFriends() {
  try {
    return JSON.parse(localStorage.getItem(friendKey) || "[]");
  } catch {
    return [];
  }
}

function saveFriends() {
  localStorage.setItem(friendKey, JSON.stringify(friends));
}

function getPerson(personId) {
  return samplePeople.find((item) => item.id === personId);
}

function isFriend(personId) {
  return friends.includes(personId);
}

function addFriend(personId, silent = false) {
  const person = getPerson(personId);
  if (!person) return;
  if (!isFriend(personId)) {
    friends.push(personId);
    saveFriends();
    syncFriendToBackend(personId);
    renderContacts();
    renderChatPeople();
    renderMatches();
    renderPlaza();
    if (!silent) toast(`已添加 ${person.name} 到联系人`);
  } else if (!silent) {
    toast(`${person.name} 已经在联系人里`);
  }
}

function syncFriendToBackend(personId) {
  if (!backendEnabled) return;
  api("/api/friends", {
    method: "POST",
    body: JSON.stringify({ userId: currentUserId, personId })
  }).catch(() => console.warn("好友关系已保存在本地，但后端同步失败。"));
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

function initNavigation() {
  const links = $$(".nav-link");
  const sections = links.map((link) => $(link.getAttribute("href")));
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      links.forEach((link) => {
        link.classList.toggle("active", link.getAttribute("href") === `#${entry.target.id}`);
      });
    });
  }, { threshold: 0.42 });
  sections.forEach((section) => section && observer.observe(section));
}

function initZodiac() {
  $("#zodiac").innerHTML = zodiacList.map((z) => `<option>${z}</option>`).join("");
}

function initQuiz() {
  const form = $("#mbtiForm");
  form.innerHTML = questions.map((q, index) => `
    <div class="question">
      <p>${index + 1}. ${q.text}</p>
      <label class="option">
        <input type="radio" name="q${index}" value="${q.a}" ${index % 2 === 0 ? "checked" : ""}>
        <span>同意</span>
      </label>
      <label class="option">
        <input type="radio" name="q${index}" value="${q.b}" ${index % 2 !== 0 ? "checked" : ""}>
        <span>不同意</span>
      </label>
    </div>
  `).join("");

  form.addEventListener("change", calculateMbti);
  calculateMbti();
}

function calculateMbti() {
  const scores = { E: 0, I: 0, S: 0, N: 0, T: 0, F: 0, J: 0, P: 0 };
  questions.forEach((_, index) => {
    const picked = $(`input[name="q${index}"]:checked`);
    if (picked) scores[picked.value] += 1;
  });

  const type = [
    scores.E >= scores.I ? "E" : "I",
    scores.S >= scores.N ? "S" : "N",
    scores.T >= scores.F ? "T" : "F",
    scores.J >= scores.P ? "J" : "P"
  ].join("");

  profile.mbti = type;
  saveProfile();
  $("#mbtiType").textContent = type;
  $("#mbtiDesc").textContent = mbtiText[type] || "这是你的简化测试结果，会自动参与推荐计算。";
  renderMatches();
  renderHero();
}

function initProfileForm() {
  $("#nickname").value = profile.nickname;
  $("#school").value = profile.school;
  $("#major").value = profile.major;
  $("#zodiac").value = profile.zodiac;
  $("#goal").value = profile.goal;
  $("#time").value = profile.time;
  $("#interests").value = profile.interests.join(",");
  $("#bio").value = profile.bio;

  $("#profileForm").addEventListener("submit", (event) => {
    event.preventDefault();
    profile = {
      ...profile,
      nickname: $("#nickname").value.trim() || "我",
      school: $("#school").value.trim() || "我的大学",
      major: $("#major").value.trim() || "未填写",
      zodiac: $("#zodiac").value,
      goal: $("#goal").value,
      time: $("#time").value,
      interests: $("#interests").value.split(/[,，]/).map((item) => item.trim()).filter(Boolean),
      bio: $("#bio").value.trim() || "想找合得来的校园搭子。"
    };
    saveProfile();
    renderMatches();
    renderChatPeople();
    renderHero();
    toast("资料已保存，推荐已刷新");
  });
}

function calcMatch(person) {
  let score = 48;
  const reasons = [];
  const bestPairs = mbtiPairs[profile.mbti] || [];

  if (!profile.mbti) {
    reasons.push("完成 MBTI 测试后更准");
  } else if (person.mbti === profile.mbti) {
    score += 18;
    reasons.push("MBTI 相同，沟通节奏接近");
  } else if (bestPairs.includes(person.mbti)) {
    score += 28;
    reasons.push("MBTI 合拍度高");
  } else if (person.mbti[0] === profile.mbti[0] || person.mbti[1] === profile.mbti[1]) {
    score += 12;
    reasons.push("性格有共同点");
  }

  const common = person.interests.filter((tag) => profile.interests.includes(tag));
  score += Math.min(common.length * 8, 24);
  if (common.length) reasons.push(`共同兴趣：${common.join("、")}`);

  if (person.goal === profile.goal) {
    score += 14;
    reasons.push(`都想找${person.goal}`);
  }

  if (person.time === profile.time) {
    score += 8;
    reasons.push("可约时间一致");
  }

  if (person.zodiac === profile.zodiac) {
    score += 5;
    reasons.push("星座相同，话题更容易打开");
  }

  return {
    score: Math.max(58, Math.min(99, score)),
    reasons: reasons.slice(0, 3)
  };
}

function getSortedPeople() {
  return samplePeople
    .map((person) => ({ ...person, match: calcMatch(person) }))
    .filter((person) => currentFilter === "all" || person.goal === currentFilter)
    .sort((a, b) => b.match.score - a.match.score);
}

function renderMatches() {
  const list = $("#matchList");
  if (!list) return;
  const people = getSortedPeople();
  list.innerHTML = people.map((person) => `
    <article class="person-card">
      <button class="person-top" data-open-chat="${person.id}" type="button">
        <div class="avatar">${person.name.slice(0, 1)}</div>
        <div>
          <h3>${person.name} · ${person.mbti}</h3>
          <span>${person.zodiac}｜${person.school}｜${person.major}</span>
        </div>
      </button>
      <div class="score-line">
        <span>合拍指数</span>
        <strong>${person.match.score}%</strong>
      </div>
      <div class="bar"><span style="width:${person.match.score}%"></span></div>
      <p>${person.bio}</p>
      <div class="tag-row">${person.interests.map((tag) => `<span>${tag}</span>`).join("")}</div>
      <div class="score-detail">${person.match.reasons.join("｜") || "完善资料后会出现推荐理由"}</div>
      <div class="match-actions">
        <button class="btn primary" data-like="${person.id}">${isFriend(person.id) ? "打开聊天" : "喜欢并聊天"}</button>
        <button class="btn ghost" data-add-friend="${person.id}">${isFriend(person.id) ? "已是好友" : "添加好友"}</button>
        <button class="btn subtle" data-pass="${person.id}">暂时跳过</button>
      </div>
    </article>
  `).join("") || `<p class="empty">这个分类暂时没有推荐，换个搭子类型试试。</p>`;

  $$("[data-open-chat]").forEach((btn) => {
    btn.addEventListener("click", () => openChatModal(btn.dataset.openChat));
  });

  $$("[data-like]").forEach((btn) => {
    btn.addEventListener("click", () => {
      currentChatId = btn.dataset.like;
      addFriend(currentChatId, true);
      seedChat(currentChatId);
      renderChatPeople();
      renderMessages();
      openChatModal(currentChatId);
      toast("已加入联系人并打开聊天");
    });
  });

  $$("[data-add-friend]").forEach((btn) => {
    btn.addEventListener("click", () => addFriend(btn.dataset.addFriend));
  });

  $$("[data-pass]").forEach((btn) => {
    btn.addEventListener("click", () => {
      btn.closest(".person-card").style.opacity = "0.45";
      btn.textContent = "已跳过";
      btn.disabled = true;
    });
  });
}

function initFilters() {
  $$(".chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      $$(".chip").forEach((item) => item.classList.remove("active"));
      chip.classList.add("active");
      currentFilter = chip.dataset.filter;
      renderMatches();
    });
  });
}

function seedChat(personId) {
  if (chats[personId]?.length) return;
  const person = samplePeople.find((item) => item.id === personId);
  chats[personId] = [
    { from: "other", text: person.greeting, time: nowTime() }
  ];
  saveChats();
}

function nowTime() {
  return new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

function renderChatPeople() {
  const box = $("#chatPeople");
  box.innerHTML = samplePeople.map((person) => {
    const count = chats[person.id]?.length || 0;
    return `
      <button class="person-tab ${person.id === currentChatId ? "active" : ""}" data-chat="${person.id}">
        <span class="avatar">${person.name.slice(0, 1)}</span>
        <span>
          <strong>${person.name}</strong><br>
          <small>${person.mbti}｜${person.goal}${count ? `｜${count}条` : ""}</small>
        </span>
      </button>
    `;
  }).join("");

  $$("[data-chat]").forEach((tab) => {
    tab.addEventListener("click", () => {
      currentChatId = tab.dataset.chat;
      seedChat(currentChatId);
      renderChatPeople();
      renderMessages();
    });
  });
}

function renderMessages() {
  const person = samplePeople.find((item) => item.id === currentChatId);
  $("#chatTitle").textContent = person ? `${person.name} · ${person.mbti}` : "选择一位同学开始聊天";
  $("#chatMeta").textContent = person ? `${person.goal}｜${person.zodiac}` : "本地模拟";

  const messages = chats[currentChatId] || [];
  $("#messages").innerHTML = messages.length
    ? messages.map((msg) => `<p class="bubble ${msg.from === "me" ? "me" : ""}">${msg.text}<br><small>${msg.time}</small></p>`).join("")
    : `<p class="empty">点击推荐卡片里的“喜欢并聊天”，或从左侧选择同学开始。</p>`;
  $("#messages").scrollTop = $("#messages").scrollHeight;
}

function renderPlaza() {
  const feed = $("#plazaFeed");
  if (!feed) return;
  feed.innerHTML = plazaPosts.map((post) => {
    const person = getPerson(post.personId);
    return `
      <article class="post-card">
        <div class="post-head">
          <button class="person-trigger" data-open-chat="${person.id}" type="button">
            <span class="avatar">${person.name.slice(0, 1)}</span>
            <span>
              <h3>${person.name} · ${person.mbti}</h3>
              <span>${person.school}｜${person.major}｜${post.time}</span>
            </span>
          </button>
        </div>
        <p class="post-content">${post.content}</p>
        <div class="post-photo-grid">
          ${Array.from({ length: post.photos }, () => `<div class="post-photo"></div>`).join("")}
        </div>
        <div class="tag-row">${post.tags.map((tag) => `<span>${tag}</span>`).join("")}</div>
        <p>❤️ ${post.likes}　💬 ${post.comments.slice(0, 2).join(" / ")}</p>
        <div class="post-actions">
          <button class="btn primary" data-open-chat="${person.id}">私信</button>
          <button class="btn ghost" data-add-friend="${person.id}">${isFriend(person.id) ? "已是好友" : "添加好友"}</button>
          <button class="btn subtle" data-like-post="${post.id}">点赞</button>
        </div>
      </article>
    `;
  }).join("");

  [...feed.querySelectorAll("[data-open-chat]")].forEach((btn) => {
    btn.addEventListener("click", () => openChatModal(btn.dataset.openChat));
  });

  [...feed.querySelectorAll("[data-add-friend]")].forEach((btn) => {
    btn.addEventListener("click", () => addFriend(btn.dataset.addFriend));
  });

  [...feed.querySelectorAll("[data-like-post]")].forEach((btn) => {
    btn.addEventListener("click", () => {
      btn.textContent = "已点赞";
      btn.disabled = true;
      toast("已点赞这条动态");
    });
  });
}

function renderContacts() {
  const list = $("#contactsList");
  if (!list) return;
  const people = friends.map(getPerson).filter(Boolean);
  list.innerHTML = people.length ? people.map((person) => `
    <article class="contact-card">
      <div class="contact-main">
        <button class="person-trigger" data-open-chat="${person.id}" type="button">
          <span class="avatar">${person.name.slice(0, 1)}</span>
          <span class="contact-info">
            <h3>${person.name} · ${person.mbti}</h3>
            <span>${person.zodiac}｜${person.goal}｜${person.interests.slice(0, 2).join("、")}</span>
          </span>
        </button>
      </div>
      <div class="contact-actions">
        <button class="btn primary" data-open-chat="${person.id}">聊天</button>
        <button class="btn ghost" data-go-chat="${person.id}">进入聊天页</button>
      </div>
    </article>
  `).join("") : `<p class="empty">还没有联系人。去广场或推荐匹配里点击“添加好友”，这里就会出现他。</p>`;

  [...list.querySelectorAll("[data-open-chat]")].forEach((btn) => {
    btn.addEventListener("click", () => openChatModal(btn.dataset.openChat));
  });

  [...list.querySelectorAll("[data-go-chat]")].forEach((btn) => {
    btn.addEventListener("click", () => {
      currentChatId = btn.dataset.goChat;
      seedChat(currentChatId);
      renderChatPeople();
      renderMessages();
      location.hash = "#chat";
    });
  });
}

function openChatModal(personId) {
  const person = getPerson(personId);
  if (!person) return;
  currentModalChatId = personId;
  seedChat(personId);
  $("#modalChatTitle").textContent = `${person.name} · ${person.mbti}`;
  $("#modalChatMeta").textContent = `${person.goal}｜${person.zodiac}`;
  renderModalMessages();
  $("#chatModal").classList.remove("hidden");
  $("#chatModal").setAttribute("aria-hidden", "false");
  $("#modalMessageInput").focus();
}

function closeChatModal() {
  $("#chatModal").classList.add("hidden");
  $("#chatModal").setAttribute("aria-hidden", "true");
}

function renderModalMessages() {
  const box = $("#modalMessages");
  const messages = chats[currentModalChatId] || [];
  box.innerHTML = messages.length
    ? messages.map((msg) => `<p class="bubble ${msg.from === "me" ? "me" : ""}">${msg.text}<br><small>${msg.time}</small></p>`).join("")
    : `<p class="empty">开始发送第一条消息吧。</p>`;
  box.scrollTop = box.scrollHeight;
}

function sendMessage(personId, text, renderAfterSend = true) {
  chats[personId] = chats[personId] || [];
  chats[personId].push({ from: "me", text, time: nowTime() });
  saveChats();

  if (backendEnabled) {
    api("/api/messages", {
      method: "POST",
      body: JSON.stringify({
        userId: currentUserId,
        personId,
        from: "me",
        text
      })
    }).catch(() => console.warn("消息已保存在本地，但后端发送失败。"));
  }

  setTimeout(() => {
    const person = getPerson(personId);
    const replies = [
      "可以呀，我觉得这个安排挺合适的。",
      "听起来不错！你一般什么时候有空？",
      `哈哈我也喜欢${person.interests[0]}，可以一起试试。`,
      "那我们先约一个校园里比较方便的地方？"
    ];
    const replyText = replies[Math.floor(Math.random() * replies.length)];
    chats[personId].push({ from: "other", text: replyText, time: nowTime() });
    saveChats();
    renderChatPeople();
    if (personId === currentChatId) renderMessages();
    if (personId === currentModalChatId && !$("#chatModal").classList.contains("hidden")) renderModalMessages();
  }, 700);

  if (renderAfterSend) {
    renderChatPeople();
    if (personId === currentChatId) renderMessages();
    if (personId === currentModalChatId) renderModalMessages();
  }
}

function initModalChat() {
  $$("[data-close-modal]").forEach((el) => {
    el.addEventListener("click", closeChatModal);
  });

  $("#modalChatForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const input = $("#modalMessageInput");
    const text = input.value.trim();
    if (!text || !currentModalChatId) return;
    input.value = "";
    addFriend(currentModalChatId, true);
    sendMessage(currentModalChatId, text);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeChatModal();
  });
}

function initChat() {
  seedChat(currentChatId);
  renderChatPeople();
  renderMessages();

  if (backendEnabled && window.io) {
    socket = io();
    socket.emit("join", currentUserId);
    socket.on("chat:message", (message) => {
      if (!message || message.from === "me") return;
      chats[message.personId] = chats[message.personId] || [];
      chats[message.personId].push({
        from: message.from,
        text: message.text,
        time: new Date(message.time).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })
      });
      saveChats();
      renderChatPeople();
      if (message.personId === currentChatId) renderMessages();
      if (message.personId === currentModalChatId && !$("#chatModal").classList.contains("hidden")) renderModalMessages();
    });
  }

  $("#chatForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const input = $("#messageInput");
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    sendMessage(currentChatId, text);
  });
}

function renderHero() {
  const first = getSortedPeople()[0] || samplePeople[0];
  $("#heroName").textContent = `${first.name} · ${first.mbti}`;
  $("#heroScore").textContent = `${first.match?.score || calcMatch(first).score}%`;
}

function init() {
  initNavigation();
  initZodiac();
  initQuiz();
  initProfileForm();
  initFilters();
  initChat();
  initModalChat();
  renderPlaza();
  renderContacts();
  renderMatches();
  renderHero();
}

init();
