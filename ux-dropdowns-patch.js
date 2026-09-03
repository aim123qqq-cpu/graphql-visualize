(function () {
  "use strict";

  if (window.__graphqlUxDropdownsPatchReady) return;
  window.__graphqlUxDropdownsPatchReady = true;

  const BUILTIN = new Set(["String", "Int", "Float", "Boolean", "ID"]);
  const PANEL_ID = "statsDropdownPanel";
  let activeKind = "";

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
    enhanceStats();
    bindStats();
    observeStats();
  }

  function injectStyles() {
    if (document.getElementById("uxDropdownsPatchStyles")) return;
    const style = document.createElement("style");
    style.id = "uxDropdownsPatchStyles";
    style.textContent = `
      .nav-controls .ui-tooltip::after,
      .nav-controls .ui-tooltip:hover::after,
      .nav-controls .ui-tooltip:focus-visible::after {
        left: 50%;
        right: auto;
        top: auto;
        bottom: calc(100% + 9px);
        transform: translate(-50%, 3px);
      }

      .nav-controls .ui-tooltip:hover::after,
      .nav-controls .ui-tooltip:focus-visible::after {
        transform: translate(-50%, 0);
      }

      .nav-controls button,
      .nav-controls button:hover,
      .nav-controls button:focus-visible {
        text-decoration: none !important;
        border-bottom-color: var(--line) !important;
        color: var(--ink);
      }

      .nav-controls button:hover {
        background: var(--accent-soft);
      }

      .stats {
        position: relative;
      }

      .stats div {
        cursor: pointer;
        transition: background 120ms ease, color 120ms ease;
      }

      .stats div:hover,
      .stats div.is-open {
        background: var(--accent-soft);
      }

      .stats div:focus-visible {
        outline: 2px solid color-mix(in srgb, var(--accent), transparent 35%);
        outline-offset: -2px;
      }

      .stats-dropdown-panel {
        border-bottom: 1px solid var(--line);
        background: color-mix(in srgb, var(--panel), var(--bg) 18%);
        padding: 10px;
      }

      .stats-dropdown-card {
        max-height: 260px;
        overflow: auto;
        border: 1px solid var(--line);
        border-radius: 8px;
        background: var(--panel);
      }

      .stats-dropdown-head {
        position: sticky;
        top: 0;
        z-index: 1;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        padding: 9px 11px;
        border-bottom: 1px solid var(--line);
        background: var(--panel);
      }

      .stats-dropdown-head strong {
        font-size: 13px;
      }

      .stats-dropdown-head span {
        color: var(--muted);
        font-size: 12px;
      }

      .stats-dropdown-list {
        display: grid;
        gap: 0;
      }

      .stats-dropdown-row {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 12px;
        align-items: center;
        padding: 8px 11px;
        border-bottom: 1px solid var(--line);
        color: var(--ink);
      }

      .stats-dropdown-row:last-child {
        border-bottom: 0;
      }

      .stats-dropdown-name {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-weight: 600;
      }

      .stats-dropdown-meta,
      .stats-dropdown-type {
        max-width: 220px;
        overflow: hidden;
        text-align: right;
        text-overflow: ellipsis;
        white-space: nowrap;
        color: var(--muted);
        font-family: Consolas, "Courier New", monospace;
        font-size: 12px;
      }

      .stats-dropdown-type {
        padding: 2px 7px;
        border: 1px solid color-mix(in srgb, currentColor, transparent 70%);
        border-radius: 999px;
        color: #2563eb;
        background: color-mix(in srgb, currentColor, transparent 91%);
      }

      .stats-dropdown-type.scalar {
        color: #e30611;
      }

      .stats-dropdown-type.enum {
        color: #7c3aed;
      }

      .stats-dropdown-empty {
        margin: 0;
        padding: 12px;
        color: var(--muted);
      }

      body.theme-dark .stats-dropdown-type {
        color: #60a5fa;
      }

      body.theme-dark .stats-dropdown-type.scalar {
        color: #ff5a64;
      }

      body.theme-dark .stats-dropdown-type.enum {
        color: #c084fc;
      }
    `;
    document.head.appendChild(style);
  }

  function bindStats() {
    const stats = document.getElementById("stats");
    if (!stats || stats.dataset.uxDropdownsBound) return;
    stats.dataset.uxDropdownsBound = "true";
    stats.addEventListener("click", (event) => {
      const item = event.target.closest("[data-stats-kind]");
      if (!item) return;
      event.preventDefault();
      togglePanel(item.dataset.statsKind || "");
    });
    stats.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      const item = event.target.closest("[data-stats-kind]");
      if (!item) return;
      event.preventDefault();
      togglePanel(item.dataset.statsKind || "");
    });
  }

  function observeStats() {
    const stats = document.getElementById("stats");
    if (!stats || stats.dataset.uxDropdownsObserved) return;
    stats.dataset.uxDropdownsObserved = "true";
    const observer = new MutationObserver(() => {
      enhanceStats();
      if (activeKind) renderPanel(activeKind);
    });
    observer.observe(stats, { childList: true, subtree: true });
  }

  function enhanceStats() {
    const stats = document.getElementById("stats");
    if (!stats) return;
    const kinds = ["types", "relations", "fields"];
    Array.from(stats.children).forEach((item, index) => {
      if (!(item instanceof HTMLElement)) return;
      const kind = kinds[index];
      if (!kind) return;
      item.dataset.statsKind = kind;
      item.tabIndex = 0;
      item.setAttribute("role", "button");
      item.setAttribute("aria-expanded", activeKind === kind ? "true" : "false");
      item.setAttribute("title", titleFor(kind));
      item.classList.toggle("is-open", activeKind === kind);
    });
  }

  function togglePanel(kind) {
    if (!kind) return;
    activeKind = activeKind === kind ? "" : kind;
    enhanceStats();
    if (!activeKind) {
      document.getElementById(PANEL_ID)?.remove();
      return;
    }
    renderPanel(activeKind);
  }

  function renderPanel(kind) {
    const stats = document.getElementById("stats");
    if (!stats) return;
    const data = schemaSnapshot();
    const items = itemsFor(kind, data);
    let panel = document.getElementById(PANEL_ID);
    if (!panel) {
      panel = document.createElement("div");
      panel.id = PANEL_ID;
      panel.className = "stats-dropdown-panel";
      stats.insertAdjacentElement("afterend", panel);
    }
    panel.innerHTML = `
      <div class="stats-dropdown-card">
        <div class="stats-dropdown-head">
          <strong>${escapeHtml(titleFor(kind))}</strong>
          <span>${items.length} ${suffixFor(kind)}</span>
        </div>
        <div class="stats-dropdown-list">
          ${items.length ? items.map((item) => rowFor(kind, item)).join("") : '<p class="stats-dropdown-empty">Пока нечего показать.</p>'}
        </div>
      </div>
    `;
  }

  function schemaSnapshot() {
    const graph = document.getElementById("graphSvg");
    const nodes = Array.from(graph?.querySelectorAll("[data-node]") || []).map((node) => {
      const name = node.dataset.node || "";
      const kind = node.querySelector(".node-kind-text")?.textContent?.trim() || "";
      const fields = Array.from(node.querySelectorAll(".field-row")).map((row) => ({
        owner: name,
        name: row.dataset.field || row.querySelector(".field-name")?.textContent?.trim() || "",
        type: row.querySelector(".field-type")?.textContent?.trim() || ""
      })).filter((field) => field.name);
      return { name, kind, fields };
    }).filter((node) => node.name);
    const nodeNames = new Set(nodes.map((node) => node.name));
    const edges = Array.from(graph?.querySelectorAll("[data-edge]") || []).map((edge) => edgeParts(edge.dataset.edge || "")).filter(Boolean);
    return { nodes, nodeNames, edges };
  }

  function itemsFor(kind, data) {
    if (kind === "types") {
      return data.nodes.slice().sort((a, b) => a.name.localeCompare(b.name, "ru"));
    }
    if (kind === "relations") {
      return data.edges.slice().sort((a, b) => (a.source + a.label + a.target).localeCompare(b.source + b.label + b.target, "ru"));
    }
    return data.nodes
      .flatMap((node) => node.fields.map((field) => ({ ...field, typeKind: fieldKind(field.type, data.nodeNames) })))
      .sort((a, b) => (a.owner + a.name).localeCompare(b.owner + b.name, "ru"));
  }

  function rowFor(kind, item) {
    if (kind === "types") {
      return `<div class="stats-dropdown-row"><span class="stats-dropdown-name">${escapeHtml(item.name)}</span><span class="stats-dropdown-meta">${escapeHtml(item.kind || "type")}</span></div>`;
    }
    if (kind === "relations") {
      return `<div class="stats-dropdown-row"><span class="stats-dropdown-name">${escapeHtml(item.source)}.${escapeHtml(item.label)}</span><span class="stats-dropdown-meta">→ ${escapeHtml(item.target)}</span></div>`;
    }
    return `<div class="stats-dropdown-row"><span class="stats-dropdown-name">${escapeHtml(item.owner)}.${escapeHtml(item.name)}</span><span class="stats-dropdown-type ${item.typeKind}">${escapeHtml(item.type)}</span></div>`;
  }

  function edgeParts(id) {
    const match = String(id).match(/^(.+?)->(.+?):(.*)$/);
    if (!match) return null;
    return { id, source: match[1], target: match[2], label: match[3] || "field" };
  }

  function fieldKind(type, nodeNames) {
    const name = namedType(type);
    if (BUILTIN.has(name)) return "scalar";
    if (/enum value/i.test(type)) return "enum";
    return nodeNames.has(name) ? "object" : "";
  }

  function namedType(type) {
    return String(type || "").replace(/[![\]\s]/g, "");
  }

  function titleFor(kind) {
    if (kind === "types") return "Типы";
    if (kind === "relations") return "Связи";
    return "Поля";
  }

  function suffixFor(kind) {
    if (kind === "types") return "типов";
    if (kind === "relations") return "связей";
    return "полей";
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
})();
