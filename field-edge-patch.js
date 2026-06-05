(function () {
  "use strict";

  const FIELD_PATCH_FLAG = "fieldEdgePatchReady";

  if (window[FIELD_PATCH_FLAG]) return;
  window[FIELD_PATCH_FLAG] = true;

  injectStyles();
  bindAddFieldSubmit();
  observeEdges();
  observeNodePositions();

  function injectStyles() {
    if (document.getElementById("fieldEdgePatchStyles")) return;
    const style = document.createElement("style");
    style.id = "fieldEdgePatchStyles";
    style.textContent = `
      .edge {
        transition: stroke 140ms ease, stroke-width 140ms ease, opacity 140ms ease, filter 140ms ease;
      }

      .edge.selected,
      .edge.edge-selected {
        stroke: var(--accent) !important;
        stroke-width: 4.8 !important;
        opacity: 1 !important;
        filter: drop-shadow(0 0 6px rgba(227, 6, 17, 0.45));
        marker-end: url(#arrow-selected) !important;
      }

      body.theme-dark .edge.selected,
      body.theme-dark .edge.edge-selected {
        filter: drop-shadow(0 0 7px rgba(255, 91, 99, 0.55));
      }

      svg:has(.edge.selected) .edge:not(.selected):not(.edge-selected),
      svg:has(.edge.edge-selected) .edge:not(.selected):not(.edge-selected) {
        opacity: 0.46;
      }
    `;
    document.head.appendChild(style);
  }

  function bindAddFieldSubmit() {
    document.addEventListener("submit", (event) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement) || form.id !== "addFieldForm") return;

      const typeName = currentSelectedType();
      const fieldName = cleanName(document.getElementById("newFieldName")?.value || "");
      const fieldType = String(document.getElementById("newFieldType")?.value || "").trim();
      const input = document.getElementById("schemaInput");

      if (!typeName || !fieldName || !fieldType || !input) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      input.value = insertField(input.value || "", typeName, fieldName, fieldType);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));

      setTimeout(() => {
        document.getElementById("buildBtn")?.click();
        setTimeout(() => document.getElementById("optimizeBtn")?.click(), 80);
      }, 0);
    }, true);
  }

  function currentSelectedType() {
    const selected = document.querySelector("#graphSvg [data-node].selected");
    if (selected?.dataset?.node) return selected.dataset.node;
    const title = document.querySelector("#details .type-card h3, #details .detail-card h3");
    return title?.textContent?.trim() || "";
  }

  function insertField(source, typeName, name, type) {
    const declaration = new RegExp("((?:type|interface|input)\\s+" + escapeRegExp(typeName) + "\\b[^{}]*\\{)", "m");
    const match = declaration.exec(source);
    if (!match) {
      const next = source.replace(/\s*$/, "");
      return `${next}\n\ntype ${typeName} {\n  ${name}: ${type}\n}`;
    }

    const open = match.index + match[0].length - 1;
    const close = findCloseBrace(source, open);
    if (close < 0) return source;

    const body = source.slice(open + 1, close);
    const duplicate = new RegExp("(^|\\n)\\s*" + escapeRegExp(name) + "\\s*:", "m");
    if (duplicate.test(body)) return source;

    const indentation = inferIndent(body);
    const before = source.slice(0, close).replace(/[ \t\r\n]*$/, "");
    const after = source.slice(close);
    return `${before}\n${indentation}${name}: ${type}\n${after}`;
  }

  function findCloseBrace(text, open) {
    let depth = 0;
    for (let index = open; index < text.length; index += 1) {
      if (text[index] === "{") depth += 1;
      if (text[index] === "}") {
        depth -= 1;
        if (depth === 0) return index;
      }
    }
    return -1;
  }

  function inferIndent(body) {
    const line = body.split(/\r?\n/).find((item) => /^\s+\S/.test(item));
    return line ? line.match(/^\s*/)[0] : "  ";
  }

  function observeEdges() {
    const svg = document.getElementById("graphSvg");
    if (!svg) {
      setTimeout(observeEdges, 120);
      return;
    }

    ensureSelectedMarker(svg);
    bindEdgeClicks(svg);

    const observer = new MutationObserver(() => {
      ensureSelectedMarker(svg);
      restoreSelectedEdge(svg);
    });
    observer.observe(svg, { childList: true, subtree: true });
  }

  function observeNodePositions() {
    const svg = document.getElementById("graphSvg");
    if (!svg) {
      setTimeout(observeNodePositions, 120);
      return;
    }
    if (svg.dataset.nodePositionPatchReady) return;
    svg.dataset.nodePositionPatchReady = "true";

    const positions = window.__graphqlVisualizerNodePositions || new Map();
    window.__graphqlVisualizerNodePositions = positions;

    const observer = new MutationObserver((records) => {
      let shouldRestore = false;

      records.forEach((record) => {
        if (record.type === "attributes") {
          const node = record.target.closest?.("[data-node]");
          if (node && record.attributeName === "transform") rememberNodePosition(node);
          return;
        }
        if (record.type === "childList") shouldRestore = true;
      });

      if (shouldRestore) requestAnimationFrame(() => restoreNodePositions(svg));
    });

    observer.observe(svg, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["transform"]
    });

    requestAnimationFrame(() => restoreNodePositions(svg));
  }

  function rememberNodePosition(node) {
    if (!node?.dataset?.node) return;
    const transform = node.getAttribute("transform") || "";
    const match = transform.match(/translate\(([-0-9.]+),\s*([-0-9.]+)\)/);
    if (!match) return;

    const x = Number(match[1]);
    const y = Number(match[2]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;

    window.__graphqlVisualizerNodePositions.set(node.dataset.node, { x, y });
  }

  function restoreNodePositions(svg) {
    const positions = window.__graphqlVisualizerNodePositions;
    if (!positions?.size) return;

    let changed = false;
    svg.querySelectorAll("[data-node]").forEach((node) => {
      const saved = positions.get(node.dataset.node || "");
      if (!saved) return;
      node.dataset.x = String(saved.x);
      node.dataset.y = String(saved.y);
      node.setAttribute("transform", `translate(${saved.x}, ${saved.y})`);
      changed = true;
    });

    if (changed) redrawVisibleEdges(svg);
  }

  function bindEdgeClicks(svg) {
    svg.addEventListener("click", (event) => {
      const edge = event.target.closest?.("[data-edge]");
      if (!edge) return;
      window.__graphqlVisualizerSelectedEdge = edge.dataset.edge || "";
      setTimeout(() => restoreSelectedEdge(svg), 0);
    }, true);

    svg.addEventListener("click", (event) => {
      if (event.target.closest?.("[data-edge]")) return;
      if (event.target.closest?.("[data-node]")) {
        window.__graphqlVisualizerSelectedEdge = "";
        return;
      }
      const nearEdge = nearestEdge(svg, event, 18);
      if (nearEdge) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        window.__graphqlVisualizerSelectedEdge = nearEdge.dataset.edge || "";
        restoreSelectedEdge(svg);
        return;
      }
      window.__graphqlVisualizerSelectedEdge = "";
      setTimeout(() => restoreSelectedEdge(svg), 0);
    });
  }

  function nearestEdge(svg, event, radius) {
    const edges = Array.from(svg.querySelectorAll("[data-edge]"));
    let best = null;
    let bestDistance = radius;

    edges.forEach((edge) => {
      const distance = distanceToPath(edge, event.clientX, event.clientY);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = edge;
      }
    });

    return best;
  }

  function distanceToPath(path, clientX, clientY) {
    if (typeof path.getTotalLength !== "function" || typeof path.getPointAtLength !== "function") return Infinity;

    const matrix = path.getScreenCTM();
    if (!matrix) return Infinity;

    const length = path.getTotalLength();
    const steps = Math.max(10, Math.min(80, Math.ceil(length / 28)));
    let best = Infinity;

    for (let index = 0; index <= steps; index += 1) {
      const point = path.getPointAtLength((length * index) / steps);
      const screen = point.matrixTransform(matrix);
      const dx = screen.x - clientX;
      const dy = screen.y - clientY;
      best = Math.min(best, Math.sqrt(dx * dx + dy * dy));
    }

    return best;
  }

  function restoreSelectedEdge(svg) {
    const selectedId = window.__graphqlVisualizerSelectedEdge || "";
    svg.querySelectorAll("[data-edge]").forEach((edge) => {
      const selected = selectedId && edge.dataset.edge === selectedId;
      edge.classList.toggle("edge-selected", Boolean(selected));
    });
  }

  function redrawVisibleEdges(svg) {
    const paths = Array.from(svg.querySelectorAll("[data-edge]"));
    const edges = paths.map((path) => edgeParts(path.dataset.edge || "")).filter(Boolean);
    const lanes = edgeLanes(edges);

    paths.forEach((path) => {
      const edge = edgeParts(path.dataset.edge || "");
      if (!edge) return;
      const source = nodeById(svg, edge.source);
      const target = nodeById(svg, edge.target);
      if (!source || !target) return;
      path.setAttribute("d", edgePath(edge, source, target, lanes.get(edge.id) || 0));
    });
  }

  function edgeParts(id) {
    const match = String(id).match(/^(.+)->(.+):(.+)$/);
    if (!match) return null;
    return { id, source: match[1], target: match[2], label: match[3] };
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

  function nodeById(svg, id) {
    return Array.from(svg.querySelectorAll("[data-node]")).find((node) => node.dataset.node === id);
  }

  function nodeBox(node) {
    const rect = node.querySelector("rect");
    return {
      x: Number(node.dataset.x) || 0,
      y: Number(node.dataset.y) || 0,
      width: Number(rect?.getAttribute("width")) || 0,
      height: Number(rect?.getAttribute("height")) || 0
    };
  }

  function sourceY(node, field, height) {
    const row = Array.from(node.querySelectorAll(".field-row")).find((item) => item.dataset.field === field);
    return row ? Number(row.querySelector(".field-name")?.getAttribute("y")) - 3 : height / 2;
  }

  function targetY(node, source, height) {
    const row = Array.from(node.querySelectorAll(".field-row")).find((item) => unwrapType(item.querySelector(".field-type")?.textContent || "") === source);
    return row ? Number(row.querySelector(".field-name")?.getAttribute("y")) - 3 : Math.min(height - 18, 30);
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

  function unwrapType(type) {
    return String(type || "").replace(/[![\]\\s]/g, "");
  }

  function ensureSelectedMarker(svg) {
    let defs = svg.querySelector("defs");
    if (!defs) {
      defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
      svg.insertBefore(defs, svg.firstChild);
    }
    if (defs.querySelector("#arrow-selected")) return;

    const marker = document.createElementNS("http://www.w3.org/2000/svg", "marker");
    marker.setAttribute("id", "arrow-selected");
    marker.setAttribute("viewBox", "0 0 10 10");
    marker.setAttribute("refX", "9");
    marker.setAttribute("refY", "5");
    marker.setAttribute("markerWidth", "7");
    marker.setAttribute("markerHeight", "7");
    marker.setAttribute("orient", "auto");

    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", "M 0 0 L 10 5 L 0 10 z");
    path.setAttribute("fill", "var(--accent)");
    marker.appendChild(path);
    defs.appendChild(marker);
  }

  function cleanName(value) {
    return String(value || "")
      .trim()
      .replace(/[^_0-9A-Za-z]/g, "")
      .replace(/^([0-9])/, "_$1");
  }

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
})();
