(function () {
  "use strict";

  if (window.__graphqlModeBehaviorPatchReady) return;
  window.__graphqlModeBehaviorPatchReady = true;

  const HELP = {
    types: "Типы: карта блоков. Поля приглушены, повторные связи объединены.",
    fields: "Поля: акцент на полях-ссылках. Остальные поля приглушены.",
    all: "Все: полная таблица полей и все найденные связи."
  };

  injectStyles();
  ensureHelp();
  bindModeEvents();
  observeGraph();
  requestAnimationFrame(applyMode);

  function injectStyles() {
    if (document.getElementById("modeBehaviorStyles")) return;
    const style = document.createElement("style");
    style.id = "modeBehaviorStyles";
    style.textContent = `
      .mode-help {
        color: var(--muted);
        font-size: 12px;
        line-height: 1.2;
        min-width: 220px;
        max-width: 360px;
      }

      #graphSvg.mode-types .node .field-row {
        opacity: 0.34;
      }

      #graphSvg.mode-types .node .field-port {
        opacity: 0.45;
      }

      #graphSvg.mode-fields .field-row.is-scalar-field {
        opacity: 0.28;
      }

      #graphSvg.mode-fields .field-row.is-ref-field {
        opacity: 1;
      }
    `;
    document.head.appendChild(style);
  }

  function ensureHelp() {
    const segmented = document.querySelector(".segmented");
    if (!segmented || document.getElementById("modeHelp")) return;
    const help = document.createElement("span");
    help.id = "modeHelp";
    help.className = "mode-help";
    segmented.insertAdjacentElement("afterend", help);
    updateHelp();
  }

  function bindModeEvents() {
    document.addEventListener("click", (event) => {
      if (!event.target.closest?.(".mode")) return;
      requestAnimationFrame(() => requestAnimationFrame(applyMode));
    }, true);
  }

  function observeGraph() {
    const svg = document.getElementById("graphSvg");
    if (!svg) {
      setTimeout(observeGraph, 100);
      return;
    }
    const observer = new MutationObserver(() => requestAnimationFrame(applyMode));
    observer.observe(svg, { childList: true, subtree: true });
  }

  function applyMode() {
    ensureHelp();
    updateHelp();

    const svg = document.getElementById("graphSvg");
    if (!svg) return;
    const mode = activeMode();
    svg.classList.toggle("mode-types", mode === "types");
    svg.classList.toggle("mode-fields", mode === "fields");
    svg.classList.toggle("mode-all", mode === "all");

    annotateRows(svg);
    if (mode === "types") rerouteTypeEdges(svg);
  }

  function updateHelp() {
    const help = document.getElementById("modeHelp");
    if (help) help.textContent = HELP[activeMode()] || HELP.types;
  }

  function activeMode() {
    return document.querySelector(".mode.active")?.dataset.mode || "types";
  }

  function annotateRows(svg) {
    svg.querySelectorAll(".field-row").forEach((row) => {
      const isRef = Boolean(row.querySelector(".field-port"));
      row.classList.toggle("is-ref-field", isRef);
      row.classList.toggle("is-scalar-field", !isRef);
    });
  }

  function rerouteTypeEdges(svg) {
    const nodes = new Map();
    svg.querySelectorAll("[data-node]").forEach((node) => {
      const box = readNodeBox(node);
      if (box) nodes.set(node.dataset.node, box);
    });

    svg.querySelectorAll("[data-edge]").forEach((path) => {
      const edge = parseEdge(path.dataset.edge || "");
      const source = nodes.get(edge.source);
      const target = nodes.get(edge.target);
      if (!source || !target) return;

      const forward = source.x + source.width / 2 <= target.x + target.width / 2;
      const sx = forward ? source.x + source.width : source.x;
      const tx = forward ? target.x : target.x + target.width;
      const sy = source.y + 26;
      const ty = target.y + 26;
      const dir = forward ? 1 : -1;
      const lead = sx + dir * 72;
      const trail = tx - dir * 72;
      const midY = (sy + ty) / 2;
      path.setAttribute("d", roundedPath([[sx, sy], [lead, sy], [lead, midY], [trail, midY], [trail, ty], [tx, ty]], 14));
    });
  }

  function parseEdge(id) {
    const match = id.match(/^(.+?)->(.+?):(.*)$/);
    return match ? { source: match[1], target: match[2], label: match[3] } : { source: "", target: "", label: "" };
  }

  function readNodeBox(node) {
    const transform = node.getAttribute("transform") || "";
    const match = transform.match(/translate\(([-0-9.]+),\s*([-0-9.]+)\)/);
    const rect = node.querySelector("rect");
    if (!match || !rect) return null;
    return {
      x: Number(match[1]),
      y: Number(match[2]),
      width: Number(rect.getAttribute("width") || 260),
      height: Number(rect.getAttribute("height") || 52)
    };
  }

  function roundedPath(points, radius) {
    if (points.length < 2) return "";
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
})();
