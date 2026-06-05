(function () {
  "use strict";

  if (window.__graphqlReferenceLinksPatchReady) return;
  window.__graphqlReferenceLinksPatchReady = true;

  injectStyles();
  bindTypeLinks();
  bindStickyEdgeClear();

  function injectStyles() {
    if (document.getElementById("referenceLinksPatchStyles")) return;
    const style = document.createElement("style");
    style.id = "referenceLinksPatchStyles";
    style.textContent = `
      #details .type-field-type.ref-type-link {
        cursor: pointer;
        text-decoration: underline;
        text-decoration-thickness: 1px;
        text-underline-offset: 3px;
      }

      #details .type-field-type.ref-type-link:hover {
        filter: brightness(0.9);
      }

      .node.reference-flash > rect:first-child {
        animation: referenceFlash 900ms ease;
        stroke: var(--accent) !important;
        stroke-width: 4 !important;
      }

      @keyframes referenceFlash {
        0% { filter: drop-shadow(0 0 0 rgba(227, 6, 17, 0)); }
        35% { filter: drop-shadow(0 0 10px rgba(227, 6, 17, 0.5)); }
        100% { filter: drop-shadow(0 0 0 rgba(227, 6, 17, 0)); }
      }
    `;
    document.head.appendChild(style);
  }

  function bindTypeLinks() {
    document.addEventListener("click", (event) => {
      const type = event.target.closest?.("#details .type-field-type");
      if (!type) return;

      const typeName = unwrapType(type.textContent || "");
      const node = findGraphNode(typeName);
      if (!node) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      focusGraphNode(node);
    }, true);

    const observer = new MutationObserver(() => annotateReferenceTypes());
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(annotateReferenceTypes, 0);
  }

  function bindStickyEdgeClear() {
    document.addEventListener("pointerdown", clearWhenOutsideEdge, true);
    document.addEventListener("click", clearWhenOutsideEdge, true);
  }

  function clearWhenOutsideEdge(event) {
    if (event.target.closest?.("#graphSvg [data-edge]")) return;
    window.__graphqlVisualizerSelectedEdge = "";
    document.querySelectorAll("#graphSvg [data-edge]").forEach((edge) => {
      edge.classList.remove("selected", "edge-selected");
    });
  }

  function annotateReferenceTypes() {
    document.querySelectorAll("#details .type-field-type").forEach((type) => {
      const typeName = unwrapType(type.textContent || "");
      const linked = Boolean(findGraphNode(typeName));
      type.classList.toggle("ref-type-link", linked);
      if (linked) {
        type.setAttribute("role", "button");
        type.setAttribute("tabindex", "0");
        type.setAttribute("title", `Open ${typeName}`);
      } else {
        type.removeAttribute("role");
        type.removeAttribute("tabindex");
      }
    });
  }

  function findGraphNode(typeName) {
    if (!typeName || isBuiltinType(typeName)) return null;
    return Array.from(document.querySelectorAll("#graphSvg [data-node]")).find((node) => node.dataset.node === typeName) || null;
  }

  function focusGraphNode(node) {
    window.__graphqlVisualizerSelectedEdge = "";
    document.querySelectorAll("#graphSvg [data-edge]").forEach((edge) => edge.classList.remove("selected", "edge-selected"));

    node.dispatchEvent(new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      view: window
    }));

    document.querySelectorAll("#graphSvg [data-node]").forEach((item) => item.classList.toggle("selected", item === node));
    node.classList.add("reference-flash");
    setTimeout(() => node.classList.remove("reference-flash"), 920);
  }

  function unwrapType(type) {
    return String(type || "").replace(/[![\]\s]/g, "");
  }

  function isBuiltinType(typeName) {
    return ["String", "Int", "Float", "Boolean", "ID"].includes(typeName);
  }
})();
