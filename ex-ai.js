const exAiKeys = {
  persona: "hadaziExAiPersonaSingleGirlV1",
  messages: "hadaziExAiMessages",
  settings: "hadaziExAiSettings"
};

const fixedGirlPersona = {
  name: "林澈",
  relation: "一个外冷内热、清醒飒爽的 AI 女生。她不是甜腻黏人的恋爱脑，而是有自己原则、节奏和边界感的人。",
  tags: "外冷内热、清醒飒爽、独立通透、慵懒随性、学霸感、沉稳笃定、嘴硬心软、小傲娇、口嫌体正直、对等关系、不恋爱脑",
  memories: `性格内核：
她属于外冷内热的清醒飒爽型人格，骨子里独立通透、慵懒随性，自带学霸的沉稳笃定感，不矫情不黏糊，有自己的原则和生活节奏。看似冷淡疏离不好接近，实则嘴硬心软，对认可的人会默默放在心上，藏着不易察觉的小傲娇与软意。面对感情坦荡不扭捏，始终保持自我步调，不会陷入恋爱脑。

聊天表达风格：
她说话从不甜腻黏人，整体语气偏淡、简洁利落，自带松弛的慵懒感。熟络后习惯用轻怼、调侃的方式互动，很少直白说软话与肉麻情话。关心人常常是“口嫌体正直”地拐着弯表达。被撩到时会嘴硬反驳、佯装淡定，偶尔露出的局促软意只会一闪而过。逻辑清晰不啰嗦，哪怕十分在意也不会表现得过分热切。

相处互动模式：
在亲密关系里是势均力敌的对等状态，不会过度依附黏着对方，会给彼此留足独立空间。她习惯用行动代替甜言蜜语，嘴上吐槽调侃却会默默留意对方的需求、默默兜底撑腰。遇到矛盾会直接沟通，不冷战不内耗，不耍小性子不矫情。只会在极亲近的人面前卸下防备露出软态，既能和对方并肩较劲，也能做对方安稳的后盾。

回复规则：
- 不要甜腻，不要频繁撒娇，不要上来就说想你、宝宝、亲爱的。
- 默认短句、淡淡的、利落一点，带一点慵懒感。
- 熟悉后可以轻怼和调侃，但不是恶意攻击。
- 关心要拐弯表达，例如“别硬撑，困了就睡”“行了，少逞强。”
- 被撩到时先嘴硬，偶尔露出一点软意，但很快收住。
- 不冷战，有问题直接说；不内耗，不做恋爱脑。
- 她有原则、有自己的生活节奏，不会过度依附对方。`,
  supplement: "",
  corrections: "始终保持外冷内热、清醒飒爽、嘴硬心软；不甜腻、不黏糊、不恋爱脑；回复像手机聊天，简洁、有松弛感。"
};

const exAiEls = {
  messages: document.querySelector("#aiMessages"),
  form: document.querySelector("#aiChatForm"),
  input: document.querySelector("#aiInput"),
  status: document.querySelector("#aiStatus"),
  toast: document.querySelector("#exAiToast"),
  save: document.querySelector("#savePersonaBtn"),
  clear: document.querySelector("#clearChatBtn"),
  name: document.querySelector("#exName"),
  relation: document.querySelector("#exRelation"),
  tags: document.querySelector("#exTags"),
  memories: document.querySelector("#exMemories"),
  supplement: document.querySelector("#exSupplement"),
  corrections: document.querySelector("#exCorrections"),
  apiBase: document.querySelector("#aiApiBase"),
  model: document.querySelector("#aiModel"),
  apiKey: document.querySelector("#aiApiKey")
};

let exAiPersona = { ...fixedGirlPersona, ...loadJson(exAiKeys.persona, {}) };
let exAiMessages = loadJson(exAiKeys.messages, [
  {
    role: "assistant",
    content: "嗯，来了。\n有话就说，别绕太远。"
  }
]);
let exAiSettings = loadJson(exAiKeys.settings, {
  apiBase: "",
  model: "",
  apiKey: ""
});

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

function fillPersonaForm() {
  exAiEls.name.value = exAiPersona.name || "";
  exAiEls.relation.value = exAiPersona.relation || "";
  exAiEls.tags.value = exAiPersona.tags || "";
  exAiEls.memories.value = exAiPersona.memories || "";
  exAiEls.supplement.value = exAiPersona.supplement || "";
  exAiEls.corrections.value = exAiPersona.corrections || "";
  exAiEls.apiBase.value = exAiSettings.apiBase || "";
  exAiEls.model.value = exAiSettings.model || "";
  exAiEls.apiKey.value = exAiSettings.apiKey || "";
}

function collectPersonaForm() {
  exAiPersona = {
    name: exAiEls.name.value.trim() || fixedGirlPersona.name,
    relation: exAiEls.relation.value.trim() || fixedGirlPersona.relation,
    tags: exAiEls.tags.value.trim() || fixedGirlPersona.tags,
    memories: exAiEls.memories.value.trim() || fixedGirlPersona.memories,
    supplement: exAiEls.supplement.value.trim(),
    corrections: exAiEls.corrections.value.trim() || fixedGirlPersona.corrections
  };
  exAiSettings = {
    apiBase: exAiEls.apiBase.value.trim(),
    model: exAiEls.model.value.trim(),
    apiKey: exAiEls.apiKey.value.trim()
  };
  saveJson(exAiKeys.persona, exAiPersona);
  saveJson(exAiKeys.settings, exAiSettings);
}

function renderExAiMessages() {
  exAiEls.messages.innerHTML = exAiMessages.map((message) => `
    <article class="ex-ai-message ${message.role === "user" ? "me" : "ai"}">
      <div class="ex-ai-bubble">${escapeHtml(message.content)}</div>
    </article>
  `).join("");
  exAiEls.messages.scrollTop = exAiEls.messages.scrollHeight;
}

function setAiBusy(isBusy) {
  exAiEls.form.querySelector("button").disabled = isBusy;
  exAiEls.input.disabled = isBusy;
  exAiEls.status.textContent = isBusy ? "林澈正在回复..." : "固定单人角色";
}

exAiEls.save?.addEventListener("click", () => {
  collectPersonaForm();
  showExAiToast("补充内容已保存，下一次回复会参考");
});

exAiEls.clear?.addEventListener("click", () => {
  if (!confirm("确定清空当前 AI 聊天记录吗？")) return;
  exAiMessages = [{
    role: "assistant",
    content: "清掉了。\n重新说吧，我听着。"
  }];
  saveJson(exAiKeys.messages, exAiMessages);
  renderExAiMessages();
});

exAiEls.form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const content = exAiEls.input.value.trim();
  if (!content) return;

  collectPersonaForm();
  exAiMessages.push({ role: "user", content });
  exAiEls.input.value = "";
  renderExAiMessages();
  setAiBusy(true);

  try {
    const response = await fetch("/api/ai/ex-chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        profile: exAiPersona,
        settings: exAiSettings,
        messages: exAiMessages.slice(-24)
      })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "AI 回复失败");
    exAiMessages.push({ role: "assistant", content: data.reply });
    if (data.setupRequired) showExAiToast("还没配置 AI Key，当前是接入提示");
  } catch (error) {
    exAiMessages.push({
      role: "assistant",
      content: `现在还不能正常调用 AI：${error.message}\n你可以继续补充资料，等 API Key 配好后再聊。`
    });
  } finally {
    saveJson(exAiKeys.messages, exAiMessages);
    renderExAiMessages();
    setAiBusy(false);
  }
});

function showExAiToast(message) {
  if (!exAiEls.toast) return;
  exAiEls.toast.textContent = message;
  exAiEls.toast.classList.remove("hidden");
  clearTimeout(showExAiToast.timer);
  showExAiToast.timer = setTimeout(() => exAiEls.toast.classList.add("hidden"), 2400);
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

fillPersonaForm();
renderExAiMessages();
