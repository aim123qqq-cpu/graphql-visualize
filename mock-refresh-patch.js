(function () {
  "use strict";

  if (window.__graphqlMockRefreshPatchReady) return;
  window.__graphqlMockRefreshPatchReady = true;

  let lastSchemaFingerprint = "";

  initWhenReady();

  function initWhenReady() {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", init);
      return;
    }
    init();
  }

  function init() {
    bindAfterReady();
  }

  function bindAfterReady(attempt = 0) {
    const mockButton = document.getElementById("contractMockBtn");
    const refreshButton = document.getElementById("contractRefreshSchemaBtn");
    if (!mockButton || !refreshButton || !window.GraphQLContractMock) {
      if (attempt < 30) window.setTimeout(() => bindAfterReady(attempt + 1), 100);
      return;
    }

    mockButton.addEventListener("click", () => {
      window.setTimeout(() => refreshMockFromLeft({ forceSample: false }), 0);
    });
    refreshButton.addEventListener("click", () => {
      window.setTimeout(() => refreshMockFromLeft({ forceSample: true }), 0);
    });
  }

  function refreshMockFromLeft(options) {
    const api = window.GraphQLContractMock;
    const leftSchema = document.getElementById("schemaInput")?.value || "";
    const schemaInput = document.getElementById("contractSchemaInput");
    const queryInput = document.getElementById("contractQueryInput");
    const status = document.getElementById("contractStatus");
    if (!api || !schemaInput || !queryInput) return;

    const nextFingerprint = fingerprint(leftSchema);
    const schemaChanged = nextFingerprint !== lastSchemaFingerprint;
    lastSchemaFingerprint = nextFingerprint;
    schemaInput.value = leftSchema;

    if (options.forceSample || schemaChanged || shouldReplaceQuery(api, leftSchema, queryInput.value)) {
      queryInput.value = api.buildSampleQuery(leftSchema);
    }

    if (status) {
      status.textContent = leftSchema.trim() ? "SDL и пример запроса обновлены из левой панели" : "В левой панели нет SDL";
      status.className = "contract-status " + (leftSchema.trim() ? "ok" : "bad");
    }
  }

  function shouldReplaceQuery(api, schemaText, queryText) {
    if (!queryText.trim()) return true;
    try {
      const result = api.runContract(schemaText, queryText);
      return result.errors.some((message) => /поле не найдено в типе Query|root type Query/.test(message));
    } catch (error) {
      return true;
    }
  }

  function fingerprint(value) {
    const text = String(value || "");
    let hash = 0;
    for (let index = 0; index < text.length; index += 1) {
      hash = ((hash << 5) - hash + text.charCodeAt(index)) | 0;
    }
    return `${text.length}:${hash}`;
  }
})();
