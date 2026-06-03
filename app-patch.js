(function () {
  "use strict";

  const $ = (selector) => document.querySelector(selector);

  function ensurePanelIcons() {
    const left = $("#leftPanelBtn");
    const right = $("#rightPanelBtn");
    if (left && !left.querySelector(".sidebar-icon")) {
      left.innerHTML = '<span class="sidebar-icon" aria-hidden="true"></span>';
    }
    if (right && !right.querySelector(".sidebar-icon")) {
      right.innerHTML = '<span class="sidebar-icon mirrored" aria-hidden="true"></span>';
    }
  }

  function nodeInfo(nodeEl) {
    const rect = nodeEl.querySelector("rect");
    return {
      id: nodeEl.dataset.node,
      x: Number(nodeEl.dataset.x) || 0,
      y: Number(nodeEl.dataset.y) || 0,
      width: Number(rect && rect.getAttribute("width")) || 232,
      height: Number(rect && rect.getAttribute("height")) || 88,
      fields: [...nodeEl.querySelectorAll("text.field")]
    };
  }

  function fieldY(info, name, targetName) {
    const field = info.fields.find((item) => {
      const text = item.textContent || "";
      return name ? text.startsWith(name + ":") : text.includes(":") && text.includes(targetName);
    });
    return field ? Number(field.getAttribute("y")) - 3 : info.height / 2;
  }

  function targetY(info, sourceName) {
    const field = info.fields.find((item) => (item.textContent || "").includes(sourceName));
    return field ? Number(field.getAttribute("y")) - 3 : Math.min(info.height - 18, 34);
  }

  function edgeLane(edge, groups) {
    const ids = groups.get(edge.key) || [edge.id];
    return (ids.indexOf(edge.id) - (ids.length - 1) / 2) * 18;
  }

  function updateFieldRows(nodes) {
    nodes.forEach((node) => {
      node.querySelectorAll(".field-row-line").forEach((line) => line.remove());
      const width = Number(node.querySelector("rect")?.getAttribute("width")) || 232;
      node.querySelectorAll("text.field").forEach((text) => {
        const y = Number(text.getAttribute("y")) - 12;
        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("class", "field-row-line");
        line.setAttribute("x1", "0");
        line.setAttribute("x2", String(width));
        line.setAttribute("y1", String(y));
        line.setAttribute("y2", String(y));
        text.parentNode.insertBefore(line, text);
      });
    });
  }

  function updateEdges() {
    const svg = $("#graphSvg");
    if (!svg) return;
    const nodeMap = new Map([...svg.querySelectorAll("[data-node]")].map((node) => [node.dataset.node, nodeInfo(node)]));
    const edgeEls = [...svg.querySelectorAll("[data-edge]")];
    const parsed = edgeEls.map((edgeEl) => {
      const id = edgeEl.dataset.edge || "";
      const split = id.split(":");
      const pair = split.shift() || "";
      const [source, target] = pair.split("->");
      const label = split.join(":");
      const key = source < target ? source + "|" + target : target + "|" + source;
      return { edgeEl, id, source, target, label, key };
    }).filter((item) => item.source && item.target);
    const groups = new Map();
    parsed.forEach((edge) => {
      if (!groups.has(edge.key)) groups.set(edge.key, []);
      groups.get(edge.key).push(edge.id);
    });
    parsed.forEach((edge) => {
      const source = nodeMap.get(edge.source);
      const target = nodeMap.get(edge.target);
      const path = edge.edgeEl.querySelector("path");
      if (!source || !target || !path) return;
      const right = source.x + source.width / 2 <= target.x + target.width / 2;
      const sy = source.y + fieldY(source, edge.label, edge.target);
      const ty = target.y + targetY(target, edge.source);
      const sx = right ? source.x + source.width : source.x;
      const tx = right ? target.x : target.x + target.width;
      const lane = edgeLane(edge, groups);
      const mid = Math.max(44, Math.abs(tx - sx) / 2);
      path.setAttribute("d", `M ${sx} ${sy} C ${sx + mid} ${sy + lane}, ${tx - mid} ${ty + lane}, ${tx} ${ty}`);
    });
  }

  function enhance() {
    ensurePanelIcons();
    updateFieldRows([...document.querySelectorAll("[data-node]")]);
    updateEdges();
  }

  const observer = new MutationObserver(() => requestAnimationFrame(enhance));
  window.addEventListener("load", () => {
    const svg = $("#graphSvg");
    if (svg) observer.observe(svg, { childList: true, subtree: true });
    enhance();
  });
  document.addEventListener("click", () => requestAnimationFrame(enhance), true);
})();
