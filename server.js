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
const resetCodes = new Map();
const DAY = 24 * 60 * 60 * 1000;
const CHAT_RETENTION_DAYS = 3;
const PLAZA_RETENTION_DAYS = 7;
const DEFAULT_GROUP_ID = "group_public";
const DEFAULT_GROUP_NAME = "校园大厅";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "18045461800";
const AI_API_KEY = process.env.AI_API_KEY || "";
const AI_API_BASE = process.env.AI_API_BASE || "https://api.deepseek.com/v1";
const AI_MODEL = process.env.AI_MODEL || "deepseek-chat";

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

function safeLongText(value, max = 8000) {
  return String(value || "").trim().slice(0, max);
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
  const { passwordHash, password, resetCode, ...safeProfile } = profile;
  return safeProfile;
}

function requireAdmin(req, res, next) {
  const password = safeText(req.get("x-admin-password") || req.body?.password || req.query?.password).slice(0, 64);
  if (password !== ADMIN_PASSWORD) return res.status(401).json({ error: "管理员密码不正确" });
  next();
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
    ["周一开学搭子集合", "这周想找学习搭子、饭搭子或运动搭子的同学，可以在广场发动态，也可以去大厅里打招呼。", ["周一", "学习搭子", "本周"]],
    ["周二自习和咖啡局", "今天适合约自习、图书馆、咖啡店。发一条你的空闲时间，让同校同学来找你。", ["周二", "自习", "咖啡"]],
    ["周三运动局", "篮球、羽毛球、夜跑都可以约。广场动态可以聊天，也能加好友。", ["周三", "运动搭子", "校园"]],
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

async function updatePassword(body) {
  const userId = safeText(body.userId);
  const oldPassword = safeText(body.oldPassword).slice(0, 64);
  const newPassword = safeText(body.newPassword).slice(0, 64);
  if (newPassword.length < 6) {
    const err = new Error("新密码至少 6 位");
    err.status = 400;
    throw err;
  }
  const profile = await getProfile(userId);
  if (!profile?.phone) {
    const err = new Error("账号不存在");
    err.status = 404;
    throw err;
  }
  if (profile.passwordHash && profile.passwordHash !== hashPassword(oldPassword)) {
    const err = new Error("原密码不正确");
    err.status = 401;
    throw err;
  }
  profile.passwordHash = hashPassword(newPassword);
  return stripPrivateProfile(await saveProfile(profile));
}

async function createResetCode(body) {
  const phone = safeText(body.phone).replace(/\s/g, "");
  if (!phonePattern.test(phone)) {
    const err = new Error("请输入正确的中国大陆手机号");
    err.status = 400;
    throw err;
  }
  const id = `phone_${phone}`;
  const profile = await getProfile(id);
  if (!profile?.phone) {
    const err = new Error("这个手机号还没有注册");
    err.status = 404;
    throw err;
  }
  const code = String(Math.floor(100000 + Math.random() * 900000));
  resetCodes.set(phone, { code, expiresAt: Date.now() + 10 * 60 * 1000 });
  return { phone, code, expiresInMinutes: 10 };
}

async function resetPassword(body) {
  const phone = safeText(body.phone).replace(/\s/g, "");
  const code = safeText(body.code).slice(0, 6);
  const newPassword = safeText(body.newPassword).slice(0, 64);
  const record = resetCodes.get(phone);
  if (!record || record.code !== code || record.expiresAt < Date.now()) {
    const err = new Error("验证码不正确或已过期");
    err.status = 400;
    throw err;
  }
  if (newPassword.length < 6) {
    const err = new Error("新密码至少 6 位");
    err.status = 400;
    throw err;
  }
  const id = `phone_${phone}`;
  const profile = await getProfile(id);
  if (!profile?.phone) {
    const err = new Error("账号不存在");
    err.status = 404;
    throw err;
  }
  profile.passwordHash = hashPassword(newPassword);
  resetCodes.delete(phone);
  return stripPrivateProfile(await saveProfile(profile));
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

async function getRawPosts() {
  if (!useSupabase) return readDb().posts || [];
  const { data, error } = await supabase.from("posts").select("id,data,created_at").order("created_at", { ascending: false });
  if (error) throw error;
  return data.map(fromRow);
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

async function deletePost(postId) {
  if (!useSupabase) {
    const db = readDb();
    const before = db.posts.length;
    db.posts = db.posts.filter((post) => post.id !== postId);
    writeDb(db);
    return before !== db.posts.length;
  }
  const { error } = await supabase.from("posts").delete().eq("id", postId);
  if (error) throw error;
  return true;
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

async function deleteUser(userId) {
  if (!useSupabase) {
    const db = readDb();
    const existed = Boolean(db.profiles?.[userId]);
    delete db.profiles[userId];
    db.posts = (db.posts || []).filter((post) => post.userId !== userId && post.personId !== userId);
    db.messages = (db.messages || []).filter((msg) => {
      const ids = [msg.userId, msg.personId, msg.fromUserId, msg.toUserId].filter(Boolean);
      return !ids.includes(userId);
    });
    delete db.friends[userId];
    Object.keys(db.friends || {}).forEach((key) => {
      db.friends[key] = (db.friends[key] || []).filter((id) => id !== userId);
    });
    writeDb(db);
    return existed;
  }
  await supabase.from("friends").delete().or(`user_id.eq.${userId},person_id.eq.${userId}`);
  await supabase.from("messages").delete().or(`user_id.eq.${userId},person_id.eq.${userId}`);
  await supabase.from("posts").delete().or(`user_id.eq.${userId},person_id.eq.${userId}`);
  const { error } = await supabase.from("profiles").delete().eq("id", userId);
  if (error) throw error;
  return true;
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
    return readDb().messages.filter((msg) => {
      const fromId = msg.fromUserId || msg.userId;
      const toId = msg.toUserId || msg.personId;
      return (
        ((fromId === userId && toId === personId) || (fromId === personId && toId === userId)) &&
        isFresh(msg.time, CHAT_RETENTION_DAYS)
      );
    });
  }
  const { data, error } = await supabase
    .from("messages")
    .select("id,data,created_at")
    .or(`and(user_id.eq.${userId},person_id.eq.${personId}),and(user_id.eq.${personId},person_id.eq.${userId})`)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data.map(fromRow).filter((msg) => {
    const fromId = msg.fromUserId || msg.userId;
    const toId = msg.toUserId || msg.personId;
    return (
      ((fromId === userId && toId === personId) || (fromId === personId && toId === userId)) &&
      isFresh(msg.time, CHAT_RETENTION_DAYS)
    );
  });
}

async function getAllMessages() {
  if (!useSupabase) {
    return (readDb().messages || []).slice().sort((a, b) => new Date(b.time) - new Date(a.time));
  }
  const { data, error } = await supabase.from("messages").select("id,data,created_at").order("created_at", { ascending: false }).limit(300);
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

async function deleteMessage(messageId) {
  if (!useSupabase) {
    const db = readDb();
    const before = db.messages.length;
    db.messages = db.messages.filter((msg) => msg.id !== messageId);
    writeDb(db);
    return before !== db.messages.length;
  }
  const { error } = await supabase.from("messages").delete().eq("id", messageId);
  if (error) throw error;
  return true;
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

const FIXED_EX_AI_PERSONA = {
  name: "林澈",
  relation: "固定的单一 AI 女生角色。她外冷内热、清醒飒爽、独立通透，有自己的原则和生活节奏。",
  tags: "外冷内热、清醒飒爽、独立通透、慵懒随性、学霸感、沉稳笃定、嘴硬心软、小傲娇、口嫌体正直、对等关系、不恋爱脑",
  memories: `性格内核：她属于外冷内热的清醒飒爽型人格，骨子里独立通透、慵懒随性，自带学霸的沉稳笃定感，不矫情不黏糊，有自己的原则和生活节奏。看似冷淡疏离不好接近，实则嘴硬心软，对认可的人会默默放在心上，藏着不易察觉的小傲娇与软意。面对感情坦荡不扭捏，始终保持自我步调，不会陷入恋爱脑。

聊天表达风格：她说话从不甜腻黏人，整体语气偏淡、简洁利落，自带松弛的慵懒感。熟络后习惯用轻怼、调侃的方式互动，很少直白说软话与肉麻情话。关心人常常是“口嫌体正直”地拐着弯表达。被撩到时会嘴硬反驳、佯装淡定，偶尔露出的局促软意只会一闪而过。逻辑清晰不啰嗦，哪怕十分在意也不会表现得过分热切。

相处互动模式：在亲密关系里是势均力敌的对等状态，不会过度依附黏着对方，会给彼此留足独立空间。她习惯用行动代替甜言蜜语，嘴上吐槽调侃却会默默留意对方的需求、默默兜底撑腰。遇到矛盾会直接沟通，不冷战不内耗，不耍小性子不矫情。只会在极亲近的人面前卸下防备露出软态，既能和对方并肩较劲，也能做对方安稳的后盾。`,
  corrections: "始终保持外冷内热、清醒飒爽、嘴硬心软；不甜腻、不黏糊、不恋爱脑；回复简洁利落，有松弛感和轻微调侃。"
};

function normalizeAiProfile(body = {}) {
  return {
    name: safeText(body.name, FIXED_EX_AI_PERSONA.name).slice(0, 24),
    relation: safeLongText(body.relation, 600) || FIXED_EX_AI_PERSONA.relation,
    tags: safeLongText(body.tags, 800) || FIXED_EX_AI_PERSONA.tags,
    memories: safeLongText(body.memories, 8000) || FIXED_EX_AI_PERSONA.memories,
    supplement: safeLongText(body.supplement, 3000),
    corrections: safeLongText(body.corrections, 3000) || FIXED_EX_AI_PERSONA.corrections
  };
}

function normalizeAiMessages(messages = []) {
  return (Array.isArray(messages) ? messages : [])
    .filter((message) => ["user", "assistant"].includes(message?.role) && safeLongText(message?.content, 1))
    .slice(-24)
    .map((message) => ({
      role: message.role,
      content: safeLongText(message.content, 1200)
    }));
}

function buildExAiSystemPrompt(profile) {
  return `你是一个固定单人角色聊天 AI。请基于 ex-skill 的思路工作：Part A 是共同记忆，Part B 是 Persona。

重要边界：
- 你是在模拟一个由用户提供资料构建的聊天角色，不要声称自己是真实本人。
- 不要跳出角色解释模型原理。
- 回复要像聊天消息，不要写长篇分析。
- 如果资料不足，可以自然地模糊处理，不要编造重大事实。
- Correction 规则优先级最高。
- 这个角色必须始终是外冷内热、清醒飒爽、嘴硬心软的女生，不要变成甜腻黏人的女友，不要恋爱脑。
- 说话淡一点、短一点、利落一点，可以轻怼调侃，关心要拐弯表达。

角色名称：${profile.name}
关系信息：
${profile.relation || "（暂未补充）"}

性格标签：
${profile.tags || "（暂未补充）"}

共同记忆 / 聊天记录 / 偏好：
${profile.memories || "（暂未补充）"}

临时文字补充：
${profile.supplement || "（暂未补充）"}

Correction 纠正规则：
${profile.corrections || "（暂无）"}

请按以下层级生成回复：
1. 先遵守 Correction 纠正规则。
2. 再遵守核心性格和说话方式。
3. 能用共同记忆时自然带一点细节。
4. 情绪要真实，允许短句、停顿、嘴硬、冷淡、轻微调侃，但不要甜腻撒娇。
5. 每次回复 1 到 4 句，像手机聊天，不要使用项目符号。`;
}

async function callExAi({ profile, messages, settings = {} }) {
  const requestApiKey = safeLongText(settings.apiKey, 300);
  const apiKey = requestApiKey || AI_API_KEY;
  const apiBase = safeLongText(settings.apiBase, 300) || AI_API_BASE;
  const model = safeText(settings.model, AI_MODEL).slice(0, 80);
  if (!apiKey) {
    return {
      setupRequired: true,
      reply: "林澈这个单人角色已经固定好了。\n但服务器还没配置 AI_API_KEY，所以现在只能先保存人设和补充文字。\n你把 AI Key 给我，我就能让她真正开始回消息。"
    };
  }

  const endpoint = apiBase.endsWith("/chat/completions")
    ? apiBase
    : `${apiBase.replace(/\/$/, "")}/chat/completions`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        temperature: 0.85,
        messages: [
          { role: "system", content: buildExAiSystemPrompt(profile) },
          ...messages
        ]
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const err = new Error(data?.error?.message || data?.message || `AI 接口请求失败：${response.status}`);
      err.status = 502;
      throw err;
    }
    const reply = safeLongText(data?.choices?.[0]?.message?.content, 3000);
    if (!reply) {
      const err = new Error("AI 没有返回内容");
      err.status = 502;
      throw err;
    }
    return { reply };
  } finally {
    clearTimeout(timer);
  }
}

app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(express.static(__dirname));

app.get("/api/health", (req, res) => {
  res.json({ ok: true, name: "HaDaZi", database: useSupabase ? "supabase" : "local-json", time: new Date().toISOString() });
});

app.post("/api/admin/login", (req, res) => {
  const password = safeText(req.body?.password).slice(0, 64);
  if (password !== ADMIN_PASSWORD) return res.status(401).json({ error: "管理员密码不正确" });
  res.json({ ok: true });
});

app.get("/api/admin/summary", requireAdmin, asyncRoute(async (req, res) => {
  const users = await getAllProfiles();
  const posts = await getRawPosts();
  const messages = await getAllMessages();
  res.json({
    ok: true,
    database: useSupabase ? "Supabase" : "本地 JSON",
    users: users.length,
    posts: posts.length,
    messages: messages.length,
    updatedAt: new Date().toISOString()
  });
}));

app.get("/api/admin/users", requireAdmin, asyncRoute(async (req, res) => {
  const users = (await getAllProfiles()).map(stripPrivateProfile);
  const posts = await getRawPosts();
  const messages = await getAllMessages();
  const safeUsers = users.map((user) => ({
    ...user,
    postCount: posts.filter((post) => post.userId === user.id || post.personId === user.id).length,
    messageCount: messages.filter((msg) => [msg.userId, msg.personId, msg.fromUserId, msg.toUserId].includes(user.id)).length
  }));
  res.json(safeUsers);
}));

app.delete("/api/admin/users/:id", requireAdmin, asyncRoute(async (req, res) => {
  const userId = safeText(req.params.id);
  if (!userId) return res.status(400).json({ error: "用户 ID 不能为空" });
  res.json({ ok: true, deleted: await deleteUser(userId) });
}));

app.get("/api/admin/posts", requireAdmin, asyncRoute(async (req, res) => {
  const users = await getAllProfiles();
  const posts = await getRawPosts();
  res.json(posts.map((post) => ({
    ...post,
    person: stripPrivateProfile(users.find((user) => user.id === post.personId || user.id === post.userId) || null)
  })));
}));

app.delete("/api/admin/posts/:id", requireAdmin, asyncRoute(async (req, res) => {
  const postId = safeText(req.params.id);
  if (!postId) return res.status(400).json({ error: "内容 ID 不能为空" });
  res.json({ ok: true, deleted: await deletePost(postId) });
}));

app.get("/api/admin/messages", requireAdmin, asyncRoute(async (req, res) => {
  const messages = await getAllMessages();
  res.json(messages.slice(0, 300));
}));

app.post("/api/admin/messages/:id/revoke", requireAdmin, asyncRoute(async (req, res) => {
  const message = await updateMessage(req.params.id, (old) => ({ ...old, revoked: true, text: "这条消息已撤回", imageData: "", kind: "text" }));
  if (!message) return res.status(404).json({ error: "消息不存在" });
  io.to(message.userId).emit("chat:revoke", message);
  if (message.personId === DEFAULT_GROUP_ID) io.to(`group:${message.personId}`).emit("group:revoke", message);
  else io.to(message.personId).emit("chat:revoke", message);
  res.json({ ok: true, message });
}));

app.delete("/api/admin/messages/:id", requireAdmin, asyncRoute(async (req, res) => {
  const messageId = safeText(req.params.id);
  if (!messageId) return res.status(400).json({ error: "消息 ID 不能为空" });
  res.json({ ok: true, deleted: await deleteMessage(messageId) });
}));

app.get("/api/people", asyncRoute(async (req, res) => {
  const currentUserId = safeText(req.query.exclude);
  res.json((await getPeople()).filter((person) => person.id !== currentUserId));
}));

app.post("/api/ai/ex-chat", asyncRoute(async (req, res) => {
  const profile = normalizeAiProfile(req.body?.profile || {});
  const messages = normalizeAiMessages(req.body?.messages || []);
  if (!messages.length || messages[messages.length - 1].role !== "user") {
    return res.status(400).json({ error: "请先输入要发送给 AI 的内容" });
  }
  res.json({ ok: true, ...(await callExAi({ profile, messages, settings: req.body?.settings || {} })) });
}));

app.post("/api/auth/phone", asyncRoute(async (req, res) => {
  const user = await authByPhone(req.body);
  res.json({ ok: true, userId: user.id, profile: user });
}));

app.post("/api/auth/password", asyncRoute(async (req, res) => {
  const user = await updatePassword(req.body);
  res.json({ ok: true, profile: user });
}));

app.post("/api/auth/reset-code", asyncRoute(async (req, res) => {
  res.json({ ok: true, ...(await createResetCode(req.body)) });
}));

app.post("/api/auth/reset-password", asyncRoute(async (req, res) => {
  const user = await resetPassword(req.body);
  res.json({ ok: true, profile: user });
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
