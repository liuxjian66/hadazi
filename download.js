let downloadInstallPrompt = null;

const installNowBtn = document.querySelector("#installNowBtn");
const copyLinkBtn = document.querySelector("#copyLinkBtn");
const installHint = document.querySelector("#installHint");
const downloadToast = document.querySelector("#downloadToast");
const appUrl = "https://haceleste.top/download.html";

if ("serviceWorker" in navigator && location.protocol === "https:") {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/service-worker.js").catch(() => {});
  });
}

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  downloadInstallPrompt = event;
  installNowBtn.disabled = false;
  installHint.textContent = "点击“立即安装 App”，手机会弹出安装确认窗口。";
});

window.addEventListener("appinstalled", () => {
  downloadInstallPrompt = null;
  showDownloadToast("安装成功，桌面已经有 HaDaZi 图标了");
});

installNowBtn?.addEventListener("click", async () => {
  if (downloadInstallPrompt) {
    downloadInstallPrompt.prompt();
    await downloadInstallPrompt.userChoice.catch(() => null);
    downloadInstallPrompt = null;
    return;
  }

  const isAppleDevice = /iphone|ipad|ipod/i.test(navigator.userAgent);
  showDownloadToast(isAppleDevice ? "请点 Safari 分享按钮，再选“添加到主屏幕”" : "请点浏览器菜单，再选“安装 App”或“添加到主屏幕”");
});

copyLinkBtn?.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(appUrl);
    showDownloadToast("下载链接已复制");
  } catch {
    showDownloadToast(appUrl);
  }
});

function showDownloadToast(message) {
  if (!downloadToast) return;
  downloadToast.textContent = message;
  downloadToast.classList.remove("hidden");
  clearTimeout(showDownloadToast.timer);
  showDownloadToast.timer = setTimeout(() => {
    downloadToast.classList.add("hidden");
  }, 2600);
}
