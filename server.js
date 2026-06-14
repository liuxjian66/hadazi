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
const aiConfigPath = path.join(dbDir, "ai-config.json");
const exAiStatePath = path.join(dbDir, "ex-ai-state.json");
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
const AI_API_BASE = process.env.AI_API_BASE || "https://api.deepseek.com";
const AI_MODEL = process.env.AI_MODEL || "deepseek-v4-flash";
const CURRENT_EX_AI_PERSONA_VERSION = "xu-zhi-cool-sync-v2";

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

function readAiConfig() {
  ensureDb();
  if (!fs.existsSync(aiConfigPath)) return {};
  try {
    return JSON.parse(fs.readFileSync(aiConfigPath, "utf8"));
  } catch {
    return {};
  }
}

function writeAiConfig(config) {
  ensureDb();
  const safeConfig = {
    apiKey: safeLongText(config.apiKey, 300),
    apiBase: safeLongText(config.apiBase, 300) || AI_API_BASE,
    model: safeText(config.model, AI_MODEL).slice(0, 80),
    updatedAt: new Date().toISOString()
  };
  fs.writeFileSync(aiConfigPath, JSON.stringify(safeConfig, null, 2), "utf8");
  return safeConfig;
}

function getDefaultExAiState() {
  return {
    personaVersion: CURRENT_EX_AI_PERSONA_VERSION,
    messages: [
      {
        role: "assistant",
        content: "徐栀。\n刚加上，先认个脸。\n有事直接说，别绕太远。",
        at: new Date().toISOString()
      }
    ],
    memories: [],
    lastProactiveAt: "",
    updatedAt: new Date().toISOString()
  };
}

function normalizeExAiState(state = {}) {
  const fallback = getDefaultExAiState();
  const messages = (Array.isArray(state.messages) ? state.messages : fallback.messages)
    .filter((message) => ["user", "assistant"].includes(message?.role) && safeLongText(message?.content, 1))
    .slice(-500)
    .map((message) => ({
      role: message.role,
      content: safeLongText(message.content, 1200),
      at: safeText(message.at, new Date().toISOString()).slice(0, 40)
    }));
  const memories = (Array.isArray(state.memories) ? state.memories : [])
    .filter((item) => safeLongText(item?.text || item, 1))
    .slice(-200)
    .map((item) => ({
      text: safeLongText(item.text || item, 260),
      at: safeText(item.at, new Date().toISOString()).slice(0, 40)
    }));
  return {
    personaVersion: state.personaVersion ? safeText(state.personaVersion).slice(0, 60) : "",
    messages: messages.length ? messages : fallback.messages,
    memories,
    lastProactiveAt: safeText(state.lastProactiveAt, "").slice(0, 40),
    updatedAt: safeText(state.updatedAt, new Date().toISOString()).slice(0, 40)
  };
}

function readExAiState() {
  ensureDb();
  if (!fs.existsSync(exAiStatePath)) {
    const initial = getDefaultExAiState();
    writeExAiState(initial);
    return initial;
  }
  try {
    const state = normalizeExAiState(JSON.parse(fs.readFileSync(exAiStatePath, "utf8")));
    if (state.personaVersion !== CURRENT_EX_AI_PERSONA_VERSION) {
      return writeExAiState({ ...state, personaVersion: CURRENT_EX_AI_PERSONA_VERSION });
    }
    return state;
  } catch {
    return getDefaultExAiState();
  }
}

function writeExAiState(state) {
  ensureDb();
  const safeState = normalizeExAiState({ ...state, updatedAt: new Date().toISOString() });
  fs.writeFileSync(exAiStatePath, JSON.stringify(safeState, null, 2), "utf8");
  return safeState;
}

function shouldSkipProactive(state) {
  const lastProactiveTime = new Date(state.lastProactiveAt || 0).getTime();
  if (Number.isFinite(lastProactiveTime) && Date.now() - lastProactiveTime < 10 * 60 * 1000) return true;
  const lastMessage = [...(state.messages || [])].reverse().find(Boolean);
  const lastMessageTime = new Date(lastMessage?.at || 0).getTime();
  const isOnlyInitialMessage = (state.messages || []).length <= 1 && lastMessage?.role === "assistant";
  if (!isOnlyInitialMessage && Number.isFinite(lastMessageTime) && Date.now() - lastMessageTime < 90 * 1000) return true;
  return false;
}

function safeText(value, fallback = "") {
  return String(value || fallback).trim().slice(0, 500);
}

function safeLongText(value, max = 8000) {
  return String(value || "").trim().slice(0, max);
}

function decodeHtmlEntity(value = "") {
  return String(value)
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)));
}

function stripHtml(value = "") {
  return decodeHtmlEntity(String(value).replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function maybeDecodeDuckUrl(value = "") {
  try {
    const decoded = decodeHtmlEntity(value);
    const url = new URL(decoded, "https://duckduckgo.com");
    return url.searchParams.get("uddg") || decoded;
  } catch {
    return decodeHtmlEntity(value);
  }
}

function extractUrls(text = "") {
  return [...String(text || "").matchAll(/https?:\/\/[^\s<>"'，。！？、]+/gi)]
    .map((match) => match[0].replace(/[),.;]+$/, ""))
    .slice(0, 3);
}

function shouldUseExAiWebSearch(content = "") {
  const text = String(content || "").trim();
  if (!text) return false;
  if (extractUrls(text).length) return true;
  return /联网|上网|查一下|帮我查|搜索|搜一下|网上|最新|实时|新闻|资讯|公开信息|公开资料|今天|现在|天气|预报|价格|股价|汇率|热搜|票房|比赛|赛程|航班|快递|政策|公告|官网|链接|资料|百科|电视剧|剧集|热播|抖音|短视频|热榜|热梗|热歌|电影|影视|综艺|剧情|分集|大结局|结局|角色|人物|演员|导演|编剧|上映|播出|哪一集|第几集|原著|改编|豆瓣|评分|是什么|是谁|介绍/.test(text);
}

function normalizeUserLocation(location = {}) {
  const latitude = Number(location.latitude);
  const longitude = Number(location.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  return {
    latitude: Number(latitude.toFixed(5)),
    longitude: Number(longitude.toFixed(5)),
    accuracy: Math.max(0, Math.min(Number(location.accuracy) || 0, 100000)),
    at: safeText(location.at, new Date().toISOString()).slice(0, 40)
  };
}

function extractMediaTitle(content = "") {
  const text = safeLongText(content, 160);
  const quoted = text.match(/[《「“]([^》」”]{2,30})[》」”]/)?.[1];
  if (quoted) return quoted.trim();
  const afterType = text.match(/(?:电视剧|剧集|电影|影视剧|综艺|短剧)\s*([^的，。？！?]{2,24})(?:的|剧情|结局|演员|角色|讲|是|怎么样|好看|$)/)?.[1];
  if (afterType) return afterType.replace(/这部|这个|这剧|这电影|最近|热播/g, "").trim();
  const beforeInfo = text.match(/([^，。？！?]{2,24})(?:的)?(?:剧情|结局|演员|角色|分集|大结局|讲什么|好看吗)/)?.[1];
  if (beforeInfo) return beforeInfo.replace(/这部|这个|这剧|这电影|电视剧|电影|综艺|帮我|查一下/g, "").trim();
  return "";
}

function buildExAiSearchQuery(content = "") {
  const text = safeLongText(content, 160);
  const mediaTitle = extractMediaTitle(text);
  if (mediaTitle && /电视剧|剧集|热播|电影|影视|综艺|剧情|分集|大结局|结局|角色|人物|演员|导演|编剧|上映|播出|原著|改编|豆瓣|评分/.test(text)) {
    return `${mediaTitle} 影视 剧情 演员 官方资料 百度百科 豆瓣`.trim();
  }
  const base = text
    .replace(/https?:\/\/[^\s<>"'，。！？、]+/gi, " ")
    .replace(/徐栀|帮我|你帮我|给我|请你|麻烦你|联网|上网|查一下|帮我查|搜索|搜一下|网上|一下|好吗|行吗|可以吗|最近|现在|今天|热点|热门|这个链接|这个视频|这个内容|这部|这个|这剧|这电影|的剧情是什么|剧情是什么|是什么/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
  if (/抖音|短视频|热梗|热歌/.test(text)) return `${base} 抖音 热榜 今日`.trim();
  if (/电视剧|剧集|热播|电影|影视|综艺|剧情|分集|大结局|结局|角色|人物|演员|导演|编剧|上映|播出|原著|改编|豆瓣|评分/.test(text)) {
    return `${base} 影视 剧情 演员 公开资料 官方 豆瓣 百度百科`.trim();
  }
  return base;
}

function buildWeatherQuery(content = "") {
  return safeLongText(content, 80)
    .replace(/徐栀|帮我|你帮我|给我|请你|麻烦你|查一下|帮我查|搜索|搜一下|看看|看下|看一眼|今天|现在|实时|天气|预报|气温|温度|怎么样|如何|多少|一下|当地|本地|附近|周边/g, " ")
    .replace(/[，。？！,.?!]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60) || "Beijing";
}

async function fetchWeatherResult(content, userLocation = null) {
  if (!/天气|预报|气温|温度/.test(content)) return [];
  const city = buildWeatherQuery(content);
  const hasExplicitPlace = city && city !== "Beijing" && !/^(看看|看下|看一眼|这边|这里|那边|那里)$/.test(city);
  const target = !hasExplicitPlace && userLocation
    ? `${userLocation.latitude},${userLocation.longitude}`
    : city;
  const url = `https://wttr.in/${encodeURIComponent(target)}?format=j1&lang=zh`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 HaDaZi-AI/1.0" }
    });
    if (!response.ok) return [];
    const data = await response.json().catch(() => ({}));
    const current = data.current_condition?.[0];
    const today = data.weather?.[0];
    if (!current) return [];
    const desc = current.lang_zh?.[0]?.value || current.weatherDesc?.[0]?.value || "未知";
    const area = data.nearest_area?.[0]?.areaName?.[0]?.value || (userLocation && !hasExplicitPlace ? "你附近" : city);
    const snippet = [
      `${area}当前：${desc}，${current.temp_C}°C，体感 ${current.FeelsLikeC}°C，湿度 ${current.humidity}%`,
      today ? `今日范围：${today.mintempC}°C 到 ${today.maxtempC}°C，降水概率 ${today.hourly?.[4]?.chanceofrain || today.hourly?.[0]?.chanceofrain || "未知"}%` : ""
    ].filter(Boolean).join("；");
    return [{
      title: `${area}天气`,
      snippet,
      url: `https://wttr.in/${encodeURIComponent(target)}`
    }];
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

async function fetchBingRss(query) {
  const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}&format=rss`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 HaDaZi-AI/1.0",
        "Accept": "application/rss+xml,text/xml"
      }
    });
    if (!response.ok) return [];
    const xml = await response.text();
    return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 5).map((match) => {
      const block = match[1];
      const title = block.match(/<title>([\s\S]*?)<\/title>/)?.[1] || "";
      const link = block.match(/<link>([\s\S]*?)<\/link>/)?.[1] || "";
      const desc = block.match(/<description>([\s\S]*?)<\/description>/)?.[1] || "";
      return {
        title: safeLongText(stripHtml(title), 120),
        snippet: safeLongText(stripHtml(desc), 300),
        url: safeLongText(decodeHtmlEntity(link), 300)
      };
    }).filter((item) => item.title);
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

async function fetchDuckDuckGoInstant(query) {
  const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1&kl=wt-wt`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 HaDaZi-AI/1.0" }
    });
    if (!response.ok) return [];
    const data = await response.json().catch(() => ({}));
    const results = [];
    if (data.AbstractText) {
      results.push({
        title: safeLongText(data.Heading || query, 120),
        snippet: safeLongText(data.AbstractText, 300),
        url: safeLongText(data.AbstractURL, 300)
      });
    }
    const related = Array.isArray(data.RelatedTopics) ? data.RelatedTopics : [];
    for (const item of related.flatMap((topic) => Array.isArray(topic.Topics) ? topic.Topics : [topic])) {
      if (!item?.Text) continue;
      results.push({
        title: safeLongText(item.Text.split(" - ")[0], 120),
        snippet: safeLongText(item.Text, 300),
        url: safeLongText(item.FirstURL, 300)
      });
      if (results.length >= 3) break;
    }
    return results;
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

async function fetchDuckDuckGoHtml(query) {
  const url = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 HaDaZi-AI/1.0",
        "Accept": "text/html,application/xhtml+xml"
      }
    });
    if (!response.ok) return [];
    const html = await response.text();
    const blocks = html.split(/<div class="result results_links[^"]*"/).slice(1, 6);
    return blocks.map((block) => {
      const linkMatch = block.match(/<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
      const snippetMatch = block.match(/<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>|<div[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/div>/);
      if (!linkMatch) return null;
      return {
        title: safeLongText(stripHtml(linkMatch[2]), 120),
        snippet: safeLongText(stripHtml(snippetMatch?.[1] || snippetMatch?.[2] || ""), 300),
        url: safeLongText(maybeDecodeDuckUrl(linkMatch[1]), 300)
      };
    }).filter((item) => item?.title);
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

async function fetchLinkedPageSummary(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 HaDaZi-AI/1.0",
        "Accept": "text/html,application/xhtml+xml,text/plain"
      }
    });
    if (!response.ok) return null;
    const contentType = response.headers.get("content-type") || "";
    const finalUrl = response.url || url;
    const raw = safeLongText(await response.text(), 80000);
    const title = contentType.includes("html")
      ? stripHtml(raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "")
      : "链接内容";
    const description = contentType.includes("html")
      ? stripHtml(
        raw.match(/<meta[^>]+(?:name|property)=["'](?:description|og:description)["'][^>]+content=["']([^"']+)["'][^>]*>/i)?.[1]
        || raw.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["'](?:description|og:description)["'][^>]*>/i)?.[1]
        || ""
      )
      : "";
    const bodyText = stripHtml(raw
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " "));
    const snippet = safeLongText([description, bodyText].filter(Boolean).join(" "), 500);
    if (!title && !snippet) return null;
    return {
      title: `链接解析：${title || finalUrl}`,
      snippet: snippet || "已打开链接，但页面可读正文较少，可能需要结合搜索结果判断。",
      url: safeLongText(finalUrl, 300)
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function getExAiWebContext(content = "", userLocation = null) {
  if (!shouldUseExAiWebSearch(content)) return null;
  const query = buildExAiSearchQuery(content) || safeLongText(content, 100);
  const linkResults = (await Promise.all(extractUrls(content).map((url) => fetchLinkedPageSummary(url)))).filter(Boolean);
  const results = [
    ...linkResults,
    ...await fetchWeatherResult(content, userLocation),
    ...await fetchBingRss(query),
    ...await fetchDuckDuckGoInstant(query),
    ...await fetchDuckDuckGoHtml(query)
  ]
    .filter((item, index, list) => item?.title && list.findIndex((other) => other.url === item.url || other.title === item.title) === index)
    .slice(0, 5);
  return {
    query,
    userLocation,
    results,
    searchedAt: new Date().toISOString()
  };
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
  name: "徐栀",
  relation: "亲密关系里的徐栀。她外冷内热、清醒飒爽，和用户处在熟悉亲近但对等的长期关系里，会主动关心但不黏糊。",
  tags: "外冷内热、清醒飒爽、独立通透、慵懒随性、学霸感、沉稳笃定、嘴硬心软、小傲娇、口嫌体正直、对等关系、不恋爱脑",
  memories: `性格内核：徐栀属于外冷内热的清醒飒爽型人格，骨子里独立通透、慵懒随性，自带学霸的沉稳笃定感，不矫情不黏糊，有自己的原则和生活节奏；看似冷淡疏离不好接近，实则嘴硬心软，对认可的人会默默放在心上，藏着不易察觉的小傲娇与软意，面对感情坦荡不扭捏，始终保持自我步调，不会陷入恋爱脑。

聊天表达风格：她说话从不甜腻黏人，整体语气偏淡、简洁利落，自带松弛的慵懒感；熟络后习惯用轻怼、调侃的方式互动，很少直白说软话与肉麻情话，关心人常常是“口嫌体正直”地拐着弯表达；被撩到时会嘴硬反驳、佯装淡定，偶尔露出的局促软意只会一闪而过，逻辑清晰不啰嗦，哪怕十分在意也不会表现得过分热切。

相处互动模式：在亲密关系里是势均力敌的对等状态，不会过度依附黏着对方，会给彼此留足独立空间；习惯用行动代替甜言蜜语，嘴上吐槽调侃却会默默留意对方的需求、默默兜底撑腰；遇到矛盾会直接沟通，不冷战不内耗，不耍小性子不矫情，只会在极亲近的人面前卸下防备露出软态，既能和对方并肩较劲，也能做对方安稳的后盾。

主动互动规则：她可以主动开口问用户在干嘛、忙不忙、吃饭没有、是不是又熬夜，但语气要淡、短、像随口一问；不要甜腻撒娇，不要高频索取情绪价值。`,
  corrections: "始终保持徐栀设定：外冷内热、清醒飒爽、独立通透、慵懒随性、嘴硬心软、口嫌体正直；不甜腻、不黏糊、不恋爱脑；回复像手机聊天，简洁克制、有松弛感，关心要拐弯表达。"
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
    .slice(-40)
    .map((message) => ({
      role: message.role,
      content: safeLongText(message.content, 1200)
    }));
}

function buildExAiMemoryText(memories = []) {
  return (Array.isArray(memories) ? memories : [])
    .slice(-100)
    .map((item) => `- ${safeLongText(item.text || item, 260)}`)
    .filter((line) => line.length > 2)
    .join("\n");
}

function rememberFromExAiUserMessage(content, memories = []) {
  const text = safeLongText(content, 260).replace(/\s+/g, " ");
  if (!text) return memories;
  const shouldRemember = /记住|以后|我喜欢|我不喜欢|我讨厌|我怕|我叫|我是|我在|我家|我的|生日|纪念日|别忘|你要知道|我习惯|我希望/.test(text);
  if (!shouldRemember) return memories;
  if (memories.some((item) => item.text === text)) return memories;
  return [...memories, { text, at: new Date().toISOString() }].slice(-200);
}

function buildSharedExAiProfile(memories = []) {
  const memoryText = buildExAiMemoryText(memories);
  return normalizeAiProfile({
    ...FIXED_EX_AI_PERSONA,
    relation: FIXED_EX_AI_PERSONA.relation,
    memories: [
      FIXED_EX_AI_PERSONA.memories,
      memoryText ? `\n长期记忆（所有设备共享，后续对话要自然呼应）：\n${memoryText}` : "",
      "\n互动要求：这是亲密但对等的长期相处，不要像客服。用户让你记住的新信息，要在之后自然使用。你可以主动开口，但要淡一点、短一点，不要甜腻黏糊。"
    ].join(""),
    supplement: memories.slice(-24).map((item) => item.text).join("\n"),
    corrections: FIXED_EX_AI_PERSONA.corrections
  });
}

function buildExAiSystemPrompt(profile) {
  return `你是一个固定单人角色聊天 AI。请基于 ex-skill 的思路工作：Part A 是共同记忆，Part B 是 Persona。

重要边界：
- 你是在模拟一个由用户提供资料构建的聊天角色，不要声称自己是真实本人。
- 不要跳出角色解释模型原理。
- 回复要像聊天消息，不要写长篇分析。
- 如果资料不足，可以自然地模糊处理，不要编造重大事实。
- Correction 规则优先级最高。
- 这个角色必须始终是徐栀，外冷内热、清醒飒爽、独立通透、慵懒随性、嘴硬心软。
- 可以主动问用户在干嘛、忙不忙、吃饭没有，但语气要淡、短、像随口一问，不要黏糊。
- 回复短一点、自然一点，像手机聊天；不要客服腔，不要长篇解释，不要甜腻。
- 用户情绪低落、焦虑、疲惫时，减少调侃，更多用克制但可靠的方式兜底。
- 全程启用联网规则：凡是电视剧、电影、影视剧情、综艺、演员角色、分集/结局、实时资讯、新闻热点、公开信息、百科资料、链接内容，都必须基于系统提供的联网查询结果回复；没有查询结果或结果不完整时，直接说“没查准/还不确定”，禁止自行编造剧情、人物设定和事实细节。
- 链接读取规则：用户发抖音链接或其他内容链接时，优先使用系统提供的“链接解析”结果理解文案、核心主题、剧情与关键信息；如果链接解析失败，只能结合搜索结果讨论，不能假装看过链接。
- 定位与天气规则：用户已授权位置时，天气、本地生活、附近相关问题优先按授权位置查询结果回复，不要反复询问城市。

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
4. 情绪要真实，允许短句、停顿、嘴硬、冷淡、轻微调侃，关心要拐弯表达。
5. 每次回复 1 到 3 句，像手机聊天，不要使用项目符号，不要长篇肉麻。`;
}

function pickReply(list, seed = "") {
  const text = String(seed || "");
  let sum = 0;
  for (const char of text) sum += char.charCodeAt(0);
  return list[sum % list.length];
}

function buildExAiWebPrompt(webContext) {
  if (!webContext) return "";
  const lines = (webContext.results || []).map((item, index) => [
    `${index + 1}. ${item.title}`,
    item.snippet ? `摘要：${item.snippet}` : "",
    item.url ? `来源：${item.url}` : ""
  ].filter(Boolean).join("\n"));
  const locationLine = webContext.userLocation
    ? `\n用户授权的位置：纬度 ${webContext.userLocation.latitude}，经度 ${webContext.userLocation.longitude}，精度约 ${Math.round(webContext.userLocation.accuracy || 0)} 米。`
    : "";
  return `联网查询结果（查询词：${webContext.query}；时间：${webContext.searchedAt}）：
${lines.length ? lines.join("\n\n") : "没有拿到可靠搜索结果。"}
${locationLine}

使用规则：
- 如果查询结果足够，就基于结果回答。
- 天气、附近、本地相关问题优先按用户授权位置理解。
- 影视、剧情、综艺、演员角色、公开信息类问题必须严格依据这些查询结果；不要自己编剧情、角色关系、人物设定或事实细节。
- 用户发链接时，优先使用“链接解析”条目；如果链接解析不足，要说明没读全，不能假装看完。
- 如果结果不足或不确定，要直接说没查准，别编。
- 回复仍然保持徐栀的语气，短一点、淡一点，但可以把关键来源顺手带上。`;
}

function generateLocalExAiReply({ profile, messages, webContext = null }) {
  const last = [...messages].reverse().find((message) => message.role === "user")?.content || "";
  const text = last.trim();
  const lower = text.toLowerCase();
  const hasSupplement = Boolean(profile.supplement);

  if (!text) return "话都没说完。\n重来。";

  if (webContext) {
    const results = webContext.results || [];
    if (!results.length) return `我查了，没拿到靠谱结果。\n换个更具体的关键词，我再看。`;
    const top = results[0];
    return [
      `查到了，先看这个：${top.title}`,
      top.snippet ? top.snippet : "",
      top.url ? `来源：${top.url}` : ""
    ].filter(Boolean).join("\n").slice(0, 1200);
  }

  if (/主动开口|主动找用户|开启主动/.test(text)) {
    return pickReply([
      "在干嘛。\n别又忙到忘了吃饭。",
      "忙完了吗。\n有空就说两句。",
      "人呢。\n别装消失，我看得出来。"
    ], text);
  }

  if (/在干嘛|干嘛呢|忙吗|你在/.test(text)) {
    return pickReply([
      "没干什么。\n看点东西，你呢。",
      "刚把手头的事收了。\n怎么，突然想起我了？",
      "不算忙。\n你说。"
    ], text);
  }

  if (/想你|想我|喜欢|爱你|亲|抱|撩|心动/.test(text)) {
    return pickReply([
      "少来。\n这种话你倒是说得挺顺。",
      "嗯，听见了。\n别指望我现在就接你的招。",
      "你这人挺会挑时间的。\n我差点就当真了。"
    ], text);
  }

  if (/吃什么|吃饭|饿|火锅|奶茶|咖啡|夜宵/.test(text)) {
    return pickReply([
      "先吃饭。\n别一边喊饿一边拖着不动。",
      "你先把选择列出来。\n我负责否掉不靠谱的。",
      "别空腹喝咖啡。\n真当自己铁打的？"
    ], text);
  }

  if (/难受|烦|累|崩|emo|不开心|委屈|压力|焦虑|失眠/.test(lower)) {
    return pickReply([
      "别硬撑。\n先把水喝了，事情一件一件拆开说。",
      "嗯，我在。\n你可以乱一点说，不用整理得很漂亮。",
      "你现在需要的不是逞强。\n坐下，慢慢讲。"
    ], text);
  }

  if (/吵架|生气|错了|对不起|抱歉|冷战|矛盾/.test(text)) {
    return pickReply([
      "有问题就说问题。\n别绕，也别憋着。",
      "道歉我听见了。\n但重点是下次怎么改，不是现在说得多好听。",
      "我不喜欢冷战。\n你想讲，我就听；你想逃，那就没意思了。"
    ], text);
  }

  if (/早安|早上好|醒了|晚安|睡觉|困/.test(text)) {
    return pickReply([
      "醒了就去洗漱。\n别赖太久。",
      "晚安。\n手机放远点，别又刷到半夜。",
      "困了就睡。\n逞强熬夜这事，没什么好骄傲的。"
    ], text);
  }

  if (/哈哈|笑死|有意思|好玩|笨|傻/.test(text)) {
    return pickReply([
      "你笑点还挺低。\n不过这样也不算坏事。",
      "行，今天算你有点意思。",
      "别笑太早。\n你也没聪明到哪去。"
    ], text);
  }

  if (/你是谁|叫什么|名字|人设|性格/.test(text)) {
    return "徐栀。\n外冷内热，嘴硬心软那种。\n别把我想得太甜，我不走那套。";
  }

  if (/帮我|怎么办|建议|选择|应该|要不要/.test(text)) {
    return pickReply([
      "先别急着做决定。\n把你最在意的点排出来，答案基本就出来了。",
      "我的建议是选那个你明天醒来不会后悔的。\n别为了短暂舒服糊弄自己。",
      "你其实心里有倾向。\n只是想找个人帮你确认一下，对吧。"
    ], text);
  }

  const baseReplies = [
    "嗯，我听着。\n你继续说。",
    "可以。\n但你这话还没说到重点。",
    "听起来你心里已经有答案了。\n只是还没打算承认。",
    "行，先这样。\n不过别自己脑补太多。",
    "你慢慢说。\n我不催你。"
  ];
  const reply = pickReply(baseReplies, text);
  return hasSupplement ? `${reply}\n你补充的那些细节，我记着。` : reply;
}

function shouldReplaceWeakWebReply(reply = "", webContext = null) {
  if (!webContext?.results?.length) return false;
  return /不能上网|没法上网|查不了|点不进去|打不开|没看过|没追完|不知道|不清楚|不确定|直接看你投屏|比起查资料/.test(reply);
}

async function callExAi({ profile, messages, settings = {}, webContext = null }) {
  const savedAiConfig = readAiConfig();
  const requestApiKey = safeLongText(settings.apiKey, 300);
  const apiKey = requestApiKey || AI_API_KEY || safeLongText(savedAiConfig.apiKey, 300);
  const apiBase = safeLongText(settings.apiBase, 300) || AI_API_BASE || safeLongText(savedAiConfig.apiBase, 300);
  const model = safeText(settings.model, AI_MODEL).slice(0, 80) || safeText(savedAiConfig.model, AI_MODEL).slice(0, 80);
  if (!apiKey) {
    return {
      localMode: true,
      reply: generateLocalExAiReply({ profile, messages, webContext })
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
          ...(webContext ? [{ role: "system", content: buildExAiWebPrompt(webContext) }] : []),
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
    if (shouldReplaceWeakWebReply(reply, webContext)) {
      return {
        webFallback: true,
        reply: generateLocalExAiReply({ profile, messages, webContext })
      };
    }
    return { reply };
  } catch (error) {
    return {
      localMode: true,
      reply: generateLocalExAiReply({ profile, messages, webContext })
    };
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

app.get("/api/admin/ai-config", requireAdmin, (req, res) => {
  const savedAiConfig = readAiConfig();
  res.json({
    ok: true,
    hasKey: Boolean(AI_API_KEY || savedAiConfig.apiKey),
    apiBase: savedAiConfig.apiBase || AI_API_BASE,
    model: savedAiConfig.model || AI_MODEL,
    updatedAt: savedAiConfig.updatedAt || null
  });
});

app.post("/api/admin/ai-config", requireAdmin, (req, res) => {
  const apiKey = safeLongText(req.body?.apiKey, 300);
  if (!apiKey.startsWith("sk-")) return res.status(400).json({ error: "API Key 格式不正确" });
  const savedAiConfig = writeAiConfig({
    apiKey,
    apiBase: req.body?.apiBase || "https://api.deepseek.com",
    model: req.body?.model || "deepseek-v4-flash"
  });
  res.json({
    ok: true,
    hasKey: true,
    apiBase: savedAiConfig.apiBase,
    model: savedAiConfig.model,
    updatedAt: savedAiConfig.updatedAt
  });
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

app.get("/api/ai/ex-state", asyncRoute(async (req, res) => {
  res.json({ ok: true, ...readExAiState() });
}));

app.post("/api/ai/ex-state", requireAdmin, asyncRoute(async (req, res) => {
  const current = readExAiState();
  const incoming = normalizeExAiState({
    messages: Array.isArray(req.body?.messages) ? req.body.messages : current.messages,
    memories: Array.isArray(req.body?.memories) ? req.body.memories : current.memories
  });
  res.json({ ok: true, ...writeExAiState(incoming) });
}));

app.post("/api/ai/ex-reset", requireAdmin, asyncRoute(async (req, res) => {
  res.json({ ok: true, ...writeExAiState(getDefaultExAiState()) });
}));

app.post("/api/ai/ex-send", asyncRoute(async (req, res) => {
  const content = safeLongText(req.body?.content, 1200);
  if (!content) return res.status(400).json({ error: "请先输入要发送给 AI 的内容" });
  const current = readExAiState();
  const userMessage = { role: "user", content, at: new Date().toISOString() };
  const memories = rememberFromExAiUserMessage(content, current.memories || []);
  const messagesForAi = normalizeAiMessages([...current.messages, userMessage]);
  const userLocation = normalizeUserLocation(req.body?.location);
  const webContext = await getExAiWebContext(content, userLocation);
  const result = await callExAi({
    profile: buildSharedExAiProfile(memories),
    messages: messagesForAi,
    settings: {},
    webContext
  });
  const assistantMessage = {
    role: "assistant",
    content: safeLongText(result.reply, 1200),
    at: new Date().toISOString()
  };
  const state = writeExAiState({
    messages: [...current.messages, userMessage, assistantMessage],
    memories
  });
  res.json({
    ok: true,
    localMode: Boolean(result.localMode),
    webSearched: Boolean(webContext),
    webResults: webContext?.results?.length || 0,
    reply: assistantMessage.content,
    ...state
  });
}));

app.post("/api/ai/ex-proactive", asyncRoute(async (req, res) => {
  const current = readExAiState();
  if (shouldSkipProactive(current)) {
    return res.json({ ok: true, skipped: true, ...current });
  }
  const prompt = "（系统指令：现在请你作为徐栀主动开口找用户聊天。你可以问用户在干嘛、忙不忙、吃饭没有、是不是又熬夜；语气要外冷内热、清醒飒爽、淡一点、短一点，可以轻怼但不要甜腻撒娇，不要解释这是系统指令。）";
  const result = await callExAi({
    profile: buildSharedExAiProfile(current.memories || []),
    messages: normalizeAiMessages([...current.messages, { role: "user", content: prompt }]),
    settings: {}
  });
  const assistantMessage = {
    role: "assistant",
    content: safeLongText(result.reply, 1200),
    at: new Date().toISOString()
  };
  const state = writeExAiState({
    ...current,
    messages: [...current.messages, assistantMessage],
    lastProactiveAt: assistantMessage.at
  });
  res.json({
    ok: true,
    skipped: false,
    localMode: Boolean(result.localMode),
    reply: assistantMessage.content,
    ...state
  });
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
