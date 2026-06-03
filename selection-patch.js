(function () {
  "use strict";

  const $ = (selector) => document.querySelector(selector);

  function escapeHtml(value) {
    return String(value || "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[char]));
  }

  function clearSelection() {
    document.querySelectorAll(".node.selected").forEach((node) => node.classList.remove("selected"));
    document.querySelectorAll(".edge.selected").forEach((edge) => edge.classList.remove("selected"));
  }

  function nodeDetails(node) {
    const title = node.querySelector(".title")?.textContent || node.dataset.node || "";
    const kind = node.querySelector(".node-kind-text")?.textContent || node.querySelector(".kind")?.textContent || "type";
    const fields = [...node.querySelectorAll(".field-row")].slice(0, 40).map((row) => {
      const name = row.querySelector(".field-name")?.textContent || row.dataset.field || "";
      const type = row.querySelector(".field-type")?.textContent || row.dataset.type || "";
      return `<li><strong>${escapeHtml(name)}</strong>: ${escapeHtml(type)}</li>`;
    }).join("");
    return `<div class="detail-card"><h3>${escapeHtml(title)}</h3><p class="muted">${escapeHtml(kind)}</p><ul class="field-list">${fields}</ul></div>`;
  }

  function edgeDetails(edge) {
    const parts = (edge.dataset.edge || "").split(":");
    const [source, target] = (parts.shift() || "").split("->");
    const label = parts.join(":") || "тип";
    return `<div class="detail-card"><h3>${escapeHtml(source)} -> ${escapeHtml(target)}</h3><p class="muted">Связь через поле: ${escapeHtml(label)}</p></div>`;
  }

  function selectNode(node) {
    clearSelection();
    node.classList.add("selected");
    const details = $("#details");
    if (details) details.innerHTML = nodeDetails(node);
  }

  function selectEdge(edge) {
    clearSelection();
    edge.querySelector(".edge")?.classList.add("selected");
    const details = $("#details");
    if (details) details.innerHTML = edgeDetails(edge);
  }

  function selectCanvas() {
    clearSelection();
    const details = $("#details");
    if (details) details.innerHTML = '<p class="muted">Выберите узел или связь на графе.</p>';
  }

  function bindSvgSelection() {
    const svg = $("#graphSvg");
    if (!svg) return;

    svg.querySelectorAll("[data-node]").forEach((node) => {
      node.onclick = (event) => {
        event.stopPropagation();
        selectNode(node);
      };
    });

    svg.querySelectorAll("[data-edge]").forEach((edge) => {
      edge.onclick = (event) => {
        event.stopPropagation();
        selectEdge(edge);
      };
    });

    svg.onclick = () => selectCanvas();
  }

  document.addEventListener("click", (event) => {
    if (!event.target.closest("#graphSvg")) return;
    event.preventDefault();
    event.stopImmediatePropagation();

    const node = event.target.closest("[data-node]");
    const edge = event.target.closest("[data-edge]");
    if (node) return selectNode(node);
    if (edge) return selectEdge(edge);
    selectCanvas();
  }, true);

  window.addEventListener("load", () => {
    const svg = $("#graphSvg");
    if (!svg) return;
    bindSvgSelection();
    new MutationObserver(() => requestAnimationFrame(bindSvgSelection)).observe(svg, { childList: true, subtree: true });
  });
})();
