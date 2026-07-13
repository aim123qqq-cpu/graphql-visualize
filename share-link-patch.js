(function () {
  "use strict";

  const PARAM = "share";
  const HASH_PREFIX = "#share=";
  const READY_FLAG = "__graphqlShareLinkPatchReady";

  if (window[READY_FLAG]) return;
  window[READY_FLAG] = true;

  initWhenReady();

  function initWhenReady() {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", init);
      return;
    }
    init();
  }

  function init() {
    injectStyles();
    addShareButton();
    setTimeout(loadSharedSchema, 420);
  }

  function injectStyles() {
    if (document.getElementById("shareLinkPatchStyles")) return;
    const style = document.createElement("style");
    style.id = "shareLinkPatchStyles";
    style.textContent = `
      .share-link-btn {
        position: relative;
      }

      .share-link-btn.is-copied {
        border-color: var(--accent);
        background: var(--accent);
        color: #fff;
      }

      .share-toast {
        position: fixed;
        right: 18px;
        bottom: 18px;
        z-index: 140;
        max-width: min(420px, calc(100vw - 36px));
        padding: 12px 14px;
        border: 1px solid var(--line);
        border-radius: 10px;
        background: var(--panel);
        color: var(--ink);
        box-shadow: 0 18px 50px rgba(0, 0, 0, 0.16);
        font-size: 13px;
        opacity: 0;
        transform: translateY(8px);
        pointer-events: none;
        transition: opacity 180ms ease, transform 180ms ease;
      }

      .share-toast.show {
        opacity: 1;
        transform: translateY(0);
      }

      body.theme-dark .share-toast {
        box-shadow: 0 22px 64px rgba(0, 0, 0, 0.42);
      }
    `;
    document.head.appendChild(style);
  }

  function addShareButton() {
    const actions = document.querySelector(".topbar .actions");
    const build = document.getElementById("buildBtn");
    if (!actions || document.getElementById("copyShareLinkBtn")) return;

    const button = document.createElement("button");
    button.id = "copyShareLinkBtn";
    button.className = "share-link-btn";
    button.type = "button";
    button.textContent = "Ссылка";
    button.title = "Скопировать ссылку на текущую построенную схему";
    button.setAttribute("aria-label", button.title);
    button.addEventListener("click", copyShareLink);

    if (build && build.nextSibling) {
      actions.insertBefore(button, build.nextSibling);
    } else {
      actions.appendChild(button);
    }
  }

  async function copyShareLink() {
    const button = document.getElementById("copyShareLinkBtn");
    const schema = document.getElementById("schemaInput")?.value.trim() || "";
    if (!schema) {
      showToast("Сначала вставьте или загрузите схему.");
      return;
    }

    try {
      if (button) {
        button.disabled = true;
        button.textContent = "Готовлю...";
      }
      const url = await createShareUrl(schema);
      await writeClipboard(url);
      if (button) {
        button.classList.add("is-copied");
        button.textContent = "Скопировано";
      }
      showToast(url.length > 26000
        ? "Ссылка скопирована. Она длинная, потому что схема большая."
        : "Ссылка на схему скопирована.");
      setTimeout(() => {
        if (!button) return;
        button.classList.remove("is-copied");
        button.textContent = "Ссылка";
      }, 1700);
    } catch (error) {
      showToast("Не удалось скопировать ссылку: " + error.message);
      if (button) button.textContent = "Ссылка";
    } finally {
      if (button) button.disabled = false;
    }
  }

  async function createShareUrl(schema) {
    const payload = {
      v: 1,
      schema,
      mode: activeMode(),
      showScalars: checked("showScalars"),
      showBuiltins: checked("showBuiltins"),
      density: valueOf("densityInput"),
      accent: valueOf("accentInput")
    };
    const token = await encodePayload(payload);
    const url = new URL(window.location.href);
    url.searchParams.set(PARAM, token);
    url.hash = "";
    return url.toString();
  }

  async function loadSharedSchema() {
    const token = readToken();
    if (!token) return;
    try {
      const payload = await decodePayload(token);
      const schema = typeof payload.schema === "string" ? payload.schema : "";
      if (!schema) throw new Error("в ссылке нет схемы");

      const schemaInput = document.getElementById("schemaInput");
      if (!schemaInput) return;
      schemaInput.value = schema;

      setChecked("showScalars", payload.showScalars);
      setChecked("showBuiltins", payload.showBuiltins);
      setValue("densityInput", payload.density);
      setValue("accentInput", payload.accent);
      applyMode(payload.mode);
      activateSchemaTab();

      document.getElementById("buildBtn")?.click();
      showToast("Схема из ссылки загружена.");
    } catch (error) {
      showToast("Не удалось открыть схему из ссылки: " + error.message);
    }
  }

  function readToken() {
    const params = new URLSearchParams(window.location.search);
    const queryToken = params.get(PARAM);
    if (queryToken) return queryToken;
    if (window.location.hash.startsWith(HASH_PREFIX)) return window.location.hash.slice(HASH_PREFIX.length);
    return "";
  }

  async function encodePayload(payload) {
    const json = JSON.stringify(payload);
    const bytes = new TextEncoder().encode(json);
    if ("CompressionStream" in window) {
      const compressed = await streamBytes(bytes, new CompressionStream("gzip"));
      return "gz." + base64UrlEncode(compressed);
    }
    return "js." + base64UrlEncode(bytes);
  }

  async function decodePayload(token) {
    const [kind, data] = token.split(".", 2);
    if (!kind || !data) throw new Error("неверный формат ссылки");
    const bytes = base64UrlDecode(data);
    const decoded = kind === "gz"
      ? await streamBytes(bytes, new DecompressionStream("gzip"))
      : bytes;
    return JSON.parse(new TextDecoder().decode(decoded));
  }

  async function streamBytes(bytes, stream) {
    const response = new Response(new Blob([bytes]).stream().pipeThrough(stream));
    return new Uint8Array(await response.arrayBuffer());
  }

  function base64UrlEncode(bytes) {
    let binary = "";
    for (let index = 0; index < bytes.length; index += 1) {
      binary += String.fromCharCode(bytes[index]);
    }
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  }

  function base64UrlDecode(value) {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  }

  async function writeClipboard(text) {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return;
    }
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.left = "-9999px";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    if (!ok) throw new Error("браузер запретил доступ к буферу");
  }

  function activeMode() {
    return document.querySelector(".mode.active")?.dataset.mode || "all";
  }

  function applyMode(mode) {
    if (!mode) return;
    const button = document.querySelector(`.mode[data-mode="${cssEscape(mode)}"]`);
    if (button && !button.classList.contains("active")) button.click();
  }

  function activateSchemaTab() {
    const tab = document.querySelector('.tab[data-tab="schema"]');
    if (tab && !tab.classList.contains("active")) tab.click();
  }

  function checked(id) {
    const item = document.getElementById(id);
    return item ? Boolean(item.checked) : undefined;
  }

  function setChecked(id, value) {
    const item = document.getElementById(id);
    if (item && typeof value === "boolean") item.checked = value;
  }

  function valueOf(id) {
    const item = document.getElementById(id);
    return item ? item.value : undefined;
  }

  function setValue(id, value) {
    const item = document.getElementById(id);
    if (item && value !== undefined && value !== null) {
      item.value = value;
      item.dispatchEvent(new Event("input", { bubbles: true }));
      item.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }

  function cssEscape(value) {
    if (window.CSS && typeof CSS.escape === "function") return CSS.escape(String(value));
    return String(value).replace(/["\\]/g, "\\$&");
  }

  let toastTimer = 0;
  function showToast(message) {
    let toast = document.getElementById("shareLinkToast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "shareLinkToast";
      toast.className = "share-toast";
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 3200);
  }
})();
