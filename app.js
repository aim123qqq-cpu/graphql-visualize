(function () {
  "use strict";

  const sampleSchema = `schema {
  query: Query
  mutation: Mutation
}

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

enum Role {
  STUDENT
  TEACHER
  ADMIN
}`;

  const introspectionQuery = `{
    __schema {
      types {
        kind
        name
        description
        fields(includeDeprecated: true) {
          name
          description
          type { kind name ofType { kind name ofType { kind name ofType { kind name } } } }
          args { name type { kind name ofType { kind name ofType { kind name } } } }
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
    nodePositions: {},
    renderFrame: 0,
    selected: null,
    search: ""
  };

  const el = {
    schemaInput: document.getElementById("schemaInput"),
    buildBtn: document.getElementById("buildBtn"),
    sampleBtn: document.getElementById("sampleBtn"),
    clearBtn: document.getElementById("clearBtn"),
    fileInput: document.getElementById("fileInput"),
    fileName: document.getElementById("fileName"),
    endpointInput: document.getElementById("endpointInput"),
    authInput: document.getElementById("authInput"),
    loadEndpointBtn: document.getElementById("loadEndpointBtn"),
    accentInput: document.getElementById("accentInput"),
    densityInput: document.getElementById("densityInput"),
    showScalars: document.getElementById("showScalars"),
    showBuiltins: document.getElementById("showBuiltins"),
    searchInput: document.getElementById("searchInput"),
    graphSvg: document.getElementById("graphSvg"),
    emptyState: document.getElementById("emptyState"),
    stats: document.getElementById("stats"),
    details: document.getElementById("details"),
    warnings: document.getElementById("warnings"),
    exportDotBtn: document.getElementById("exportDotBtn"),
    exportSvgBtn: document.getElementById("exportSvgBtn"),
    exportPngBtn: document.getElementById("exportPngBtn")
  };

  function init() {
    el.schemaInput.value = sampleSchema;
    bindEvents();
    buildGraph();
  }

  function bindEvents() {
    document.querySelectorAll(".tab").forEach((button) => {
      button.addEventListener("click", () => activateTab(button.dataset.tab));
    });
    document.querySelectorAll(".mode").forEach((button) => {
      button.addEventListener("click", () => {
        state.mode = button.dataset.mode;
        document.querySelectorAll(".mode").forEach((item) => item.classList.toggle("active", item === button));
        render();
      });
    });
    el.buildBtn.addEventListener("click", buildGraph);
    el.sampleBtn.addEventListener("click", () => {
      el.schemaInput.value = sampleSchema;
      buildGraph();
    });
    el.clearBtn.addEventListener("click", () => {
      el.schemaInput.value = "";
      state.graph = { nodes: [], edges: [], warnings: [] };
      state.nodePositions = {};
      state.selected = null;
      render();
    });
    el.fileInput.addEventListener("change", loadFile);
    el.loadEndpointBtn.addEventListener("click", loadEndpoint);
    el.accentInput.addEventListener("input", () => {
      document.documentElement.style.setProperty("--accent", el.accentInput.value);
      render();
    });
    el.densityInput.addEventListener("input", render);
    el.showScalars.addEventListener("change", render);
    el.showBuiltins.addEventListener("change", render);
    el.searchInput.addEventListener("input", () => {
      state.search = el.searchInput.value.trim().toLowerCase();
      render();
    });
    el.exportDotBtn.addEventListener("click", () => downloadText("schema.dot", toDot(state.graph)));
    el.exportSvgBtn.addEventListener("click", exportSvg);
    el.exportPngBtn.addEventListener("click", exportPng);
    bindPanZoom();
  }

  function activateTab(name) {
    document.querySelectorAll(".tab").forEach((button) => button.classList.toggle("active", button.dataset.tab === name));
    document.querySelectorAll(".tab-page").forEach((page) => page.classList.remove("active"));
    document.getElementById(name + "Page").classList.add("active");
  }

  function loadFile(event) {
    const file = event.target.files[0];
    if (!file) return;
    el.fileName.textContent = file.name;
    const reader = new FileReader();
    reader.onload = () => {
      el.schemaInput.value = String(reader.result || "");
      activateTab("schema");
      buildGraph();
    };
    reader.readAsText(file);
  }

  async function loadEndpoint() {
    const url = el.endpointInput.value.trim();
    if (!url) {
      showWarnings(["Укажите URL GraphQL сервера."]);
      return;
    }
    el.loadEndpointBtn.disabled = true;
    el.loadEndpointBtn.textContent = "Загружаю...";
    try {
      const headers = { "Content-Type": "application/json" };
      const auth = el.authInput.value.trim();
      if (auth) headers.Authorization = auth;
      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({ query: introspectionQuery })
      });
      if (!response.ok) throw new Error("HTTP " + response.status);
      const json = await response.json();
      el.schemaInput.value = JSON.stringify(json, null, 2);
      activateTab("schema");
      buildGraph();
    } catch (error) {
      showWarnings(["Не удалось загрузить endpoint: " + error.message, "Частая причина: сервер не разрешает CORS для браузера."]);
    } finally {
      el.loadEndpointBtn.disabled = false;
      el.loadEndpointBtn.textContent = "Загрузить introspection";
    }
  }

  function buildGraph() {
    const raw = el.schemaInput.value.trim();
    if (!raw) {
      state.graph = { nodes: [], edges: [], warnings: ["Вставьте схему или JSON introspection."] };
      render();
      return;
    }
    try {
      state.graph = raw[0] === "{" ? parseIntrospection(JSON.parse(raw)) : parseSdl(raw);
      state.nodePositions = {};
      state.selected = null;
      state.zoom = 1;
      state.pan = { x: 40, y: 40 };
    } catch (error) {
      state.graph = { nodes: [], edges: [], warnings: ["Ошибка разбора схемы: " + error.message] };
    }
    render();
  }

  function parseSdl(raw) {
    const text = raw
      .replace(/#[^\n\r]*/g, "")
      .replace(/"""[\s\S]*?"""/g, "")
      .replace(/'[\s\S]*?'/g, "");
    const nodes = new Map();
    const edges = [];
    const warnings = [];
    const definitions = /(?:extend\s+)?(type|interface|input|enum)\s+([_A-Za-z][_0-9A-Za-z]*)[^{]*\{([\s\S]*?)\}|(?:extend\s+)?union\s+([_A-Za-z][_0-9A-Za-z]*)\s*=\s*([^\n\r]+)|scalar\s+([_A-Za-z][_0-9A-Za-z]*)/g;
    let match;

    while ((match = definitions.exec(text))) {
      const kind = match[1] ? match[1].toUpperCase() : match[4] ? "UNION" : "SCALAR";
      const name = match[2] || match[4] || match[6];
      const body = match[3] || "";
      const unionBody = match[5] || "";
      const node = ensureNode(nodes, name, kind);

      if (kind === "UNION") {
        unionBody.split("|").map((item) => item.trim()).filter(Boolean).forEach((target) => {
          node.fields.push({ name: target, type: target });
          edges.push(makeEdge(name, target, "union"));
        });
      } else if (kind !== "SCALAR" && kind !== "ENUM") {
        parseFields(body).forEach((field) => {
          node.fields.push(field);
          const target = unwrapType(field.type);
          if (target && target !== name) edges.push(makeEdge(name, target, field.name));
        });
      } else if (kind === "ENUM") {
        node.fields = body.split(/\s+/).map((value) => value.trim()).filter(Boolean).map((value) => ({ name: value, type: "enum value" }));
      }
    }

    edges.forEach((edge) => {
      if (!nodes.has(edge.target)) ensureNode(nodes, edge.target, guessKind(edge.target));
    });

    addWarnings(nodes, edges, warnings);
    return { nodes: Array.from(nodes.values()), edges: uniqueEdges(edges), warnings };
  }

  function parseFields(body) {
    return body
      .split(/\n|;/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("}"))
      .map((line) => line.replace(/\s+/g, " "))
      .map((line) => {
        const cleaned = line.replace(/@[_A-Za-z][_0-9A-Za-z]*(\([^)]*\))?/g, "").trim();
        const nameMatch = cleaned.match(/^([_A-Za-z][_0-9A-Za-z]*)\s*(?:\([^)]*\))?\s*:\s*([^=]+)(?:=.*)?$/);
        if (!nameMatch) return null;
        return { name: nameMatch[1], type: nameMatch[2].trim() };
      })
      .filter(Boolean);
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
      const fields = type.fields || type.inputFields || [];
      fields.forEach((field) => {
        const typeName = typeRefName(field.type);
        const typeText = typeRefText(field.type);
        node.fields.push({ name: field.name, type: typeText });
        if (typeName && typeName !== type.name) edges.push(makeEdge(type.name, typeName, field.name));
      });
      (type.enumValues || []).forEach((value) => node.fields.push({ name: value.name, type: "enum value" }));
      (type.interfaces || []).forEach((iface) => edges.push(makeEdge(type.name, iface.name, "implements")));
      (type.possibleTypes || []).forEach((possible) => edges.push(makeEdge(type.name, possible.name, "possible")));
    });

    addWarnings(nodes, edges, warnings);
    return { nodes: Array.from(nodes.values()), edges: uniqueEdges(edges), warnings };
  }

  function ensureNode(map, name, kind) {
    if (!map.has(name)) {
      map.set(name, { id: name, name, kind, fields: [], description: "" });
    }
    return map.get(name);
  }

  function makeEdge(source, target, label) {
    return { id: source + "->" + target + ":" + label, source, target, label };
  }

  function uniqueEdges(edges) {
    const seen = new Set();
    return edges.filter((edge) => {
      const key = edge.source + "|" + edge.target + "|" + edge.label;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function guessKind(name) {
    return ["String", "Int", "Float", "Boolean", "ID"].includes(name) ? "SCALAR" : "OBJECT";
  }

  function unwrapType(type) {
    return String(type).replace(/[![\]\s]/g, "").split("|")[0];
  }

  function typeRefName(ref) {
    let current = ref;
    while (current) {
      if (current.name) return current.name;
      current = current.ofType;
    }
    return "";
  }

  function typeRefText(ref) {
    if (!ref) return "";
    if (ref.kind === "NON_NULL") return typeRefText(ref.ofType) + "!";
    if (ref.kind === "LIST") return "[" + typeRefText(ref.ofType) + "]";
    return ref.name || ref.kind || "";
  }

  function addWarnings(nodes, edges, warnings) {
    const names = new Set(nodes.keys());
    edges.forEach((edge) => {
      if (!names.has(edge.target)) warnings.push("Тип " + edge.target + " используется, но не объявлен явно.");
    });
    if (!names.has("Query")) warnings.push("Тип Query не найден. Для GraphQL API он обычно обязателен.");
    const isolated = Array.from(nodes.values()).filter((node) => {
      if (isBuiltin(node.name)) return false;
      return !edges.some((edge) => edge.source === node.name || edge.target === node.name);
    });
    if (isolated.length) warnings.push("Изолированные типы: " + isolated.map((node) => node.name).join(", ") + ".");
    if (!warnings.length) warnings.push("Критичных проблем не найдено.");
  }

  function visibleGraph() {
    const showScalars = el.showScalars.checked;
    const showBuiltins = el.showBuiltins.checked;
    const allowed = new Set();
    state.graph.nodes.forEach((node) => {
      if (!showBuiltins && isBuiltin(node.name)) return;
      if (!showScalars && ["SCALAR", "ENUM"].includes(node.kind)) return;
      allowed.add(node.id);
    });
    let edges = state.graph.edges.filter((edge) => allowed.has(edge.source) && allowed.has(edge.target));
    if (state.mode === "types") {
      edges = uniqueEdges(edges.map((edge) => makeEdge(edge.source, edge.target, "")));
    } else if (state.mode === "fields") {
      edges = edges.filter((edge) => edge.label);
    }
    const nodes = state.graph.nodes.filter((node) => allowed.has(node.id));
    return layout(nodes, edges);
  }

  function isBuiltin(name) {
    return ["String", "Int", "Float", "Boolean", "ID"].includes(name) || String(name).startsWith("__");
  }

  function layout(nodes, edges) {
    const density = Number(el.densityInput.value) / 100;
    const metrics = new Map(nodes.map((node) => [node.id, nodeMetrics(node)]));
    const indegree = new Map(nodes.map((node) => [node.id, 0]));
    const outgoing = new Map(nodes.map((node) => [node.id, []]));

    edges.forEach((edge) => {
      if (!indegree.has(edge.source) || !indegree.has(edge.target)) return;
      indegree.set(edge.target, indegree.get(edge.target) + 1);
      outgoing.get(edge.source).push(edge.target);
    });

    const levels = assignLevels(nodes, indegree, outgoing);
    const byLevel = new Map();
    nodes.forEach((node) => {
      const level = levels.get(node.id) || 0;
      if (!byLevel.has(level)) byLevel.set(level, []);
      byLevel.get(level).push(node);
    });

    const positioned = [];
    Array.from(byLevel.keys()).sort((a, b) => a - b).forEach((level) => {
      const list = byLevel.get(level).sort((a, b) => {
        const kindCompare = kindWeight(a.kind) - kindWeight(b.kind);
        return kindCompare || a.name.localeCompare(b.name);
      });
      let y = 0;
      list.forEach((node) => {
        const metric = metrics.get(node.id);
        const saved = state.nodePositions[node.id];
        const x = saved ? saved.x : level * 300 * density;
        const nextY = saved ? saved.y : y;
        positioned.push({ ...node, ...metric, x, y: nextY });
        y += metric.height + 34 * density;
      });
    });
    return { nodes: positioned, edges };
  }

  function assignLevels(nodes, indegree, outgoing) {
    const levels = new Map();
    const queue = nodes
      .filter((node) => node.name === "Query" || node.name === "Mutation" || node.name === "Subscription" || indegree.get(node.id) === 0)
      .sort((a, b) => rootWeight(a.name) - rootWeight(b.name) || a.name.localeCompare(b.name));

    queue.forEach((node) => levels.set(node.id, 0));
    for (let index = 0; index < queue.length; index += 1) {
      const node = queue[index];
      const nextLevel = (levels.get(node.id) || 0) + 1;
      (outgoing.get(node.id) || []).forEach((targetId) => {
        if (!levels.has(targetId) || nextLevel < levels.get(targetId)) {
          levels.set(targetId, nextLevel);
          const target = nodes.find((item) => item.id === targetId);
          if (target && !queue.includes(target)) queue.push(target);
        }
      });
    }
    nodes.forEach((node) => {
      if (!levels.has(node.id)) levels.set(node.id, kindWeight(node.kind) > 3 ? 2 : 1);
    });
    return levels;
  }

  function rootWeight(name) {
    const order = { Query: 0, Mutation: 1, Subscription: 2 };
    return Object.prototype.hasOwnProperty.call(order, name) ? order[name] : 10;
  }

  function kindWeight(kind) {
    const order = { OBJECT: 0, INTERFACE: 1, INPUT_OBJECT: 2, INPUT: 2, UNION: 3, ENUM: 4, SCALAR: 5 };
    return Object.prototype.hasOwnProperty.call(order, kind) ? order[kind] : 6;
  }

  function nodeMetrics(node) {
    const width = 232;
    const titleLines = wrapText(node.name, 24);
    const kindLines = [readableKind(node.kind)];
    const fieldRows = node.fields.slice(0, 7).flatMap((field) => wrapText(field.name + ": " + shortType(field.type), 28));
    const moreRows = node.fields.length > 7 ? ["+ еще " + (node.fields.length - 7)] : [];
    const rows = { titleLines, kindLines, fieldRows, moreRows };
    const height = Math.max(88, 22 + titleLines.length * 16 + kindLines.length * 16 + fieldRows.length * 17 + moreRows.length * 17);
    return { width, height, rows };
  }

  function render() {
    state.renderFrame = 0;
    const graph = visibleGraph();
    renderStats(graph);
    renderWarnings(state.graph.warnings);
    renderDetails();
    renderSvg(graph);
  }

  function scheduleRender() {
    if (state.renderFrame) return;
    state.renderFrame = window.requestAnimationFrame(render);
  }

  function renderStats(graph) {
    const fieldCount = graph.nodes.reduce((sum, node) => sum + node.fields.length, 0);
    el.stats.innerHTML = `
      <div><strong>${graph.nodes.length}</strong><span>типов</span></div>
      <div><strong>${graph.edges.length}</strong><span>связей</span></div>
      <div><strong>${fieldCount}</strong><span>полей</span></div>`;
  }

  function renderWarnings(warnings) {
    showWarnings(warnings);
  }

  function showWarnings(warnings) {
    el.warnings.innerHTML = warnings.map((item) => {
      const bad = item.includes("Ошибка") || item.includes("не ") || item.includes("Не ");
      return `<li class="${bad ? "bad" : ""}">${escapeHtml(item)}</li>`;
    }).join("");
  }

  function renderDetails() {
    if (!state.selected) {
      el.details.innerHTML = `<p class="muted">Выберите узел или связь на графе.</p>`;
      return;
    }
    if (state.selected.type === "edge") {
      const edge = state.selected.data;
      el.details.innerHTML = `
        <div class="detail-card">
          <h3>${escapeHtml(edge.source)} -> ${escapeHtml(edge.target)}</h3>
          <p class="muted">Связь через поле: ${escapeHtml(edge.label || "тип")}</p>
        </div>`;
      return;
    }
    const node = state.selected.data;
    el.details.innerHTML = `
      <div class="detail-card">
        <h3>${escapeHtml(node.name)}</h3>
        <p class="muted">${escapeHtml(readableKind(node.kind))}</p>
        ${node.description ? `<p>${escapeHtml(node.description)}</p>` : ""}
        <ul class="field-list">
          ${node.fields.slice(0, 40).map((field) => `<li><strong>${escapeHtml(field.name)}</strong>: ${escapeHtml(field.type)}</li>`).join("")}
        </ul>
      </div>`;
  }

  function renderSvg(graph) {
    el.emptyState.classList.toggle("hidden", graph.nodes.length > 0);
    const svg = el.graphSvg;
    const maxX = Math.max(800, ...graph.nodes.map((node) => node.x + node.width + 80));
    const maxY = Math.max(520, ...graph.nodes.map((node) => node.y + node.height + 80));
    svg.setAttribute("viewBox", `0 0 ${Math.max(800, svg.clientWidth)} ${Math.max(520, svg.clientHeight)}`);
    const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
    const search = state.search;
    const highlightIds = new Set();
    if (search) {
      graph.nodes.forEach((node) => {
        const haystack = [node.name, node.kind, ...node.fields.map((field) => field.name + " " + field.type)].join(" ").toLowerCase();
        if (haystack.includes(search)) highlightIds.add(node.id);
      });
    }

    const edgeMarkup = graph.edges.map((edge) => {
      const source = nodeById.get(edge.source);
      const target = nodeById.get(edge.target);
      if (!source || !target) return "";
      const anchors = edgeAnchors(source, target);
      const mid = Math.max(44, Math.abs(anchors.tx - anchors.sx) / 2);
      const d = `M ${anchors.sx} ${anchors.sy} C ${anchors.sx + mid} ${anchors.sy}, ${anchors.tx - mid} ${anchors.ty}, ${anchors.tx} ${anchors.ty}`;
      const selected = state.selected && state.selected.type === "edge" && state.selected.data.id === edge.id;
      const highlighted = highlightIds.has(edge.source) || highlightIds.has(edge.target);
      return `<g class="edge-group ${selected ? "selected" : ""}" data-edge="${escapeAttr(edge.id)}">
        <path class="edge ${selected ? "selected" : ""} ${highlighted ? "highlight" : ""}" d="${d}"></path>
        ${edge.label ? `<text class="edge-label" x="${(anchors.sx + anchors.tx) / 2}" y="${(anchors.sy + anchors.ty) / 2 - 8}">${escapeHtml(edge.label)}</text>` : ""}
      </g>`;
    }).join("");

    const nodeMarkup = graph.nodes.map((node) => {
      const selected = state.selected && state.selected.type === "node" && state.selected.data.id === node.id;
      const highlighted = highlightIds.has(node.id);
      const title = renderTextLines(node.rows.titleLines, 12, 24, "title");
      const kind = renderTextLines(node.rows.kindLines, 12, 24 + node.rows.titleLines.length * 16, "kind");
      const fieldStart = 48 + node.rows.titleLines.length * 16;
      const fields = renderTextLines(node.rows.fieldRows, 12, fieldStart, "field");
      const moreY = fieldStart + node.rows.fieldRows.length * 17;
      const more = renderTextLines(node.rows.moreRows, 12, moreY, "kind");
      return `<g class="node ${selected ? "selected" : ""} ${highlighted ? "highlight" : ""}" data-node="${escapeAttr(node.id)}" data-x="${node.x}" data-y="${node.y}" transform="translate(${node.x}, ${node.y})">
        <rect width="${node.width}" height="${node.height}" rx="8"></rect>
        ${title}
        ${kind}
        ${fields}${more}
      </g>`;
    }).join("");

    svg.innerHTML = `
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#8a94a6"></path>
        </marker>
      </defs>
      <g transform="translate(${state.pan.x}, ${state.pan.y}) scale(${state.zoom})">
        <rect x="-40" y="-40" width="${maxX + 80}" height="${maxY + 80}" fill="transparent"></rect>
        ${edgeMarkup}
        ${nodeMarkup}
      </g>`;

    svg.querySelectorAll("[data-node]").forEach((nodeEl) => {
      nodeEl.addEventListener("click", (event) => {
        event.stopPropagation();
        const node = graph.nodes.find((item) => item.id === nodeEl.dataset.node);
        state.selected = { type: "node", data: node };
        render();
      });
    });
    svg.querySelectorAll("[data-edge]").forEach((edgeEl) => {
      edgeEl.addEventListener("click", (event) => {
        event.stopPropagation();
        const edge = graph.edges.find((item) => item.id === edgeEl.dataset.edge);
        state.selected = { type: "edge", data: edge };
        render();
      });
    });
    svg.onclick = () => {
      state.selected = null;
      render();
    };
  }

  function edgeAnchors(source, target) {
    const sourceCenterX = source.x + source.width / 2;
    const targetCenterX = target.x + target.width / 2;
    const sourceCenterY = source.y + source.height / 2;
    const targetCenterY = target.y + target.height / 2;
    if (sourceCenterX <= targetCenterX) {
      return {
        sx: source.x + source.width,
        sy: sourceCenterY,
        tx: target.x,
        ty: targetCenterY
      };
    }
    return {
      sx: source.x,
      sy: sourceCenterY,
      tx: target.x + target.width,
      ty: targetCenterY
    };
  }

  function renderTextLines(lines, x, y, className) {
    return lines.map((line, index) => {
      const classAttr = className ? ` class="${className}"` : "";
      const weight = className === "title" ? ` font-weight="700"` : "";
      const dy = className === "field" ? 17 : 16;
      return `<text${classAttr}${weight} x="${x}" y="${y + index * dy}">${escapeHtml(line)}</text>`;
    }).join("");
  }

  function wrapText(value, maxChars) {
    const words = String(value || "").split(/\s+/).filter(Boolean);
    const lines = [];
    let line = "";

    words.forEach((word) => {
      const parts = breakLongWord(word, maxChars);
      parts.forEach((part) => {
        const next = line ? line + " " + part : part;
        if (next.length > maxChars && line) {
          lines.push(line);
          line = part;
        } else {
          line = next;
        }
      });
    });
    if (line) lines.push(line);
    return lines.length ? lines : [""];
  }

  function breakLongWord(word, maxChars) {
    if (word.length <= maxChars) return [word];
    const chunks = [];
    for (let index = 0; index < word.length; index += maxChars - 1) {
      const part = word.slice(index, index + maxChars - 1);
      chunks.push(index + maxChars - 1 < word.length ? part + "-" : part);
    }
    return chunks;
  }

  function svgPoint(event) {
    const rect = el.graphSvg.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left - state.pan.x) / state.zoom,
      y: (event.clientY - rect.top - state.pan.y) / state.zoom
    };
  }

  function bindPanZoom() {
    let draggingCanvas = false;
    let draggingNode = null;
    let last = { x: 0, y: 0 };
    el.graphSvg.addEventListener("mousedown", (event) => {
      const nodeEl = event.target.closest("[data-node]");
      if (nodeEl) {
        const point = svgPoint(event);
        const current = state.nodePositions[nodeEl.dataset.node] || {
          x: Number(nodeEl.dataset.x) || 0,
          y: Number(nodeEl.dataset.y) || 0
        };
        draggingNode = {
          id: nodeEl.dataset.node,
          offsetX: point.x - current.x,
          offsetY: point.y - current.y
        };
        event.stopPropagation();
        return;
      }
      draggingCanvas = true;
      last = { x: event.clientX, y: event.clientY };
    });
    window.addEventListener("mousemove", (event) => {
      if (draggingNode) {
        const point = svgPoint(event);
        state.nodePositions[draggingNode.id] = {
          x: point.x - draggingNode.offsetX,
          y: point.y - draggingNode.offsetY
        };
        scheduleRender();
        return;
      }
      if (!draggingCanvas) return;
      state.pan.x += event.clientX - last.x;
      state.pan.y += event.clientY - last.y;
      last = { x: event.clientX, y: event.clientY };
      scheduleRender();
    });
    window.addEventListener("mouseup", () => {
      draggingCanvas = false;
      draggingNode = null;
    });
    el.graphSvg.addEventListener("wheel", (event) => {
      event.preventDefault();
      const factor = event.deltaY > 0 ? 0.9 : 1.1;
      state.zoom = Math.min(2.4, Math.max(0.35, state.zoom * factor));
      scheduleRender();
    }, { passive: false });
  }

  function readableKind(kind) {
    const map = {
      OBJECT: "object",
      INTERFACE: "interface",
      INPUT_OBJECT: "input",
      INPUT: "input",
      ENUM: "enum",
      UNION: "union",
      SCALAR: "scalar"
    };
    return map[kind] || String(kind).toLowerCase();
  }

  function shortType(type) {
    const text = String(type);
    return text.length > 22 ? text.slice(0, 19) + "..." : text;
  }

  function toDot(graph) {
    const lines = ["digraph GraphQLSchema {", "  graph [rankdir=LR];", "  node [shape=record, style=rounded];"];
    graph.nodes.forEach((node) => {
      lines.push(`  "${escapeDot(node.id)}" [label="{${escapeDot(node.name)}|${escapeDot(readableKind(node.kind))}}"];
`);
    });
    graph.edges.forEach((edge) => {
      lines.push(`  "${escapeDot(edge.source)}" -> "${escapeDot(edge.target)}" [label="${escapeDot(edge.label)}"];
`);
    });
    lines.push("}");
    return lines.join("\n");
  }

  function exportSvg() {
    const content = `<?xml version="1.0" encoding="UTF-8"?>\n${el.graphSvg.outerHTML}`;
    downloadText("schema.svg", content);
  }

  function exportPng() {
    const serialized = new XMLSerializer().serializeToString(el.graphSvg);
    const image = new Image();
    const blob = new Blob([serialized], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1200, el.graphSvg.clientWidth * 2);
      canvas.height = Math.max(800, el.graphSvg.clientHeight * 2);
      const context = canvas.getContext("2d");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      canvas.toBlob((png) => downloadBlob("schema.png", png), "image/png");
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
    return String(value).replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[char]));
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/`/g, "&#096;");
  }

  function escapeDot(value) {
    return String(value || "").replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
  }

  init();
})();
