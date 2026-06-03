(function () {
  "use strict";

  const $ = (selector) => document.querySelector(selector);
  let userViewportChanged = false;
  let userMovedNode = false;
  let lastSignature = "";
  let pointerStart = null;
  let selectedNodeId = "";
  let selectedEdgeId = "";
  let enhancing = false;
  let pendingEnhance = false;
  let observer = null;
  let observedSvg = null;
  const observerOptions = { childList: true, subtree: true };

  function observeSvg(svg) {
    if (!observer || !svg) return;
    observer.disconnect();
    observedSvg = svg;
    observer.observe(svg, observerOptions);
  }

  function scheduleEnhance() {
    if (pendingEnhance) return;
    pendingEnhance = true;
    queueMicrotask(() => {
      pendingEnhance = false;
      enhance();
    });
  }

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

  function unwrapType(type) {
    return String(type || "").replace(/[![\]\s]/g, "");
  }

  function shortType(type, max = 24) {
    const text = String(type || "");
    return text.length > max ? text.slice(0, max - 3) + "..." : text;
  }

  function splitFieldRows() {
    document.querySelectorAll(".field-row").forEach((row) => {
      if (row.querySelector(".field-type")) return;
      const texts = [...row.querySelectorAll("text.field")];
      if (!texts.length) return;
      const first = texts[0];
      const x = Number(first.getAttribute("x")) || 12;
      const y = Number(first.getAttribute("y")) || 48;
      const width = Number(row.closest("[data-node]")?.querySelector("rect")?.getAttribute("width")) || 260;
      const combined = texts.map((text) => text.textContent || "").join(" ").trim();
      const divider = combined.indexOf(":");
      const fieldName = row.dataset.field || (divider >= 0 ? combined.slice(0, divider).trim() : combined);
      const fieldType = divider >= 0 ? combined.slice(divider + 1).trim() : "";
      row.dataset.field = fieldName;
      row.dataset.type = unwrapType(fieldType);
      texts.forEach((text) => text.remove());
      const nameEl = document.createElementNS("http://www.w3.org/2000/svg", "text");
      nameEl.setAttribute("class", "field field-name");
      nameEl.setAttribute("x", String(x));
      nameEl.setAttribute("y", String(y));
      nameEl.textContent = fieldName;
      row.appendChild(nameEl);
      const typeEl = document.createElementNS("http://www.w3.org/2000/svg", "text");
      typeEl.setAttribute("class", "field field-type");
      typeEl.setAttribute("x", String(width - x));
      typeEl.setAttribute("y", String(y));
      typeEl.setAttribute("text-anchor", "end");
      typeEl.textContent = shortType(fieldType);
      row.appendChild(typeEl);
    });
  }

  function applyNodeSkin(nodes) {
    nodes.forEach((node) => {
      const rect = node.el.querySelector("rect");
      if (!rect) return;
      node.width = Math.max(320, node.width);
      rect.setAttribute("width", String(node.width));
      rect.setAttribute("rx", "10");
      let header = node.el.querySelector(".node-header");
      if (!header) {
        header = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        header.setAttribute("class", "node-header");
        header.setAttribute("x", "0");
        header.setAttribute("y", "0");
        header.setAttribute("rx", "10");
        node.el.insertBefore(header, rect.nextSibling);
      }
      header.setAttribute("width", String(node.width));
      header.setAttribute("height", "40");
      const title = node.el.querySelector("text.title");
      if (title) {
        title.setAttribute("x", "14");
        title.setAttribute("y", "24");
      }
      const kind = node.el.querySelector("text.kind");
      const kindText = kind ? kind.textContent || "type" : "type";
      if (kind) kind.style.display = "none";
      let badge = node.el.querySelector(".node-kind-badge");
      if (!badge) {
        badge = document.createElementNS("http://www.w3.org/2000/svg", "g");
        badge.setAttribute("class", "node-kind-badge");
        const pill = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        pill.setAttribute("class", "node-kind-pill");
        pill.setAttribute("rx", "11");
        pill.setAttribute("height", "22");
        const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
        text.setAttribute("class", "node-kind-text");
        text.setAttribute("text-anchor", "middle");
        badge.appendChild(pill);
        badge.appendChild(text);
        node.el.appendChild(badge);
      }
      const label = node.id === "Query" ? "root" : kindText;
      const pillWidth = Math.max(42, label.length * 7 + 18);
      const pill = badge.querySelector(".node-kind-pill");
      const text = badge.querySelector(".node-kind-text");
      pill.setAttribute("x", String(node.width - pillWidth - 10));
      pill.setAttribute("y", "9");
      pill.setAttribute("width", String(pillWidth));
      text.setAttribute("x", String(node.width - pillWidth / 2 - 10));
      text.setAttribute("y", "24");
      text.textContent = label;
      node.el.classList.toggle("root-node", node.id === "Query");
      node.el.querySelectorAll(".field-row").forEach((row) => {
        const type = row.querySelector(".field-type");
        const name = row.querySelector(".field-name");
        if (type) type.setAttribute("x", String(node.width - 18));
        if (name) name.setAttribute("x", "18");
        updateFieldPort(row, node.width);
      });
    });
  }

  function updateFieldPort(row, width) {
    const type = row.dataset.type || "";
    const name = row.querySelector(".field-name");
    const isScalar = ["String", "Int", "Float", "Boolean", "ID"].includes(type) || type === "enumvalue" || !type;
    let port = row.querySelector(".field-port");
    if (isScalar) {
      if (port) port.remove();
      return;
    }
    if (!port) {
      port = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      port.setAttribute("class", "field-port");
      port.setAttribute("r", "3");
      row.appendChild(port);
    }
    const y = Number((name || row.querySelector(".field"))?.getAttribute("y")) || 48;
    port.setAttribute("cx", String(width + 1));
    port.setAttribute("cy", String(y - 3));
  }

  function nodeInfo(nodeEl) {
    const rect = nodeEl.querySelector("rect");
    return {
      el: nodeEl,
      id: nodeEl.dataset.node,
      x: Number(nodeEl.dataset.x) || 0,
      y: Number(nodeEl.dataset.y) || 0,
      width: Number(rect && rect.getAttribute("width")) || 260,
      height: Number(rect && rect.getAttribute("height")) || 88,
      fields: [...nodeEl.querySelectorAll(".field-row")]
    };
  }

  function parseEdges(svg) {
    return [...svg.querySelectorAll("[data-edge]")].map((edgeEl) => {
      const id = edgeEl.dataset.edge || "";
      const split = id.split(":");
      const pair = split.shift() || "";
      const [source, target] = pair.split("->");
      const label = split.join(":");
      const key = source < target ? source + "|" + target : target + "|" + source;
      return { edgeEl, id, source, target, label, key };
    }).filter((item) => item.source && item.target);
  }

  function chooseCenter(nodes, edges) {
    const degree = new Map(nodes.map((node) => [node.id, 0]));
    edges.forEach((edge) => {
      degree.set(edge.source, (degree.get(edge.source) || 0) + 1);
      degree.set(edge.target, (degree.get(edge.target) || 0) + 1);
    });
    const roots = { Query: 0, Mutation: 1, Subscription: 2 };
    return [...nodes].sort((a, b) => (roots[a.id] ?? 10) - (roots[b.id] ?? 10) || (degree.get(b.id) || 0) - (degree.get(a.id) || 0) || a.id.localeCompare(b.id))[0];
  }

  function spiderLayout(nodes, edges) {
    if (!nodes.length || userMovedNode) return;
    const center = chooseCenter(nodes, edges);
    if (!center) return;
    const neighbors = new Map(nodes.map((node) => [node.id, new Set()]));
    edges.forEach((edge) => {
      if (neighbors.has(edge.source) && neighbors.has(edge.target)) {
        neighbors.get(edge.source).add(edge.target);
        neighbors.get(edge.target).add(edge.source);
      }
    });
    const rings = new Map([[center.id, 0]]);
    const queue = [center.id];
    for (let index = 0; index < queue.length; index += 1) {
      const id = queue[index];
      [...(neighbors.get(id) || [])].sort().forEach((next) => {
        if (!rings.has(next)) {
          rings.set(next, (rings.get(id) || 0) + 1);
          queue.push(next);
        }
      });
    }
    nodes.forEach((node) => {
      if (!rings.has(node.id)) rings.set(node.id, Math.max(1, Math.ceil(Math.sqrt(rings.size + 1))));
    });
    const grouped = new Map();
    nodes.forEach((node) => {
      const ring = rings.get(node.id) || 0;
      if (!grouped.has(ring)) grouped.set(ring, []);
      grouped.get(ring).push(node);
    });
    const density = Number($("#densityInput")?.value || 100) / 100;
    const positioned = new Map();
    [...grouped.keys()].sort((a, b) => a - b).forEach((ring) => {
      const items = grouped.get(ring).sort((a, b) => (neighbors.get(b.id)?.size || 0) - (neighbors.get(a.id)?.size || 0) || a.id.localeCompare(b.id));
      if (ring === 0) {
        items.forEach((node, index) => positioned.set(node.id, { x: index * 120, y: 0 }));
        return;
      }
      const crowdedRadius = (items.length * 135 * density) / (Math.PI * 2);
      const radius = Math.max(ring * 230 * density + Math.max(0, ring - 1) * 48 * density, crowdedRadius);
      items.forEach((node, index) => {
        const angle = -Math.PI / 2 + (index / Math.max(1, items.length)) * Math.PI * 2 + (ring % 2 ? 0 : Math.PI / Math.max(4, items.length));
        positioned.set(node.id, {
          x: Math.cos(angle) * radius - node.width / 2,
          y: Math.sin(angle) * radius - node.height / 2
        });
      });
    });
    normalizePositions(nodes, positioned);
    nodes.forEach((node) => {
      const point = positioned.get(node.id);
      node.x = point.x;
      node.y = point.y;
      node.el.dataset.x = String(point.x);
      node.el.dataset.y = String(point.y);
      node.el.setAttribute("transform", `translate(${point.x}, ${point.y})`);
    });
  }

  function normalizePositions(nodes, positioned) {
    const minX = Math.min(...nodes.map((node) => positioned.get(node.id).x));
    const minY = Math.min(...nodes.map((node) => positioned.get(node.id).y));
    nodes.forEach((node) => {
      const point = positioned.get(node.id);
      point.x = point.x - minX + 70;
      point.y = point.y - minY + 70;
    });
  }

  function fieldY(info, name, targetName) {
    const field = info.fields.find((item) => name ? item.dataset.field === name : item.dataset.type === targetName);
    const text = field && field.querySelector(".field-name, .field");
    return text ? Number(text.getAttribute("y")) - 3 : info.height / 2;
  }

  function targetY(info, sourceName) {
    const field = info.fields.find((item) => item.dataset.type === sourceName || (item.textContent || "").includes(sourceName));
    const text = field && field.querySelector(".field-name, .field");
    return text ? Number(text.getAttribute("y")) - 3 : Math.min(info.height - 18, 34);
  }

  function edgeLane(edge, groups) {
    const ids = groups.get(edge.key) || [edge.id];
    return (ids.indexOf(edge.id) - (ids.length - 1) / 2) * 18;
  }

  function updateFieldRows(nodes) {
    nodes.forEach((node) => {
      const width = node.width;
      node.el.querySelectorAll(".field-row").forEach((row) => {
        const text = row.querySelector(".field-name, .field");
        if (!text) return;
        const y = Number(text.getAttribute("y")) - 12;
        let line = row.querySelector(".field-row-line");
        if (!line) {
          line = document.createElementNS("http://www.w3.org/2000/svg", "line");
          line.setAttribute("class", "field-row-line");
          row.insertBefore(line, row.firstChild);
        }
        line.setAttribute("x1", "0");
        line.setAttribute("x2", String(width));
        line.setAttribute("y1", String(y));
        line.setAttribute("y2", String(y));
      });
    });
  }

  function updateEdges(nodes, edges) {
    const nodeMap = new Map(nodes.map((node) => [node.id, node]));
    const groups = new Map();
    edges.forEach((edge) => {
      if (!groups.has(edge.key)) groups.set(edge.key, []);
      groups.get(edge.key).push(edge.id);
    });
    edges.forEach((edge) => {
      const source = nodeMap.get(edge.source);
      const target = nodeMap.get(edge.target);
      const path = edge.edgeEl.querySelector("path");
      if (!source || !target || !path) return;
      const right = source.x + source.width / 2 <= target.x + target.width / 2;
      const sx = right ? source.x + source.width : source.x;
      const tx = right ? target.x : target.x + target.width;
      const sy = source.y + fieldY(source, edge.label, edge.target);
      const ty = target.y + targetY(target, edge.source);
      const lane = edgeLane(edge, groups);
      const mid = Math.max(52, Math.abs(tx - sx) / 2);
      path.setAttribute("d", `M ${sx} ${sy} C ${sx + mid} ${sy + lane}, ${tx - mid} ${ty + lane}, ${tx} ${ty}`);
    });
  }

  function escapeHtml(value) {
    return String(value || "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
  }

  function detailsForNode(nodeEl) {
    const title = nodeEl.querySelector(".title")?.textContent || nodeEl.dataset.node || "";
    const kind = nodeEl.querySelector(".node-kind-text")?.textContent || "type";
    const fields = [...nodeEl.querySelectorAll(".field-row")].slice(0, 40).map((row) => {
      const name = row.querySelector(".field-name")?.textContent || row.dataset.field || "";
      const type = row.querySelector(".field-type")?.textContent || row.dataset.type || "";
      return `<li><strong>${escapeHtml(name)}</strong>: ${escapeHtml(type)}</li>`;
    }).join("");
    return `<div class="detail-card"><h3>${escapeHtml(title)}</h3><p class="muted">${escapeHtml(kind)}</p><ul class="field-list">${fields}</ul></div>`;
  }

  function detailsForEdge(edgeEl) {
    const id = edgeEl.dataset.edge || "";
    const split = id.split(":");
    const [source, target] = (split.shift() || "").split("->");
    const label = split.join(":") || "тип";
    return `<div class="detail-card"><h3>${escapeHtml(source)} -> ${escapeHtml(target)}</h3><p class="muted">Связь через поле: ${escapeHtml(label)}</p></div>`;
  }

  function applySelection() {
    document.querySelectorAll(".node.selected, .node.highlight").forEach((item) => {
      if (!selectedNodeId || item.dataset.node !== selectedNodeId) item.classList.remove("selected");
    });
    document.querySelectorAll(".edge.selected").forEach((item) => item.classList.remove("selected"));
    if (selectedNodeId) {
      const node = document.querySelector(`[data-node="${CSS.escape(selectedNodeId)}"]`);
      if (node) node.classList.add("selected");
    }
    if (selectedEdgeId) {
      const edge = document.querySelector(`[data-edge="${CSS.escape(selectedEdgeId)}"] .edge`);
      if (edge) edge.classList.add("selected");
    }
  }

  function selectGraphItem(event) {
    const svg = event.target.closest("#graphSvg");
    if (!svg) return;
    const details = $("#details");
    const node = event.target.closest("[data-node]");
    const edge = event.target.closest("[data-edge]");
    event.preventDefault();
    event.stopImmediatePropagation();
    if (node) {
      selectedNodeId = node.dataset.node || "";
      selectedEdgeId = "";
      if (details) details.innerHTML = detailsForNode(node);
    } else if (edge) {
      selectedNodeId = "";
      selectedEdgeId = edge.dataset.edge || "";
      if (details) details.innerHTML = detailsForEdge(edge);
    } else {
      selectedNodeId = "";
      selectedEdgeId = "";
      if (details) details.innerHTML = '<p class="muted">Выберите узел или связь на графе.</p>';
    }
    applySelection();
  }

  function fitGraph(svg, nodes) {
    if (!nodes.length || userViewportChanged || userMovedNode) return;
    const group = svg.querySelector("g[transform]");
    if (!group) return;
    const minX = Math.min(...nodes.map((node) => node.x));
    const minY = Math.min(...nodes.map((node) => node.y));
    const maxX = Math.max(...nodes.map((node) => node.x + node.width));
    const maxY = Math.max(...nodes.map((node) => node.y + node.height));
    const width = Math.max(800, svg.clientWidth || 800);
    const height = Math.max(520, svg.clientHeight || 520);
    const graphWidth = Math.max(1, maxX - minX);
    const graphHeight = Math.max(1, maxY - minY);
    const padding = 56;
    const zoom = Math.min(1.05, Math.max(0.22, Math.min((width - padding * 2) / graphWidth, (height - padding * 2) / graphHeight)));
    const panX = (width - graphWidth * zoom) / 2 - minX * zoom;
    const panY = (height - graphHeight * zoom) / 2 - minY * zoom;
    group.setAttribute("transform", `translate(${panX}, ${panY}) scale(${zoom})`);
  }

  function enhance() {
    if (enhancing) return;
    enhancing = true;
    if (observer) observer.disconnect();
    try {
      ensurePanelIcons();
      splitFieldRows();
      const svg = $("#graphSvg");
      if (!svg) return;
      const nodes = [...svg.querySelectorAll("[data-node]")].map(nodeInfo);
      const edges = parseEdges(svg);
      const signature = nodes.map((node) => node.id).sort().join("|") + "::" + edges.length;
      if (signature !== lastSignature) {
        userViewportChanged = false;
        userMovedNode = false;
        lastSignature = signature;
      }
      spiderLayout(nodes, edges);
      applyNodeSkin(nodes);
      updateFieldRows(nodes);
      updateEdges(nodes, edges);
      applySelection();
      fitGraph(svg, nodes);
      observeSvg(svg);
    } finally {
      enhancing = false;
    }
  }

  observer = new MutationObserver(() => scheduleEnhance());
  window.addEventListener("load", () => {
    const svg = $("#graphSvg");
    if (svg) observeSvg(svg);
    enhance();
  });
  document.addEventListener("mousedown", (event) => {
    if (event.target.closest("#graphSvg")) {
      pointerStart = {
        x: event.clientX,
        y: event.clientY,
        node: Boolean(event.target.closest("[data-node]"))
      };
    }
  }, true);
  document.addEventListener("mousemove", (event) => {
    if (!pointerStart) return;
    if (Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y) > 4) {
      if (pointerStart.node) userMovedNode = true;
      userViewportChanged = true;
    }
  }, true);
  document.addEventListener("mouseup", () => {
    pointerStart = null;
  }, true);
  document.addEventListener("wheel", (event) => {
    if (event.target.closest("#graphSvg")) userViewportChanged = true;
  }, true);
  document.addEventListener("click", (event) => {
    if (event.target.closest("#graphSvg")) return selectGraphItem(event);
    if (event.target.closest("#buildBtn, #sampleBtn, #optimizeBtn, .mode, #densityInput")) {
      userViewportChanged = false;
      userMovedNode = false;
      selectedNodeId = "";
      selectedEdgeId = "";
    }
    scheduleEnhance();
  }, true);
})();
