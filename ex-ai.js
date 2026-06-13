const exAiKeys = {
  persona: "hadaziExAiPersona",
  messages: "hadaziExAiMessages",
  settings: "hadaziExAiSettings"
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

let exAiPersona = loadJson(exAiKeys.persona, {
  name: "小美",
  relation: "",
  tags: "",
  memories: "",
  supplement: "",
  corrections: ""
});
let exAiMessages = loadJson(exAiKeys.messages, [
  {
    role: "assistant",
    content: "你可以先在右侧补充她的资料、聊天记录或性格标签。准备好后，直接发消息开始聊。"
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
    name: exAiEls.name.value.trim() || "小美",
    relation: exAiEls.relation.value.trim(),
    tags: exAiEls.tags.value.trim(),
    memories: exAiEls.memories.value.trim(),
    supplement: exAiEls.supplement.value.trim(),
    corrections: exAiEls.corrections.value.trim()
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
  exAiEls.status.textContent = isBusy ? "AI 正在回复..." : "可随时补充文字资料";
}

exAiEls.save?.addEventListener("click", () => {
  collectPersonaForm();
  showExAiToast("补充内容已保存，下一次回复会参考");
});

exAiEls.clear?.addEventListener("click", () => {
  if (!confirm("确定清空当前 AI 聊天记录吗？")) return;
  exAiMessages = [{
    role: "assistant",
    content: "聊天已清空。你可以继续补充资料，然后重新开始。"
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
