(function () {
  "use strict";

  if (window.__graphqlTooltipsPatchReady) return;
  window.__graphqlTooltipsPatchReady = true;

  const TOOLTIPS = [
    ["#themeToggleBtn", "Переключить светлую и темную тему"],
    ["#buildBtn", "Построить визуализацию по текущей SDL или introspection JSON"],
    ["#sampleBtn", "Открыть FAQ с примером и правилами составления схемы"],
    ["#clearBtn", "Очистить схему и сбросить текущую визуализацию"],
    ["#leftPanelBtn", "Скрыть или показать левую панель"],
    ["#rightPanelBtn", "Скрыть или показать правую панель"],
    ["#optimizeBtn", "Перестроить блоки так, чтобы связи читались лучше"],
    ["#exportDotBtn", "Экспортировать схему в DOT"],
    ["#exportSvgBtn", "Экспортировать схему в SVG"],
    ["#exportPngBtn", "Экспортировать схему в PNG"],
    ["#exportDrawioBtn", "Экспортировать схему в draw.io"],
    ["#zoomOutBtn", "Уменьшить масштаб схемы"],
    ["#zoomInBtn", "Увеличить масштаб схемы"],
    ["#fitGraphBtn", "Поместить всю схему на экран"],
    [".mode[data-mode='types']", "Типы: карта блоков, повторные связи объединены"],
    [".mode[data-mode='fields']", "Поля: акцент на полях, которые ссылаются на другие типы"],
    [".mode[data-mode='all']", "Все: полные таблицы и все найденные связи"],
    ["#feedbackBtn", "Поделитесь мнением"],
    ["#feedbackCancelBtn", "Закрыть форму без отправки"],
    ["#feedbackCloseBtn", "Закрыть окно"],
    ["#loadEndpointBtn", "Загрузить introspection с GraphQL endpoint"]
  ];

  injectStyles();
  applyTooltips();
  observeDom();

  function injectStyles() {
    if (document.getElementById("tooltipsPatchStyles")) return;
    const style = document.createElement("style");
    style.id = "tooltipsPatchStyles";
    style.textContent = `
      .ui-tooltip {
        position: relative;
      }

      .ui-tooltip:not(.feedback-btn)::after {
        content: attr(data-ui-tooltip);
        position: absolute;
        left: 50%;
        top: calc(100% + 8px);
        z-index: 160;
        width: max-content;
        max-width: min(260px, 72vw);
        padding: 7px 9px;
        border: 1px solid var(--line);
        border-radius: 8px;
        background: var(--panel);
        color: var(--ink);
        box-shadow: 0 10px 24px rgba(0, 0, 0, 0.14);
        font-size: 12px;
        font-weight: 500;
        line-height: 1.25;
        text-align: left;
        white-space: normal;
        opacity: 0;
        pointer-events: none;
        transform: translate(-50%, -3px);
        transition: opacity 120ms ease, transform 120ms ease;
      }

      .ui-tooltip:not(.feedback-btn):hover::after,
      .ui-tooltip:not(.feedback-btn):focus-visible::after {
        opacity: 1;
        transform: translate(-50%, 0);
      }

      .topbar .ui-tooltip:not(.feedback-btn):last-child::after,
      .exports .ui-tooltip:last-child::after,
      .nav-controls .ui-tooltip:last-child::after {
        left: auto;
        right: 0;
        transform: translateY(-3px);
      }

      .topbar .ui-tooltip:not(.feedback-btn):last-child:hover::after,
      .topbar .ui-tooltip:not(.feedback-btn):last-child:focus-visible::after,
      .exports .ui-tooltip:last-child:hover::after,
      .exports .ui-tooltip:last-child:focus-visible::after,
      .nav-controls .ui-tooltip:last-child:hover::after,
      .nav-controls .ui-tooltip:last-child:focus-visible::after {
        transform: translateY(0);
      }

      .panel-toggle.ui-tooltip::after {
        left: auto;
        right: 0;
        transform: translateY(-3px);
      }

      .panel-toggle.ui-tooltip:hover::after,
      .panel-toggle.ui-tooltip:focus-visible::after {
        transform: translateY(0);
      }
    `;
    document.head.appendChild(style);
  }

  function observeDom() {
    const observer = new MutationObserver(() => applyTooltips());
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function applyTooltips() {
    TOOLTIPS.forEach(([selector, text]) => {
      document.querySelectorAll(selector).forEach((button) => {
        if (!(button instanceof HTMLElement)) return;
        button.dataset.uiTooltip = text;
        button.classList.add("ui-tooltip");
        if (!button.getAttribute("aria-label")) button.setAttribute("aria-label", text);
        button.setAttribute("title", text);
      });
    });
  }
})();
