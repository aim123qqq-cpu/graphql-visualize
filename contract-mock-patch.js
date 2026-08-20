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
    window.GraphQLContractMock = { parseSchema, parseOperation, runContract };
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
        width: min(1120px, 100%);
        max-height: min(90vh, 860px);
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
        grid-template-columns: minmax(280px, 0.9fr) minmax(320px, 1.1fr);
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

      @media (max-width: 820px) {
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
    button.textContent = "Контракт";
    button.title = "Проверить GraphQL-запрос по текущей схеме и получить mock-ответ";
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
            <h2 id="contractTitle">Проверка контракта</h2>
            <p>Напишите query или mutation: сервис проверит поля по текущей схеме и сгенерирует mock JSON.</p>
          </div>
          <button id="contractCloseBtn" class="contract-close" type="button" aria-label="Закрыть">x</button>
        </div>
        <div class="contract-body">
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
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeContract();
    });
  }

  function openContract() {
    const overlay = document.getElementById("contractOverlay");
    if (!overlay) return;
    overlay.classList.add("open");
    overlay.setAttribute("aria-hidden", "false");
    if (!document.getElementById("contractQueryInput")?.value.trim()) fillSampleQuery();
    setTimeout(() => document.getElementById("contractQueryInput")?.focus(), 0);
  }

  function closeContract() {
    const overlay = document.getElementById("contractOverlay");
    if (!overlay) return;
    overlay.classList.remove("open");
    overlay.setAttribute("aria-hidden", "true");
  }

  function fillSampleQuery() {
    const schema = readSchema();
    const model = parseSchema(schema);
    const root = model.types.Query || firstObjectType(model) || null;
    const field = root?.fields[0];
    const nested = field ? model.types[namedType(field.type)] : null;
    const nestedFields = nested?.fields?.slice(0, 3).map((item) => `      ${item.name}`).join("\n") || "      id";
    const query = field && nested && !BUILTIN_SCALARS.has(namedType(field.type))
      ? `query ContractPreview {\n  ${field.name} {\n${nestedFields}\n  }\n}`
      : `query ContractPreview {\n  ${field?.name || "__typename"}\n}`;
    document.getElementById("contractQueryInput").value = query;
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
    const rootName = operation.type === "mutation" ? "Mutation" : "Query";
    const root = schema.types[rootName];
    if (!root) {
      errors.push(`В схеме не найден root type ${rootName}.`);
      return { response: { data: null, errors: errors.map((message) => ({ message })) }, errors };
    }
    const data = mockSelection(schema, root, operation.selection, errors, rootName);
    return {
      response: errors.length ? { data, errors: errors.map((message) => ({ message })) } : { data },
      errors
    };
  }

  function parseSchema(raw) {
    const text = stripDescriptions(String(raw || ""));
    const types = {};
    const defs = /(?:extend\s+)?(type|interface|input)\s+([_A-Za-z][_0-9A-Za-z]*)[^{]*\{([\s\S]*?)\}|(?:extend\s+)?enum\s+([_A-Za-z][_0-9A-Za-z]*)[^{]*\{([\s\S]*?)\}|scalar\s+([_A-Za-z][_0-9A-Za-z]*)/g;
    let match;
    while ((match = defs.exec(text))) {
      if (match[1]) {
        const kind = match[1].toUpperCase();
        const name = match[2];
        types[name] = types[name] || { name, kind, fields: [] };
        types[name].fields.push(...parseFields(match[3]));
      } else if (match[4]) {
        const name = match[4];
        types[name] = {
          name,
          kind: "ENUM",
          values: match[5].split(/\s+/).map((item) => item.trim()).filter(Boolean)
        };
      } else if (match[6]) {
        const name = match[6];
        types[name] = { name, kind: "SCALAR", fields: [] };
      }
    }
    BUILTIN_SCALARS.forEach((name) => {
      if (!types[name]) types[name] = { name, kind: "SCALAR", fields: [] };
    });
    return { types };
  }

  function parseFields(body) {
    const clean = String(body || "")
      .replace(/#[^\n\r]*/g, "")
      .replace(/@[_A-Za-z][_0-9A-Za-z]*(\([^)]*\))?/g, "")
      .replace(/[,;]/g, "\n")
      .replace(/\s+/g, " ")
      .trim();
    const fields = [];
    const pattern = /([_A-Za-z][_0-9A-Za-z]*)\s*(?:\(([^)]*)\))?\s*:\s*([^=]+?)(?=\s+[_A-Za-z][_0-9A-Za-z]*\s*(?:\(|:)|$)/g;
    let match;
    while ((match = pattern.exec(clean))) {
      fields.push({
        name: match[1],
        args: parseArgs(match[2]),
        type: match[3].trim()
      });
    }
    return fields;
  }

  function parseArgs(raw) {
    if (!raw) return [];
    return raw.split(",").map((part) => {
      const match = part.trim().match(/^([_A-Za-z][_0-9A-Za-z]*)\s*:\s*([^=]+)(?:=.*)?$/);
      return match ? { name: match[1], type: match[2].trim(), required: /!\s*$/.test(match[2].trim()) } : null;
    }).filter(Boolean);
  }

  function parseOperation(raw) {
    const tokens = tokenize(raw);
    const parser = { tokens, index: 0 };
    let type = "query";
    if (peek(parser) === "query" || peek(parser) === "mutation") {
      type = take(parser);
      if (isName(peek(parser))) take(parser);
      if (peek(parser) === "(") skipBalanced(parser, "(", ")");
    }
    while (peek(parser) && peek(parser) !== "{") take(parser);
    return { type, selection: parseSelectionSet(parser) };
  }

  function parseSelectionSet(parser) {
    expect(parser, "{");
    const selection = [];
    while (peek(parser) && peek(parser) !== "}") {
      if (peek(parser) === "...") {
        skipFragment(parser);
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
      selection.push({ responseName, name, args, children });
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

  function skipFragment(parser) {
    take(parser);
    while (peek(parser) && peek(parser) !== "}") {
      if (peek(parser) === "{") {
        parseSelectionSet(parser);
        return;
      }
      take(parser);
    }
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

  function mockSelection(schema, parentType, selection, errors, path) {
    const result = {};
    selection.forEach((item) => {
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
      result[item.responseName] = mockValue(schema, field.type, item.children, errors, `${path}.${item.name}`);
    });
    return result;
  }

  function mockValue(schema, typeText, children, errors, path) {
    const ref = parseTypeRef(typeText);
    if (ref.list) return [mockValue(schema, ref.inner, children, errors, path + "[0]")];
    const name = namedType(ref.name);
    if (BUILTIN_SCALARS.has(name)) return scalarMock(name);
    const type = schema.types[name];
    if (!type) {
      errors.push(`${path}: тип ${name} не найден в схеме.`);
      return null;
    }
    if (type.kind === "ENUM") return type.values?.[0] || "MOCK_ENUM";
    if (!children.length) {
      errors.push(`${path}: для объектного типа ${name} нужно выбрать вложенные поля.`);
      return {};
    }
    return mockSelection(schema, type, children, errors, path);
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
    const pattern = /#[^\n\r]*|\.{3}|[_A-Za-z][_0-9A-Za-z]*|-?\d+(?:\.\d+)?|"(?:\\.|[^"\\])*"|[!$():=@{}\[\],]/g;
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

  function readSchema() {
    return document.getElementById("schemaInput")?.value || "";
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
