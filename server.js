require("dotenv").config();

const express = require("express");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
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
const phonePattern = /^1[3-9]\d{9}$/;
const DAY = 24 * 60 * 60 * 1000;
const CHAT_RETENTION_DAYS = 3;
const PLAZA_RETENTION_DAYS = 7;
const DEFAULT_GROUP_ID = "group_public";
const DEFAULT_GROUP_NAME = "校园大厅";

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

function ensureDb() {
  if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
  if (!fs.existsSync(dbPath)) {
    writeDb({ profiles: {}, people: [], posts: [], friends: {}, messages: [] });
  }
}

function readDb() {
  ensureDb();
  const db = JSON.parse(fs.readFileSync(dbPath, "utf8"));
  db.profiles ||= {};
  db.people ||= [];
  db.posts ||= [];
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

function isFresh(value, days) {
  const time = new Date(value || 0).getTime();
  return Number.isFinite(time) && Date.now() - time <= days * DAY;
}

function hashPassword(password) {
  return crypto.createHash("sha256").update(String(password)).digest("hex");
}

function stripPrivateProfile(profile) {
  if (!profile) return profile;
  const { passwordHash, password, ...safeProfile } = profile;
  return safeProfile;
}

function normalizeProfile(body) {
  return {
    id: safeText(body.id, `user_${Date.now()}`),
    phone: safeText(body.phone, "").slice(0, 11),
    nickname: safeText(body.nickname, "我").slice(0, 16),
    avatar: safeText(body.avatar, "").slice(0, 4),
    avatarUrl: safeText(body.avatarUrl, "").slice(0, 1000),
    gender: safeText(body.gender, "未设置").slice(0, 8),
    age: safeText(body.age, "").slice(0, 3),
    birthday: safeText(body.birthday, "").slice(0, 12),
    school: safeText(body.school, "我的大学").slice(0, 24),
    major: safeText(body.major, "未填写").slice(0, 24),
    zodiac: safeText(body.zodiac, "天秤座").slice(0, 12),
    goal: safeText(body.goal, "饭搭子").slice(0, 16),
    time: safeText(body.time, "周末白天").slice(0, 16),
    mbti: safeText(body.mbti, "").toUpperCase().slice(0, 4),
    mbtiComplete: Boolean(body.mbtiComplete || safeText(body.mbti, "")),
    interests: Array.isArray(body.interests)
      ? body.interests.map((item) => safeText(item).slice(0, 20)).filter(Boolean).slice(0, 12)
      : [],
    resume: safeText(body.resume, "大二学生，想找合得来的校园搭子。").slice(0, 300),
    bio: safeText(body.bio, "想找合得来的校园搭子。").slice(0, 120),
    updatedAt: new Date().toISOString()
  };
}

function normalizeUserPerson(profile) {
  return {
    id: profile.id,
    name: profile.nickname || "同学",
    avatar: profile.avatar || "",
    avatarUrl: profile.avatarUrl || "",
    mbti: profile.mbti || "",
    mbtiComplete: Boolean(profile.mbtiComplete && profile.mbti),
    zodiac: profile.zodiac || "未设置",
    school: profile.school || "我的大学",
    major: profile.major || "未填写",
    gender: profile.gender || "未设置",
    age: profile.age || "",
    birthday: profile.birthday || "",
    goal: profile.goal || "饭搭子",
    time: profile.time || "周末白天",
    interests: Array.isArray(profile.interests) ? profile.interests : [],
    bio: profile.bio || profile.resume || "想找合得来的校园搭子。",
    greeting: "你好呀，我也在 HaDaZi 上找搭子。",
    isRealUser: true,
    updatedAt: profile.updatedAt || profile.updated_at || ""
  };
}

async function getAllProfiles() {
  if (!useSupabase) return Object.values(readDb().profiles || {});
  const { data, error } = await supabase.from("profiles").select("id,data,updated_at").order("updated_at", { ascending: false });
  if (error) throw error;
  return data.map((row) => ({ id: row.id, ...(row.data || {}), updatedAt: row.updated_at }));
}

function normalizePost(body) {
  return {
    id: safeText(body.id, `post_${Date.now()}`),
    personId: safeText(body.personId, "me"),
    userId: safeText(body.userId, ""),
    authorName: safeText(body.authorName, "我").slice(0, 16),
    time: safeText(body.time, "刚刚").slice(0, 24),
    content: safeText(body.content).slice(0, 500),
    tags: Array.isArray(body.tags)
      ? body.tags.map((item) => safeText(item).slice(0, 20)).filter(Boolean).slice(0, 8)
      : [],
    likes: Number(body.likes || 0),
    comments: Array.isArray(body.comments)
      ? body.comments.map((item) => safeText(item).slice(0, 80)).filter(Boolean).slice(0, 20)
      : [],
    photos: Math.max(0, Math.min(3, Number(body.photos || 0))),
    createdAt: body.createdAt || new Date().toISOString()
  };
}

function normalizeMessage(body) {
  const kind = ["text", "emoji", "image"].includes(body.kind) ? body.kind : "text";
  return {
    id: safeText(body.id, `msg_${Date.now()}_${Math.random().toString(16).slice(2)}`),
    userId: safeText(body.userId),
    personId: safeText(body.personId),
    fromUserId: safeText(body.fromUserId, body.userId),
    toUserId: safeText(body.toUserId, body.personId),
    from: safeText(body.from, "me").slice(0, 16),
    senderName: safeText(body.senderName, "").slice(0, 24),
    senderAvatar: safeText(body.senderAvatar, "").slice(0, 4),
    senderAvatarUrl: safeText(body.senderAvatarUrl, "").slice(0, 1000),
    kind,
    text: safeText(body.text).slice(0, 500),
    imageData: kind === "image" ? safeText(body.imageData, "").slice(0, 900000) : "",
    revoked: Boolean(body.revoked),
    time: body.time || new Date().toISOString()
  };
}

function weeklySystemPosts() {
  const now = new Date();
  const day = now.getDay() || 7;
  const monday = new Date(now);
  monday.setHours(9, 0, 0, 0);
  monday.setDate(now.getDate() - day + 1);
  const topics = [
    ["周一开学搭子集合", "这周想找学习搭子、饭搭子或运动搭子的同学，可以在广场发动态，也可以去群聊里打招呼。", ["周一", "学习搭子", "本周"]],
    ["周二自习和咖啡局", "今天适合约自习、图书馆、咖啡店。发一条你的空闲时间，让同校同学来找你。", ["周二", "自习", "咖啡"]],
    ["周三运动局", "篮球、羽毛球、夜跑都可以约。广场里的真人动态可以聊天，也能加好友。", ["周三", "运动搭子", "校园"]],
    ["周四游戏和桌游局", "想开黑、桌游、密室或剧本杀的同学，发动态说清楚时间和地点更容易被看到。", ["周四", "游戏搭子", "桌游"]],
    ["周五饭搭子", "周五适合约饭、夜市和校园周边探店。看到合适的人可以先加好友再聊天。", ["周五", "饭搭子", "探店"]],
    ["周六出门局", "周末可以 City Walk、看展、拍照、逛街。新人登录也能看到本周广场内容。", ["周六", "旅行搭子", "拍照"]],
    ["周日复盘和下周搭子", "整理一下这周认识的新朋友，也可以提前约下周固定搭子。", ["周日", "固定搭子", "下周"]]
  ];
  return topics.map(([title, content, tags], index) => {
    const createdAt = new Date(monday.getTime() + index * DAY).toISOString();
    return normalizePost({
      id: `weekly_${monday.toISOString().slice(0, 10)}_${index}`,
      personId: "system_plaza",
      userId: "system_plaza",
      authorName: "HaDaZi 广场",
      time: title,
      content,
      tags,
      likes: 0,
      comments: [],
      photos: 0,
      createdAt
    });
  });
}

async function authByPhone(body) {
  const phone = safeText(body.phone).replace(/\s/g, "");
  const password = safeText(body.password).slice(0, 64);
  const nickname = safeText(body.nickname, `用户${phone.slice(-4)}`).slice(0, 16);
  if (!phonePattern.test(phone)) {
    const err = new Error("请输入正确的中国大陆手机号");
    err.status = 400;
    throw err;
  }
  if (password.length < 6) {
    const err = new Error("密码至少 6 位");
    err.status = 400;
    throw err;
  }

  const id = `phone_${phone}`;
  const existing = await getProfile(id);
  const passwordHash = hashPassword(password);
  if (existing?.passwordHash && existing.passwordHash !== passwordHash) {
    const err = new Error("手机号或密码不正确");
    err.status = 401;
    throw err;
  }

  const profile = normalizeProfile({
    ...existing,
    id,
    phone,
    nickname: existing?.nickname || nickname,
    mbtiComplete: Boolean(existing?.mbti)
  });
  profile.passwordHash = existing?.passwordHash || passwordHash;
  await saveProfile(profile);
  return stripPrivateProfile(profile);
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
  const profiles = await getAllProfiles();
  return profiles.filter((profile) => profile.phone && profile.mbti).map(normalizeUserPerson);
}

async function getPeople() {
  if (!useSupabase) {
    return Object.values(readDb().profiles || {})
      .filter((profile) => profile.phone && profile.mbti)
      .map(normalizeUserPerson);
  }
  return supabaseSelectPeople();
}

async function getPosts() {
  if (!useSupabase) {
    const db = readDb();
    const people = await getPeople();
    return [...db.posts.filter((post) => isFresh(post.createdAt, PLAZA_RETENTION_DAYS)), ...weeklySystemPosts()]
      .map((post) => ({ ...post, person: people.find((person) => person.id === post.personId) || null }));
  }

  const people = await getPeople();
  const { data, error } = await supabase.from("posts").select("id,data,created_at").order("created_at", { ascending: false });
  if (error) throw error;

  return [...data.map(fromRow).filter((post) => isFresh(post.createdAt, PLAZA_RETENTION_DAYS)), ...weeklySystemPosts()].map((post) => ({
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
    const people = await getPeople();
    const friendIds = db.friends[userId] || [];
    return friendIds.map((personId) => people.find((person) => person.id === personId)).filter(Boolean);
  }

  const people = await getPeople();
  const { data, error } = await supabase.from("friends").select("person_id").eq("user_id", userId).order("created_at");
  if (error) throw error;
  const friendIds = data.map((row) => row.person_id);
  return friendIds.map((personId) => people.find((person) => person.id === personId)).filter(Boolean);
}

async function removeFriend(userId, personId) {
  if (!userId || !personId) {
    const err = new Error("好友参数不正确");
    err.status = 400;
    throw err;
  }
  if (!useSupabase) {
    const db = readDb();
    db.friends[userId] = (db.friends[userId] || []).filter((id) => id !== personId);
    writeDb(db);
    return db.friends[userId];
  }
  const { error } = await supabase.from("friends").delete().eq("user_id", userId).eq("person_id", personId);
  if (error) throw error;
  return (await getFriends(userId)).map((person) => person.id);
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
    return readDb().messages.filter((msg) => (
      (msg.userId === userId && msg.personId === personId) ||
      (msg.userId === personId && msg.personId === userId)
    ) && isFresh(msg.time, CHAT_RETENTION_DAYS));
  }
  const { data, error } = await supabase
    .from("messages")
    .select("id,data,created_at")
    .or(`and(user_id.eq.${userId},person_id.eq.${personId}),and(user_id.eq.${personId},person_id.eq.${userId})`)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data.map(fromRow).filter((msg) => isFresh(msg.time, CHAT_RETENTION_DAYS));
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

async function updateMessage(messageId, updater) {
  if (!useSupabase) {
    const db = readDb();
    const index = db.messages.findIndex((msg) => msg.id === messageId);
    if (index === -1) return null;
    db.messages[index] = updater(db.messages[index]);
    writeDb(db);
    return db.messages[index];
  }
  const { data: oldRow, error: oldError } = await supabase.from("messages").select("id,data").eq("id", messageId).maybeSingle();
  if (oldError) throw oldError;
  if (!oldRow) return null;
  const next = updater(fromRow(oldRow));
  const { data, error } = await supabase.from("messages").update({ data: next }).eq("id", messageId).select("id,data").single();
  if (error) throw error;
  return fromRow(data);
}

async function getUserPosts(userId) {
  return (await getPosts()).filter((post) => post.personId === userId || post.userId === userId);
}

async function getGroupMembers(groupId) {
  if (groupId !== DEFAULT_GROUP_ID) return [];
  return getPeople();
}

async function getGroupMessages(groupId) {
  if (!useSupabase) {
    return readDb().messages
      .filter((msg) => msg.personId === groupId && isFresh(msg.time, CHAT_RETENTION_DAYS))
      .sort((a, b) => new Date(a.time) - new Date(b.time));
  }
  const { data, error } = await supabase
    .from("messages")
    .select("id,data,created_at")
    .eq("person_id", groupId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data.map(fromRow).filter((msg) => isFresh(msg.time, CHAT_RETENTION_DAYS));
}

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(express.static(__dirname));

app.get("/api/health", (req, res) => {
  res.json({ ok: true, name: "HaDaZi", database: useSupabase ? "supabase" : "local-json", time: new Date().toISOString() });
});

app.get("/api/people", asyncRoute(async (req, res) => {
  const currentUserId = safeText(req.query.exclude);
  res.json((await getPeople()).filter((person) => person.id !== currentUserId));
}));

app.post("/api/auth/phone", asyncRoute(async (req, res) => {
  const user = await authByPhone(req.body);
  res.json({ ok: true, userId: user.id, profile: user });
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

app.delete("/api/friends", asyncRoute(async (req, res) => {
  const friends = await removeFriend(safeText(req.body.userId), safeText(req.body.personId));
  res.json({ ok: true, friends });
}));

app.get("/api/profile/:id", asyncRoute(async (req, res) => {
  res.json(stripPrivateProfile(await getProfile(req.params.id)));
}));

app.get("/api/profile/:id/posts", asyncRoute(async (req, res) => {
  res.json(await getUserPosts(req.params.id));
}));

app.post("/api/profile", asyncRoute(async (req, res) => {
  const incoming = normalizeProfile(req.body);
  const existing = await getProfile(incoming.id);
  const profile = {
    ...incoming,
    phone: existing?.phone || incoming.phone,
    passwordHash: existing?.passwordHash
  };
  res.json(stripPrivateProfile(await saveProfile(profile)));
}));

app.get("/api/matches/:id", asyncRoute(async (req, res) => {
  const profile = await getProfile(req.params.id);
  if (!profile) return res.status(404).json({ error: "请先用手机号登录或注册" });
  if (!profile.mbti) return res.status(403).json({ error: "做完 MBTI 并保存个人资料后才能匹配唠嗑" });
  const matches = (await getPeople())
    .filter((person) => person.id !== profile.id && person.mbtiComplete)
    .map((person) => ({ ...person, match: calcMatch(profile, person) }))
    .sort((a, b) => b.match.score - a.match.score);
  res.json(matches);
}));

app.get("/api/messages/:userId/:personId", asyncRoute(async (req, res) => {
  res.json(await getMessages(req.params.userId, req.params.personId));
}));

app.post("/api/messages/:id/revoke", asyncRoute(async (req, res) => {
  const message = await updateMessage(req.params.id, (old) => ({ ...old, revoked: true, text: "这条消息已撤回", imageData: "", kind: "text" }));
  if (!message) return res.status(404).json({ error: "消息不存在" });
  io.to(message.userId).emit("chat:revoke", message);
  io.to(message.personId).emit("chat:revoke", message);
  res.json(message);
}));

app.post("/api/messages", asyncRoute(async (req, res) => {
  const people = await getPeople();
  const person = people.find((item) => item.id === req.body.personId);
  if (!person) return res.status(404).json({ error: "聊天对象不存在" });

  const message = normalizeMessage(req.body);
  if (!message.userId || !message.text) return res.status(400).json({ error: "消息内容不能为空" });
  const senderProfile = await getProfile(message.userId);
  if (!senderProfile?.phone) return res.status(401).json({ error: "请先用手机号登录或注册" });
  if (!senderProfile?.mbti) return res.status(403).json({ error: "做完 MBTI 并保存个人资料后才能匹配唠嗑" });

  const saved = await saveMessage(message);
  io.to(saved.userId).emit("chat:message", saved);
  io.to(saved.personId).emit("chat:message", saved);
  res.json(saved);
}));

app.get("/api/groups", asyncRoute(async (req, res) => {
  const members = await getGroupMembers(DEFAULT_GROUP_ID);
  res.json([{ id: DEFAULT_GROUP_ID, name: DEFAULT_GROUP_NAME, membersCount: members.length }]);
}));

app.get("/api/groups/:groupId/members", asyncRoute(async (req, res) => {
  const members = await getGroupMembers(req.params.groupId);
  res.json(members);
}));

app.get("/api/groups/:groupId/messages", asyncRoute(async (req, res) => {
  res.json(await getGroupMessages(req.params.groupId));
}));

app.post("/api/groups/:groupId/messages", asyncRoute(async (req, res) => {
  const senderProfile = await getProfile(safeText(req.body.userId));
  if (!senderProfile?.phone) return res.status(401).json({ error: "请先用手机号登录或注册" });
  if (!senderProfile?.mbti) return res.status(403).json({ error: "做完 MBTI 并保存个人资料后才能进群唠嗑" });
  const message = normalizeMessage({
    ...req.body,
    personId: req.params.groupId,
    fromUserId: senderProfile.id,
    toUserId: req.params.groupId,
    senderName: senderProfile.nickname,
    senderAvatar: senderProfile.avatar,
    senderAvatarUrl: senderProfile.avatarUrl
  });
  if (!message.text && !message.imageData) return res.status(400).json({ error: "消息内容不能为空" });
  const saved = await saveMessage(message);
  io.to(`group:${req.params.groupId}`).emit("group:message", saved);
  res.json(saved);
}));

app.post("/api/groups/:groupId/messages/:id/revoke", asyncRoute(async (req, res) => {
  const message = await updateMessage(req.params.id, (old) => ({ ...old, revoked: true, text: "这条消息已撤回", imageData: "", kind: "text" }));
  if (!message) return res.status(404).json({ error: "消息不存在" });
  io.to(`group:${req.params.groupId}`).emit("group:revoke", message);
  res.json(message);
}));

io.on("connection", (socket) => {
  socket.on("join", (userId) => {
    if (userId) socket.join(String(userId));
  });

  socket.on("group:join", (groupId) => {
    if (groupId) socket.join(`group:${groupId}`);
  });

  socket.on("chat:send", async (payload) => {
    try {
      const message = normalizeMessage(payload);
      if (!message.userId || !message.personId || !message.text) return;
      const senderProfile = await getProfile(message.userId);
      if (!senderProfile?.phone || !senderProfile?.mbti) {
        socket.emit("chat:error", { error: "做完 MBTI 并保存个人资料后才能匹配唠嗑" });
        return;
      }
      const saved = await saveMessage(message);
      io.to(saved.userId).emit("chat:message", saved);
      io.to(saved.personId).emit("chat:message", saved);
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
