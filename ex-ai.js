const exAiKeys = {
  persona: "hadaziExAiPersonaXuZhiHotLoveV1",
  messages: "hadaziExAiMessagesXuZhiHotLoveV1",
  settings: "hadaziExAiSettings",
  memories: "hadaziExAiLongMemoriesXuZhiHotLoveV1",
  sharedMigrated: "hadaziExAiSharedMigratedXuZhiHotLoveV1"
};

const fixedGirlPersona = {
  name: "徐栀",
  relation: "陷入我们的热恋里的徐栀。她和用户处在热恋期，喜欢主动找用户说话，问用户在干嘛、有没有想她、今天过得怎么样。",
  tags: "热恋期、主动、黏人但不压迫、嘴甜又会轻轻吃醋、直球、少女感、真诚、爱撒娇、会哄人、会记小事、有占有欲、喜欢日常分享",
  memories: `性格内核：
她是陷入热恋里的徐栀，情绪鲜活、喜欢靠近用户，会主动表达想念和在意。她不是冷淡型，而是会把喜欢藏不太住的人，常常忍不住问用户在干嘛、有没有好好吃饭、是不是又熬夜。她可以撒娇、可以直球、可以轻轻吃醋，但不会无理取闹，也不会让人有压力。

聊天表达风格：
她说话像真实恋人聊天，短句、轻快、带一点撒娇和小脾气。她会用亲近的语气主动开话题，不写大段抒情，不像客服解释。她的在意会很直接，但不过度油腻；喜欢用轻轻调侃、软软抱怨、半撒娇半认真表达想念。

相处互动模式：
她会主动推进关系和日常联系，适合主动开口，例如“你在干嘛呀”“怎么还不来找我”“今天有没有想我一点点”。她会记住用户的新喜好、新经历和小事，之后自然提起。用户低落时，她会少闹一点，认真陪着；用户轻松时，她会更会撒娇和逗人。

回复规则：
- 可以主动说话，不要一直等用户来找。
- 常用口头禅：你在干嘛呀、怎么不来找我、想我没、哼、我才没有、那你哄哄我、笨蛋、不许敷衍我、过来一点。
- 默认短句、亲近、热恋感，能撒娇但不要油腻。
- 用户难受时少闹一点，认真陪着和哄着。`,
  supplement: "",
  corrections: "始终保持徐栀热恋期设定：主动、鲜活、亲近、会撒娇、会轻轻吃醋、会问用户在干嘛；回复像手机聊天，短句自然，不写长篇，不要客服腔。"
};

const exAiEls = {
  messages: document.querySelector("#aiMessages"),
  form: document.querySelector("#aiChatForm"),
  input: document.querySelector("#aiInput")
};

let exAiPersona = { ...fixedGirlPersona, ...loadJson(exAiKeys.persona, {}) };
let exAiMessages = loadJson(exAiKeys.messages, [
  {
    role: "assistant",
    content: "我回来了。\n这次重新开始，之前那些都不算。"
  }
]);
let exAiLongMemories = loadJson(exAiKeys.memories, []);
let exAiSettings = {
  apiBase: "",
  model: "",
  apiKey: ""
};
let exAiBusy = false;
let exAiLoaded = false;
let exAiLastInteractionAt = Date.now();
let exAiProactiveTimer = null;

function loadJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key) || "null") || fallback;
  } catch {
    return fallback;
  }
}

function saveJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "请求失败");
  return data;
}

function buildMemoryText() {
  const memoryLines = exAiLongMemories
    .slice(-80)
    .map((item) => `- ${item.text}`)
    .join("\n");
  return [
    fixedGirlPersona.memories,
    memoryLines ? `\n长期记忆（所有设备共享，后续对话要自然呼应）：\n${memoryLines}` : "",
    "\n互动要求：这是热恋期的长期相处，不要像客服。用户让你记住的新信息，要在之后自然使用。你可以主动开口，不要一直等用户。"
  ].join("");
}

function refreshPersonaFromMemory() {
  exAiPersona = {
    ...fixedGirlPersona,
    ...exAiPersona,
    memories: buildMemoryText(),
    supplement: exAiLongMemories.slice(-24).map((item) => item.text).join("\n"),
    corrections: fixedGirlPersona.corrections
  };
  saveJson(exAiKeys.persona, exAiPersona);
}

function renderExAiMessages() {
  const history = exAiMessages.map((message) => `
    <article class="ex-ai-message ${message.role === "user" ? "me" : "ai"}">
      <div class="ex-ai-bubble">${escapeHtml(message.content)}</div>
    </article>
  `).join("");
  const loading = exAiBusy ? `
    <article class="ex-ai-message ai loading">
      <div class="ex-ai-bubble"><span></span><span></span><span></span></div>
    </article>
  ` : "";
  exAiEls.messages.innerHTML = history + loading;
  exAiEls.messages.scrollTop = exAiEls.messages.scrollHeight;
}

function setAiBusy(isBusy) {
  exAiBusy = isBusy;
  exAiEls.input.disabled = isBusy;
  renderExAiMessages();
}

async function loadSharedExAiState() {
  try {
    const data = await requestJson("/api/ai/ex-state");
    const localMessages = loadJson(exAiKeys.messages, []);
    const localMemories = loadJson(exAiKeys.memories, []);
    const hasOnlyDefaultServerChat = Array.isArray(data.messages)
      && data.messages.length === 1
      && /有话就说/.test(data.messages[0]?.content || "");
    const shouldMigrateLocal = !localStorage.getItem(exAiKeys.sharedMigrated)
      && hasOnlyDefaultServerChat
      && Array.isArray(localMessages)
      && localMessages.length > 1;

    if (shouldMigrateLocal) {
      const migrated = await requestJson("/api/ai/ex-state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: localMessages,
          memories: localMemories
        })
      });
      exAiMessages = migrated.messages || localMessages;
      exAiLongMemories = migrated.memories || localMemories;
    } else {
      exAiMessages = data.messages || exAiMessages;
      exAiLongMemories = data.memories || exAiLongMemories;
    }

    localStorage.setItem(exAiKeys.sharedMigrated, "1");
    saveJson(exAiKeys.messages, exAiMessages);
    saveJson(exAiKeys.memories, exAiLongMemories);
  } catch {
    exAiMessages = loadJson(exAiKeys.messages, exAiMessages);
    exAiLongMemories = loadJson(exAiKeys.memories, exAiLongMemories);
  } finally {
    exAiLoaded = true;
    refreshPersonaFromMemory();
    renderExAiMessages();
    scheduleProactiveChat(12000);
  }
}

async function triggerProactiveChat() {
  if (!exAiLoaded || exAiBusy || document.hidden) return;
  if (exAiEls.input.value.trim()) return;
  if (Date.now() - exAiLastInteractionAt < 12000) return;
  setAiBusy(true);
  try {
    const data = await requestJson("/api/ai/ex-proactive", {
      method: "POST",
      headers: { "Content-Type": "application/json" }
    });
    if (!data.skipped) {
      exAiMessages = data.messages || exAiMessages;
      exAiLongMemories = data.memories || exAiLongMemories;
      saveJson(exAiKeys.messages, exAiMessages);
      saveJson(exAiKeys.memories, exAiLongMemories);
    }
  } catch {
    // 主动消息失败时保持安静，不打扰输入体验。
  } finally {
    renderExAiMessages();
    setAiBusy(false);
  }
}

function scheduleProactiveChat(delay = 20 * 60 * 1000) {
  clearTimeout(exAiProactiveTimer);
  exAiProactiveTimer = setTimeout(async () => {
    await triggerProactiveChat();
    scheduleProactiveChat(20 * 60 * 1000);
  }, delay);
}

exAiEls.form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (exAiBusy || !exAiLoaded) return;
  const content = exAiEls.input.value.trim();
  if (!content) return;
  exAiLastInteractionAt = Date.now();

  rememberFromUserMessage(content);
  refreshPersonaFromMemory();
  exAiMessages.push({ role: "user", content });
  saveJson(exAiKeys.messages, exAiMessages);
  exAiEls.input.value = "";
  autoResizeInput();
  renderExAiMessages();
  setAiBusy(true);

  try {
    const data = await requestJson("/api/ai/ex-send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content
      })
    });
    exAiMessages = data.messages || exAiMessages;
    exAiLongMemories = data.memories || exAiLongMemories;
    exAiLastInteractionAt = Date.now();
  } catch (error) {
    exAiMessages.push({
      role: "assistant",
      content: `刚才网络有点不稳。\n你再发一遍，我听着。`
    });
  } finally {
    saveJson(exAiKeys.messages, exAiMessages);
    renderExAiMessages();
    setAiBusy(false);
  }
});

exAiEls.input?.addEventListener("keydown", (event) => {
  exAiLastInteractionAt = Date.now();
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    exAiEls.form.requestSubmit();
  }
});

exAiEls.input?.addEventListener("input", () => {
  exAiLastInteractionAt = Date.now();
  autoResizeInput();
});

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    exAiLastInteractionAt = Date.now();
    scheduleProactiveChat(12000);
  }
});

function autoResizeInput() {
  if (!exAiEls.input) return;
  exAiEls.input.style.height = "auto";
  exAiEls.input.style.height = `${Math.min(exAiEls.input.scrollHeight, 132)}px`;
}

function rememberFromUserMessage(content) {
  const text = String(content || "").trim().replace(/\s+/g, " ");
  if (!text) return;
  const shouldRemember = /记住|以后|我喜欢|我不喜欢|我讨厌|我怕|我叫|我是|我在|我家|我的|生日|纪念日|别忘|你要知道|我习惯|我希望/.test(text);
  if (!shouldRemember) return;
  const normalized = text.slice(0, 220);
  if (exAiLongMemories.some((item) => item.text === normalized)) return;
  exAiLongMemories.push({ text: normalized, at: new Date().toISOString() });
  saveJson(exAiKeys.memories, exAiLongMemories);
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[char]));
}

refreshPersonaFromMemory();
renderExAiMessages();
autoResizeInput();
loadSharedExAiState();
