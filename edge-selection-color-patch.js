(function () {
  "use strict";

  if (window.__graphqlEdgeSelectionColorPatchReady) return;
  window.__graphqlEdgeSelectionColorPatchReady = true;

  injectStyles();
  observeSvg();

  function injectStyles() {
    if (document.getElementById("edgeSelectionColorStyles")) return;
    const style = document.createElement("style");
    style.id = "edgeSelectionColorStyles";
    style.textContent = `
      .edge.color-a.selected,
      .edge.color-a.edge-selected {
        stroke: var(--edge-a) !important;
        marker-end: url(#arrow-selected-a) !important;
        filter: drop-shadow(0 0 7px color-mix(in srgb, var(--edge-a), transparent 45%)) !important;
      }

      .edge.color-b.selected,
      .edge.color-b.edge-selected {
        stroke: var(--edge-b) !important;
        marker-end: url(#arrow-selected-b) !important;
        filter: drop-shadow(0 0 7px color-mix(in srgb, var(--edge-b), transparent 45%)) !important;
      }

      .edge.color-c.selected,
      .edge.color-c.edge-selected {
        stroke: var(--edge-c) !important;
        marker-end: url(#arrow-selected-c) !important;
        filter: drop-shadow(0 0 7px color-mix(in srgb, var(--edge-c), transparent 45%)) !important;
      }

      .edge.selected,
      .edge.edge-selected {
        stroke-width: 4.8 !important;
        opacity: 1 !important;
      }
    `;
    document.head.appendChild(style);
  }

  function observeSvg() {
    const svg = document.getElementById("graphSvg");
    if (!svg) {
      setTimeout(observeSvg, 120);
      return;
    }

    ensureMarkers(svg);
    const observer = new MutationObserver(() => ensureMarkers(svg));
    observer.observe(svg, { childList: true, subtree: true });
  }

  function ensureMarkers(svg) {
    const defs = svg.querySelector("defs");
    if (!defs) return;
    addMarker(defs, "arrow-selected-a", "var(--edge-a)");
    addMarker(defs, "arrow-selected-b", "var(--edge-b)");
    addMarker(defs, "arrow-selected-c", "var(--edge-c)");
  }

  function addMarker(defs, id, fill) {
    if (defs.querySelector(`#${id}`)) return;
    const marker = document.createElementNS("http://www.w3.org/2000/svg", "marker");
    marker.setAttribute("id", id);
    marker.setAttribute("viewBox", "0 0 10 10");
    marker.setAttribute("refX", "9");
    marker.setAttribute("refY", "5");
    marker.setAttribute("markerWidth", "7");
    marker.setAttribute("markerHeight", "7");
    marker.setAttribute("orient", "auto");

    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", "M 0 0 L 10 5 L 0 10 z");
    path.setAttribute("fill", fill);
    marker.appendChild(path);
    defs.appendChild(marker);
  }
})();
