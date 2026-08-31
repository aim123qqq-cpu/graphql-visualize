(function () {
  "use strict";

  if (window.__graphqlMockSmartSamplePatchReady) return;
  window.__graphqlMockSmartSamplePatchReady = true;

  const BUILTIN_SCALARS = new Set(["String", "Int", "Float", "Boolean", "ID"]);
  const MAX_DEPTH = 5;
  const MAX_FIELDS = 9;
  const MAX_OBJECT_FIELDS = 3;
  const MAX_ABSTRACT_TYPES = 3;
  const PLATFORM_KEY = "graphqlMockPlatform";

  initWhenReady();

  function initWhenReady() {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", init);
      return;
    }
    init();
  }

  function init(attempt = 0) {
    const api = window.GraphQLContractMock;
    if (!api?.parseSchema || !api?.mockInputValue) {
      if (attempt < 30) window.setTimeout(() => init(attempt + 1), 100);
      return;
    }

    api.buildSampleQuery = buildSmartSampleQuery;
    ensurePlatformToggle();
    document.getElementById("contractSampleBtn")?.addEventListener("click", () => {
      window.setTimeout(() => {
        const schema = document.getElementById("contractSchemaInput")?.value || document.getElementById("schemaInput")?.value || "";
        const queryInput = document.getElementById("contractQueryInput");
        if (queryInput) queryInput.value = buildSmartSampleQuery(schema);
      }, 0);
    });
  }

  function ensurePlatformToggle() {
    if (document.getElementById("mockPlatformToggle")) return;
    const sampleButton = document.getElementById("contractSampleBtn");
    const actions = sampleButton?.parentElement;
    if (!sampleButton || !actions) return;
    injectStyles();

    const toggle = document.createElement("div");
    toggle.id = "mockPlatformToggle";
    toggle.className = "mock-platform-toggle";
    toggle.setAttribute("role", "radiogroup");
    toggle.setAttribute("aria-label", "Платформа автогенерации Mock-запроса");
    toggle.innerHTML = `
      <button class="mock-platform-option" type="button" data-platform="ios" role="radio">iOS</button>
      <button class="mock-platform-option" type="button" data-platform="android" role="radio">Android</button>
    `;
    actions.insertBefore(toggle, sampleButton);
    toggle.addEventListener("click", (event) => {
      const button = event.target.closest("[data-platform]");
      if (!button) return;
      setPlatform(button.dataset.platform);
      updatePlatformToggle();
      regenerateQuery();
    });
    updatePlatformToggle();
  }

  function injectStyles() {
    if (document.getElementById("mockSmartSampleStyles")) return;
    const style = document.createElement("style");
    style.id = "mockSmartSampleStyles";
    style.textContent = `
      .mock-platform-toggle {
        display: inline-grid;
        grid-template-columns: 1fr 1fr;
        gap: 2px;
        padding: 3px;
        border: 1px solid var(--line);
        border-radius: 999px;
        background: var(--field-bg);
      }

      .mock-platform-option {
        min-width: 70px;
        border: 0;
        border-radius: 999px;
        padding: 7px 10px;
        background: transparent;
        color: var(--muted);
        font-size: 12px;
      }

      .mock-platform-option.active {
        background: var(--accent);
        color: #fff;
        box-shadow: 0 1px 4px rgba(0, 0, 0, 0.12);
      }
    `;
    document.head.appendChild(style);
  }

  function updatePlatformToggle() {
    document.querySelectorAll("#mockPlatformToggle [data-platform]").forEach((button) => {
      const active = button.dataset.platform === getPlatform();
      button.classList.toggle("active", active);
      button.setAttribute("aria-checked", active ? "true" : "false");
    });
  }

  function regenerateQuery() {
    const schema = document.getElementById("contractSchemaInput")?.value || document.getElementById("schemaInput")?.value || "";
    const queryInput = document.getElementById("contractQueryInput");
    if (queryInput) queryInput.value = buildSmartSampleQuery(schema);
  }

  function getPlatform() {
    return localStorage.getItem(PLATFORM_KEY) || "ios";
  }

  function setPlatform(platform) {
    localStorage.setItem(PLATFORM_KEY, platform === "android" ? "android" : "ios");
  }

  function buildSmartSampleQuery(schemaText) {
    const api = window.GraphQLContractMock;
    const options = { includeTypename: getPlatform() === "ios" };
    const schema = api.parseSchema(schemaText);
    const rootName = schema.roots.query || "Query";
    const root = schema.types[rootName] || firstObjectType(schema);
    const field = pickRootField(root);
    if (!field) return "query MockPreview {\n  __typename\n}";

    const args = field.args?.length
      ? "(" + field.args.map((arg) => `${arg.name}: ${api.mockInputValue(schema, arg.type, 0)}`).join(", ") + ")"
      : "";
    const selection = sampleSelectionForType(schema, namedType(field.type), 1, new Set([root.name]), options);
    return selection
      ? `query MockPreview {\n  ${field.name}${args} {\n${selection}\n  }\n}`
      : `query MockPreview {\n  ${field.name}${args}\n}`;
  }

  function pickRootField(root) {
    if (!root?.fields?.length) return null;
    return root.fields.find((field) => !isMetaField(field.name)) || root.fields[0];
  }

  function sampleSelectionForType(schema, typeName, depth, visited, options) {
    if (BUILTIN_SCALARS.has(typeName)) return "";
    const type = schema.types[typeName];
    if (!type) return "";

    if (type.kind === "UNION" || type.kind === "INTERFACE") {
      return sampleAbstractSelection(schema, type, depth, visited, options);
    }
    if (type.kind === "ENUM" || type.kind === "SCALAR") return "";
    if (!type.fields?.length) return `${indent(depth)}__typename`;

    if (depth > MAX_DEPTH || visited.has(type.name)) {
      return sampleLeafFields(schema, type, depth).join("\n") || (options.includeTypename ? `${indent(depth)}__typename` : "");
    }

    const nextVisited = new Set(visited);
    nextVisited.add(type.name);

    const scalarFields = type.fields
      .filter((field) => !isMetaField(field.name) && isLeafType(schema, field.type))
      .slice(0, MAX_FIELDS);
    const objectFields = type.fields
      .filter((field) => !isMetaField(field.name) && !isLeafType(schema, field.type))
      .slice(0, MAX_OBJECT_FIELDS);
    const fields = [...scalarFields, ...objectFields].slice(0, MAX_FIELDS);

    const lines = options.includeTypename ? [`${indent(depth)}__typename`] : [];
    return lines.concat(fields.map((field) => {
      const childType = namedType(field.type);
      const childSelection = sampleSelectionForType(schema, childType, depth + 1, nextVisited, options);
      const args = field.args?.length
        ? "(" + field.args.map((arg) => `${arg.name}: ${window.GraphQLContractMock.mockInputValue(schema, arg.type, depth)}`).join(", ") + ")"
        : "";
      return childSelection
        ? `${indent(depth)}${field.name}${args} {\n${childSelection}\n${indent(depth)}}`
        : `${indent(depth)}${field.name}${args}`;
    })).join("\n");
  }

  function sampleAbstractSelection(schema, type, depth, visited, options) {
    const lines = options.includeTypename ? [`${indent(depth)}__typename`] : [];
    (type.fields || [])
      .filter((field) => isLeafType(schema, field.type))
      .slice(0, 4)
      .forEach((field) => lines.push(`${indent(depth)}${field.name}`));

    (type.possibleTypes || []).slice(0, MAX_ABSTRACT_TYPES).forEach((targetName) => {
      const fields = sampleSelectionForType(schema, targetName, depth + 1, visited, options);
      if (fields) lines.push(`${indent(depth)}... on ${targetName} {\n${fields}\n${indent(depth)}}`);
    });
    return lines.join("\n");
  }

  function sampleLeafFields(schema, type, depth) {
    return (type.fields || [])
      .filter((field) => !isMetaField(field.name) && isLeafType(schema, field.type))
      .slice(0, Math.max(3, MAX_FIELDS - 2))
      .map((field) => `${indent(depth)}${field.name}`);
  }

  function isLeafType(schema, typeText) {
    const name = namedType(typeText);
    const type = schema.types[name];
    return BUILTIN_SCALARS.has(name) || type?.kind === "ENUM" || type?.kind === "SCALAR";
  }

  function namedType(typeText) {
    return String(typeText || "").replace(/[![\]\s]/g, "");
  }

  function firstObjectType(schema) {
    return Object.values(schema.types).find((type) => type.kind === "TYPE" || type.kind === "OBJECT");
  }

  function isMetaField(name) {
    return String(name || "").startsWith("__");
  }

  function indent(depth) {
    return "  ".repeat(depth + 1);
  }
})();
