(function () {
  "use strict";

  const FIELD_PATCH_FLAG = "fieldEdgePatchReady";

  if (window[FIELD_PATCH_FLAG]) return;
  window[FIELD_PATCH_FLAG] = true;

  injectStyles();
  bindAddFieldSubmit();
  observeEdges();

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
      window.__graphqlVisualizerSelectedEdge = "";
      setTimeout(() => restoreSelectedEdge(svg), 0);
    });
  }

  function restoreSelectedEdge(svg) {
    const selectedId = window.__graphqlVisualizerSelectedEdge || "";
    svg.querySelectorAll("[data-edge]").forEach((edge) => {
      const selected = selectedId && edge.dataset.edge === selectedId;
      edge.classList.toggle("edge-selected", Boolean(selected));
    });
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
