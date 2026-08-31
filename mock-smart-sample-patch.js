(function () {
  "use strict";

  if (window.__graphqlMockSmartSamplePatchReady) return;
  window.__graphqlMockSmartSamplePatchReady = true;

  const BUILTIN_SCALARS = new Set(["String", "Int", "Float", "Boolean", "ID"]);
  const MAX_DEPTH = 5;
  const MAX_FIELDS = 9;
  const MAX_OBJECT_FIELDS = 3;
  const MAX_ABSTRACT_TYPES = 3;

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
    document.getElementById("contractSampleBtn")?.addEventListener("click", () => {
      window.setTimeout(() => {
        const schema = document.getElementById("contractSchemaInput")?.value || document.getElementById("schemaInput")?.value || "";
        const queryInput = document.getElementById("contractQueryInput");
        if (queryInput) queryInput.value = buildSmartSampleQuery(schema);
      }, 0);
    });
  }

  function buildSmartSampleQuery(schemaText) {
    const api = window.GraphQLContractMock;
    const schema = api.parseSchema(schemaText);
    const rootName = schema.roots.query || "Query";
    const root = schema.types[rootName] || firstObjectType(schema);
    const field = pickRootField(root);
    if (!field) return "query MockPreview {\n  __typename\n}";

    const args = field.args?.length
      ? "(" + field.args.map((arg) => `${arg.name}: ${api.mockInputValue(schema, arg.type, 0)}`).join(", ") + ")"
      : "";
    const selection = sampleSelectionForType(schema, namedType(field.type), 1, new Set([root.name]));
    return selection
      ? `query MockPreview {\n  ${field.name}${args} {\n${selection}\n  }\n}`
      : `query MockPreview {\n  ${field.name}${args}\n}`;
  }

  function pickRootField(root) {
    if (!root?.fields?.length) return null;
    return root.fields.find((field) => !isMetaField(field.name)) || root.fields[0];
  }

  function sampleSelectionForType(schema, typeName, depth, visited) {
    if (BUILTIN_SCALARS.has(typeName)) return "";
    const type = schema.types[typeName];
    if (!type) return "";

    if (type.kind === "UNION" || type.kind === "INTERFACE") {
      return sampleAbstractSelection(schema, type, depth, visited);
    }
    if (type.kind === "ENUM" || type.kind === "SCALAR") return "";
    if (!type.fields?.length) return `${indent(depth)}__typename`;

    if (depth > MAX_DEPTH || visited.has(type.name)) {
      return sampleLeafFields(schema, type, depth).join("\n") || `${indent(depth)}__typename`;
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

    return fields.map((field) => {
      const childType = namedType(field.type);
      const childSelection = sampleSelectionForType(schema, childType, depth + 1, nextVisited);
      const args = field.args?.length
        ? "(" + field.args.map((arg) => `${arg.name}: ${window.GraphQLContractMock.mockInputValue(schema, arg.type, depth)}`).join(", ") + ")"
        : "";
      return childSelection
        ? `${indent(depth)}${field.name}${args} {\n${childSelection}\n${indent(depth)}}`
        : `${indent(depth)}${field.name}${args}`;
    }).join("\n");
  }

  function sampleAbstractSelection(schema, type, depth, visited) {
    const lines = [`${indent(depth)}__typename`];
    (type.fields || [])
      .filter((field) => isLeafType(schema, field.type))
      .slice(0, 4)
      .forEach((field) => lines.push(`${indent(depth)}${field.name}`));

    (type.possibleTypes || []).slice(0, MAX_ABSTRACT_TYPES).forEach((targetName) => {
      const fields = sampleSelectionForType(schema, targetName, depth + 1, visited);
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
