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

  document.addEventListener("click", (event) => {
    if (!event.target.closest("#graphSvg")) return;
    event.preventDefault();
    event.stopImmediatePropagation();

    const node = event.target.closest("[data-node]");
    const edge = event.target.closest("[data-edge]");
    const details = $("#details");
    clearSelection();

    if (node) {
      node.classList.add("selected");
      if (details) details.innerHTML = nodeDetails(node);
      return;
    }

    if (edge) {
      edge.querySelector(".edge")?.classList.add("selected");
      if (details) details.innerHTML = edgeDetails(edge);
      return;
    }

    if (details) details.innerHTML = '<p class="muted">Выберите узел или связь на графе.</p>';
  }, true);
})();
