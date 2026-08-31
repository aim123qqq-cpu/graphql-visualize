(function () {
  "use strict";

  if (window.__graphqlContractMockPatchReady) return;
  window.__graphqlContractMockPatchReady = true;

  const BUILTIN_SCALARS = new Set(["String", "Int", "Float", "Boolean", "ID"]);

  initWhenReady();

  function initWhenReady() {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", init);
      return;
    }
    init();
  }

  function init() {
    injectStyles();
    ensureButton();
    ensureModal();
    window.GraphQLContractMock = {
      parseSchema,
      parseOperation,
      runContract,
      buildSampleQuery,
      mockInputValue
    };
  }

  function injectStyles() {
    if (document.getElementById("contractMockPatchStyles")) return;
    const style = document.createElement("style");
    style.id = "contractMockPatchStyles";
    style.textContent = `
      .contract-overlay {
        position: fixed;
        inset: 0;
        z-index: 135;
        display: none;
        align-items: center;
        justify-content: center;
        padding: 18px;
        background: rgba(0, 0, 0, 0.38);
      }

      body.theme-dark .contract-overlay {
        background: rgba(0, 0, 0, 0.62);
      }

      .contract-overlay.open {
        display: flex;
      }

      .contract-dialog {
        width: min(1280px, 100%);
        max-height: min(92vh, 920px);
        display: grid;
        grid-template-rows: auto minmax(0, 1fr);
        border: 1px solid var(--line);
        border-radius: 12px;
        background: var(--panel);
        color: var(--ink);
        overflow: hidden;
        box-shadow: 0 26px 78px rgba(0, 0, 0, 0.26);
      }

      .contract-head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 16px;
        padding: 18px 20px;
        border-bottom: 1px solid var(--line);
      }

      .contract-head h2 {
        margin: 0 0 4px;
        font-size: 18px;
      }

      .contract-head p {
        margin: 0;
        color: var(--muted);
      }

      .contract-close {
        width: 34px;
        min-width: 34px;
        padding: 0;
      }

      .contract-body {
        display: grid;
        grid-template-columns: minmax(260px, 0.9fr) minmax(300px, 0.9fr) minmax(320px, 1fr);
        min-height: 0;
      }

      .contract-pane {
        display: grid;
        grid-template-rows: auto minmax(0, 1fr);
        gap: 10px;
        min-width: 0;
        min-height: 0;
        padding: 16px 18px 18px;
      }

      .contract-pane + .contract-pane {
        border-left: 1px solid var(--line);
      }

      .contract-pane h3 {
        margin: 0;
        font-size: 13px;
      }

      .contract-schema,
      .contract-query,
      .contract-output {
        width: 100%;
        min-height: 320px;
        border: 1px solid var(--line);
        border-radius: 9px;
        background: var(--field-bg);
        color: var(--ink);
        padding: 12px;
        overflow: auto;
        font-family: Consolas, "Courier New", monospace;
        font-size: 12px;
        line-height: 1.55;
        resize: vertical;
        white-space: pre;
      }

      .contract-output {
        margin: 0;
        resize: none;
      }

      .contract-actions,
      .contract-result-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        flex-wrap: wrap;
      }

      .contract-status {
        color: var(--muted);
        font-size: 12px;
      }

      .contract-status.ok {
        color: #15803d;
      }

      .contract-status.bad {
        color: var(--danger);
      }

      .contract-errors {
        display: grid;
        gap: 6px;
        margin: 0;
        padding: 0;
        list-style: none;
      }

      .contract-errors li {
        padding: 8px 10px;
        border: 1px solid color-mix(in srgb, var(--danger), var(--line) 65%);
        border-radius: 8px;
        background: color-mix(in srgb, var(--danger), transparent 92%);
        color: var(--danger);
        font-size: 12px;
      }

      @media (max-width: 1100px) {
        .contract-body {
          grid-template-columns: 1fr;
        }

        .contract-pane + .contract-pane {
          border-left: 0;
          border-top: 1px solid var(--line);
        }
      }
    `;
    document.head.appendChild(style);
  }

  function ensureButton() {
    const actions = document.querySelector(".topbar .actions");
    const build = document.getElementById("buildBtn");
    if (!actions || document.getElementById("contractMockBtn")) return;

    const button = document.createElement("button");
    button.id = "contractMockBtn";
    button.type = "button";
    button.textContent = "Mock";
    button.title = "Проверить GraphQL-запрос по текущему SDL и получить mock-ответ";
    button.setAttribute("aria-label", button.title);
    button.addEventListener("click", openContract);

    if (build && build.nextSibling) {
      actions.insertBefore(button, build.nextSibling);
    } else {
      actions.appendChild(button);
    }
  }

  function ensureModal() {
    if (document.getElementById("contractOverlay")) return;
    const overlay = document.createElement("div");
    overlay.id = "contractOverlay";
    overlay.className = "contract-overlay";
    overlay.setAttribute("aria-hidden", "true");
    overlay.innerHTML = `
      <div class="contract-dialog" role="dialog" aria-modal="true" aria-labelledby="contractTitle">
        <div class="contract-head">
          <div>
            <h2 id="contractTitle">Mock GraphQL</h2>
            <p>Проверьте query или mutation по SDL контракта и получите пример JSON-ответа.</p>
          </div>
          <button id="contractCloseBtn" class="contract-close" type="button" aria-label="Закрыть">x</button>
        </div>
        <div class="contract-body">
          <section class="contract-pane">
            <div class="contract-actions">
              <h3>SDL контракта</h3>
              <button id="contractRefreshSchemaBtn" type="button">Взять слева</button>
            </div>
            <textarea id="contractSchemaInput" class="contract-schema" spellcheck="false"></textarea>
          </section>
          <section class="contract-pane">
            <div class="contract-actions">
              <h3>GraphQL запрос</h3>
              <button id="contractSampleBtn" type="button">Пример</button>
            </div>
            <textarea id="contractQueryInput" class="contract-query" spellcheck="false"></textarea>
            <div class="contract-actions">
              <span id="contractStatus" class="contract-status" aria-live="polite"></span>
              <button id="contractRunBtn" class="primary" type="button">Проверить</button>
            </div>
          </section>
          <section class="contract-pane">
            <div class="contract-result-head">
              <h3>Mock response</h3>
              <button id="contractCopyBtn" type="button">Копировать JSON</button>
            </div>
            <pre id="contractOutput" class="contract-output">{}</pre>
            <ul id="contractErrors" class="contract-errors"></ul>
          </section>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) closeContract();
    });
    document.getElementById("contractCloseBtn")?.addEventListener("click", closeContract);
    document.getElementById("contractRunBtn")?.addEventListener("click", runFromUi);
    document.getElementById("contractSampleBtn")?.addEventListener("click", fillSampleQuery);
    document.getElementById("contractCopyBtn")?.addEventListener("click", copyJson);
    document.getElementById("contractRefreshSchemaBtn")?.addEventListener("click", syncSchemaFromLeft);
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeContract();
    });
  }

  function openContract() {
    const overlay = document.getElementById("contractOverlay");
    if (!overlay) return;
    overlay.classList.add("open");
    overlay.setAttribute("aria-hidden", "false");
    syncSchemaFromLeft();
    if (!document.getElementById("contractQueryInput")?.value.trim()) fillSampleQuery();
    setTimeout(() => document.getElementById("contractQueryInput")?.focus(), 0);
  }

  function closeContract() {
    const overlay = document.getElementById("contractOverlay");
    if (!overlay) return;
    overlay.classList.remove("open");
    overlay.setAttribute("aria-hidden", "true");
  }

  function syncSchemaFromLeft() {
    const schemaInput = document.getElementById("contractSchemaInput");
    if (!schemaInput) return;
    schemaInput.value = readLeftSchema();
    const status = document.getElementById("contractStatus");
    if (status) {
      status.textContent = schemaInput.value.trim() ? "SDL взят из левой панели" : "В левой панели нет SDL";
      status.className = "contract-status " + (schemaInput.value.trim() ? "ok" : "bad");
    }
  }

  function fillSampleQuery() {
    const schema = readSchema();
    const query = buildSampleQuery(schema);
    document.getElementById("contractQueryInput").value = query;
  }

  function buildSampleQuery(schemaText) {
    const model = parseSchema(schemaText);
    const rootName = model.roots.query || "Query";
    const root = model.types[rootName] || firstObjectType(model);
    const field = root?.fields?.[0];
    if (!field) return "query MockPreview {\n  __typename\n}";
    const argText = field.args.length
      ? "(" + field.args.map((arg) => `${arg.name}: ${mockInputValue(model, arg.type, 0)}`).join(", ") + ")"
      : "";
    const nestedFields = sampleSelectionForType(model, namedType(field.type), 1);
    return nestedFields
      ? `query MockPreview {\n  ${field.name}${argText} {\n${nestedFields}\n  }\n}`
      : `query MockPreview {\n  ${field.name}${argText}\n}`;
  }

  function runFromUi() {
    const status = document.getElementById("contractStatus");
    const output = document.getElementById("contractOutput");
    const errors = document.getElementById("contractErrors");
    try {
      const result = runContract(readSchema(), document.getElementById("contractQueryInput")?.value || "");
      output.textContent = JSON.stringify(result.response, null, 2);
      errors.innerHTML = result.errors.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
      status.textContent = result.errors.length ? `Найдено ошибок: ${result.errors.length}` : "Контракт выглядит корректно";
      status.className = "contract-status " + (result.errors.length ? "bad" : "ok");
    } catch (error) {
      output.textContent = "{}";
      errors.innerHTML = `<li>${escapeHtml(error.message)}</li>`;
      status.textContent = "Ошибка проверки";
      status.className = "contract-status bad";
    }
  }

  async function copyJson() {
    const text = document.getElementById("contractOutput")?.textContent || "{}";
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const area = document.createElement("textarea");
        area.value = text;
        area.style.position = "fixed";
        area.style.left = "-9999px";
        document.body.appendChild(area);
        area.select();
        document.execCommand("copy");
        area.remove();
      }
      const status = document.getElementById("contractStatus");
      status.textContent = "JSON скопирован";
      status.className = "contract-status ok";
    } catch (error) {
      const status = document.getElementById("contractStatus");
      status.textContent = "Не удалось скопировать JSON";
      status.className = "contract-status bad";
    }
  }

  function runContract(schemaText, queryText) {
    const schema = parseSchema(schemaText);
    const operation = parseOperation(queryText);
    const errors = [];
    const rootName = operation.type === "mutation"
      ? schema.roots.mutation || "Mutation"
      : schema.roots.query || "Query";
    const root = schema.types[rootName];
    if (!root) {
      errors.push(`В схеме не найден root type ${rootName}.`);
      return { response: { data: null, errors: errors.map((message) => ({ message })) }, errors };
    }
    const data = mockSelection(schema, root, operation.selection, errors, rootName, operation.fragments);
    return {
      response: errors.length ? { data, errors: errors.map((message) => ({ message })) } : { data },
      errors
    };
  }

  function parseSchema(raw) {
    const text = normalizeSdl(stripDescriptions(String(raw || "")));
    const types = {};
    const roots = parseSchemaRoots(text);
    const definitions = readDefinitions(text);

    definitions.forEach((definition) => {
      if (definition.kind === "SCALAR") {
        types[definition.name] = types[definition.name] || { name: definition.name, kind: "SCALAR", fields: [] };
        return;
      }
      if (definition.kind === "UNION") {
        const possibleTypes = definition.members
          .map((item) => item.trim())
          .filter(Boolean)
          .map((item) => item.replace(/=.*/, "").trim());
        types[definition.name] = {
          name: definition.name,
          kind: "UNION",
          fields: [],
          possibleTypes
        };
        return;
      }
      if (definition.kind === "ENUM") {
        types[definition.name] = {
          name: definition.name,
          kind: "ENUM",
          values: parseEnumValues(definition.body)
        };
        return;
      }
      const existing = types[definition.name] || {
        name: definition.name,
        kind: definition.kind,
        fields: [],
        interfaces: []
      };
      existing.kind = existing.kind || definition.kind;
      existing.interfaces = unique([...(existing.interfaces || []), ...parseImplements(definition.header)]);
      existing.fields.push(...parseFields(definition.body));
      types[definition.name] = existing;
    });

    Object.values(types).forEach((type) => {
      (type.interfaces || []).forEach((name) => {
        if (!types[name]) types[name] = { name, kind: "INTERFACE", fields: [], interfaces: [] };
      });
    });
    Object.values(types).forEach((type) => {
      (type.interfaces || []).forEach((interfaceName) => {
        const iface = types[interfaceName];
        iface.possibleTypes = unique([...(iface.possibleTypes || []), type.name]);
      });
    });
    Object.values(types).forEach((type) => {
      (type.fields || []).forEach((field) => {
        const target = namedType(field.type);
        if (target && !types[target] && !BUILTIN_SCALARS.has(target)) {
          types[target] = { name: target, kind: "OBJECT", fields: [], interfaces: [] };
        }
      });
    });
    BUILTIN_SCALARS.forEach((name) => {
      if (!types[name]) types[name] = { name, kind: "SCALAR", fields: [] };
    });
    return { types, roots };
  }

  function normalizeSdl(text) {
    return String(text || "")
      .replace(/}\s*,/g, "}")
      .replace(/\r\n/g, "\n");
  }

  function parseSchemaRoots(text) {
    const roots = {};
    const match = text.match(/\bschema\b[^{]*\{([\s\S]*?)\}/);
    if (!match) return roots;
    match[1].split(/\n|;/).forEach((line) => {
      const pair = line.trim().match(/^(query|mutation|subscription)\s*:\s*([_A-Za-z][_0-9A-Za-z]*)/);
      if (pair) roots[pair[1]] = pair[2];
    });
    return roots;
  }

  function readDefinitions(text) {
    const definitions = [];
    const pattern = /\b(extend\s+)?(type|interface|input|enum|union|scalar)\s+([_A-Za-z][_0-9A-Za-z]*)/g;
    let match;
    while ((match = pattern.exec(text))) {
      const keyword = match[2];
      const name = match[3];
      const headerStart = match.index;
      const cursor = pattern.lastIndex;

      if (keyword === "scalar") {
        definitions.push({ kind: "SCALAR", name });
        continue;
      }
      if (keyword === "union") {
        const lineEnd = findDefinitionLineEnd(text, cursor);
        const members = text.slice(cursor, lineEnd).replace(/^.*?=/, "").split("|");
        definitions.push({ kind: "UNION", name, members });
        pattern.lastIndex = lineEnd;
        continue;
      }

      const openIndex = text.indexOf("{", cursor);
      if (openIndex === -1) break;
      const closeIndex = findMatchingBrace(text, openIndex);
      if (closeIndex === -1) break;
      definitions.push({
        kind: keyword.toUpperCase(),
        name,
        header: text.slice(headerStart, openIndex),
        body: text.slice(openIndex + 1, closeIndex)
      });
      pattern.lastIndex = closeIndex + 1;
    }
    return definitions;
  }

  function findDefinitionLineEnd(text, start) {
    const nextDef = text.slice(start).search(/\n\s*(?:extend\s+)?(?:type|interface|input|enum|union|scalar|schema)\b/);
    return nextDef === -1 ? text.length : start + nextDef;
  }

  function findMatchingBrace(text, openIndex) {
    let depth = 0;
    for (let i = openIndex; i < text.length; i += 1) {
      if (text[i] === "{") depth += 1;
      if (text[i] === "}") depth -= 1;
      if (depth === 0) return i;
    }
    return -1;
  }

  function parseImplements(header) {
    const match = String(header || "").match(/\bimplements\b\s+([^{]+)/);
    if (!match) return [];
    return match[1]
      .replace(/&/g, " ")
      .split(/\s+/)
      .map((item) => item.trim())
      .filter((item) => item && item !== "implements");
  }

  function parseEnumValues(body) {
    return String(body || "")
      .split(/\n|;/)
      .map((line) => line.replace(/@[_A-Za-z][_0-9A-Za-z]*(\([^)]*\))?/g, "").trim())
      .filter((line) => /^[_A-Za-z][_0-9A-Za-z]*$/.test(line));
  }

  function parseFields(body) {
    const fields = [];
    splitFieldLines(body).forEach((line) => {
      const clean = line
        .replace(/@[_A-Za-z][_0-9A-Za-z]*(\([^)]*(?:\)[^)]*)?\))?/g, "")
        .replace(/\s+/g, " ")
        .trim();
      const match = clean.match(/^([_A-Za-z][_0-9A-Za-z]*)\s*(?:\((.*)\))?\s*:\s*([^=]+?)(?:\s*=.*)?$/);
      if (!match) return;
      fields.push({
        name: match[1],
        args: parseArgs(match[2]),
        type: match[3].trim()
      });
    });
    return fields;
  }

  function splitFieldLines(body) {
    const lines = [];
    let current = "";
    let parens = 0;
    String(body || "").split(/\n|;/).forEach((rawLine) => {
      const line = rawLine.trim();
      if (!line) return;
      current += (current ? " " : "") + line;
      for (const char of line) {
        if (char === "(") parens += 1;
        if (char === ")") parens -= 1;
      }
      if (parens <= 0 && current.includes(":")) {
        lines.push(current);
        current = "";
        parens = 0;
      }
    });
    if (current.trim()) lines.push(current.trim());
    return lines;
  }

  function parseArgs(raw) {
    if (!raw) return [];
    return splitTopLevel(raw, ",").map((part) => {
      const match = part.trim().match(/^([_A-Za-z][_0-9A-Za-z]*)\s*:\s*([^=]+)(?:=.*)?$/);
      return match ? { name: match[1], type: match[2].trim(), required: /!\s*$/.test(match[2].trim()) } : null;
    }).filter(Boolean);
  }

  function parseOperation(raw) {
    const tokens = tokenize(raw);
    const parser = { tokens, index: 0, fragments: {} };
    let type = "query";
    while (peek(parser)) {
      if (peek(parser) === "fragment") {
        parseNamedFragment(parser);
        continue;
      }
      if (peek(parser) === "query" || peek(parser) === "mutation") {
        type = take(parser);
        if (isName(peek(parser))) take(parser);
        if (peek(parser) === "(") skipBalanced(parser, "(", ")");
        break;
      }
      if (peek(parser) === "{") break;
      take(parser);
    }
    while (peek(parser) && peek(parser) !== "{") take(parser);
    const selection = parseSelectionSet(parser);
    while (peek(parser)) {
      if (peek(parser) === "fragment") {
        parseNamedFragment(parser);
        continue;
      }
      take(parser);
    }
    return { type, selection, fragments: parser.fragments };
  }

  function parseNamedFragment(parser) {
    expect(parser, "fragment");
    const name = take(parser);
    if (peek(parser) === "on") take(parser);
    const typeName = take(parser);
    const children = peek(parser) === "{" ? parseSelectionSet(parser) : [];
    parser.fragments[name] = { kind: "fragment", typeName, children };
  }

  function parseSelectionSet(parser) {
    expect(parser, "{");
    const selection = [];
    while (peek(parser) && peek(parser) !== "}") {
      if (peek(parser) === "...") {
        take(parser);
        if (peek(parser) === "on") {
          take(parser);
          const typeName = take(parser);
          while (peek(parser) === "@") skipDirective(parser);
          const children = peek(parser) === "{" ? parseSelectionSet(parser) : [];
          selection.push({ kind: "inlineFragment", typeName, children });
          continue;
        }
        const fragmentName = take(parser);
        selection.push({ kind: "fragmentSpread", fragmentName });
        continue;
      }
      if (!isName(peek(parser))) {
        take(parser);
        continue;
      }
      let responseName = take(parser);
      let name = responseName;
      if (peek(parser) === ":") {
        take(parser);
        name = take(parser);
      }
      const args = [];
      if (peek(parser) === "(") args.push(...parseCallArgs(parser));
      while (peek(parser) === "@") skipDirective(parser);
      const children = peek(parser) === "{" ? parseSelectionSet(parser) : [];
      selection.push({ kind: "field", responseName, name, args, children });
    }
    expect(parser, "}");
    return selection;
  }

  function parseCallArgs(parser) {
    const args = [];
    expect(parser, "(");
    while (peek(parser) && peek(parser) !== ")") {
      if (isName(peek(parser))) {
        const name = take(parser);
        if (peek(parser) === ":") {
          take(parser);
          skipValue(parser);
          args.push(name);
          continue;
        }
      }
      take(parser);
    }
    expect(parser, ")");
    return args;
  }

  function skipValue(parser) {
    if (peek(parser) === "$") {
      take(parser);
      if (isName(peek(parser))) take(parser);
      return;
    }
    if (peek(parser) === "{" || peek(parser) === "[" || peek(parser) === "(") {
      const open = take(parser);
      const close = open === "{" ? "}" : open === "[" ? "]" : ")";
      let depth = 1;
      while (peek(parser) && depth > 0) {
        const token = take(parser);
        if (token === open) depth += 1;
        if (token === close) depth -= 1;
      }
      return;
    }
    take(parser);
  }

  function skipDirective(parser) {
    expect(parser, "@");
    if (isName(peek(parser))) take(parser);
    if (peek(parser) === "(") skipBalanced(parser, "(", ")");
  }

  function skipBalanced(parser, open, close) {
    expect(parser, open);
    let depth = 1;
    while (peek(parser) && depth > 0) {
      const token = take(parser);
      if (token === open) depth += 1;
      if (token === close) depth -= 1;
    }
  }

  function mockSelection(schema, parentType, selection, errors, path, fragments) {
    const result = {};
    const inlineFragments = [];

    selection.forEach((item) => {
      if (item.kind === "inlineFragment") {
        inlineFragments.push(item);
        return;
      }
      if (item.kind === "fragmentSpread") {
        const fragment = fragments?.[item.fragmentName];
        if (fragment) inlineFragments.push(fragment);
        return;
      }
      if (item.name === "__typename") {
        result[item.responseName] = parentType.name;
        return;
      }
      const field = parentType.fields?.find((candidate) => candidate.name === item.name);
      if (!field) {
        errors.push(`${path}.${item.name}: поле не найдено в типе ${parentType.name}.`);
        return;
      }
      field.args.filter((arg) => arg.required && !item.args.includes(arg.name)).forEach((arg) => {
        errors.push(`${path}.${item.name}: не передан обязательный аргумент ${arg.name}: ${arg.type}.`);
      });
      result[item.responseName] = mockValue(schema, field.type, item.children, errors, `${path}.${item.name}`, fragments);
    });

    inlineFragments.forEach((fragment) => {
      const target = schema.types[fragment.typeName];
      if (!target) {
        errors.push(`${path}: тип inline fragment ${fragment.typeName} не найден в схеме.`);
        return;
      }
      Object.assign(result, mockSelection(schema, target, fragment.children, errors, `${path}<${fragment.typeName}>`, fragments));
    });
    return result;
  }

  function mockValue(schema, typeText, children, errors, path, fragments) {
    const ref = parseTypeRef(typeText);
    if (ref.list) return [mockValue(schema, ref.inner, children, errors, path + "[0]", fragments)];
    const name = namedType(ref.name);
    if (BUILTIN_SCALARS.has(name)) return scalarMock(name);
    const type = schema.types[name];
    if (!type) {
      errors.push(`${path}: тип ${name} не найден в схеме.`);
      return null;
    }
    if (type.kind === "ENUM") return type.values?.[0] || "MOCK_ENUM";
    if (type.kind === "UNION" || type.kind === "INTERFACE") {
      return mockAbstractValue(schema, type, children, errors, path, fragments);
    }
    if (!children.length) {
      errors.push(`${path}: для объектного типа ${name} нужно выбрать вложенные поля.`);
      return {};
    }
    return mockSelection(schema, type, children, errors, path, fragments);
  }

  function mockAbstractValue(schema, type, children, errors, path, fragments) {
    const inline = children.find((item) => item.kind === "inlineFragment" && schema.types[item.typeName]);
    const targetName = inline?.typeName || type.possibleTypes?.[0];
    const target = schema.types[targetName] || type;
    const selection = inline
      ? [{ kind: "field", name: "__typename", responseName: "__typename", args: [], children: [] }, ...inline.children]
      : children;
    if (!selection.length || selection.every((item) => item.name === "__typename")) {
      return { __typename: target.name };
    }
    return mockSelection(schema, target, selection, errors, path, fragments);
  }

  function sampleSelectionForType(schema, typeName, depth) {
    if (BUILTIN_SCALARS.has(typeName)) return "";
    const type = schema.types[typeName];
    if (!type) return "";
    if (depth > 3) return `${indent(depth)}__typename`;
    if (type.kind === "UNION" || type.kind === "INTERFACE") {
      const targetName = type.possibleTypes?.[0];
      const targetFields = sampleSelectionForType(schema, targetName, depth + 1);
      return targetName
        ? `${indent(depth)}__typename\n${indent(depth)}... on ${targetName} {\n${targetFields || indent(depth + 1) + "__typename"}\n${indent(depth)}}`
        : `${indent(depth)}__typename`;
    }
    if (!type.fields?.length || type.kind === "ENUM" || type.kind === "SCALAR") return "";
    return type.fields.slice(0, 5).map((field) => {
      const childType = namedType(field.type);
      const args = field.args?.length
        ? "(" + field.args.map((arg) => `${arg.name}: ${mockInputValue(schema, arg.type, depth)}`).join(", ") + ")"
        : "";
      const childSelection = sampleSelectionForType(schema, childType, depth + 1);
      return childSelection
        ? `${indent(depth)}${field.name}${args} {\n${childSelection}\n${indent(depth)}}`
        : `${indent(depth)}${field.name}${args}`;
    }).join("\n");
  }

  function mockInputValue(schema, typeText, depth) {
    const ref = parseTypeRef(typeText);
    if (ref.list) return `[${mockInputValue(schema, ref.inner, depth + 1)}]`;
    const name = namedType(ref.name);
    if (name === "ID" || name === "String") return JSON.stringify(name === "ID" ? "mock-id-1" : "Mock String");
    if (name === "Int") return "1";
    if (name === "Float") return "10.5";
    if (name === "Boolean") return "true";
    const type = schema.types[name];
    if (type?.kind === "ENUM") return type.values?.[0] || "MOCK_ENUM";
    if (type?.kind === "INPUT" && depth < 4) {
      const pairs = type.fields.slice(0, 8).map((field) => `${field.name}: ${mockInputValue(schema, field.type, depth + 1)}`);
      return `{ ${pairs.join(", ")} }`;
    }
    return "null";
  }

  function parseTypeRef(typeText) {
    const text = String(typeText || "").trim().replace(/!+$/g, "");
    if (text.startsWith("[")) return { list: true, inner: text.slice(1, -1).trim().replace(/!+$/g, "") };
    return { list: false, name: text };
  }

  function namedType(typeText) {
    return String(typeText || "").replace(/[![\]\s]/g, "");
  }

  function scalarMock(name) {
    if (name === "ID") return "mock-id-1";
    if (name === "Int") return 1;
    if (name === "Float") return 10.5;
    if (name === "Boolean") return true;
    return "Mock String";
  }

  function tokenize(raw) {
    const tokens = [];
    const text = stripDescriptions(String(raw || ""));
    const pattern = /#[^\n\r]*|\.{3}|[_A-Za-z][_0-9A-Za-z]*|\$|-?\d+(?:\.\d+)?|"(?:\\.|[^"\\])*"|[!$():=@{}\[\],|]/g;
    let match;
    while ((match = pattern.exec(text))) {
      const token = match[0];
      if (!token || token.startsWith("#")) continue;
      tokens.push(token);
    }
    return tokens;
  }

  function stripDescriptions(value) {
    return String(value || "").replace(/"""[\s\S]*?"""/g, "").replace(/#[^\n\r]*/g, "");
  }

  function splitTopLevel(value, delimiter) {
    const parts = [];
    let current = "";
    let depth = 0;
    for (const char of String(value || "")) {
      if ("([{".includes(char)) depth += 1;
      if (")] }".replace(" ", "").includes(char)) depth -= 1;
      if (char === delimiter && depth === 0) {
        parts.push(current);
        current = "";
        continue;
      }
      current += char;
    }
    if (current.trim()) parts.push(current);
    return parts;
  }

  function indent(depth) {
    return "  ".repeat(depth + 1);
  }

  function unique(items) {
    return [...new Set(items.filter(Boolean))];
  }

  function peek(parser) {
    return parser.tokens[parser.index];
  }

  function take(parser) {
    return parser.tokens[parser.index++];
  }

  function expect(parser, token) {
    if (take(parser) !== token) throw new Error(`Ожидался токен ${token}.`);
  }

  function isName(token) {
    return /^[_A-Za-z][_0-9A-Za-z]*$/.test(token || "");
  }

  function firstObjectType(schema) {
    return Object.values(schema.types).find((type) => type.kind === "TYPE" || type.kind === "OBJECT");
  }

  function readLeftSchema() {
    return document.getElementById("schemaInput")?.value || "";
  }

  function readSchema() {
    return document.getElementById("contractSchemaInput")?.value || readLeftSchema();
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
})();
