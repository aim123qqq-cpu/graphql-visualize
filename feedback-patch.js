(function () {
  "use strict";

  const ENDPOINT = window.GRAPHQL_VISUALIZER_FEEDBACK_ENDPOINT || "/api/feedback";
  const PENDING_KEY = "graphql-visualizer-feedback-pending";

  if (window.__graphqlFeedbackPatchReady) return;
  window.__graphqlFeedbackPatchReady = true;

  injectStyles();
  setupFeedback();

  function injectStyles() {
    if (document.getElementById("feedbackPatchStyles")) return;
    const style = document.createElement("style");
    style.id = "feedbackPatchStyles";
    style.textContent = `
      .feedback-btn {
        position: relative;
      }

      .feedback-btn::after {
        content: attr(data-tooltip);
        position: absolute;
        right: 0;
        top: calc(100% + 8px);
        z-index: 50;
        width: max-content;
        max-width: 220px;
        padding: 7px 9px;
        border: 1px solid var(--line);
        border-radius: 8px;
        background: var(--panel);
        color: var(--ink);
        box-shadow: 0 10px 24px rgba(0, 0, 0, 0.12);
        font-size: 12px;
        line-height: 1.2;
        opacity: 0;
        pointer-events: none;
        transform: translateY(-3px);
        transition: opacity 120ms ease, transform 120ms ease;
      }

      .feedback-btn:hover::after,
      .feedback-btn:focus-visible::after {
        opacity: 1;
        transform: translateY(0);
      }

      .feedback-overlay {
        position: fixed;
        inset: 0;
        z-index: 130;
        display: none;
        align-items: center;
        justify-content: center;
        padding: 18px;
        background: rgba(0, 0, 0, 0.36);
      }

      body.theme-dark .feedback-overlay {
        background: rgba(0, 0, 0, 0.62);
      }

      .feedback-overlay.open {
        display: flex;
      }

      .feedback-dialog {
        width: min(560px, 100%);
        max-height: min(86vh, 760px);
        display: grid;
        grid-template-rows: auto minmax(0, 1fr);
        border: 1px solid var(--line);
        border-radius: 12px;
        background: var(--panel);
        color: var(--ink);
        overflow: hidden;
        box-shadow: 0 24px 70px rgba(0, 0, 0, 0.24);
      }

      .feedback-head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 14px;
        padding: 18px 20px;
        border-bottom: 1px solid var(--line);
      }

      .feedback-head h2 {
        margin: 0 0 4px;
        font-size: 18px;
      }

      .feedback-head p {
        margin: 0;
        color: var(--muted);
      }

      .feedback-close {
        width: 34px;
        min-width: 34px;
        padding: 0;
      }

      .feedback-form {
        display: grid;
        gap: 12px;
        padding: 18px 20px 20px;
        overflow: auto;
      }

      .feedback-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
      }

      .feedback-field {
        display: grid;
        gap: 6px;
      }

      .feedback-field label {
        color: var(--muted);
        font-size: 12px;
        font-weight: 700;
      }

      .feedback-field input,
      .feedback-field select,
      .feedback-field textarea {
        width: 100%;
        border: 1px solid var(--line);
        border-radius: 8px;
        background: var(--field-bg);
        color: var(--ink);
        min-height: 36px;
        padding: 8px 10px;
      }

      .feedback-field textarea {
        min-height: 132px;
        resize: vertical;
      }

      .feedback-actions {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 10px;
        padding-top: 4px;
      }

      .feedback-status {
        flex: 1;
        min-width: 0;
        color: var(--muted);
        font-size: 12px;
        line-height: 1.25;
      }

      .feedback-actions button[disabled] {
        cursor: wait;
        opacity: 0.68;
      }

      @media (max-width: 620px) {
        .feedback-grid {
          grid-template-columns: 1fr;
        }

        .feedback-actions {
          align-items: stretch;
          flex-direction: column;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function setupFeedback() {
    ensureButton();
    ensureModal();
  }

  function ensureButton() {
    const actions = document.querySelector(".topbar .actions");
    if (!actions || document.getElementById("feedbackBtn")) return;

    const button = document.createElement("button");
    button.id = "feedbackBtn";
    button.className = "icon-btn feedback-btn";
    button.type = "button";
    button.textContent = "?";
    button.dataset.tooltip = "Поделитесь мнением";
    button.title = "Поделитесь мнением";
    button.setAttribute("aria-label", "Поделитесь мнением");
    button.addEventListener("click", openFeedback);
    actions.insertBefore(button, actions.firstChild);
  }

  function ensureModal() {
    if (document.getElementById("feedbackOverlay")) return;
    const overlay = document.createElement("div");
    overlay.id = "feedbackOverlay";
    overlay.className = "feedback-overlay";
    overlay.setAttribute("aria-hidden", "true");
    overlay.innerHTML = `
      <div class="feedback-dialog" role="dialog" aria-modal="true" aria-labelledby="feedbackTitle">
        <div class="feedback-head">
          <div>
            <h2 id="feedbackTitle">Обратная связь</h2>
            <p>Расскажите, что улучшить, что сломалось или чего не хватает.</p>
          </div>
          <button id="feedbackCloseBtn" class="feedback-close" type="button" aria-label="Закрыть">x</button>
        </div>
        <form id="feedbackForm" class="feedback-form">
          <div class="feedback-grid">
            <div class="feedback-field">
              <label for="feedbackName">Имя</label>
              <input id="feedbackName" name="name" type="text" autocomplete="name" placeholder="Как к вам обращаться">
            </div>
            <div class="feedback-field">
              <label for="feedbackContact">Контакт</label>
              <input id="feedbackContact" name="contact" type="text" placeholder="Email, Telegram или GitHub">
            </div>
          </div>
          <div class="feedback-grid">
            <div class="feedback-field">
              <label for="feedbackType">Тип</label>
              <select id="feedbackType" name="type">
                <option value="Идея">Идея</option>
                <option value="Баг">Баг</option>
                <option value="Улучшение">Улучшение</option>
                <option value="Вопрос">Вопрос</option>
              </select>
            </div>
            <div class="feedback-field">
              <label for="feedbackRating">Оценка</label>
              <select id="feedbackRating" name="rating">
                <option value="5">5 - отлично</option>
                <option value="4">4 - хорошо</option>
                <option value="3">3 - нормально</option>
                <option value="2">2 - плохо</option>
                <option value="1">1 - критично</option>
              </select>
            </div>
          </div>
          <div class="feedback-field">
            <label for="feedbackMessage">Сообщение</label>
            <textarea id="feedbackMessage" name="message" required placeholder="Опишите обратную связь"></textarea>
          </div>
          <div class="feedback-actions">
            <span id="feedbackStatus" class="feedback-status" aria-live="polite"></span>
            <button id="feedbackCancelBtn" type="button">Отмена</button>
            <button class="primary" type="submit">Отправить</button>
          </div>
        </form>
      </div>`;
    document.body.appendChild(overlay);

    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) closeFeedback();
    });
    document.getElementById("feedbackCloseBtn")?.addEventListener("click", closeFeedback);
    document.getElementById("feedbackCancelBtn")?.addEventListener("click", closeFeedback);
    document.getElementById("feedbackForm")?.addEventListener("submit", submitFeedback);
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeFeedback();
    });
  }

  function openFeedback() {
    const overlay = document.getElementById("feedbackOverlay");
    if (!overlay) return;
    overlay.classList.add("open");
    overlay.setAttribute("aria-hidden", "false");
    setStatus("");
    setTimeout(() => document.getElementById("feedbackMessage")?.focus(), 0);
  }

  function closeFeedback() {
    const overlay = document.getElementById("feedbackOverlay");
    if (!overlay) return;
    overlay.classList.remove("open");
    overlay.setAttribute("aria-hidden", "true");
  }

  async function submitFeedback(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const submit = form.querySelector("button[type='submit']");
    const data = new FormData(form);
    const message = String(data.get("message") || "").trim();
    if (!message) return;

    const payload = {
      createdAt: new Date().toISOString(),
      type: String(data.get("type") || "ОС"),
      rating: String(data.get("rating") || ""),
      name: String(data.get("name") || "").trim() || "Не указано",
      contact: String(data.get("contact") || "").trim() || "Не указано",
      message,
      page: location.href,
      userAgent: navigator.userAgent
    };

    try {
      setStatus("Отправляем...");
      if (submit) submit.disabled = true;
      const response = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setStatus("Спасибо, ОС отправлена.");
      form.reset();
      setTimeout(closeFeedback, 700);
    } catch (error) {
      savePendingFeedback(payload);
      setStatus("Сервер ОС пока недоступен. Запись сохранена локально и не потеряется.");
    } finally {
      if (submit) submit.disabled = false;
    }
  }

  function setStatus(text) {
    const status = document.getElementById("feedbackStatus");
    if (status) status.textContent = text;
  }

  function savePendingFeedback(payload) {
    const list = JSON.parse(localStorage.getItem(PENDING_KEY) || "[]");
    list.unshift(payload);
    localStorage.setItem(PENDING_KEY, JSON.stringify(list.slice(0, 20)));
  }
})();
