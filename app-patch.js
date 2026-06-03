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

  const state = {
    graph: { nodes: [], edges: [] },
    pan: { x: 40, y: 40 },
    zoom: 1,
    positions: {},
    selected: "",
    selectedEdge: "",
    fit: true
  };

  const $ = (id) => document.getElementById(id);
  const builtins = new Set(["String", "Int", "Float", "Boolean", "ID"]);

  function init() {
    const build = $("buildBtn");
    const sampleBtn = $("sampleBtn");
    const optimize = $("optimizeBtn");
    const file = $("fileInput");
    const density = $("densityInput");
    const search = $("searchInput");
    const modeButtons = document.querySelectorAll(".mode");
    if (build) build.onclick = buildGraph;
    if (sampleBtn) sampleBtn.onclick = () => {
      $("schemaInput").value = sample;
      buildGraph();
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
    modeButtons.forEach((button) => {
      button.onclick = () => {
        modeButtons.forEach((item) => item.classList.toggle("active", item === button));
        state.positions = {};
        state.fit = true;
        render();
      };
    });
    buildGraph();
  }

  function loadFile(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      $("schemaInput").value = String(reader.result || "");
      buildGraph();
    };
    reader.readAsText(file);
  }

  function buildGraph() {
    const raw = ($("schemaInput")?.value || "").trim();
    if (!raw) return;
    try {
      state.graph = raw[0] === "{" ? parseIntrospection(JSON.parse(raw)) : parseSdl(raw);
      state.positions = {};
      state.selected = "";
      state.selectedEdge = "";
      state.fit = true;
      render();
    } catch (error) {
      warn(["Parse error: " + error.message]);
    }
  }

  function parseSdl(raw) {
    const text = raw.replace(/#[^\n\r]*/g, "").replace(/"""[\s\S]*?"""/g, "");
    const nodes = new Map();
    const edges = [];
    const defs = /(?:extend\s+)?(type|interface|input|enum)\s+([_A-Za-z][_0-9A-Za-z]*)[^{]*\{([\s\S]*?)\}|(?:extend\s+)?union\s+([_A-Za-z][_0-9A-Za-z]*)\s*=\s*([^\n\r]+)|scalar\s+([_A-Za-z][_0-9A-Za-z]*)/g;
    let match;
    while ((match = defs.exec(text))) {
      const kind = match[1] ? match[1].toUpperCase() : match[4] ? "UNION" : "SCALAR";
      const name = match[2] || match[4] || match[6];
      const node = ensure(nodes, name, kind);
      if (kind === "UNION") {
        match[5].split("|").map((item) => item.trim()).filter(Boolean).forEach((target) => {
          node.fields.push({ name: target, type: target });
          edges.push(edge(name, target, "union"));
        });
      } else if (kind === "ENUM") {
        node.fields = match[3].split(/\s+/).filter(Boolean).map((item) => ({ name: item, type: "enum value" }));
      } else if (kind !== "SCALAR") {
        fields(match[3]).forEach((field) => {
          node.fields.push(field);
          const target = unwrap(field.type);
          if (target && target !== name) edges.push(edge(name, target, field.name));
        });
      }
    }
    edges.forEach((item) => {
      if (!nodes.has(item.target)) ensure(nodes, item.target, builtins.has(item.target) ? "SCALAR" : "OBJECT");
    });
    return { nodes: [...nodes.values()], edges: unique(edges) };
  }

  function parseIntrospection(json) {
    const schema = json.data?.__schema || json.__schema || json;
    if (!schema.types) throw new Error("No __schema.types found");
    const nodes = new Map();
    const edges = [];
    schema.types.forEach((type) => {
      if (!type || !type.name || type.name.startsWith("__")) return;
      const node = ensure(nodes, type.name, type.kind);
      (type.fields || type.inputFields || []).forEach((field) => {
        const target = typeName(field.type);
        const text = typeText(field.type);
        node.fields.push({ name: field.name, type: text });
        if (target && target !== type.name) edges.push(edge(type.name, target, field.name));
      });
      (type.enumValues || []).forEach((value) => node.fields.push({ name: value.name, type: "enum value" }));
    });
    return { nodes: [...nodes.values()], edges: unique(edges) };
  }

  function fields(body) {
    return body.split(/\n|;/).map((line) => line.trim()).filter(Boolean).map((line) => {
      const clean = line.replace(/@[_A-Za-z][_0-9A-Za-z]*(\([^)]*\))?/g, "").replace(/\s+/g, " ");
      const match = clean.match(/^([_A-Za-z][_0-9A-Za-z]*)\s*(?:\([^)]*\))?\s*:\s*([^=]+)(?:=.*)?$/);
      return match ? { name: match[1], type: match[2].trim() } : null;
    }).filter(Boolean);
  }

  function ensure(map, name, kind) {
    if (!map.has(name)) map.set(name, { id: name, name, kind, fields: [] });
    return map.get(name);
  }

  function edge(source, target, label) {
    return { id: source + "->" + target + ":" + label, source, target, label };
  }

  function unique(edges) {
    const seen = new Set();
    return edges.filter((item) => {
      const key = item.source + "|" + item.target + "|" + item.label;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function layout() {
    const mode = document.querySelector(".mode.active")?.dataset.mode || "types";
    const showScalars = $("showScalars")?.checked !== false;
    const showBuiltins = $("showBuiltins")?.checked === true;
    const allowed = new Set();
    state.graph.nodes.forEach((node) => {
      if (!showBuiltins && builtins.has(node.name)) return;
      if (!showScalars && ["SCALAR", "ENUM"].includes(node.kind)) return;
      allowed.add(node.id);
    });
    let edges = state.graph.edges.filter((item) => allowed.has(item.source) && allowed.has(item.target));
    if (mode === "types") edges = uniquePairs(edges);
    const nodes = state.graph.nodes.filter((node) => allowed.has(node.id)).map(metric);
    const levels = levelsFor(nodes, edges);
    const columns = new Map();
    nodes.forEach((node) => {
      const level = levels.get(node.id) || 0;
      if (!columns.has(level)) columns.set(level, []);
      columns.get(level).push(node);
    });
    sortColumns(columns, edges, levels);
    const density = Number($("densityInput")?.value || 100) / 100;
    let x = 70;
    const placed = [];
    [...columns.keys()].sort((a, b) => a - b).forEach((level) => {
      const items = columns.get(level);
      const maxWidth = Math.max(...items.map((node) => node.width));
      let y = 70;
      items.forEach((node) => {
        const saved = state.positions[node.id];
        placed.push({ ...node, x: saved ? saved.x : x, y: saved ? saved.y : y });
        y += node.height + 62 * density;
      });
      x += maxWidth + 170 * density;
    });
    return { nodes: placed, edges };
  }

  function uniquePairs(edges) {
    const seen = new Set();
    return edges.filter((item) => {
      const key = item.source + "|" + item.target;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function levelsFor(nodes, edges) {
    const ids = new Set(nodes.map((node) => node.id));
    const out = new Map(nodes.map((node) => [node.id, []]));
    const inc = new Map(nodes.map((node) => [node.id, []]));
    edges.forEach((item) => {
      if (!ids.has(item.source) || !ids.has(item.target)) return;
      out.get(item.source).push(item.target);
      inc.get(item.target).push(item.source);
    });
    const roots = nodes.filter((node) => ["Query", "Mutation", "Subscription"].includes(node.name));
    if (!roots.length && nodes.length) roots.push(nodes[0]);
    const levels = new Map();
    const queue = [];
    roots.forEach((node) => {
      levels.set(node.id, 0);
      queue.push(node.id);
    });
    for (let i = 0; i < queue.length; i += 1) {
      const id = queue[i];
      out.get(id).forEach((target) => {
        const next = (levels.get(id) || 0) + 1;
        if (!levels.has(target) || next < levels.get(target)) {
          levels.set(target, next);
          queue.push(target);
        }
      });
    }
    nodes.forEach((node) => {
      if (levels.has(node.id)) return;
      const parents = inc.get(node.id).filter((id) => levels.has(id));
      levels.set(node.id, parents.length ? Math.max(...parents.map((id) => levels.get(id))) + 1 : 0);
    });
    return levels;
  }

  function sortColumns(columns, edges, levels) {
    const order = new Map();
    [...columns.keys()].sort((a, b) => a - b).forEach((level) => {
      columns.get(level).sort((a, b) => rootWeight(a.name) - rootWeight(b.name) || a.name.localeCompare(b.name));
      columns.get(level).forEach((node, index) => order.set(node.id, index));
    });
    for (let pass = 0; pass < 5; pass += 1) {
      [...columns.keys()].sort((a, b) => a - b).forEach((level) => {
        columns.get(level).sort((a, b) => bary(a.id, edges, levels, order) - bary(b.id, edges, levels, order) || a.name.localeCompare(b.name));
        columns.get(level).forEach((node, index) => order.set(node.id, index));
      });
    }
  }

  function bary(id, edges, levels, order) {
    const level = levels.get(id) || 0;
    const linked = edges.filter((item) => item.source === id || item.target === id)
      .map((item) => item.source === id ? item.target : item.source)
      .filter((item) => order.has(item) && Math.abs((levels.get(item) || 0) - level) <= 1);
    return linked.length ? linked.reduce((sum, item) => sum + order.get(item), 0) / linked.length : order.get(id) || 0;
  }

  function metric(node) {
    const rows = node.fields.slice(0, 10).map((field, index) => ({
      field,
      y: 58 + index * 24,
      type: short(field.type)
    }));
    return { ...node, width: 320, height: Math.max(86, 58 + rows.length * 24 + 16), rows };
  }

  function render() {
    const graph = layout();
    const svg = $("graphSvg");
    if (!svg) return;
    $("emptyState")?.classList.toggle("hidden", graph.nodes.length > 0);
    stats(graph);
    if (state.fit) {
      fit(graph);
      state.fit = false;
    }
    const byId = new Map(graph.nodes.map((node) => [node.id, node]));
    const groups = new Map();
    graph.edges.forEach((item) => {
      const key = item.source < item.target ? item.source + "|" + item.target : item.target + "|" + item.source;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item.id);
    });
    const edgeSvg = graph.edges.map((item) => drawEdge(item, byId, groups)).join("");
    const nodeSvg = graph.nodes.map(drawNode).join("");
    const maxX = Math.max(900, ...graph.nodes.map((node) => node.x + node.width + 120));
    const maxY = Math.max(620, ...graph.nodes.map((node) => node.y + node.height + 120));
    svg.setAttribute("viewBox", `0 0 ${Math.max(900, svg.clientWidth || 900)} ${Math.max(620, svg.clientHeight || 620)}`);
    svg.innerHTML = `<defs><marker id="arrow-a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="var(--edge-a)"></path></marker><marker id="arrow-b" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="var(--edge-b)"></path></marker><marker id="arrow-c" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="var(--edge-c)"></path></marker></defs><g transform="translate(${state.pan.x}, ${state.pan.y}) scale(${state.zoom})"><rect x="-40" y="-40" width="${maxX + 80}" height="${maxY + 80}" fill="transparent"></rect>${edgeSvg}${nodeSvg}</g>`;
    bindSvg(svg, graph);
  }

  function drawNode(node) {
    const kind = node.name === "Query" ? "root" : readable(node.kind);
    const badgeWidth = Math.max(42, kind.length * 7 + 18);
    const rows = node.rows.map((row) => {
      const typeName = unwrap(row.field.type);
      const port = builtins.has(typeName) || !typeName ? "" : `<circle class="field-port" cx="${node.width + 1}" cy="${row.y - 3}" r="3"></circle>`;
      return `<g class="field-row" data-field="${esc(row.field.name)}" data-type="${esc(typeName)}"><text class="field field-name" x="18" y="${row.y}">${esc(row.field.name)}</text><text class="field field-type" x="${node.width - 18}" y="${row.y}" text-anchor="end">${esc(row.type)}</text>${port}</g>`;
    }).join("");
    return `<g class="node ${node.name === "Query" ? "root-node" : ""} ${state.selected === node.id ? "selected" : ""}" data-node="${esc(node.id)}" data-x="${node.x}" data-y="${node.y}" transform="translate(${node.x}, ${node.y})"><rect width="${node.width}" height="${node.height}" rx="10"></rect><rect class="node-header" width="${node.width}" height="40" rx="10"></rect><text class="title" font-weight="700" x="14" y="24">${esc(node.name)}</text><g class="node-kind-badge"><rect class="node-kind-pill" x="${node.width - badgeWidth - 10}" y="9" width="${badgeWidth}" height="22" rx="11"></rect><text class="node-kind-text" x="${node.width - badgeWidth / 2 - 10}" y="24" text-anchor="middle">${esc(kind)}</text></g>${rows}</g>`;
  }

  function drawEdge(item, byId, groups) {
    const source = byId.get(item.source);
    const target = byId.get(item.target);
    if (!source || !target) return "";
    const right = source.x + source.width / 2 <= target.x + target.width / 2;
    const sx = right ? source.x + source.width : source.x;
    const tx = right ? target.x : target.x + target.width;
    const sy = source.y + sourceY(source, item.label);
    const ty = target.y + targetY(target, source.name);
    const key = item.source < item.target ? item.source + "|" + item.target : item.target + "|" + item.source;
    const list = groups.get(key) || [item.id];
    const lane = (list.indexOf(item.id) - (list.length - 1) / 2) * 22;
    const dir = right ? 1 : -1;
    const leadX = sx + dir * (80 + Math.abs(lane));
    const trailX = tx - dir * (80 + Math.abs(lane));
    const laneY = (sy + ty) / 2 + lane;
    const d = `M ${sx} ${sy} H ${leadX} V ${laneY} H ${trailX} V ${ty} H ${tx}`;
    const colorClass = edgeColorClass(item);
    const marker = colorClass === "color-b" ? "arrow-b" : colorClass === "color-c" ? "arrow-c" : "arrow-a";
    return `<g data-edge="${esc(item.id)}"><path class="edge ${colorClass} ${state.selectedEdge === item.id ? "selected" : ""}" style="marker-end:url(#${marker})" d="${d}"></path></g>`;
  }

  function edgeColorClass(item) {
    const text = item.id || item.source + item.target + item.label;
    let hash = 0;
    for (let index = 0; index < text.length; index += 1) hash = (hash + text.charCodeAt(index)) % 3;
    return ["color-a", "color-b", "color-c"][hash];
  }

  function bindSvg(svg, graph) {
    svg.querySelectorAll("[data-node]").forEach((nodeEl) => {
      nodeEl.onclick = (event) => {
        event.stopPropagation();
        state.selected = nodeEl.dataset.node || "";
        state.selectedEdge = "";
        details(graph.nodes.find((node) => node.id === state.selected));
        render();
      };
    });
    svg.querySelectorAll("[data-edge]").forEach((edgeEl) => {
      edgeEl.onclick = (event) => {
        event.stopPropagation();
        state.selected = "";
        state.selectedEdge = edgeEl.dataset.edge || "";
        render();
      };
    });
    svg.onclick = () => {
      state.selected = "";
      state.selectedEdge = "";
      details(null);
      render();
    };
    bindDrag(svg);
  }

  function bindDrag(svg) {
    let moving = null;
    let canvas = null;
    svg.onmousedown = (event) => {
      const node = event.target.closest("[data-node]");
      if (node) {
        const point = svgPoint(svg, event);
        moving = { id: node.dataset.node, dx: point.x - Number(node.dataset.x), dy: point.y - Number(node.dataset.y) };
        event.stopPropagation();
        returnÂˆBˆØ[˜\ÈHÈˆ]™[˜ÛY[Nˆ]™[˜ÛY[K[ˆÈ‹‹œİ]Kœ[ˆHNÂˆNÂˆÚ[™İË›Û›[İ\Ù[[İ™HH
]™[
HOˆÂˆYˆ
[İš[™ÊHÂˆÛÛœİÚ[Hİ™ÔÚ[
İ™Ë]™[
NÂˆİ]KœÜÚ][ÛœÖÛ[İš[™ËšYHHÈˆÚ[H[İš[™Ë™NˆÚ[HH[İš[™Ë™HNÂˆ™[™\Š
NÂˆ™]\›ÂˆBˆYˆ
XØ[˜\ÊH™]\›Âˆİ]Kœ[ˆHÈˆØ[˜\Ëœ[‹
È]™[˜ÛY[HØ[˜\ËNˆØ[˜\Ëœ[‹H
È]™[˜ÛY[HHØ[˜\ËHNÂˆ™[™\Š
NÂˆNÂˆÚ[™İË›Û›[İ\Ù]\H

HOˆÂˆ[İš[™ÈH[ÂˆØ[˜\ÈH[ÂˆNÂˆİ™Ë›ÛÚY[H
]™[
HOˆÂˆ]™[œ™]™[Y˜][

NÂˆİ]K›ÛÛHHX]›Z[Š‹X]›X^
Œİ]K›ÛÛH
ˆ
]™[™[VHˆÈHˆKŒJJJNÂˆ™[™\Š
NÂˆNÂˆB‚ˆ[˜İ[Ûˆš]
Ü˜\
HÂˆYˆ
YÜ˜\››Ù\Ë›[™İ
H™]\›ÂˆÛÛœİİ™ÈH	
™Ü˜\İ™ÈŠNÂˆÛÛœİZ[–HX]›Z[Š‹‹™Ü˜\››Ù\Ë›X\

›ÙJHOˆ›ÙK
JNÂˆÛÛœİZ[–HHX]›Z[Š‹‹™Ü˜\››Ù\Ë›X\

›ÙJHOˆ›ÙKJJNÂˆÛÛœİX^HX]›X^
‹‹™Ü˜\››Ù\Ë›X\

›ÙJHOˆ›ÙK
È›ÙKÚY
JNÂˆÛÛœİX^HHX]›X^
‹‹™Ü˜\››Ù\Ë›X\

›ÙJHOˆ›ÙKH
È›ÙKšZYÚ
JNÂˆÛÛœİÚYHX]›X^
Lİ™Ë˜ÛY[ÚYL
NÂˆÛÛœİZYÚHX]›X^
ŒŒİ™Ë˜ÛY[ZYÚŒŒ
NÂˆÛÛœİ›ÛÛHHX]›Z[ŠKX]›X^
ŒNX]›Z[Š
ÚYHLLŠHÈ
X^HZ[–JK
ZYÚHLLŠHÈ
X^HHZ[–HJJJJNÂˆİ]K›ÛÛHH›ÛÛNÂˆİ]Kœ[ˆHÈˆ
ÚYH
X^HZ[–
H
ˆ›ÛÛJHÈˆHZ[–
ˆ›ÛÛKNˆ
ZYÚH
X^HHZ[–JH
ˆ›ÛÛJHÈˆHZ[–H
ˆ›ÛÛHNÂˆB‚ˆ[˜İ[Ûˆİ]ÊÜ˜\
HÂˆÛÛœİİ]ÈH	
œİ]ÈŠNÂˆYˆ
\İ]ÊH™]\›ÂˆÛÛœİšY[ÈHÜ˜\››Ù\Ëœ™YXÙJ
İ[K›ÙJHOˆİ[H
È›ÙK™šY[Ë›[™İ
NÂˆİ]Ëš[›™\’SH]İ›Û™Ï‰ÙÜ˜\››Ù\Ë›[™İOÜİ›Û™ÏÜ[´`´.4/ô/´,ÜÜ[Ù]]İ›Û™Ï‰ÙÜ˜\™YÙ\Ë›[™İOÜİ›Û™ÏÜ[´`t,´cô-ô-t.OÜÜ[Ù]]İ›Û™Ï‰ÙšY[ßOÜİ›Û™ÏÜ[´/ô/´.ô-t.OÜÜ[Ù]˜ÂˆB‚ˆ[˜İ[Ûˆ]Z[Ê›ÙJHÂˆÛÛœİ›ŞH	
™]Z[ÈŠNÂˆYˆ
X›Ş
H™]\›ÂˆYˆ
[›ÙJHÂˆ›Şš[›™\’SH	ÏÛ\ÜÏH›]]Y´$´bô,t-t`4.4`´-H4,t.ô/´.ˆ4.4.ô.4`t,´cô-ôc4/t,4,ô`4,4a4-KÜ‰ÎÂˆ™]\›ÂˆBˆ›Şš[›™\’SH]ˆÛ\ÜÏH™]Z[XØ\™Ï‰Ù\ØÊ›ÙK›˜[YJ_OÚÏÛ\ÜÏH›]]Y‰Ù\ØÊ™XYX›J›ÙKšÚ[™
J_OÜ[Û\ÜÏH™šY[[\İ‰Û›ÙK™šY[Ë›X\

šY[
HOˆOİ›Û™Ï‰Ù\ØÊšY[›˜[YJ_OÜİ›Û™Ïˆ	Ù\ØÊšY[\J_OÛO˜
Kš›Ú[ŠˆŠ_Oİ[Ù]˜ÂˆB‚ˆ[˜İ[ÛˆØ\›Š][\ÊHÂˆÛÛœİ›ŞH	
Ø\›š[™ÜÈŠNÂˆYˆ
›Ş
H›Şš[›™\’SH][\Ë›X\

][JHOˆHÛ\ÜÏH˜˜Y‰Ù\ØÊ][J_OÛO˜
Kš›Ú[ŠˆŠNÂˆB‚ˆ[˜İ[ÛˆÛİ\˜ÙVJ›ÙKšY[
HÂˆÛÛœİ›İÈH›ÙKœ›İÜË™š[™

][JHOˆ][K™šY[›˜[YHOOHšY[
NÂˆ™]\›ˆ›İÈÈ›İËHHÈˆ›ÙKšZYÚÈÂˆB‚ˆ[˜İ[Ûˆ\™Ù]J›ÙKÛİ\˜ÙJHÂˆÛÛœİ›İÈH›ÙKœ›İÜË™š[™

][JHOˆ[Ü˜\
][K™šY[\JHOOHÛİ\˜ÙJNÂˆ™]\›ˆ›İÈÈ›İËHHÈˆX]›Z[Š›ÙKšZYÚHNÌ
NÂˆB‚ˆ[˜İ[Ûˆİ™ÔÚ[
İ™Ë]™[
HÂˆÛÛœİ™XİHİ™Ë™Ù]›İ[™[™ĞÛY[™Xİ

NÂˆ™]\›ˆÈˆ
]™[˜ÛY[H™Xİ›YHİ]Kœ[‹
HÈİ]K›ÛÛKNˆ
]™[˜ÛY[HH™XİÜHİ]Kœ[‹JHÈİ]K›ÛÛHNÂˆB‚ˆ[˜İ[Ûˆ›ÛİÙZYÚ
˜[YJHÂˆ™]\›ˆÈ]Y\Nˆ]]][ÛˆKİXœØÜš\[ÛˆˆVÛ˜[YWHÏÈLÂˆB‚ˆ[˜İ[Ûˆ™XYX›JÚ[™
HÂˆ™]\›ˆÈĞ’‘PÕˆ\H‹S•T‘PÑNˆš[\™˜XÙH‹S”UÓĞ’‘PÕˆš[œ]‹S”Uˆš[œ]‹S•SNˆ™[[H‹S’SÓˆ[š[Ûˆ‹ĞĞSTˆœØØ[\ˆˆVÚÚ[™Hİš[™ÊÚ[™\HŠKÓİÙ\Ø\ÙJ
NÂˆB‚ˆ[˜İ[Ûˆ\S˜[YJ™YŠHÂˆÚ[H
™YŠHÂˆYˆ
™Y‹›˜[YJH™]\›ˆ™Y‹›˜[YNÂˆ™YˆH™Y‹›Ù•\NÂˆBˆ™]\›ˆˆÂˆB‚ˆ[˜İ[Ûˆ\U^
™YŠHÂˆYˆ
\™YŠH™]\›ˆˆÂˆYˆ
™Y‹šÚ[™OOH““Ó—Ó•SŠH™]\›ˆ\U^
™Y‹›Ù•\JH
ÈˆHÂˆYˆ
™Y‹šÚ[™OOH“TÕŠH™]\›ˆ–Èˆ
È\U^
™Y‹›Ù•\JH
È—HÂˆ™]\›ˆ™Y‹›˜[YH™Y‹šÚ[™ˆÂˆB‚ˆ[˜İ[Ûˆ[Ü˜\
\JHÂˆ™]\›ˆİš[™Ê\HˆŠKœ™\XÙJÖÈV×W×KÙËˆŠNÂˆB‚ˆ[˜İ[ÛˆÚÜ
\JHÂˆÛÛœİ^Hİš[™Ê\HˆŠNÂˆ™]\›ˆ^›[™İˆÈ^œÛXÙJŒJH
È‹‹‹ˆˆˆ^ÂˆB‚ˆ[˜İ[Ûˆ\ØÊ˜[YJHÂˆ™]\›ˆİš[™Ê˜[YHˆŠKœ™\XÙJÖÉˆ‰×KÙË
Ú\ŠHOˆ
È‰ˆˆ‰˜[\È‹ˆ‰›È‹ˆˆ‰™İÈ‹	È‰Îˆ‰œ][İÈ‹‰Èˆ‰ˆÌÎNÈˆVØÚ\—JJNÂˆB‚ˆÚ[™İË˜Y]™[\İ[™\Š›ØY‹

HOˆÙ][Y[İ]
[š]
JNÂŸJJ
NÂ