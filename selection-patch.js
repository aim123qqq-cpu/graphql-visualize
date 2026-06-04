(function () {
  "use strict";

  const view = {
    x: 0,
    y: 0,
    zoom: 1,
    ready: false,
    pan: null,
    node: null,
    resetNext: true,
    selectedId: ""
  };

  function init() {
    injectStyles();
    bindGraphButtons();
    bindViewport();
    ensureControls();
    observeGraph();
  }

  function injectStyles() {
    if (document.getElementById("selectionPatchStyles")) return;
    const style = document.createElement("style");
    style.id = "selectionPatchStyles";
    style.textContent = `
      :root {
        --edge-a: #e30611;
        --edge-b: #2563eb;
        --edge-c: #111111;
      }
      body.theme-dark {
        --edge-a: #ff3b45;
        --edge-b: #60a5fa;
        --edge-c: #f4f4f4;
      }
      .nav-controls {
        position: absolute;
        right: 14px;
        bottom: 14px;
        z-index: 25;
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 6px;
        border: 1px solid var(--line);
        border-radius: 8px;
        background: color-mix(in srgb, var(--panel), transparent 8%);
      }
      .nav-controls button {
        width: 34px;
        min-width: 34px;
        height: 32px;
        min-height: 32px;
        padding: 0;
        font-weight: 650;
      }
      .nav-controls #fitGraphBtn {
        width: auto;
        min-width: 42px;
        padding: 0 10px;
      }
      #graphSvg {
        touch-action: none;
      }
      .details-empty {
        margin: 0;
        color: var(--muted);
      }
      .type-card {
        display: grid;
        gap: 12px;
      }
      .type-card-head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 10px;
        padding-bottom: 10px;
        border-bottom: 1px solid var(--line);
      }
      .type-card-title {
        min-width: 0;
      }
      .type-card-title h3 {
        margin: 0 0 4px;
        overflow-wrap: anywhere;
        font-size: 17px;
        line-height: 1.25;
      }
      .type-card-title p {
        margin: 0;
        color: var(--muted);
        font-size: 12px;
      }
      .type-pill {
        flex: 0 0 auto;
        padding: 4px 9px;
        border: 1px solid var(--line);
        border-radius: 999px;
        color: var(--muted);
        font-size: 12px;
        font-weight: 700;
      }
      .type-fields {
        display: grid;
        gap: 6px;
        max-height: 280px;
        overflow: auto;
        padding-right: 2px;
      }
      .type-field-row {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 10px;
        align-items: center;
        padding: 8px 9px;
        border: 1px solid var(--line);
        border-radius: 8px;
        background: var(--field-bg);
      }
      .type-field-name {
        min-width: 0;
        overflow-wrap: anywhere;
        font-weight: 600;
      }
      .type-field-type {
        max-width: 132px;
        overflow: hidden;
        color: var(--accent);
        font-family: Consolas, "Courier New", monospace;
        font-size: 12px;
        font-weight: 700;
        text-align: right;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .type-form {
        display: grid;
        gap: 8px;
        padding-top: 10px;
        border-top: 1px solid var(--line);
      }
      .type-form-title {
        margin: 0;
        font-size: 13px;
        font-weight: 700;
      }
      .type-form-grid {
        display: grid;
        grid-template-columns: 1fr;
        gap: 8px;
      }
      .type-form input {
        height: 36px;
      }
      .type-form button {
        width: 100%;
      }
    `;
    document.head.appendChild(style);
  }

  function bindGraphButtons() {
    ["buildBtn", "sampleBtn", "optimizeBtn", "densityInput"].forEach((id) => {
      const item = document.getElementById(id);
      if (!item) return;
      item.addEventListener("click", () => {
        view.resetNext = true;
        view.selectedId = "";
      }, true);
      item.addEventListener("input", () => {
        view.resetNext = true;
      }, true);
    });
  }

  function bindViewport() {
    const svg = graphSvg();
    if (!svg || svg.dataset.selectionPatchBound) return;
    svg.dataset.selectionPatchBound = "true";

    svg.addEventListener("wheel", (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      syncView();
      const rect = svg.getBoundingClientRect();
      zoomAt(event.deltaY > 0 ? 0.9 : 1.1, event.clientX - rect.left, event.clientY - rect.top);
    }, { capture: true, passive: false });

    svg.addEventListener("mousedown", (event) => {
      const node = event.target.closest("[data-node]");
      syncView();
      if (node) {
        const point = svgPoint(event);
        view.node = {
          element: node,
          id: node.dataset.node || "",
          startClientX: event.clientX,
          startClientY: event.clientY,
          dx: point.x - number(node.dataset.x),
          dy: point.y - number(node.dataset.y),
          moved: false
        };
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      view.pan = {
        x: event.clientX,
        y: event.clientY,
        startX: view.x,
        startY: view.y
      };
      event.preventDefault();
      event.stopImmediatePropagation();
      svg.style.cursor = "grabbing";
    }, true);

    svg.addEventListener("click", (event) => {
      const node = event.target.closest("[data-node]");
      if (!node) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      selectNode(node);
    }, true);

    window.addEventListener("mousemove", (event) => {
      if (view.node) {
        moveNode(event);
        return;
      }
      if (!view.pan) return;
      view.x = view.pan.startX + event.clientX - view.pan.x;
      view.y = view.pan.startY + event.clientY - view.pan.y;
      applyView();
    }, true);

    window.addEventListener("mouseup", (event) => {
      if (view.node) {
        const node = view.node.element;
        const moved = view.node.moved;
        view.node = null;
        if (!moved) selectNode(node);
        event.stopImmediatePropagation();
      }
      view.pan = null;
      const currentSvg = graphSvg();
      if (currentSvg) currentSvg.style.cursor = "";
    }, true);
  }

  function ensureControls() {
    const wrap = document.getElementById("canvasWrap");
    if (!wrap || document.getElementById("navControls")) return;
    const controls = document.createElement("div");
    controls.id = "navControls";
    controls.className = "nav-controls";
    controls.innerHTML = '<button id="zoomOutBtn" type="button" title="Zoom out">-</button><button id="zoomInBtn" type="button" title="Zoom in">+</button><button id="fitGraphBtn" type="button" title="Fit graph">Fit</button>';
    wrap.appendChild(controls);
    document.getElementById("zoomOutBtn").onclick = () => zoomCenter(0.86);
    document.getElementById("zoomInBtn").onclick = () => zoomCenter(1.16);
    document.getElementById("fitGraphBtn").onclick = () => {
      view.resetNext = true;
      document.getElementById("optimizeBtn")?.click();
      setTimeout(syncView, 80);
    };
  }

  function observeGraph() {
    const svg = graphSvg();
    if (!svg || svg.dataset.selectionPatchObserved) return;
    svg.dataset.selectionPatchObserved = "true";
    const observer = new MutationObserver(() => {
      bindViewport();
      ensureControls();
      if (view.resetNext || !view.ready) {
        syncView();
        view.resetNext = false;
      } else {
        applyView();
      }
      if (view.selectedId) {
        const selected = nodeById(view.selectedId);
        if (selected) markSelected(selected);
      }
    });
    observer.observe(svg, { childList: true, subtree: true });
  }

  function moveNode(event) {
    const drag = view.node;
    const distance = Math.abs(event.clientX - drag.startClientX) + Math.abs(event.clientY - drag.startClientY);
    if (distance > 3) drag.moved = true;
    const point = svgPoint(event);
    const x = point.x - drag.dx;
    const y = point.y - drag.dy;
    drag.element.dataset.x = String(x);
    drag.element.dataset.y = String(y);
    drag.element.setAttribute("transform", `translate(${x}, ${y})`);
    redrawEdges();
  }

  function selectNode(node) {
    view.selectedId = node.dataset.node || "";
    markSelected(node);
    renderTypeDetails(node);
  }

  function markSelected(node) {
    graphSvg()?.querySelectorAll("[data-node]").forEach((item) => item.classList.toggle("selected", item === node));
  }

  function renderTypeDetails(node) {
    const box = document.getElementById("details");
    if (!box) return;
    const fields = readNodeFields(node);
    const kind = node.querySelector(".node-kind-text")?.textContent?.trim() || "type";
    const rows = fields.length
      ? fields.map((field) => `<div class="type-field-row"><span class="type-field-name">${esc(field.name)}</span><span class="type-field-type" title="${esc(field.type)}">${esc(field.type)}</span></div>`).join("")
      : '<p class="details-empty">&#1055;&#1086;&#1083;&#1103; &#1085;&#1077; &#1085;&#1072;&#1081;&#1076;&#1077;&#1085;&#1099;.</p>';
    box.innerHTML = `
      <div class="detail-card type-card">
        <div class="type-card-head">
          <div class="type-card-title">
            <h3>${esc(node.dataset.node || "")}</h3>
            <p>${fields.length} &#1087;&#1086;&#1083;&#1077;&#1081; &#1074; &#1073;&#1083;&#1086;&#1082;&#1077;</p>
          </div>
          <span class="type-pill">${esc(kind)}</span>
        </div>
        <div class="type-fields">${rows}</div>
        <form class="type-form" id="addFieldForm">
          <p class="type-form-title">&#1044;&#1086;&#1073;&#1072;&#1074;&#1080;&#1090;&#1100; &#1087;&#1086;&#1083;&#1077;</p>
          <div class="type-form-grid">
            <input id="newFieldName" type="text" placeholder="&#1053;&#1072;&#1079;&#1074;&#1072;&#1085;&#1080;&#1077; &#1087;&#1086;&#1083;&#1103;" autocomplete="off">
            <input id="newFieldType" type="text" placeholder="&#1058;&#1080;&#1087; &#1087;&#1086;&#1083;&#1103;, &#1085;&#1072;&#1087;&#1088;&#1080;&#1084;&#1077;&#1088; String! &#1080;&#1083;&#1080; User" autocomplete="off">
          </div>
          <button class="primary" type="submit">&#1044;&#1086;&#1073;&#1072;&#1074;&#1080;&#1090;&#1100; &#1074; &#1089;&#1093;&#1077;&#1084;&#1091;</button>
        </form>
      </div>`;
    document.getElementById("addFieldForm")?.addEventListener("submit", (event) => {
      event.preventDefault();
      addFieldToSchema(node.dataset.node || "", document.getElementById("newFieldName")?.value || "", document.getElementById("newFieldType")?.value || "");
    });
  }

  function addFieldToSchema(typeName, fieldName, fieldType) {
    const input = document.getElementById("schemaInput");
    const build = document.getElementById("buildBtn");
    const name = cleanName(fieldName);
    const type = String(fieldType || "").trim();
    if (!input || !typeName || !name || !type) return;
    const source = input.value || "";
    const block = new RegExp(`((?:type|interface|input)\\s+${escapeRegExp(typeName)}[^{}]*\\{)([\\s\\S]*?)(\\n\\})`, "m");
    if (block.test(source)) {
      input.value = source.replace(block, (all, start, body, end) => {
        if (new RegExp(`(^|\\n)\\s*${escapeRegExp(name)}\\s*:`, "m").test(body)) return all;
        return `${start}${body.replace(/\\s*$/, "")}\\n  ${name}: ${type}${end}`;
      });
    } else {
      input.value = `${source.replace(/\\s*$/, "")}\\n\\ntype ${typeName} {\\n  ${name}: ${type}\\n}`;
    }
    view.resetNext = true;
    setTimeout(() => build?.click(), 0);
  }

  function redrawEdges() {
    const paths = Array.from(graphSvg()?.querySelectorAll("[data-edge]") || []);
    const lanes = edgeLanes(paths.map((path) => edgeParts(path.dataset.edge || "")).filter(Boolean));
    paths.forEach((path) => {
      const edge = edgeParts(path.dataset.edge || "");
      if (!edge) return;
      const source = nodeById(edge.source);
      const target = nodeById(edge.target);
      if (!source || !target) return;
      path.setAttribute("d", edgePath(edge, source, target, lanes.get(edge.id) || 0));
    });
  }

  function edgePath(edge, sourceNode, targetNode, lane) {
    const source = nodeBox(sourceNode);
    const target = nodeBox(targetNode);
    const forward = source.x + source.width / 2 <= target.x + target.width / 2;
    const sx = forward ? source.x + source.width : source.x;
    const tx = forward ? target.x : target.x + target.width;
    const sy = source.y + sourceY(sourceNode, edge.label, source.height);
    const ty = target.y + targetY(targetNode, edge.source, target.height);
    const dir = forward ? 1 : -1;
    const lead = sx + dir * (70 + Math.abs(lane));
    const trail = tx - dir * (70 + Math.abs(lane));
    const midY = (sy + ty) / 2 + lane;
    return roundedPath([[sx, sy], [lead, sy], [lead, midY], [trail, midY], [trail, ty], [tx, ty]], 14);
  }

  function edgeLanes(edges) {
    const groups = new Map();
    edges.forEach((edge) => {
      const key = edge.source < edge.target ? `${edge.source}|${edge.target}` : `${edge.target}|${edge.source}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(edge);
    });
    const lanes = new Map();
    groups.forEach((items) => {
      items.forEach((edge, index) => lanes.set(edge.id, (index - (items.length - 1) / 2) * 24));
    });
    return lanes;
  }

  function zoomCenter(factor) {
    const svg = graphSvg();
    if (!svg) return;
    syncView();
    const rect = svg.getBoundingClientRect();
    zoomAt(factor, rect.width / 2, rect.height / 2);
  }

  function zoomAt(factor, cx, cy) {
    const oldZoom = view.zoom || 1;
    view.zoom = Math.min(3.6, Math.max(0.12, oldZoom * factor));
    view.x = cx - ((cx - view.x) / oldZoom) * view.zoom;
    view.y = cy - ((cy - view.y) / oldZoom) * view.zoom;
    view.ready = true;
    applyView();
  }

  function syncView() {
    const viewport = graphViewport();
    if (!viewport) return;
    const transform = viewport.getAttribute("transform") || "";
    const match = transform.match(/translate\(([-0-9.]+),\s*([-0-9.]+)\)\s*scale\(([-0-9.]+)\)/);
    if (match) {
      view.x = Number(match[1]);
      view.y = Number(match[2]);
      view.zoom = Number(match[3]);
      view.ready = true;
    }
  }

  function applyView() {
    const viewport = graphViewport();
    if (viewport) viewport.setAttribute("transform", `translate(${view.x}, ${view.y}) scale(${view.zoom})`);
  }

  function readNodeFields(node) {
    return Array.from(node.querySelectorAll(".field-row")).map((row) => ({
      name: row.dataset.field || row.querySelector(".field-name")?.textContent?.trim() || "",
      type: row.querySelector(".field-type")?.textContent?.trim() || ""
    })).filter((field) => field.name);
  }

  function nodeBox(node) {
    const rect = node.querySelector("rect");
    return {
      x: number(node.dataset.x),
      y: number(node.dataset.y),
      width: number(rect?.getAttribute("width")),
      height: number(rect?.getAttribute("height"))
    };
  }

  function sourceY(node, field, height) {
    const row = Array.from(node.querySelectorAll(".field-row")).find((item) => item.dataset.field === field);
    return row ? number(row.querySelector(".field-name")?.getAttribute("y")) - 3 : height / 2;
  }

  function targetY(node, source, height) {
    const row = Array.from(node.querySelectorAll(".field-row")).find((item) => unwrap(item.querySelector(".field-type")?.textContent || "") === source);
    return row ? number(row.querySelector(".field-name")?.getAttribute("y")) - 3 : Math.min(height - 18, 30);
  }

  function svgPoint(event) {
    const svg = graphSvg();
    const rect = svg.getBoundingClientRect();
    return { x: (event.clientX - rect.left - view.x) / view.zoom, y: (event.clientY - rect.top - view.y) / view.zoom };
  }

  function roundedPath(points, radius) {
    let d = `M ${points[0][0]} ${points[0][1]}`;
    for (let index = 1; index < points.length - 1; index += 1) {
      const prev = points[index - 1];
      const curr = points[index];
      const next = points[index + 1];
      const before = trimPoint(curr, prev, radius);
      const after = trimPoint(curr, next, radius);
      d += ` L ${before[0]} ${before[1]} Q ${curr[0]} ${curr[1]} ${after[0]} ${after[1]}`;
    }
    const last = points[points.length - 1];
    return `${d} L ${last[0]} ${last[1]}`;
  }

  function trimPoint(from, to, radius) {
    const dx = to[0] - from[0];
    const dy = to[1] - from[1];
    const length = Math.max(1, Math.abs(dx) + Math.abs(dy));
    const distance = Math.min(radius, length / 2);
    return [from[0] + Math.sign(dx) * distance, from[1] + Math.sign(dy) * distance];
  }

  function edgeParts(id) {
    const match = String(id).match(/^(.+?)->(.+?):(.+)$/);
    return match ? { id, source: match[1], target: match[2], label: match[3] } : null;
  }

  function nodeById(id) {
    return graphSvg()?.querySelector(`[data-node="${cssEscape(id)}"]`);
  }

  function graphSvg() {
    return document.getElementById("graphSvg");
  }

  function graphViewport() {
    const svg = graphSvg();
    return svg?.querySelector(".graph-viewport") || svg?.querySelector("g[transform]");
  }

  function cleanName(value) {
    return String(value || "").trim().replace(/[^_0-9A-Za-z]/g, "");
  }

  function unwrap(type) {
    return String(type || "").replace(/[![\]\s]/g, "");
  }

  function cssEscape(value) {
    if (window.CSS?.escape) return CSS.escape(value);
    return String(value || "").replace(/["\\]/g, "\\$&");
  }

  function escapeRegExp(value) {
    return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function number(value) {
    return Number(value || 0);
  }

  function esc(value) {
    return String(value || "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
  }

  window.addEventListener("load", () => setTimeout(init, 120));
})();
