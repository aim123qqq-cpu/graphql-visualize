(function () {
  "use strict";

  const key = "graphqlVisualizerHistory";
  const limit = 12;

  function init() {
    if (window.__graphqlHistoryPatchReady) return;
    window.__graphqlHistoryPatchReady = true;
    injectStyles();
    setupHistoryPanel();
    bindSaves();
    renderHistory();
  }

  function injectStyles() {
    if (document.getElementById("historyPatchStyles")) return;
    const style = document.createElement("style");
    style.id = "historyPatchStyles";
    style.textContent = `
      .canvas-wrap::before,
      .canvas-wrap::after {
        content: "";
        position: absolute;
        top: 0;
        bottom: 0;
        z-index: 18;
        display: none;
        width: 72px;
        pointer-events: none;
      }
      .canvas-wrap::before {
        left: 0;
        background: linear-gradient(90deg, var(--panel) 0%, color-mix(in srgb, var(--panel), transparent 18%) 48%, transparent 100%);
      }
      .canvas-wrap::after {
        right: 0;
        background: linear-gradient(270deg, var(--panel) 0%, color-mix(in srgb, var(--panel), transparent 18%) 48%, transparent 100%);
      }
      body.left-collapsed .canvas-wrap::before,
      body.right-collapsed .canvas-wrap::after {
        display: block;
      }
      .panel-toggle {
        z-index: 40;
        isolation: isolate;
      }
      .history-panel {
        display: grid;
        gap: 10px;
      }
      .history-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }
      .history-head h3 {
        margin: 0;
        font-size: 14px;
      }
      .history-head button {
        min-height: 30px;
        padding: 0 9px;
        font-size: 12px;
      }
      .history-list {
        display: grid;
        gap: 8px;
      }
      .history-item {
        display: grid;
        gap: 5px;
        width: 100%;
        padding: 9px 10px;
        border: 1px solid var(--line);
        border-radius: 8px;
        background: var(--field-bg);
        color: var(--ink);
        text-align: left;
      }
      .history-item:hover {
        border-color: var(--accent);
        background: var(--accent-soft);
      }
      .history-title,
      .history-preview {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .history-title {
        font-weight: 650;
      }
      .history-meta,
      .history-preview,
      .history-empty {
        color: var(--muted);
        font-size: 12px;
      }
      .history-empty {
        margin: 0;
        line-height: 1.4;
      }
    `;
    document.head.appendChild(style);
  }

  function setupHistoryPanel() {
    const tab = document.querySelector('.tab[data-tab="endpoint"]');
    const page = document.getElementById("endpointPage");
    if (tab) tab.textContent = "\u0418\u0441\u0442\u043e\u0440\u0438\u044f";
    if (!page || page.dataset.historyPatchReady) return;
    page.dataset.historyPatchReady = "true";
    page.innerHTML = [
      '<div class="history-panel">',
      '  <div class="history-head">',
      "    <h3>&#1048;&#1089;&#1090;&#1086;&#1088;&#1080;&#1103;</h3>",
      '    <button id="clearHistoryBtn" type="button">&#1054;&#1095;&#1080;&#1089;&#1090;&#1080;&#1090;&#1100;</button>',
      "  </div>",
      '  <div id="historyList" class="history-list"></div>',
      "</div>"
    ].join("");
    document.getElementById("clearHistoryBtn")?.addEventListener("click", () => {
      localStorage.removeItem(key);
      renderHistory();
    });
  }

  function bindSaves() {
    ["buildBtn", "sampleBtn", "optimizeBtn"].forEach((id) => {
      document.getElementById(id)?.addEventListener("click", () => {
        if (id === "buildBtn" || id === "sampleBtn") setTimeout(saveCurrent, 350);
      }, true);
    });
    document.getElementById("fileInput")?.addEventListener("change", () => setTimeout(saveCurrent, 700), true);
  }

  function saveCurrent() {
    const input = document.getElementById("schemaInput");
    const schema = (input?.value || "").trim();
    if (!schema) return;
    const graph = document.getElementById("graphSvg");
    const item = {
      id: String(Date.now()),
      title: titleOf(schema),
      schema,
      nodes: graph?.querySelectorAll("[data-node]").length || 0,
      edges: graph?.querySelectorAll("[data-edge]").length || 0,
      createdAt: new Date().toISOString()
    };
    const items = readHistory().filter((entry) => entry.schema !== schema);
    items.unshift(item);
    writeHistory(items.slice(0, limit));
    renderHistory();
  }

  function renderHistory() {
    const list = document.getElementById("historyList");
    if (!list) return;
    const items = readHistory();
    if (!items.length) {
      list.innerHTML = '<p class="history-empty">&#1048;&#1089;&#1090;&#1086;&#1088;&#1080;&#1103; &#1087;&#1086;&#1082;&#1072; &#1087;&#1091;&#1089;&#1090;&#1072;.</p>';
      return;
    }
    list.innerHTML = items.map((item) => [
      `<button class="history-item" type="button" data-history-id="${esc(item.id)}">`,
      `  <span class="history-title">${esc(item.title)}</span>`,
      `  <span class="history-meta">${formatDate(item.createdAt)} - ${num(item.nodes)} types - ${num(item.edges)} links</span>`,
      `  <span class="history-preview">${esc(firstLine(item.schema))}</span>`,
      "</button>"
    ].join("")).join("");
    list.querySelectorAll("[data-history-id]").forEach((button) => {
      button.addEventListener("click", () => restoreHistory(button.dataset.historyId || ""));
    });
  }

  function restoreHistory(id) {
    const item = readHistory().find((entry) => entry.id === id);
    const input = document.getElementById("schemaInput");
    if (!item || !input) return;
    input.value = item.schema;
    activateSchemaTab();
    setTimeout(() => document.getElementById("buildBtn")?.click(), 0);
  }

  function activateSchemaTab() {
    document.querySelectorAll(".tab").forEach((button) => {
      button.classList.toggle("active", button.dataset.tab === "schema");
    });
    document.querySelectorAll(".tab-page").forEach((page) => {
      page.classList.toggle("active", page.id === "schemaPage");
    });
  }

  function readHistory() {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "[]");
      return Array.isArray(value) ? value.filter((item) => item && item.schema) : [];
    } catch (error) {
      return [];
    }
  }

  function writeHistory(items) {
    localStorage.setItem(key, JSON.stringify(items));
  }

  function titleOf(schema) {
    const match = schema.match(/\b(?:schema|type|interface|input|enum|scalar|union)\s+([_A-Za-z][_0-9A-Za-z]*)?/);
    if (match?.[1]) return match[1];
    if (schema.trim().startsWith("{")) return "Introspection JSON";
    return "GraphQL SDL";
  }

  function firstLine(schema) {
    return schema.split(/\n/).map((line) => line.trim()).find(Boolean) || "";
  }

  function formatDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  }

  function num(value) {
    return Number(value || 0);
  }

  function esc(value) {
    return String(value || "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[char]));
  }

  window.addEventListener("load", () => setTimeout(init, 180));
})();