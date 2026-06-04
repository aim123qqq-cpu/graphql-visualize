(function () {
  "use strict";

  const view = {
    x: 0,
    y: 0,
    zoom: 1,
    ready: false,
    action: null,
    resetNext: true
  };

  function init() {
    injectStyles();
    bindGraphButtons();
    bindViewport();
    ensureControls();
    observeGraph();
  }

  function injectStyles() {
    if (document.getElementById("navFixStyles")) return;
    const style = document.createElement("style");
    style.id = "navFixStyles";
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
    `;
    document.head.appendChild(style);
  }

  function bindGraphButtons() {
    ["buildBtn", "sampleBtn", "optimizeBtn", "densityInput"].forEach((id) => {
      const item = document.getElementById(id);
      if (!item) return;
      item.addEventListener("click", () => {
        view.resetNext = true;
      }, true);
      item.addEventListener("input", () => {
        view.resetNext = true;
      }, true);
    });
  }

  function bindViewport() {
    const svg = graphSvg();
    if (!svg || svg.dataset.navFixBound) return;
    svg.dataset.navFixBound = "true";

    svg.addEventListener("wheel", (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      syncView();
      const rect = svg.getBoundingClientRect();
      zoomAt(event.deltaY > 0 ? 0.9 : 1.1, event.clientX - rect.left, event.clientY - rect.top);
    }, { capture: true, passive: false });

    svg.addEventListener("mousedown", (event) => {
      if (event.target.closest("[data-node]")) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      syncView();
      view.action = {
        x: event.clientX,
        y: event.clientY,
        startX: view.x,
        startY: view.y
      };
      svg.style.cursor = "grabbing";
    }, true);

    window.addEventListener("mousemove", (event) => {
      if (!view.action) return;
      view.x = view.action.startX + event.clientX - view.action.x;
      view.y = view.action.startY + event.clientY - view.action.y;
      applyView();
    }, true);

    window.addEventListener("mouseup", () => {
      view.action = null;
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
    if (!svg || svg.dataset.navFixObserved) return;
    svg.dataset.navFixObserved = "true";
    const observer = new MutationObserver(() => {
      bindViewport();
      ensureControls();
      if (view.resetNext || !view.ready) {
        syncView();
        view.resetNext = false;
      } else {
        applyView();
      }
    });
    observer.observe(svg, { childList: true, subtree: true });
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

  function graphSvg() {
    return document.getElementById("graphSvg");
  }

  function graphViewport() {
    const svg = graphSvg();
    return svg?.querySelector(".graph-viewport") || svg?.querySelector("g[transform]");
  }

  window.addEventListener("load", () => setTimeout(init, 120));
})();
