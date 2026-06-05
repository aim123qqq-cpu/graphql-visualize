(function () {
  "use strict";

  if (window.__graphqlEdgeClearPatchReady) return;
  window.__graphqlEdgeClearPatchReady = true;

  document.addEventListener("pointerdown", clearWhenOutsideEdge, true);
  document.addEventListener("click", clearWhenOutsideEdge, true);

  function clearWhenOutsideEdge(event) {
    if (event.target.closest?.("#graphSvg [data-edge]")) return;
    clearSelectedEdges();
  }

  function clearSelectedEdges() {
    window.__graphqlVisualizerSelectedEdge = "";
    document.querySelectorAll("#graphSvg [data-edge]").forEach((edge) => {
      edge.classList.remove("selected", "edge-selected");
    });
  }
})();
