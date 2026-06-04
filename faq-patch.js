(function () {
  "use strict";

  function init() {
    if (window.__graphqlFaqPatchReady) return;
    window.__graphqlFaqPatchReady = true;
    injectStyles();
    setupFaqButton();
    setupFaqModal();
  }

  function injectStyles() {
    if (document.getElementById("faqPatchStyles")) return;
    const style = document.createElement("style");
    style.id = "faqPatchStyles";
    style.textContent = `
      .faq-overlay {
        position: fixed;
        inset: 0;
        z-index: 100;
        display: none;
        align-items: center;
        justify-content: center;
        padding: 24px;
        background: rgba(0, 0, 0, 0.38);
      }
      body.theme-dark .faq-overlay {
        background: rgba(0, 0, 0, 0.58);
      }
      .faq-overlay.open {
        display: flex;
      }
      .faq-dialog {
        display: grid;
        grid-template-rows: auto minmax(0, 1fr);
        width: min(1040px, 100%);
        max-height: min(86vh, 920px);
        border: 1px solid var(--line);
        border-radius: 12px;
        background: var(--panel);
        box-shadow: 0 22px 70px rgba(0, 0, 0, 0.22);
        overflow: hidden;
      }
      body.theme-dark .faq-dialog {
        box-shadow: 0 26px 80px rgba(0, 0, 0, 0.46);
      }
      .faq-head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 16px;
        padding: 18px 20px;
        border-bottom: 1px solid var(--line);
      }
      .faq-head h2 {
        margin: 0 0 4px;
        font-size: 20px;
      }
      .faq-head p {
        margin: 0;
        color: var(--muted);
      }
      .faq-close {
        width: 36px;
        min-width: 36px;
        padding: 0;
        font-size: 18px;
      }
      .faq-body {
        overflow: auto;
        padding: 20px;
      }
      .faq-grid {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(280px, 0.78fr);
        gap: 18px;
        align-items: start;
      }
      .faq-section {
        display: grid;
        gap: 10px;
        padding: 16px;
        border: 1px solid var(--line);
        border-radius: 10px;
        background: color-mix(in srgb, var(--panel), var(--field-bg) 52%);
      }
      .faq-section h3 {
        margin: 0;
        font-size: 15px;
      }
      .faq-section p {
        margin: 0;
        color: var(--muted);
      }
      .faq-section ul,
      .faq-section ol {
        display: grid;
        gap: 8px;
        margin: 0;
        padding-left: 20px;
      }
      .faq-section li {
        color: var(--ink);
      }
      .faq-code {
        margin: 0;
        padding: 12px;
        overflow: auto;
        border: 1px solid var(--line);
        border-radius: 8px;
        background: var(--field-bg);
        color: var(--ink);
        font-family: Consolas, "Courier New", monospace;
        font-size: 12px;
        line-height: 1.55;
        white-space: pre;
      }
      .faq-visual {
        display: grid;
        gap: 12px;
        position: sticky;
        top: 0;
      }
      .faq-card {
        border: 1px solid var(--line);
        border-radius: 10px;
        background: var(--panel);
        overflow: hidden;
      }
      .faq-card-title {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 10px 12px;
        border-bottom: 1px solid var(--line);
        background: color-mix(in srgb, var(--panel), #f1f5f9 42%);
        font-weight: 700;
      }
      body.theme-dark .faq-card-title {
        background: #192235;
      }
      .faq-pill {
        padding: 2px 8px;
        border: 1px solid var(--line);
        border-radius: 999px;
        color: var(--muted);
        font-size: 11px;
        font-weight: 700;
      }
      .faq-row {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 12px;
        padding: 8px 12px;
        font-size: 12px;
      }
      .faq-row span:last-child {
        color: var(--accent);
        font-family: Consolas, "Courier New", monospace;
        font-weight: 700;
        text-align: right;
      }
      .faq-arrow {
        display: grid;
        grid-template-columns: 1fr auto 1fr;
        align-items: center;
        gap: 10px;
        color: var(--muted);
        font-size: 12px;
      }
      .faq-arrow::before,
      .faq-arrow::after {
        content: "";
        height: 1px;
        background: var(--line);
      }
      .faq-note {
        padding: 12px;
        border: 1px solid color-mix(in srgb, var(--accent), var(--line) 52%);
        border-radius: 10px;
        background: var(--accent-soft);
        color: var(--ink);
      }
      .faq-note strong {
        display: block;
        margin-bottom: 4px;
      }
      @media (max-width: 820px) {
        .faq-overlay {
          padding: 12px;
        }
        .faq-grid {
          grid-template-columns: 1fr;
        }
        .faq-visual {
          position: static;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function setupFaqButton() {
    const button = document.getElementById("sampleBtn");
    if (!button || button.dataset.faqPatchReady) return;
    button.dataset.faqPatchReady = "true";
    button.textContent = "FAQ";
    button.title = "\u041a\u0430\u043a \u0441\u043e\u0441\u0442\u0430\u0432\u0438\u0442\u044c GraphQL \u0441\u0445\u0435\u043c\u0443";
    button.setAttribute("aria-label", button.title);
    button.onclick = null;
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      openFaq();
    }, true);
  }

  function setupFaqModal() {
    if (document.getElementById("faqOverlay")) return;
    const overlay = document.createElement("div");
    overlay.id = "faqOverlay";
    overlay.className = "faq-overlay";
    overlay.innerHTML = content();
    document.body.appendChild(overlay);
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) closeFaq();
    });
    document.getElementById("faqCloseBtn")?.addEventListener("click", closeFaq);
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeFaq();
    });
  }

  function openFaq() {
    const overlay = document.getElementById("faqOverlay");
    if (!overlay) return;
    overlay.classList.add("open");
    overlay.setAttribute("aria-hidden", "false");
    document.getElementById("faqCloseBtn")?.focus();
  }

  function closeFaq() {
    const overlay = document.getElementById("faqOverlay");
    if (!overlay) return;
    overlay.classList.remove("open");
    overlay.setAttribute("aria-hidden", "true");
  }

  function content() {
    return `
      <div class="faq-dialog" role="dialog" aria-modal="true" aria-labelledby="faqTitle">
        <div class="faq-head">
          <div>
            <h2 id="faqTitle">&#1050;&#1072;&#1082; &#1089;&#1086;&#1089;&#1090;&#1072;&#1074;&#1080;&#1090;&#1100; GraphQL &#1089;&#1093;&#1077;&#1084;&#1091;</h2>
            <p>&#1055;&#1086;&#1076;&#1088;&#1086;&#1073;&#1085;&#1072;&#1103; &#1087;&#1072;&#1084;&#1103;&#1090;&#1082;&#1072; &#1087;&#1086; SDL: &#1090;&#1080;&#1087;&#1099;, &#1087;&#1086;&#1083;&#1103;, &#1089;&#1074;&#1103;&#1079;&#1080; &#1080; &#1090;&#1086;, &#1082;&#1072;&#1082; &#1101;&#1090;&#1086; &#1087;&#1088;&#1077;&#1074;&#1088;&#1072;&#1097;&#1072;&#1077;&#1090;&#1089;&#1103; &#1074; &#1075;&#1088;&#1072;&#1092;.</p>
          </div>
          <button id="faqCloseBtn" class="faq-close" type="button" aria-label="Close">x</button>
        </div>
        <div class="faq-body">
          <div class="faq-grid">
            <div class="faq-main">
              <section class="faq-section">
                <h3>1. &#1057; &#1095;&#1077;&#1075;&#1086; &#1085;&#1072;&#1095;&#1072;&#1090;&#1100;</h3>
                <p>GraphQL SDL &#1101;&#1090;&#1086; &#1090;&#1077;&#1082;&#1089;&#1090;&#1086;&#1074;&#1086;&#1077; &#1086;&#1087;&#1080;&#1089;&#1072;&#1085;&#1080;&#1077; &#1076;&#1072;&#1085;&#1085;&#1099;&#1093;. &#1042;&#1099; &#1086;&#1087;&#1080;&#1089;&#1099;&#1074;&#1072;&#1077;&#1090;&#1077;, &#1082;&#1072;&#1082;&#1080;&#1077; &#1073;&#1083;&#1086;&#1082;&#1080; &#1077;&#1089;&#1090;&#1100; &#1074; &#1089;&#1080;&#1089;&#1090;&#1077;&#1084;&#1077; &#1080; &#1082;&#1072;&#1082; &#1086;&#1085;&#1080; &#1089;&#1074;&#1103;&#1079;&#1072;&#1085;&#1099;.</p>
                <pre class="faq-code">type Query {
  me: User!
  feed: [Post!]!
}

type User {
  id: ID!
  username: String!
  posts: [Post!]!
}

type Post {
  id: ID!
  title: String!
  author: User!
}</pre>
              </section>
              <section class="faq-section">
                <h3>2. &#1063;&#1090;&#1086; &#1086;&#1079;&#1085;&#1072;&#1095;&#1072;&#1102;&#1090; type, input, enum, interface</h3>
                <ul>
                  <li><strong>type</strong> - &#1086;&#1073;&#1098;&#1077;&#1082;&#1090; &#1076;&#1072;&#1085;&#1085;&#1099;&#1093;. &#1042; &#1075;&#1088;&#1072;&#1092;&#1077; &#1101;&#1090;&#1086; &#1086;&#0442;&#1076;&#1077;&#1083;&#1100;&#1085;&#1099;&#1081; &#1073;&#1083;&#1086;&#1082;.</li>
                  <li><strong>input</strong> - &#1089;&#1090;&#1088;&#1091;&#1082;&#1090;&#1091;&#1088;&#1072; &#1076;&#1083;&#1103; &#1074;&#1093;&#1086;&#1076;&#1085;&#1099;&#1093; &#1076;&#1072;&#1085;&#1085;&#1099;&#1093;, &#1085;&#1072;&#1087;&#1088;&#1080;&#1084;&#1077;&#1088; &#1076;&#1083;&#1103; &#1089;&#1086;&#1079;&#1076;&#1072;&#1085;&#1080;&#1103; &#1080;&#1083;&#1080; &#1092;&#1080;&#1083;&#1100;&#1090;&#1088;&#1072;.</li>
                  <li><strong>enum</strong> - &#1085;&#1072;&#1073;&#1086;&#1088; &#1089;&#1090;&#1088;&#1086;&#1075;&#1080;&#1093; &#1079;&#1085;&#1072;&#1095;&#1077;&#1085;&#1080;&#1081;, &#1085;&#1072;&#1087;&#1088;&#1080;&#1084;&#1077;&#1088; ACTIVE, DRAFT, ARCHIVED.</li>
                  <li><strong>interface</strong> - &#1086;&#1073;&#1097;&#1080;&#1081; &#1082;&#1086;&#1085;&#1090;&#1088;&#1072;&#1082;&#1090; &#1076;&#1083;&#1103; &#1085;&#1077;&#1089;&#1082;&#1086;&#1083;&#1100;&#1082;&#1080;&#1093; &#1090;&#1080;&#1087;&#1086;&#1074;.</li>
                </ul>
              </section>
              <section class="faq-section">
                <h3>3. &#1050;&#1072;&#1082; &#1095;&#1080;&#1090;&#1072;&#1090;&#1100; &#1090;&#1080;&#1087; &#1087;&#1086;&#1083;&#1103;</h3>
                <ol>
                  <li><code>String</code>, <code>Int</code>, <code>Boolean</code>, <code>ID</code> - &#1089;&#1082;&#1072;&#1083;&#1103;&#1088;&#1099;, &#1086;&#1085;&#1080; &#1085;&#1077; &#1089;&#1090;&#1088;&#1086;&#1103;&#1090; &#1086;&#1090;&#1076;&#1077;&#1083;&#1100;&#1085;&#1091;&#1102; &#1089;&#1083;&#1086;&#1078;&#1085;&#1091;&#1102; &#1089;&#1074;&#1103;&#1079;&#1100;.</li>
                  <li><code>User</code> - &#1089;&#1089;&#1099;&#1083;&#1082;&#1072; &#1085;&#1072; &#1076;&#1088;&#1091;&#1075;&#1086;&#1081; &#1073;&#1083;&#1086;&#1082;. &#1042; &#1074;&#1080;&#1079;&#1091;&#1072;&#1083;&#1080;&#1079;&#1072;&#1094;&#1080;&#1080; &#1087;&#1086;&#1103;&#1074;&#1080;&#1090;&#1089;&#1103; &#1089;&#1090;&#1088;&#1077;&#1083;&#1082;&#1072;.</li>
                  <li><code>User!</code> - &#1086;&#1073;&#1103;&#1079;&#1072;&#1090;&#1077;&#1083;&#1100;&#1085;&#1086;&#1077; &#1087;&#1086;&#1083;&#1077;, null &#1085;&#1077; &#1086;&#1078;&#1080;&#1076;&#1072;&#1077;&#1090;&#1089;&#1103;.</li>
                  <li><code>[Post!]!</code> - &#1086;&#1073;&#1103;&#1079;&#1072;&#1090;&#1077;&#1083;&#1100;&#1085;&#1099;&#1081; &#1089;&#1087;&#1080;&#1089;&#1086;&#1082; &#1086;&#1073;&#1103;&#1079;&#1072;&#1090;&#1077;&#1083;&#1100;&#1085;&#1099;&#1093; Post.</li>
                </ol>
              </section>
              <section class="faq-section">
                <h3>4. &#1050;&#1072;&#1082; &#1087;&#1086;&#1103;&#1074;&#1083;&#1103;&#1102;&#1090;&#1089;&#1103; &#1089;&#1090;&#1088;&#1077;&#1083;&#1082;&#1080;</h3>
                <p>&#1045;&#1089;&#1083;&#1080; &#1087;&#1086;&#1083;&#1077; &#1080;&#1084;&#1077;&#1077;&#1090; &#1090;&#1080;&#1087; &#1076;&#1088;&#1091;&#1075;&#1086;&#1075;&#1086; &#1073;&#1083;&#1086;&#1082;&#1072;, &#1087;&#1083;&#1072;&#1090;&#1092;&#1086;&#1088;&#1084;&#1072; &#1089;&#1090;&#1088;&#1086;&#1080;&#1090; &#1089;&#1074;&#1103;&#1079;&#1100; &#1086;&#1090; &#1082;&#1086;&#1085;&#1082;&#1088;&#1077;&#1090;&#1085;&#1086;&#1075;&#1086; &#1087;&#1086;&#1083;&#1103; &#1082; &#1094;&#1077;&#1083;&#1077;&#1074;&#1086;&#1084;&#1091; &#1090;&#1080;&#1087;&#1091;.</p>
                <pre class="faq-code">type Query {
  me: User!
}

type User {
  posts: [Post!]!
}</pre>
                <p><code>me: User!</code> &#1076;&#1072;&#1105;&#1090; &#1089;&#1090;&#1088;&#1077;&#1083;&#1082;&#1091; Query -> User. <code>posts: [Post!]!</code> &#1076;&#1072;&#1105;&#1090; &#1089;&#1090;&#1088;&#1077;&#1083;&#1082;&#1091; User -> Post.</p>
              </section>
              <section class="faq-section">
                <h3>5. &#1056;&#1077;&#1082;&#1086;&#1084;&#1077;&#1085;&#1076;&#1091;&#1077;&#1084;&#1099;&#1081; &#1087;&#1086;&#1088;&#1103;&#1076;&#1086;&#1082;</h3>
                <ol>
                  <li>&#1057;&#1085;&#1072;&#1095;&#1072;&#1083;&#1072; &#1086;&#1087;&#1080;&#1096;&#1080;&#1090;&#1077; <code>Query</code> - &#1090;&#1086;&#1095;&#1082;&#1080; &#1074;&#1093;&#1086;&#1076;&#1072; &#1074; API.</li>
                  <li>&#1047;&#1072;&#1090;&#1077;&#1084; &#1086;&#1087;&#1080;&#1096;&#1080;&#1090;&#1077; &#1086;&#0441;&#1085;&#1086;&#1074;&#1085;&#1099;&#1077; <code>type</code>: User, Product, Order.</li>
                  <li>&#1044;&#1086;&#1073;&#1072;&#1074;&#1100;&#1090;&#1077; &#1087;&#1086;&#1083;&#1103; &#1089; &#1087;&#1088;&#1086;&#0441;&#1090;&#1099;&#1084;&#1080; &#1090;&#1080;&#1087;&#1072;&#1084;&#1080;: id, title, status.</li>
                  <li>&#1057;&#1074;&#1103;&#1078;&#1080;&#1090;&#1077; &#1073;&#1083;&#1086;&#1082;&#1080; &#1087;&#1086;&#1083;&#1103;&#1084;&#1080;, &#1075;&#1076;&#1077; &#1090;&#1080;&#1087; &#1087;&#1086;&#1083;&#1103; - &#1101;&#1090;&#1086; &#1076;&#1088;&#1091;&#1075;&#1086;&#1081; &#1073;&#1083;&#1086;&#1082;.</li>
                  <li>&#1044;&#1083;&#1103; &#1092;&#1086;&#1088;&#1084; &#1080; &#1092;&#1080;&#1083;&#1100;&#1090;&#1088;&#1086;&#1074; &#1086;&#0442;&#1076;&#1077;&#1083;&#1100;&#1085;&#1086; &#1089;&#1086;&#1079;&#1076;&#1072;&#1081;&#1090;&#1077; <code>input</code>.</li>
                </ol>
              </section>
              <section class="faq-section">
                <h3>6. &#1063;&#1072;&#1089;&#1090;&#1099;&#1077; &#1086;&#1096;&#1080;&#1073;&#1082;&#1080;</h3>
                <ul>
                  <li>&#1053;&#1077; &#1079;&#1072;&#1073;&#1099;&#1074;&#1072;&#1081;&#1090;&#1077; <code>:</code> &#1084;&#1077;&#1078;&#1076;&#1091; &#1080;&#1084;&#1077;&#1085;&#1077;&#1084; &#1087;&#1086;&#1083;&#1103; &#1080; &#1090;&#1080;&#1087;&#1086;&#1084;.</li>
                  <li>&#1053;&#1077; &#1089;&#1090;&#1072;&#1074;&#1100;&#1090;&#1077; &#1079;&#1072;&#1087;&#1103;&#1090;&#1099;&#1077; &#1084;&#1077;&#1078;&#1076;&#1091; &#1087;&#1086;&#1083;&#1103;&#1084;&#1080;: &#1074; SDL &#1086;&#1085;&#1080; &#1085;&#1077; &#1085;&#1091;&#1078;&#1085;&#1099;.</li>
                  <li>&#1045;&#1089;&#1083;&#1080; &#1087;&#1080;&#1096;&#1077;&#1090;&#1077; <code>[User]</code>, &#1101;&#1090;&#1086; &#1089;&#1087;&#1080;&#1089;&#1086;&#1082;, &#1072; &#1085;&#1077; &#1086;&#1076;&#1080;&#1085; User.</li>
                  <li>&#1045;&#1089;&#1083;&#1080; &#1085;&#1091;&#1078;&#1085;&#1072; &#1089;&#1090;&#1088;&#1077;&#1083;&#1082;&#1072;, &#1090;&#1080;&#1087; &#1087;&#1086;&#1083;&#1103; &#1076;&#1086;&#1083;&#1078;&#1077;&#1085; &#1089;&#1089;&#1099;&#1083;&#1072;&#1090;&#1100;&#1089;&#1103; &#1085;&#1072; &#1076;&#1088;&#1091;&#1075;&#1086;&#1081; &#1086;&#1087;&#1080;&#1089;&#1072;&#1085;&#1085;&#1099;&#1081; type.</li>
                </ul>
              </section>
            </div>
            <aside class="faq-visual">
              <div class="faq-card">
                <div class="faq-card-title"><span>Query</span><span class="faq-pill">root</span></div>
                <div class="faq-row"><span>me</span><span>User!</span></div>
                <div class="faq-row"><span>feed</span><span>[Post!]!</span></div>
              </div>
              <div class="faq-arrow">&#1087;&#1086;&#1083;&#1077; &#1089;&#1090;&#1072;&#1085;&#1086;&#1074;&#1080;&#1090;&#1089;&#1103; &#1089;&#1090;&#1088;&#1077;&#1083;&#1082;&#1086;&#1081;</div>
              <div class="faq-card">
                <div class="faq-card-title"><span>User</span><span class="faq-pill">type</span></div>
                <div class="faq-row"><span>id</span><span>ID!</span></div>
                <div class="faq-row"><span>username</span><span>String!</span></div>
                <div class="faq-row"><span>posts</span><span>[Post!]!</span></div>
              </div>
              <div class="faq-card">
                <div class="faq-card-title"><span>Post</span><span class="faq-pill">type</span></div>
                <div class="faq-row"><span>id</span><span>ID!</span></div>
                <div class="faq-row"><span>title</span><span>String!</span></div>
                <div class="faq-row"><span>author</span><span>User!</span></div>
              </div>
              <div class="faq-note">
                <strong>&#1051;&#1086;&#1075;&#1080;&#1082;&#1072; &#1074;&#1080;&#1079;&#1091;&#1072;&#1083;&#1072;</strong>
                &#1041;&#1083;&#1086;&#1082; = GraphQL type. &#1057;&#1090;&#1088;&#1086;&#1082;&#1072; &#1074;&#1085;&#1091;&#1090;&#1088;&#1080; &#1073;&#1083;&#1086;&#1082;&#1072; = &#1087;&#1086;&#1083;&#1077;. &#1057;&#1090;&#1088;&#1077;&#1083;&#1082;&#1072; = &#1087;&#1086;&#1083;&#1077; &#1089;&#1089;&#1099;&#1083;&#1072;&#1077;&#1090;&#0441;&#1103; &#1085;&#1072; &#1076;&#1088;&#1091;&#1075;&#1086;&#1081; type.
              </div>
            </aside>
          </div>
        </div>
      </div>`;
  }

  window.addEventListener("load", () => setTimeout(init, 320));
})();