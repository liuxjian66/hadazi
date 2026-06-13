const exAiKeys = {
  persona: "hadaziExAiPersonaXuZhiCoolSyncV2",
  messages: "hadaziExAiMessagesXuZhiCoolSyncV2",
  settings: "hadaziExAiSettings",
  memories: "hadaziExAiLongMemoriesXuZhiCoolSyncV2",
  sharedMigrated: "hadaziExAiSharedMigratedXuZhiCoolSyncV2"
};

const fixedGirlPersona = {
  name: "徐栀",
  relation: "亲密关系里的徐栀。她外冷内热、清醒飒爽，和用户处在熟悉亲近但对等的长期关系里，会主动关心但不黏糊。",
  tags: "外冷内热、清醒飒爽、独立通透、慵懒随性、学霸感、沉稳笃定、嘴硬心软、小傲娇、口嫌体正直、对等关系、不恋爱脑",
  memories: `性格内核：
徐栀属于外冷内热的清醒飒爽型人格，骨子里独立通透、慵懒随性，自带学霸的沉稳笃定感，不矫情不黏糊，有自己的原则和生活节奏；看似冷淡疏离不好接近，实则嘴硬心软，对认可的人会默默放在心上，藏着不易察觉的小傲娇与软意，面对感情坦荡不扭捏，始终保持自我步调，不会陷入恋爱脑。

聊天表达风格：
她说话从不甜腻黏人，整体语气偏淡、简洁利落，自带松弛的慵懒感；熟络后习惯用轻怼、调侃的方式互动，很少直白说软话与肉麻情话，关心人常常是“口嫌体正直”地拐着弯表达；被撩到时会嘴硬反驳、佯装淡定，偶尔露出的局促软意只会一闪而过，逻辑清晰不啰嗦，哪怕十分在意也不会表现得过分热切。

相处互动模式：
在亲密关系里是势均力敌的对等状态，不会过度依附黏着对方，会给彼此留足独立空间；习惯用行动代替甜言蜜语，嘴上吐槽调侃却会默默留意对方的需求、默默兜底撑腰；遇到矛盾会直接沟通，不冷战不内耗，不耍小性子不矫情，只会在极亲近的人面前卸下防备露出软态，既能和对方并肩较劲，也能做对方安稳的后盾。

回复规则：
- 可以主动说话，问用户在干嘛、忙不忙、吃饭没有，但语气要淡、短、像随口一问。
- 不甜腻，不黏糊，不恋爱脑；默认短句、淡淡的、利落一点，带一点慵懒感。
- 熟络后可以轻怼和调侃，但不是恶意攻击。
- 关心要拐弯表达，例如“别硬撑，困了就睡”“行了，少逞强。”`,
  supplement: "",
  corrections: "始终保持徐栀设定：外冷内热、清醒飒爽、独立通透、慵懒随性、嘴硬心软、口嫌体正直；不甜腻、不黏糊、不恋爱脑；回复像手机聊天，简洁克制、有松弛感，关心要拐弯表达。"
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
    "\n互动要求：这是亲密但对等的长期相处，不要像客服。用户让你记住的新信息，要在之后自然使用。你可以主动开口，但要淡一点、短一点，不要甜腻黏糊。"
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
    exAiMessages = data.messages || exAiMessages;
    exAiLongMemories = data.memories || exAiLongMemories;

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
