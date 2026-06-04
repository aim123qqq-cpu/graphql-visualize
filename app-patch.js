(function () {
  "use strict";

  const sample = `type Query {
  me: User!
  feed: [Post!]!
}

type User {
  id: ID!
  username: String!
  email: String!
  posts: [Post!]!
}

type Post {
  id: ID!
  title: String!
  body: String!
  author: User!
}`;

  const builtins = new Set(["String", "Int", "Float", "Boolean", "ID"]);
  const state = {
    graph: { nodes: [], edges: [] },
    nodes: [],
    edges: [],
    pan: { x: 48, y: 42 },
    zoom: 1,
    positions: {},
    selected: "",
    edge: "",
    fit: true
  };

  const $ = (id) => document.getElementById(id);

  function init() {
    bindControls();
    if (!$("schemaInput")?.value.trim()) $("schemaInput").value = sample;
    buildGraph();
  }

  function bindControls() {
    const build = $("buildBtn");
    const sampleBtn = $("sampleBtn");
    const clear = $("clearBtn");
    const optimize = $("optimizeBtn");
    const file = $("fileInput");
    const density = $("densityInput");
    const search = $("searchInput");

    if (build) build.onclick = buildGraph;
    if (sampleBtn) sampleBtn.onclick = () => {
      $("schemaInput").value = sample;
      buildGraph();
    };
    if (clear) clear.onclick = () => {
      $("schemaInput").value = "";
      state.graph = { nodes: [], edges: [] };
      state.nodes = [];
      state.edges = [];
      render();
    };
    if (optimize) optimize.onclick = () => {
      state.positions = {};
      state.fit = true;
      render();
    };
    if (file) file.onchange = loadFile;
    if (density) density.oninput = () => {
      state.positions = {};
      state.fit = true;
      render();
    };
    if (search) search.oninput = render;
    document.querySelectorAll(".mode").forEach((button) => {
      button.onclick = () => {
        document.querySelectorAll(".mode").forEach((item) => item.classList.toggle("active", item === button));
        state.positions = {};
        state.fit = true;
        render();
      };
    });
  }

  function loadFile(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      $("schemaInput").value = String(reader.result || "");
      const label = $("fileName");
      if (label) label.textContent = file.name;
      buildGraph();
    };
    reader.readAsText(file);
  }

  function buildGraph() {
    const raw = ($("schemaInput")?.value || "").trim();
    if (!raw) {
      state.graph = { nodes: [], edges: [] };
      render();
      return;
    }
    try {
      state.graph = raw[0] === "{" ? parseIntrospection(JSON.parse(raw)) : parseSdl(raw);
      state.positions = {};
      state.selected = "";
      state.edge = "";
      state.fit = true;
      render();
    } catch (error) {
      showEmpty("Не удалось построить схему", error.message);
    }
  }

  function parseSdl(raw) {
    const text = raw.replace(/#[^\n\r]*/g, "").replace(/"""[\s\S]*?"""/g, "");
    const nodes = new Map();
    const edges = [];
    const defs = /(?:extend\s+)?(type|interface|input|enum)\s+([_A-Za-z][_0-9A-Za-z]*)[^{]*\{([\s\S]*?)\}|(?:extend\s+)?union\s+([_A-Za-z][_0-9A-Za-z]*)\s*=\s*([^\n\r]+)|scalar\s+([_A-Za-z][_0-9A-Za-z]*)/g;
    let match;
    while ((match = defs.exec(text))) {
      const kind = match[1] ? normalizeKind(match[1]) : match[4] ? "UNION" : "SCALAR";
      const name = match[2] || match[4] || match[6];
      const node = ensure(nodes, name, kind);
      if (kind === "UNION") {
        splitUnion(match[5]).forEach((target) => {
          node.fields.push({ name: target, type: target });
          edges.push(makeEdge(name, target, target));
        });
      } else if (kind === "ENUM") {
        node.fields = enumValues(match[3]).map((name) => ({ name, type: "enum value" }));
      } else if (kind !== "SCALAR") {
        readFields(match[3]).forEach((field) => {
          node.fields.push(field);
          const target = unwrap(field.type);
          if (target && target !== name) edges.push(makeEdge(name, target, field.name));
        });
      }
    }
    edges.forEach((item) => {
      if (!nodes.has(item.target)) ensure(nodes, item.target, builtins.has(item.target) ? "SCALAR" : "OBJECT");
    });
    return { nodes: [...nodes.values()], edges: uniqueEdges(edges) };
  }

  function parseIntrospection(json) {
    const schema = json.data?.__schema || json.__schema || json;
    if (!schema.types) throw new Error("В JSON не найден __schema.types");
    const nodes = new Map();
    const edges = [];
    schema.types.forEach((type) => {
      if (!type?.name || type.name.startsWith("__")) return;
      const node = ensure(nodes, type.name, type.kind || "OBJECT");
      (type.fields || type.inputFields || []).forEach((field) => {
        const target = typeName(field.type);
        const text = typeText(field.type);
        node.fields.push({ name: field.name, type: text });
        if (target && target !== type.name) edges.push(makeEdge(type.name, target, field.name));
      });
      (type.enumValues || []).forEach((value) => node.fields.push({ name: value.name, type: "enum value" }));
    });
    return { nodes: [...nodes.values()], edges: uniqueEdges(edges) };
  }

  function readFields(body) {
    return body.split(/\n|;/).map((line) => line.trim()).filter(Boolean).map((line) => {
      const clean = line
        .replace(/@[_A-Za-z][_0-9A-Za-z]*(\([^)]*\))?/g, "")
        .replace(/\s+/g, " ");
      const match = clean.match(/^([_A-Za-z][_0-9A-Za-z]*)\s*(?:\([^)]*\))?\s*:\s*([^=]+)(?:=.*)?$/);
      return match ? { name: match[1], type: match[2].trim() } : null;
    }).filter(Boolean);
  }

  function layout() {
    const mode = document.querySelector(".mode.active")?.dataset.mode || "types";
    const showScalars = $("showScalars")?.checked !== false;
    const showBuiltins = $("showBuiltins")?.checked === true;
    const search = ($("searchInput")?.value || "").trim().toLowerCase();
    const allowed = new Set();
    state.graph.nodes.forEach((node) => {
      if (!showBuiltins && builtins.has(node.name)) return;
      if (!showScalars && ["SCALAR", "ENUM"].includes(node.kind)) return;
      if (search && !matchesSearch(node, search)) return;
      allowed.add(node.id);
    });

    let edges = state.graph.edges.filter((edge) => allowed.has(edge.source) && allowed.has(edge.target));
    if (mode === "types") edges = uniquePairs(edges);
    const nodes = state.graph.nodes.filter((node) => allowed.has(node.id)).map(measureNode);
    const levels = assignLevels(nodes, edges);
    const columns = groupByLevel(nodes, levels);
    sortColumns(columns, edges, levels);
    placeColumns(columns, Number($("densityInput")?.value || 100) / 100);
    const placed = [...columns.keys()].sort((a, b) => a - b).flatMap((level) => columns.get(level));
    return { nodes: placed, edges };
  }

  function measureNode(node) {
    const rows = node.fields.slice(0, 14).map((field, index) => ({
      field,
      y: 58 + index * 24,
      type: short(field.type)
    }));
    const longestTitle = Math.max(node.name.length * 8, 120);
    const longestType = Math.max(80, ...rows.map((row) => row.type.length * 7));
    const width = Math.max(260, Math.min(360, longestTitle + longestType + 90));
    return { ...node, width, height: Math.max(86, 58 + rows.length * 24 + 16), rows };
  }

  function assignLevels(nodes, edges) {
    const ids = new Set(nodes.map((node) => node.id));
    const out = new Map(nodes.map((node) => [node.id, []]));
    const incoming = new Map(nodes.map((node) => [node.id, []]));
    edges.forEach((edge) => {
      if (!ids.has(edge.source) || !ids.has(edge.target)) return;
      out.get(edge.source).push(edge.target);
      incoming.get(edge.target).push(edge.source);
    });
    const roots = nodes.filter((node) => ["Query", "Mutation", "Subscription"].includes(node.name));
    if (!roots.length && nodes.length) roots.push(nodes[0]);
    const levels = new Map();
    const queue = roots.map((node) => node.id);
    roots.forEach((node, index) => levels.set(node.id, index));
    for (let index = 0; index < queue.length; index += 1) {
      const source = queue[index];
      out.get(source).forEach((target) => {
        const next = (levels.get(source) || 0) + 1;
        if (!levels.has(target) || next < levels.get(target)) {
          levels.set(target, next);
          queue.push(target);
        }
      });
    }
    nodes.forEach((node) => {
      if (levels.has(node.id)) return;
      const linked = incoming.get(node.id).filter((id) => levels.has(id));
      levels.set(node.id, linked.length ? Math.max(...linked.map((id) => levels.get(id))) + 1 : 0);
    });
    return levels;
  }

  function groupByLevel(nodes, levels) {
    const columns = new Map();
    nodes.forEach((node) => {
      const level = levels.get(node.id) || 0;
      if (!columns.has(level)) columns.set(level, []);
      columns.get(level).push(node);
    });
    return columns;
  }

  function sortColumns(columns, edges, levels) {
    const order = new Map();
    [...columns.keys()].sort((a, b) => a - b).forEach((level) => {
      columns.get(level).sort((a, b) => rootWeight(a.name) - rootWeight(b.name) || a.name.localeCompare(b.name));
      columns.get(level).forEach((node, index) => order.set(node.id, index));
    });
    for (let pass = 0; pass < 8; pass += 1) {
      [...columns.keys()].sort((a, b) => a - b).forEach((level) => {
        columns.get(level).sort((a, b) => barycenter(a.id, edges, levels, order) - barycenter(b.id, edges, levels, order) || a.name.localeCompare(b.name));
        columns.get(level).forEach((node, index) => order.set(node.id, index));
      });
    }
  }

  function placeColumns(columns, density) {
    let x = 64;
    [...columns.keys()].sort((a, b) => a - b).forEach((level) => {
      const nodes = columns.get(level);
      const maxWidth = Math.max(...nodes.map((node) => node.width), 260);
      let y = 64;
      nodes.forEach((node) => {
        const saved = state.positions[node.id];
        node.x = saved ? saved.x : x;
        node.y = saved ? saved.y : y;
        y += node.height + 58 * density;
      });
      x += maxWidth + 170 * density;
    });
  }

  function render() {
    const graph = layout();
    state.nodes = graph.nodes;
    state.edges = graph.edges;
    const svg = $("graphSvg");
    if (!svg) return;
    $("emptyState")?.classList.toggle("hidden", graph.nodes.length > 0);
    renderStats(graph);
    renderDetails(graph);
    if (state.fit) {
      fitToScreen(graph);
      state.fit = false;
    }
    const byId = new Map(graph.nodes.map((node) => [node.id, node]));
    const lanes = edgeLanes(graph.edges);
    const maxX = Math.max(900, ...graph.nodes.map((node) => node.x + node.width + 180));
    const maxY = Math.max(620, ...graph.nodes.map((node) => node.y + node.height + 120));
    const edgeSvg = graph.edges.map((edge) => drawEdge(edge, byId, lanes)).join("");
    const nodeSvg = graph.nodes.map(drawNode).join("");
    svg.setAttribute("viewBox", `0 0 ${Math.max(900, svg.clientWidth || 900)} ${Math.max(620, svg.clientHeight || 620)}`);
    svg.innerHTML = `${defs()}<g transform="translate(${state.pan.x}, ${state.pan.y}) scale(${state.zoom})"><rect class="graph-hit" x="-80" y="-80" width="${maxX + 160}" height="${maxY + 160}" fill="transparent"></rect><g class="edges-layer">${edgeSvg}</g><g class="nodes-layer">${nodeSvg}</g></g>`;
    bindSvg(svg);
  }

  function drawNode(node) {
    const kind = node.name === "Query" ? "root" : readable(node.kind);
    const badgeWidth = Math.max(42, kind.length * 7 + 18);
    const rows = node.rows.map((row) => {
      const typeName = unwrap(row.field.type);
      const port = builtins.has(typeName) || !typeName ? "" : `<circle class="field-port" cx="${node.width + 1}" cy="${row.y - 3}" r="3"></circle>`;
      return `<g class="field-row" data-field="${esc(row.field.name)}"><text class="field field-name" x="18" y="${row.y}">${esc(row.field.name)}</text><text class="field field-type" x="${node.width - 18}" y="${row.y}" text-anchor="end">${esc(row.type)}</text>${port}</g>`;
    }).join("");
    return `<g class="node ${node.name === "Query" ? "root-node" : ""} ${state.selected === node.id ? "selected" : ""}" data-node="${esc(node.id)}" data-x="${node.x}" data-y="${node.y}" transform="translate(${node.x}, ${node.y})"><rect width="${node.width}" height="${node.height}" rx="10"></rect><rect class="node-header" width="${node.width}" height="40" rx="10"></rect><text class="title" font-weight="700" x="14" y="24">${esc(node.name)}</text><rect class="node-kind-pill" x="${node.width - badgeWidth - 10}" y="9" width="${badgeWidth}" height="22" rx="11"></rect><text class="node-kind-text" x="${node.width - badgeWidth / 2 - 10}" y="24" text-anchor="middle">${esc(kind)}</text>${rows}</g>`;
  }

  function drawEdge(edge, byId, lanes) {
    const source = byId.get(edge.source);
    const target = byId.get(edge.target);
    if (!source || !target) return "";
    const forward = source.x + source.width / 2 <= target.x + target.width / 2;
    const sx = forward ? source.x + source.width : source.x;
    const tx = forward ? target.x : target.x + target.width;
    const sy = source.y + sourceY(source, edge.label);
    const ty = target.y + targetY(target, source.name);
    const lane = lanes.get(edge.id) || 0;
    const dir = forward ? 1 : -1;
    const lead = sx + dir * (70 + Math.abs(lane));
    const trail = tx - dir * (70 + Math.abs(lane));
    const midY = (sy + ty) / 2 + lane;
    const d = roundedPath([[sx, sy], [lead, sy], [lead, midY], [trail, midY], [trail, ty], [tx, ty]], 14);
    const color = edgeColorClass(edge);
    const marker = color === "color-b" ? "arrow-b" : color === "color-c" ? "arrow-c" : "arrow-a";
    return `<path data-edge="${esc(edge.id)}" class="edge ${color} ${state.edge === edge.id ? "selected" : ""}" style="marker-end:url(#${marker})" d="${d}"></path>`;
  }

  function roundedPath(points, radius) {
    if (points.length < 2) return "";
    let d = `M ${points[0][0]} ${points[0][1]}`;
    for (let index = 1; index < points.length - 1; index += 1) {
      const prev = points[index - 1];
      const curr = points[index];
      const next = points[index + 1];
      const before = trimPoint(curr, prev, radius);
      const after = trimPoint(curr, next, radius);
      d += ` L ${before[0]} ${before[1]} Q ${curr[0]} ${curr[1]} ${after[0]} ${after[1]}`;
    }
    const last = points[points.length - 1];
    return `${d} L ${last[0]} ${last[1]}`;
  }

  function trimPoint(from, to, radius) {
    const dx = to[0] - from[0];
    const dy = to[1] - from[1];
    const length = Math.max(1, Math.abs(dx) + Math.abs(dy));
    const distance = Math.min(radius, length / 2);
    return [from[0] + Math.sign(dx) * distance, from[1] + Math.sign(dy) * distance];
  }

  function bindSvg(svg) {
    svg.querySelectorAll("[data-node]").forEach((node) => {
      node.onclick = (event) => {
        event.stopPropagation();
        state.selected = node.dataset.node || "";
        state.edge = "";
        render();
      };
    });
    svg.querySelectorAll("[data-edge]").forEach((edge) => {
      edge.onclick = (event) => {
        event.stopPropagation();
        state.edge = edge.dataset.edge || "";
        state.selected = "";
        render();
      };
    });
    svg.onclick = () => {
      state.selected = "";
      state.edge = "";
      render();
    };
    bindDrag(svg);
  }

  function bindDrag(svg) {
    let moving = null;
    let panning = null;
    svg.onmousedown = (event) => {
      const node = event.target.closest("[data-node]");
      if (node) {
        const point = svgPoint(svg, event);
        moving = { id: node.dataset.node, dx: point.x - Number(node.dataset.x), dy: point.y - Number(node.dataset.y) };
        event.stopPropagation();
      } else {
        panning = { x: event.clientX, y: event.clientY, pan: { ...state.pan } };
      }
    };
    window.onmousemove = (event) => {
      if (moving) {
        const point = svgPoint(svg, event);
        state.positions[moving.id] = { x: point.x - moving.dx, y: point.y - moving.dy };
        render();
      } else if (panning) {
        state.pan = { x: panning.pan.x + event.clientX - panning.x, y: panning.pan.y + event.clientY - panning.y };
        render();
      }
    };
    window.onmouseup = () => {
      moving = null;
      panning = null;
    };
    svg.onwheel = (event) => {
      event.preventDefault();
      const oldZoom = state.zoom;
      state.zoom = Math.min(2.8, Math.max(0.18, state.zoom * (event.deltaY > 0 ? 0.9 : 1.1)));
      const rect = svg.getBoundingClientRect();
      const cx = event.clientX - rect.left;
      const cy = event.clientY - rect.top;
      state.pan.x = cx - ((cx - state.pan.x) / oldZoom) * state.zoom;
      state.pan.y = cy - ((cy - state.pan.y) / oldZoom) * state.zoom;
      render();
    };
  }

  function fitToScreen(graph) {
    if (!graph.nodes.length) return;
    const svg = $("graphSvg");
    const width = Math.max(900, svg.clientWidth || 900);
    const height = Math.max(620, svg.clientHeight || 620);
    const minX = Math.min(...graph.nodes.map((node) => node.x));
    const minY = Math.min(...graph.nodes.map((node) => node.y));
    const maxX = Math.max(...graph.nodes.map((node) => node.x + node.width));
    const maxY = Math.max(...graph.nodes.map((node) => node.y + node.height));
    const zoom = Math.min(1, Math.max(0.16, Math.min((width - 96) / Math.max(1, maxX - minX), (height - 96) / Math.max(1, maxY - minY))));
    state.zoom = zoom;
    state.pan = { x: (width - (maxX - minX) * zoom) / 2 - minX * zoom, y: (height - (maxY - minY) * zoom) / 2 - minY * zoom };
  }

  function renderStats(graph) {
    const stats = $("stats");
    if (!stats) return;
    const fields = graph.nodes.reduce((sum, node) => sum + node.fields.length, 0);
    stats.innerHTML = `<div><strong>${graph.nodes.length}</strong><span>типов</span></div><div><strong>${graph.edges.length}</strong><span>связей</span></div><div><strong>${fields}</strong><span>полей</span></div>`;
  }

  function renderDetails(graph) {
    const box = $("details");
    if (!box) return;
    const node = graph.nodes.find((item) => item.id === state.selected);
    if (!node) {
      box.innerHTML = '<p class="muted">Выберите блок или связь на графе.</p>';
      return;
    }
    box.innerHTML = `<div class="detail-card"><h3>${esc(node.name)}</h3><p class="muted">${esc(readable(node.kind))}</p><ul class="field-list">${node.fields.map((field) => `<li><strong>${esc(field.name)}</strong>: ${esc(field.type)}</li>`).join("")}</ul></div>`;
  }

  function showEmpty(title, text) {
    const empty = $("emptyState");
    if (empty) {
      empty.classList.remove("hidden");
      empty.innerHTML = `<h2>${esc(title)}</h2><p>${esc(text)}</p>`;
    }
  }

  function edgeLanes(edges) {
    const groups = new Map();
    edges.forEach((edge) => {
      const key = edge.source < edge.target ? `${edge.source}|${edge.target}` : `${edge.target}|${edge.source}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(edge);
    });
    const lanes = new Map();
    groups.forEach((items) => {
      items.forEach((edge, index) => lanes.set(edge.id, (index - (items.length - 1) / 2) * 24));
    });
    return lanes;
  }

  function defs() {
    return `<defs><marker id="arrow-a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="var(--edge-a)"></path></marker><marker id="arrow-b" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="var(--edge-b)"></path></marker><marker id="arrow-c" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="var(--edge-c)"></path></marker></defs>`;
  }

  function sourceY(node, field) {
    const row = node.rows.find((item) => item.field.name === field);
    return row ? row.y - 3 : node.height / 2;
  }

  function targetY(node, source) {
    const row = node.rows.find((item) => unwrap(item.field.type) === source);
    return row ? row.y - 3 : Math.min(node.height - 18, 30);
  }

  function svgPoint(svg, event) {
    const rect = svg.getBoundingClientRect();
    return { x: (event.clientX - rect.left - state.pan.x) / state.zoom, y: (event.clientY - rect.top - state.pan.y) / state.zoom };
  }

  function ensure(map, name, kind) {
    if (!map.has(name)) map.set(name, { id: name, name, kind, fields: [] });
    return map.get(name);
  }

  function makeEdge(source, target, label) {
    return { id: `${source}->${target}:${label}`, source, target, label };
  }

  function uniqueEdges(edges) {
    const seen = new Set();
    return edges.filter((edge) => {
      const key = `${edge.source}|${edge.target}|${edge.label}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function uniquePairs(edges) {
    const seen = new Set();
    return edges.filter((edge) => {
      const key = `${edge.source}|${edge.target}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function barycenter(id, edges, levels, order) {
    const level = levels.get(id) || 0;
    const linked = edges
      .filter((edge) => edge.source === id || edge.target === id)
      .map((edge) => edge.source === id ? edge.target : edge.source)
      .filter((item) => order.has(item) && Math.abs((levels.get(item) || 0) - level) <= 1);
    return linked.length ? linked.reduce((sum, item) => sum + order.get(item), 0) / linked.length : order.get(id) || 0;
  }

  function matchesSearch(node, search) {
    return node.name.toLowerCase().includes(search) || node.fields.some((field) => `${field.name} ${field.type}`.toLowerCase().includes(search));
  }

  function splitUnion(value) {
    return String(value || "").split("|").map((item) => item.trim()).filter(Boolean);
  }

  function enumValues(value) {
    return String(value || "").split(/\s+/).map((item) => item.trim()).filter((item) => item && !item.startsWith("@"));
  }

  function normalizeKind(kind) {
    if (kind === "input") return "INPUT";
    return String(kind || "type").toUpperCase();
  }

  function rootWeight(name) {
    return { Query: 0, Mutation: 1, Subscription: 2 }[name] ?? 10;
  }

  function readable(kind) {
    return { OBJECT: "type", TYPE: "type", INTERFACE: "interface", INPUT_OBJECT: "input", INPUT: "input", ENUM: "enum", UNION: "union", SCALAR: "scalar" }[kind] || String(kind || "type").toLowerCase();
  }

  function typeName(ref) {
    while (ref) {
      if (ref.name) return ref.name;
      ref = ref.ofType;
    }
    return "";
  }

  function typeText(ref) {
    if (!ref) return "";
    if (ref.kind === "NON_NULL") return `${typeText(ref.ofType)}!`;
    if (ref.kind === "LIST") return `[${typeText(ref.ofType)}]`;
    return ref.name || ref.kind || "";
  }

  function unwrap(type) {
    return String(type || "").replace(/[![\]\s]/g, "");
  }

  function short(type) {
    const text = String(type || "");
    return text.length > 28 ? `${text.slice(0, 25)}...` : text;
  }

  function edgeColorClass(edge) {
    let hash = 0;
    const text = edge.id || "";
    for (let index = 0; index < text.length; index += 1) hash = (hash + text.charCodeAt(index)) % 3;
    return ["color-a", "color-b", "color-c"][hash];
  }

  function esc(value) {
    return String(value || "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
  }

  window.addEventListener("load", () => setTimeout(init, 30));
})();
