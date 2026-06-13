require("dotenv").config();

const express = require("express");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const PORT = process.env.PORT || 3000;
const dbDir = path.join(__dirname, "data");
const dbPath = path.join(dbDir, "db.json");
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
const useSupabase = Boolean(supabaseUrl && supabaseKey);
const supabase = useSupabase ? createClient(supabaseUrl, supabaseKey) : null;

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

const seedPeople = [
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

function ensureDb() {
  if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
  if (!fs.existsSync(dbPath)) {
    writeDb({ profiles: {}, people: seedPeople, posts: seedPosts, friends: {}, messages: [] });
  }
}

function readDb() {
  ensureDb();
  const db = JSON.parse(fs.readFileSync(dbPath, "utf8"));
  db.profiles ||= {};
  db.people ||= seedPeople;
  db.posts ||= seedPosts;
  db.friends ||= {};
  db.messages ||= [];
  writeDb(db);
  return db;
}

function writeDb(data) {
  fs.writeFileSync(dbPath, JSON.stringify(data, null, 2), "utf8");
}

function safeText(value, fallback = "") {
  return String(value || fallback).trim().slice(0, 500);
}

function normalizeProfile(body) {
  return {
    id: safeText(body.id, `user_${Date.now()}`),
    nickname: safeText(body.nickname, "我").slice(0, 16),
    gender: safeText(body.gender, "未设置").slice(0, 8),
    age: safeText(body.age, "").slice(0, 3),
    birthday: safeText(body.birthday, "").slice(0, 12),
    school: safeText(body.school, "我的大学").slice(0, 24),
    major: safeText(body.major, "未填写").slice(0, 24),
    zodiac: safeText(body.zodiac, "天秤座").slice(0, 12),
    goal: safeText(body.goal, "饭搭子").slice(0, 16),
    time: safeText(body.time, "周末白天").slice(0, 16),
    mbti: safeText(body.mbti, "").toUpperCase().slice(0, 4),
    interests: Array.isArray(body.interests)
      ? body.interests.map((item) => safeText(item).slice(0, 20)).filter(Boolean).slice(0, 12)
      : [],
    resume: safeText(body.resume, "大二学生，想找合得来的校园搭子。").slice(0, 300),
    bio: safeText(body.bio, "想找合得来的校园搭子。").slice(0, 120),
    updatedAt: new Date().toISOString()
  };
}

function normalizePost(body) {
  return {
    id: safeText(body.id, `post_${Date.now()}`),
    personId: safeText(body.personId, "me"),
    userId: safeText(body.userId, ""),
    authorName: safeText(body.authorName, "我").slice(0, 16),
    time: safeText(body.time, "刚刚").slice(0, 16),
    content: safeText(body.content).slice(0, 500),
    tags: Array.isArray(body.tags)
      ? body.tags.map((item) => safeText(item).slice(0, 20)).filter(Boolean).slice(0, 8)
      : [],
    likes: Number(body.likes || 0),
    comments: Array.isArray(body.comments)
      ? body.comments.map((item) => safeText(item).slice(0, 80)).filter(Boolean).slice(0, 20)
      : [],
    photos: Math.max(0, Math.min(3, Number(body.photos || 0))),
    createdAt: new Date().toISOString()
  };
}

function normalizeMessage(body) {
  return {
    id: safeText(body.id, `msg_${Date.now()}_${Math.random().toString(16).slice(2)}`),
    userId: safeText(body.userId),
    personId: safeText(body.personId),
    from: body.from === "other" ? "other" : "me",
    text: safeText(body.text).slice(0, 500),
    time: new Date().toISOString()
  };
}

function calcMatch(profile, person) {
  let score = 48;
  const reasons = [];
  const bestPairs = mbtiPairs[profile.mbti] || [];
  const profileInterests = Array.isArray(profile.interests) ? profile.interests : [];
  const personInterests = Array.isArray(person.interests) ? person.interests : [];

  if (!profile.mbti) {
    reasons.push("完成 MBTI 测试后更准");
  } else if (person.mbti === profile.mbti) {
    score += 18;
    reasons.push("MBTI 相同，沟通节奏接近");
  } else if (bestPairs.includes(person.mbti)) {
    score += 28;
    reasons.push("MBTI 合拍度高");
  } else if (person.mbti?.[0] === profile.mbti?.[0] || person.mbti?.[1] === profile.mbti?.[1]) {
    score += 12;
    reasons.push("性格有共同点");
  }

  const common = personInterests.filter((tag) => profileInterests.includes(tag));
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

  return { score: Math.max(58, Math.min(99, score)), reasons: reasons.slice(0, 3) };
}

function fromRow(row) {
  return { id: row.id, ...(row.data || {}) };
}

async function supabaseSelectPeople() {
  const { data, error } = await supabase.from("people").select("id,data").order("id");
  if (error) throw error;
  if (!data.length) {
    const rows = seedPeople.map((person) => ({ id: person.id, data: person }));
    const { error: seedError } = await supabase.from("people").upsert(rows);
    if (seedError) throw seedError;
    return seedPeople;
  }
  return data.map(fromRow);
}

async function getPeople() {
  if (!useSupabase) return readDb().people;
  return supabaseSelectPeople();
}

async function getPosts() {
  if (!useSupabase) {
    const db = readDb();
    return db.posts.map((post) => ({ ...post, person: db.people.find((person) => person.id === post.personId) || null }));
  }

  const people = await getPeople();
  const { data, error } = await supabase.from("posts").select("id,data,created_at").order("created_at", { ascending: false });
  if (error) throw error;

  if (!data.length) {
    const rows = seedPosts.map((post) => ({ id: post.id, user_id: null, person_id: post.personId, data: post }));
    const { error: seedError } = await supabase.from("posts").upsert(rows);
    if (seedError) throw seedError;
    return seedPosts.map((post) => ({ ...post, person: people.find((person) => person.id === post.personId) || null }));
  }

  return data.map(fromRow).map((post) => ({
    ...post,
    person: people.find((person) => person.id === post.personId) || null
  }));
}

async function savePost(post) {
  if (!useSupabase) {
    const db = readDb();
    db.posts.unshift(post);
    writeDb(db);
    return post;
  }
  const { data, error } = await supabase
    .from("posts")
    .insert({ id: post.id, user_id: post.userId || null, person_id: post.personId, data: post })
    .select("id,data")
    .single();
  if (error) throw error;
  return fromRow(data);
}

async function getProfile(id) {
  if (!useSupabase) return readDb().profiles[id] || null;
  const { data, error } = await supabase.from("profiles").select("id,data").eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? fromRow(data) : null;
}

async function saveProfile(profile) {
  if (!useSupabase) {
    const db = readDb();
    db.profiles[profile.id] = profile;
    writeDb(db);
    return profile;
  }
  const { data, error } = await supabase
    .from("profiles")
    .upsert({ id: profile.id, data: profile, updated_at: new Date().toISOString() })
    .select("id,data")
    .single();
  if (error) throw error;
  return fromRow(data);
}

async function getFriends(userId) {
  if (!useSupabase) {
    const db = readDb();
    const friendIds = db.friends[userId] || [];
    return friendIds.map((personId) => db.people.find((person) => person.id === personId)).filter(Boolean);
  }

  const people = await getPeople();
  const { data, error } = await supabase.from("friends").select("person_id").eq("user_id", userId).order("created_at");
  if (error) throw error;
  const friendIds = data.map((row) => row.person_id);
  return friendIds.map((personId) => people.find((person) => person.id === personId)).filter(Boolean);
}

async function addFriend(userId, personId) {
  const people = await getPeople();
  const person = people.find((item) => item.id === personId);
  if (!userId || !person) {
    const err = new Error("好友参数不正确");
    err.status = 400;
    throw err;
  }

  if (!useSupabase) {
    const db = readDb();
    db.friends[userId] ||= [];
    if (!db.friends[userId].includes(personId)) db.friends[userId].push(personId);
    writeDb(db);
    return db.friends[userId];
  }

  const { error } = await supabase.from("friends").upsert({ user_id: userId, person_id: personId }, { onConflict: "user_id,person_id" });
  if (error) throw error;
  const { data, error: listError } = await supabase.from("friends").select("person_id").eq("user_id", userId).order("created_at");
  if (listError) throw listError;
  return data.map((row) => row.person_id);
}

async function getMessages(userId, personId) {
  if (!useSupabase) {
    return readDb().messages.filter((msg) => msg.userId === userId && msg.personId === personId);
  }
  const { data, error } = await supabase
    .from("messages")
    .select("id,data,created_at")
    .eq("user_id", userId)
    .eq("person_id", personId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data.map(fromRow);
}

async function saveMessage(message) {
  if (!useSupabase) {
    const db = readDb();
    db.messages.push(message);
    writeDb(db);
    return message;
  }
  const { data, error } = await supabase
    .from("messages")
    .insert({ id: message.id, user_id: message.userId, person_id: message.personId, data: message, created_at: message.time })
    .select("id,data")
    .single();
  if (error) throw error;
  return fromRow(data);
}

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

app.use(cors());
app.use(express.json({ limit: "100kb" }));
app.use(express.static(__dirname));

app.get("/api/health", (req, res) => {
  res.json({ ok: true, name: "HaDaZi", database: useSupabase ? "supabase" : "local-json", time: new Date().toISOString() });
});

app.get("/api/people", asyncRoute(async (req, res) => {
  res.json(await getPeople());
}));

app.get("/api/posts", asyncRoute(async (req, res) => {
  res.json(await getPosts());
}));

app.post("/api/posts", asyncRoute(async (req, res) => {
  const post = normalizePost(req.body);
  if (!post.content) return res.status(400).json({ error: "动态内容不能为空" });
  res.json(await savePost(post));
}));

app.get("/api/friends/:userId", asyncRoute(async (req, res) => {
  res.json(await getFriends(req.params.userId));
}));

app.post("/api/friends", asyncRoute(async (req, res) => {
  const friends = await addFriend(safeText(req.body.userId), safeText(req.body.personId));
  res.json({ ok: true, friends });
}));

app.get("/api/profile/:id", asyncRoute(async (req, res) => {
  res.json(await getProfile(req.params.id));
}));

app.post("/api/profile", asyncRoute(async (req, res) => {
  res.json(await saveProfile(normalizeProfile(req.body)));
}));

app.get("/api/matches/:id", asyncRoute(async (req, res) => {
  const profile = await getProfile(req.params.id);
  if (!profile) return res.status(404).json({ error: "请先保存个人资料" });
  const matches = (await getPeople())
    .map((person) => ({ ...person, match: calcMatch(profile, person) }))
    .sort((a, b) => b.match.score - a.match.score);
  res.json(matches);
}));

app.get("/api/messages/:userId/:personId", asyncRoute(async (req, res) => {
  res.json(await getMessages(req.params.userId, req.params.personId));
}));

app.post("/api/messages", asyncRoute(async (req, res) => {
  const people = await getPeople();
  const person = people.find((item) => item.id === req.body.personId);
  if (!person) return res.status(404).json({ error: "聊天对象不存在" });

  const message = normalizeMessage(req.body);
  if (!message.userId || !message.text) return res.status(400).json({ error: "消息内容不能为空" });

  const saved = await saveMessage(message);
  io.to(saved.userId).emit("chat:message", saved);
  res.json(saved);
}));

io.on("connection", (socket) => {
  socket.on("join", (userId) => {
    if (userId) socket.join(String(userId));
  });

  socket.on("chat:send", async (payload) => {
    try {
      const message = normalizeMessage(payload);
      if (!message.userId || !message.personId || !message.text) return;
      const saved = await saveMessage(message);
      io.to(saved.userId).emit("chat:message", saved);
    } catch (error) {
      socket.emit("chat:error", { error: error.message });
    }
  });
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.use((error, req, res, next) => {
  console.error(error);
  res.status(error.status || 500).json({ error: error.message || "服务器错误" });
});

server.listen(PORT, () => {
  console.log(`HaDaZi 已启动：http://localhost:${PORT}`);
  console.log(`数据库模式：${useSupabase ? "Supabase" : "本地 JSON"}`);
});
