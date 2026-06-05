(function () {
  "use strict";

  if (window.__graphqlSidebarLayoutPatchReady) return;
  window.__graphqlSidebarLayoutPatchReady = true;

  injectStyles();
  dockPanelButtons();
  observeLayout();

  function injectStyles() {
    if (document.getElementById("sidebarLayoutPatchStyles")) return;
    const style = document.createElement("style");
    style.id = "sidebarLayoutPatchStyles";
    style.textContent = `
      .panel-toggle.graph-docked-toggle {
        position: fixed !important;
        z-index: 90 !important;
        top: 0;
        left: 0;
        transform: none !important;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
      }

      .graph-panel .toolbar {
        padding-inline: clamp(22px, 2.7vw, 42px);
        column-gap: 14px;
      }

      .graph-panel .search-wrap {
        margin-left: clamp(6px, 1vw, 16px);
      }

      .graph-panel .exports {
        margin-right: clamp(6px, 1vw, 16px);
      }

      @media (max-width: 1100px) {
        .panel-toggle.graph-docked-toggle {
          position: absolute !important;
        }

        .graph-panel .toolbar {
          padding-inline: 14px;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function observeLayout() {
    window.addEventListener("resize", scheduleDock, { passive: true });
    document.addEventListener("click", (event) => {
      if (!event.target.closest?.("#leftPanelBtn, #rightPanelBtn")) return;
      scheduleDock();
      setTimeout(dockPanelButtons, 220);
    }, true);

    const observer = new MutationObserver(scheduleDock);
    observer.observe(document.body, { attributes: true, attributeFilter: ["class"] });

    const graph = document.querySelector(".graph-panel");
    if (window.ResizeObserver && graph) {
      const resize = new ResizeObserver(scheduleDock);
      resize.observe(graph);
    }
  }

  let frame = 0;
  function scheduleDock() {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(dockPanelButtons);
  }

  function dockPanelButtons() {
    const graph = document.querySelector(".graph-panel");
    const left = document.getElementById("leftPanelBtn");
    const right = document.getElementById("rightPanelBtn");
    if (!graph || !left || !right) return;

    left.classList.add("graph-docked-toggle");
    right.classList.add("graph-docked-toggle");

    const graphBox = graph.getBoundingClientRect();
    const leftBox = left.getBoundingClientRect();
    const rightBox = right.getBoundingClientRect();
    const top = Math.max(10, graphBox.top + 12);

    left.style.top = `${top}px`;
    left.style.left = `${graphBox.left + 10}px`;
    left.style.right = "auto";

    right.style.top = `${top}px`;
    right.style.left = `${graphBox.right - rightBox.width - 10}px`;
    right.style.right = "auto";

    if (window.innerWidth <= 1100) {
      left.style.top = "12px";
      left.style.left = "12px";
      right.style.top = "12px";
      right.style.left = `${Math.max(12, graph.clientWidth - rightBox.width - 12)}px`;
    }

    if (!leftBox.width || !rightBox.width) requestAnimationFrame(dockPanelButtons);
  }
})();
