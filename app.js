(function () {
  "use strict";

  const sampleSchema = `schema { query: Query mutation: Mutation }

type Query {
  users: [User!]!
  user(id: ID!): User
  courses: [Course!]!
}

type Mutation {
  createUser(input: CreateUserInput!): User!
}

type User {
  id: ID!
  name: String!
  email: String!
  role: Role!
  courses: [Course!]!
}

type Course {
  id: ID!
  title: String!
  author: User!
  lessons: [Lesson!]!
}

type Lesson {
  id: ID!
  title: String!
  durationMinutes: Int!
}

input CreateUserInput {
  name: String!
  email: String!
  role: Role = STUDENT
}

enum Role { STUDENT TEACHER ADMIN }`;

  const introspectionQuery = `{
    __schema {
      types {
        kind name description
        fields(includeDeprecated: true) {
          name description
          type { kind name ofType { kind name ofType { kind name ofType { kind name } } } }
        }
        inputFields { name type { kind name ofType { kind name ofType { kind name } } } }
        enumValues(includeDeprecated: true) { name description }
        interfaces { name kind }
        possibleTypes { name kind }
      }
    }
  }`;

  const state = {
    graph: { nodes: [], edges: [], warnings: [] },
    mode: "types",
    zoom: 1,
    pan: { x: 40, y: 40 },
    positions: {},
    selected: null,
    search: "",
    frame: 0
  };

  const $ = (id) => document.getElementById(id);
  const el = {
    schema: $("schemaInput"),
    build: $("buildBtn"),
    sample: $("sampleBtn"),
    clear: $("clearBtn"),
    optimize: $("optimizeBtn"),
    file: $("fileInput"),
    fileName: $("fileName"),
    endpoint: $("endpointInput"),
    auth: $("authInput"),
    loadEndpoint: $("loadEndpointBtn"),
    accent: $("accentInput"),
    density: $("densityInput"),
    showScalars: $("showScalars"),
    showBuiltins: $("showBuiltins"),
    search: $("searchInput"),
    svg: $("graphSvg"),
    empty: $("emptyState"),
    stats: $("stats"),
    details: $("details"),
    warnings: $("warnings"),
    dot: $("exportDotBtn"),
    svgExport: $("exportSvgBtn"),
    png: $("exportPngBtn")
  };

  function init() {
    el.schema.value = sampleSchema;
    bindEvents();
    buildGraph();
  }

  function bindEvents() {
    document.querySelectorAll(".tab").forEach((button) => {
      button.onclick = () => activateTab(button.dataset.tab);
    });
    document.querySelectorAll(".mode").forEach((button) => {
      button.onclick = () => {
        state.mode = button.dataset.mode;
        document.querySelectorAll(".mode").forEach((item) => item.classList.toggle("active", item === button));
        render();
      };
    });
    el.build.onclick = buildGraph;
    el.sample.onclick = () => {
      el.schema.value = sampleSchema;
      buildGraph();
    };
    el.clear.onclick = () => {
      el.schema.value = "";
      state.graph = { nodes: [], edges: [], warnings: [] };
      state.positions = {};
      state.selected = null;
      render();
    };
    el.optimize.onclick = optimizeGraph;
    el.file.onchange = loadFile;
    el.loadEndpoint.onclick = loadEndpoint;
    el.accent.oninput = () => {
      document.documentElement.style.setProperty("--accent", el.accent.value);
      render();
    };
    el.density.oninput = render;
    el.showScalars.onchange = render;
    el.showBuiltins.onchange = render;
    el.search.oninput = () => {
      state.search = el.search.value.trim().toLowerCase();
      render();
    };
    el.dot.onclick = () => downloadText("schema.dot", toDot(state.graph));
    el.svgExport.onclick = () => downloadText("schema.svg", `<?xml version="1.0" encoding="UTF-8"?>\n${el.svg.outerHTML}`);
    el.png.onclick = exportPng;
    bindDrag();
  }

  function activateTab(name) {
    document.querySelectorAll(".tab").forEach((button) => button.classList.toggle("active", button.dataset.tab === name));
    document.querySelectorAll(".tab-page").forEach((page) => page.classList.remove("active"));
    $(name + "Page").classList.add("active");
  }

  function loadFile(event) {
    const file = event.target.files[0];
    if (!file) return;
    el.fileName.textContent = file.name;
    const reader = new FileReader();
    reader.onload = () => {
      el.schema.value = String(reader.result || "");
      activateTab("schema");
      buildGraph();
    };
    reader.readAsText(file);
  }

  async function loadEndpoint() {
    const url = el.endpoint.value.trim();
    if (!url) return showWarnings(["Укажите URL GraphQL сервера."]);
    el.loadEndpoint.disabled = true;
    el.loadEndpoint.textContent = "Загружаю...";
    try {
      const headers = { "Content-Type": "application/json" };
      if (el.auth.value.trim()) headers.Authorization = el.auth.value.trim();
      const response = await fetch(url, { method: "POST", headers, body: JSON.stringify({ query: introspectionQuery }) });
      if (!response.ok) throw new Error("HTTP " + response.status);
      el.schema.value = JSON.stringify(await response.json(), null, 2);
      activateTab("schema");
      buildGraph();
    } catch (error) {
      showWarnings(["Не удалось загрузить endpoint: " + error.message, "Частая причина: сервер не разрешает CORS для браузера."]);
    } finally {
      el.loadEndpoint.disabled = false;
      el.loadEndpoint.textContent = "Загрузить introspection";
    }
  }

  function buildGraph() {
    const raw = el.schema.value.trim();
    if (!raw) {
      state.graph = { nodes: [], edges: [], warnings: ["Вставьте схему или JSON introspection."] };
      return render();
    }
    try {
      state.graph = raw[0] === "{" ? parseIntrospection(JSON.parse(raw)) : parseSdl(raw);
      state.positions = {};
      state.selected = null;
      state.zoom = 1;
      state.pan = { x: 40, y: 40 };
    } catch (error) {
      state.graph = { nodes: [], edges: [], warnings: ["Ошибка разбора схемы: " + error.message] };
    }
    render();
  }

  function parseSdl(raw) {
    const text = raw.replace(/#[^\n\r]*/g, "").replace(/"""[\s\S]*?"""/g, "");
    const nodes = new Map();
    const edges = [];
    const warnings = [];
    const defs = /(?:extend\s+)?(type|interface|input|enum)\s+([_A-Za-z][_0-9A-Za-z]*)[^{]*\{([\s\S]*?)\}|(?:extend\s+)?union\s+([_A-Za-z][_0-9A-Za-z]*)\s*=\s*([^\n\r]+)|scalar\s+([_A-Za-z][_0-9A-Za-z]*)/g;
    let match;
    while ((match = defs.exec(text))) {
      const kind = match[1] ? match[1].toUpperCase() : match[4] ? "UNION" : "SCALAR";
      const name = match[2] || match[4] || match[6];
      const node = ensureNode(nodes, name, kind);
      if (kind === "UNION") {
        match[5].split("|").map((item) => item.trim()).filter(Boolean).forEach((target) => {
          node.fields.push({ name: target, type: target });
          edges.push(edge(name, target, "union"));
        });
      } else if (kind === "ENUM") {
        node.fields = match[3].split(/\s+/).filter(Boolean).map((name) => ({ name, type: "enum value" }));
      } else if (kind !== "SCALAR") {
        parseFields(match[3]).forEach((field) => {
          node.fields.push(field);
          const target = unwrapType(field.type);
          if (target && target !== name) edges.push(edge(name, target, field.name));
        });
      }
    }
    edges.forEach((item) => {
      if (!nodes.has(item.target)) ensureNode(nodes, item.target, guessKind(item.target));
    });
    addWarnings(nodes, edges, warnings);
    return { nodes: [...nodes.values()], edges: uniqueEdges(edges), warnings };
  }

  function parseFields(body) {
    return body.split(/\n|;/).map((line) => line.trim()).filter(Boolean).map((line) => {
      const clean = line.replace(/@[_A-Za-z][_0-9A-Za-z]*(\([^)]*\))?/g, "").replace(/\s+/g, " ");
      const match = clean.match(/^([_A-Za-z][_0-9A-Za-z]*)\s*(?:\([^)]*\))?\s*:\s*([^=]+)(?:=.*)?$/);
      return match ? { name: match[1], type: match[2].trim() } : null;
    }).filter(Boolean);
  }

  function parseIntrospection(json) {
    const schema = json.data && json.data.__schema ? json.data.__schema : json.__schema || json;
    if (!schema.types) throw new Error("В JSON не найден __schema.types.");
    const nodes = new Map();
    const edges = [];
    const warnings = [];
    schema.types.forEach((type) => {
      if (!type || !type.name) return;
      const node = ensureNode(nodes, type.name, type.kind);
      node.description = type.description || "";
      (type.fields || type.inputFields || []).forEach((field) => {
        const target = typeRefName(field.type);
        node.fields.push({ name: field.name, type: typeRefText(field.type) });
        if (target && target !== type.name) edges.push(edge(type.name, target, field.name));
      });
      (type.enumValues || []).forEach((value) => node.fields.push({ name: value.name, type: "enum value" }));
      (type.interfaces || []).forEach((item) => edges.push(edge(type.name, item.name, "implements")));
      (type.possibleTypes || []).forEach((item) => edges.push(edge(type.name, item.name, "possible")));
    });
    addWarnings(nodes, edges, warnings);
    return { nodes: [...nodes.values()], edges: uniqueEdges(edges), warnings };
  }

  function ensureNode(map, name, kind) {
    if (!map.has(name)) map.set(name, { id: name, name, kind, fields: [], description: "" });
    return map.get(name);
  }

  function edge(source, target, label) {
    return { id: source + "->" + target + ":" + label, source, target, label };
  }

  function uniqueEdges(edges) {
    const seen = new Set();
    return edges.filter((item) => {
      const key = item.source + "|" + item.target + "|" + item.label;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function typeRefName(ref) {
    while (ref) {
      if (ref.name) return ref.name;
      ref = ref.ofType;
    }
    return "";
  }

  function typeRefText(ref) {
    if (!ref) return "";
    if (ref.kind === "NON_NULL") return typeRefText(ref.ofType) + "!";
    if (ref.kind === "LIST") return "[" + typeRefText(ref.ofType) + "]";
    return ref.name || ref.kind || "";
  }

  function unwrapType(type) {
    return String(type).replace(/[![\]\s]/g, "");
  }

  function guessKind(name) {
    return ["String", "Int", "Float", "Boolean", "ID"].includes(name) ? "SCALAR" : "OBJECT";
  }

  function addWarnings(nodes, edges, warnings) {
    if (!nodes.has("Query")) warnings.push("Тип Query не найден. Для GraphQL API он обычно обязателен.");
    const isolated = [...nodes.values()].filter((node) => !isBuiltin(node.name) && !edges.some((item) => item.source === node.name || item.target === node.name));
    if (isolated.length) warnings.push("Изолированные типы: " + isolated.map((node) => node.name).join(", ") + ".");
    if (!warnings.length) warnings.push("Критичных проблем не найдено.");
  }

  function isBuiltin(name) {
    return ["String", "Int", "Float", "Boolean", "ID"].includes(name) || String(name).startsWith("__");
  }

  function visibleGraph() {
    const allowed = new Set();
    state.graph.nodes.forEach((node) => {
      if (!el.showBuiltins.checked && isBuiltin(node.name)) return;
      if (!el.showScalars.checked && ["SCALAR", "ENUM"].includes(node.kind)) return;
      allowed.add(node.id);
    });
    let edges = state.graph.edges.filter((item) => allowed.has(item.source) && allowed.has(item.target));
    if (state.mode === "types") edges = uniqueEdges(edges.map((item) => edge(item.source, item.target, "")));
    if (state.mode === "fields") edges = edges.filter((item) => item.label);
    return layout(state.graph.nodes.filter((node) => allowed.has(node.id)), edges);
  }

  function layout(nodes, edges) {
    const density = Number(el.density.value) / 100;
    const outgoing = new Map(nodes.map((node) => [node.id, []]));
    const indegree = new Map(nodes.map((node) => [node.id, 0]));
    edges.forEach((item) => {
      if (!outgoing.has(item.source) || !indegree.has(item.target)) return;
      outgoing.get(item.source).push(item.target);
      indegree.set(item.target, indegree.get(item.target) + 1);
    });
    const levels = assignLevels(nodes, outgoing, indegree);
    const columns = new Map();
    nodes.forEach((node) => {
      const level = levels.get(node.id) || 0;
      if (!columns.has(level)) columns.set(level, []);
      columns.get(level).push(node);
    });
    const result = [];
    [...columns.keys()].sort((a, b) => a - b).forEach((level) => {
      let y = 0;
      columns.get(level).sort((a, b) => kindWeight(a.kind) - kindWeight(b.kind) || a.name.localeCompare(b.name)).forEach((node) => {
        const metric = nodeMetric(node);
        const saved = state.positions[node.id];
        result.push({ ...node, ...metric, x: saved ? saved.x : level * 300 * density, y: saved ? saved.y : y });
        y += metric.height + 34 * density;
      });
    });
    return { nodes: result, edges };
  }

  function assignLevels(nodes, outgoing, indegree) {
    const levels = new Map();
    const queue = nodes.filter((node) => ["Query", "Mutation", "Subscription"].includes(node.name) || indegree.get(node.id) === 0);
    queue.sort((a, b) => rootWeight(a.name) - rootWeight(b.name) || a.name.localeCompare(b.name));
    queue.forEach((node) => levels.set(node.id, 0));
    for (let index = 0; index < queue.length; index += 1) {
      const node = queue[index];
      (outgoing.get(node.id) || []).forEach((id) => {
        const nextLevel = (levels.get(node.id) || 0) + 1;
        if (!levels.has(id) || nextLevel < levels.get(id)) {
          levels.set(id, nextLevel);
          const target = nodes.find((item) => item.id === id);
          if (target && !queue.includes(target)) queue.push(target);
        }
      });
    }
    nodes.forEach((node) => {
      if (!levels.has(node.id)) levels.set(node.id, kindWeight(node.kind) > 3 ? 2 : 1);
    });
    return levels;
  }

  function optimizeGraph() {
    const graph = visibleGraph();
    const density = Number(el.density.value) / 100;
    const levels = new Map();
    graph.nodes.forEach((node) => {
      const level = Math.max(0, Math.round(node.x / (300 * density)));
      if (!levels.has(level)) levels.set(level, []);
      levels.get(level).push(node);
    });
    let order = new Map(graph.nodes.map((node, index) => [node.id, index]));
    const sortedLevels = [...levels.keys()].sort((a, b) => a - b);
    for (let pass = 0; pass < 5; pass += 1) {
      sortedLevels.forEach((level) => {
        levels.get(level).sort((a, b) => barycenter(a.id, graph.edges, order) - barycenter(b.id, graph.edges, order) || a.name.localeCompare(b.name));
      });
      order = rebuildOrder(levels, sortedLevels);
    }
    state.positions = {};
    sortedLevels.forEach((level) => {
      let y = 0;
      levels.get(level).forEach((node, index) => {
        state.positions[node.id] = { x: level * 320 * density, y: y + (index % 2 ? 14 : 0) };
        y += node.height + 46 * density;
      });
    });
    state.selected = null;
    state.pan = { x: 40, y: 40 };
    render();
  }

  function barycenter(id, edges, order) {
    const neighbors = edges.filter((item) => item.source === id || item.target === id).map((item) => item.source === id ? item.target : item.source).filter((item) => order.has(item));
    if (!neighbors.length) return order.get(id) || 0;
    return neighbors.reduce((sum, item) => sum + order.get(item), 0) / neighbors.length;
  }

  function rebuildOrder(levels, sortedLevels) {
    const order = new Map();
    let index = 0;
    sortedLevels.forEach((level) => levels.get(level).forEach((node) => order.set(node.id, index++)));
    return order;
  }

  function nodeMetric(node) {
    const titleLines = wrap(node.name, 24);
    const kindLines = [readableKind(node.kind)];
    const fieldLines = node.fields.slice(0, 7).flatMap((field) => wrap(field.name + ": " + shortType(field.type), 28));
    const moreLines = node.fields.length > 7 ? ["+ еще " + (node.fields.length - 7)] : [];
    const height = Math.max(88, 22 + titleLines.length * 16 + kindLines.length * 16 + fieldLines.length * 17 + moreLines.length * 17);
    return { width: 232, height, rows: { titleLines, kindLines, fieldLines, moreLines } };
  }

  function render() {
    state.frame = 0;
    const graph = visibleGraph();
    renderStats(graph);
    showWarnings(state.graph.warnings);
    renderDetails();
    renderSvg(graph);
  }

  function scheduleRender() {
    if (!state.frame) state.frame = requestAnimationFrame(render);
  }

  function renderStats(graph) {
    const fields = graph.nodes.reduce((sum, node) => sum + node.fields.length, 0);
    el.stats.innerHTML = `<div><strong>${graph.nodes.length}</strong><span>типов</span></div><div><strong>${graph.edges.length}</strong><span>связей</span></div><div><strong>${fields}</strong><span>полей</span></div>`;
  }

  function showWarnings(warnings) {
    el.warnings.innerHTML = warnings.map((item) => `<li class="${item.includes("не ") || item.includes("Не ") || item.includes("Ошибка") ? "bad" : ""}">${escapeHtml(item)}</li>`).join("");
  }

  function renderDetails() {
    if (!state.selected) {
      el.details.innerHTML = `<p class="muted">Выберите узел или связь на графе.</p>`;
      return;
    }
    if (state.selected.type === "edge") {
      const item = state.selected.data;
      el.details.innerHTML = `<div class="detail-card"><h3>${escapeHtml(item.source)} -> ${escapeHtml(item.target)}</h3><p class="muted">Связь через поле: ${escapeHtml(item.label || "тип")}</p></div>`;
      return;
    }
    const node = state.selected.data;
    el.details.innerHTML = `<div class="detail-card"><h3>${escapeHtml(node.name)}</h3><p class="muted">${escapeHtml(readableKind(node.kind))}</p><ul class="field-list">${node.fields.slice(0, 40).map((field) => `<li><strong>${escapeHtml(field.name)}</strong>: ${escapeHtml(field.type)}</li>`).join("")}</ul></div>`;
  }

  function renderSvg(graph) {
    el.empty.classList.toggle("hidden", graph.nodes.length > 0);
    const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
    const found = new Set();
    if (state.search) {
      graph.nodes.forEach((node) => {
        const text = [node.name, node.kind, ...node.fields.map((field) => field.name + " " + field.type)].join(" ").toLowerCase();
        if (text.includes(state.search)) found.add(node.id);
      });
    }
    const groups = edgeGroups(graph.edges);
    const edges = graph.edges.map((item) => {
      const source = nodeById.get(item.source);
      const target = nodeById.get(item.target);
      if (!source || !target) return "";
      const a = anchors(source, target);
      const lane = edgeLane(item, groups);
      const mid = Math.max(44, Math.abs(a.tx - a.sx) / 2);
      const d = `M ${a.sx} ${a.sy} C ${a.sx + mid} ${a.sy + lane}, ${a.tx - mid} ${a.ty + lane}, ${a.tx} ${a.ty}`;
      const selected = state.selected && state.selected.type === "edge" && state.selected.data.id === item.id;
      const highlighted = found.has(item.source) || found.has(item.target);
      return `<g data-edge="${escapeAttr(item.id)}"><path class="edge ${selected ? "selected" : ""} ${highlighted ? "highlight" : ""}" d="${d}"></path>${item.label ? `<text class="edge-label" x="${(a.sx + a.tx) / 2}" y="${(a.sy + a.ty) / 2 + lane - 8}">${escapeHtml(item.label)}</text>` : ""}</g>`;
    }).join("");
    const nodes = graph.nodes.map((node) => {
      const selected = state.selected && state.selected.type === "node" && state.selected.data.id === node.id;
      const highlighted = found.has(node.id);
      const title = textLines(node.rows.titleLines, 12, 24, "title");
      const kind = textLines(node.rows.kindLines, 12, 24 + node.rows.titleLines.length * 16, "kind");
      const start = 48 + node.rows.titleLines.length * 16;
      const fields = textLines(node.rows.fieldLines, 12, start, "field");
      const more = textLines(node.rows.moreLines, 12, start + node.rows.fieldLines.length * 17, "kind");
      return `<g class="node ${selected ? "selected" : ""} ${highlighted ? "highlight" : ""}" data-node="${escapeAttr(node.id)}" data-x="${node.x}" data-y="${node.y}" transform="translate(${node.x}, ${node.y})"><rect width="${node.width}" height="${node.height}" rx="8"></rect>${title}${kind}${fields}${more}</g>`;
    }).join("");
    const maxX = Math.max(800, ...graph.nodes.map((node) => node.x + node.width + 80));
    const maxY = Math.max(520, ...graph.nodes.map((node) => node.y + node.height + 80));
    el.svg.setAttribute("viewBox", `0 0 ${Math.max(800, el.svg.clientWidth)} ${Math.max(520, el.svg.clientHeight)}`);
    el.svg.innerHTML = `<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#8a94a6"></path></marker></defs><g transform="translate(${state.pan.x}, ${state.pan.y}) scale(${state.zoom})"><rect x="-40" y="-40" width="${maxX + 80}" height="${maxY + 80}" fill="transparent"></rect>${edges}${nodes}</g>`;
    el.svg.querySelectorAll("[data-node]").forEach((nodeEl) => nodeEl.onclick = (event) => {
      event.stopPropagation();
      state.selected = { type: "node", data: graph.nodes.find((node) => node.id === nodeEl.dataset.node) };
      render();
    });
    el.svg.querySelectorAll("[data-edge]").forEach((edgeEl) => edgeEl.onclick = (event) => {
      event.stopPropagation();
      state.selected = { type: "edge", data: graph.edges.find((item) => item.id === edgeEl.dataset.edge) };
      render();
    });
    el.svg.onclick = () => {
      state.selected = null;
      render();
    };
  }

  function anchors(source, target) {
    const right = source.x + source.width / 2 <= target.x + target.width / 2;
    return {
      sx: right ? source.x + source.width : source.x,
      sy: source.y + source.height / 2,
      tx: right ? target.x : target.x + target.width,
      ty: target.y + target.height / 2
    };
  }

  function edgeGroups(edges) {
    const groups = new Map();
    edges.forEach((item) => {
      const key = item.source < item.target ? item.source + "|" + item.target : item.target + "|" + item.source;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item.id);
    });
    return groups;
  }

  function edgeLane(item, groups) {
    const key = item.source < item.target ? item.source + "|" + item.target : item.target + "|" + item.source;
    const group = groups.get(key) || [item.id];
    return (group.indexOf(item.id) - (group.length - 1) / 2) * 18;
  }

  function bindDrag() {
    let movingNode = null;
    let movingCanvas = false;
    let last = { x: 0, y: 0 };
    el.svg.onmousedown = (event) => {
      const nodeEl = event.target.closest("[data-node]");
      if (nodeEl) {
        const point = svgPoint(event);
        const current = state.positions[nodeEl.dataset.node] || { x: Number(nodeEl.dataset.x) || 0, y: Number(nodeEl.dataset.y) || 0 };
        movingNode = { id: nodeEl.dataset.node, dx: point.x - current.x, dy: point.y - current.y };
        event.stopPropagation();
        return;
      }
      movingCanvas = true;
      last = { x: event.clientX, y: event.clientY };
    };
    window.onmousemove = (event) => {
      if (movingNode) {
        const point = svgPoint(event);
        state.positions[movingNode.id] = { x: point.x - movingNode.dx, y: point.y - movingNode.dy };
        return scheduleRender();
      }
      if (!movingCanvas) return;
      state.pan.x += event.clientX - last.x;
      state.pan.y += event.clientY - last.y;
      last = { x: event.clientX, y: event.clientY };
      scheduleRender();
    };
    window.onmouseup = () => {
      movingNode = null;
      movingCanvas = false;
    };
    el.svg.onwheel = (event) => {
      event.preventDefault();
      state.zoom = Math.min(2.4, Math.max(0.35, state.zoom * (event.deltaY > 0 ? 0.9 : 1.1)));
      scheduleRender();
    };
  }

  function svgPoint(event) {
    const rect = el.svg.getBoundingClientRect();
    return { x: (event.clientX - rect.left - state.pan.x) / state.zoom, y: (event.clientY - rect.top - state.pan.y) / state.zoom };
  }

  function textLines(lines, x, y, className) {
    return lines.map((line, index) => `<text class="${className}" ${className === "title" ? "font-weight=\"700\"" : ""} x="${x}" y="${y + index * (className === "field" ? 17 : 16)}">${escapeHtml(line)}</text>`).join("");
  }

  function wrap(value, max) {
    const lines = [];
    let line = "";
    String(value || "").split(/\s+/).filter(Boolean).flatMap((word) => breakWord(word, max)).forEach((word) => {
      const next = line ? line + " " + word : word;
      if (next.length > max && line) {
        lines.push(line);
        line = word;
      } else {
        line = next;
      }
    });
    if (line) lines.push(line);
    return lines.length ? lines : [""];
  }

  function breakWord(word, max) {
    if (word.length <= max) return [word];
    const parts = [];
    for (let i = 0; i < word.length; i += max - 1) parts.push(word.slice(i, i + max - 1) + (i + max - 1 < word.length ? "-" : ""));
    return parts;
  }

  function rootWeight(name) {
    return { Query: 0, Mutation: 1, Subscription: 2 }[name] ?? 10;
  }

  function kindWeight(kind) {
    return { OBJECT: 0, INTERFACE: 1, INPUT_OBJECT: 2, INPUT: 2, UNION: 3, ENUM: 4, SCALAR: 5 }[kind] ?? 6;
  }

  function readableKind(kind) {
    return { OBJECT: "object", INTERFACE: "interface", INPUT_OBJECT: "input", INPUT: "input", ENUM: "enum", UNION: "union", SCALAR: "scalar" }[kind] || String(kind).toLowerCase();
  }

  function shortType(type) {
    const text = String(type);
    return text.length > 22 ? text.slice(0, 19) + "..." : text;
  }

  function toDot(graph) {
    return ["digraph GraphQLSchema {", "  graph [rankdir=LR];", "  node [shape=record, style=rounded];"]
      .concat(graph.nodes.map((node) => `  "${escapeDot(node.id)}" [label="{${escapeDot(node.name)}|${escapeDot(readableKind(node.kind))}}"];`))
      .concat(graph.edges.map((item) => `  "${escapeDot(item.source)}" -> "${escapeDot(item.target)}" [label="${escapeDot(item.label)}"];`))
      .concat("}")
      .join("\n");
  }

  function exportPng() {
    const image = new Image();
    const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(el.svg)], { type: "image/svg+xml;charset=utf-8" }));
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1200, el.svg.clientWidth * 2);
      canvas.height = Math.max(800, el.svg.clientHeight * 2);
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      canvas.toBlob((blob) => downloadBlob("schema.png", blob), "image/png");
    };
    image.src = url;
  }

  function downloadText(name, content) {
    downloadBlob(name, new Blob([content], { type: "text/plain;charset=utf-8" }));
  }

  function downloadBlob(name, blob) {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/`/g, "&#096;");
  }

  function escapeDot(value) {
    return String(value || "").replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
  }

  init();
})();
