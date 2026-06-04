(function () {
  "use strict";

  function init() {
    if (window.__graphqlExportPatchReady) return;
    window.__graphqlExportPatchReady = true;
    injectStyles();
    setupExportMenu();
  }

  function injectStyles() {
    if (document.getElementById("exportPatchStyles")) return;
    const style = document.createElement("style");
    style.id = "exportPatchStyles";
    style.textContent = `
      * {
        scrollbar-width: thin;
        scrollbar-color: color-mix(in srgb, var(--muted), transparent 45%) transparent;
      }
      *::-webkit-scrollbar {
        width: 8px;
        height: 8px;
      }
      *::-webkit-scrollbar-track {
        background: transparent;
      }
      *::-webkit-scrollbar-thumb {
        border: 2px solid transparent;
        border-radius: 999px;
        background: color-mix(in srgb, var(--muted), transparent 50%);
        background-clip: padding-box;
      }
      *::-webkit-scrollbar-thumb:hover {
        background: color-mix(in srgb, var(--muted), transparent 30%);
        background-clip: padding-box;
      }
      body.theme-dark * {
        scrollbar-color: color-mix(in srgb, var(--muted), transparent 58%) transparent;
      }
      body.theme-dark *::-webkit-scrollbar-thumb {
        background: color-mix(in srgb, var(--muted), transparent 62%);
        background-clip: padding-box;
      }
      body.theme-dark *::-webkit-scrollbar-thumb:hover {
        background: color-mix(in srgb, var(--muted), transparent 42%);
        background-clip: padding-box;
      }
      .exports {
        position: relative;
        overflow: visible;
      }
      .export-menu-btn {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        min-width: 102px;
        justify-content: center;
      }
      .export-menu-btn::after {
        content: "";
        width: 6px;
        height: 6px;
        margin-top: -3px;
        border-right: 1.5px solid currentColor;
        border-bottom: 1.5px solid currentColor;
        transform: rotate(45deg);
      }
      .export-menu {
        position: absolute;
        top: calc(100% + 6px);
        right: 0;
        z-index: 50;
        display: none;
        min-width: 164px;
        padding: 6px;
        border: 1px solid var(--line);
        border-radius: 8px;
        background: var(--panel);
        box-shadow: 0 12px 28px rgba(0, 0, 0, 0.14);
      }
      body.theme-dark .export-menu {
        box-shadow: 0 14px 34px rgba(0, 0, 0, 0.34);
      }
      .exports.open .export-menu {
        display: grid;
        gap: 4px;
      }
      .export-menu button {
        width: 100%;
        justify-content: flex-start;
        border-color: transparent;
        background: transparent;
        text-align: left;
      }
      .export-menu button:hover {
        border-color: var(--line);
        background: var(--accent-soft);
      }
      .export-hidden-source {
        display: none !important;
      }
      @media (max-width: 640px) {
        .exports {
          display: block;
          width: 100%;
        }
        .export-menu-btn {
          width: 100%;
        }
        .export-menu {
          left: 0;
          right: 0;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function setupExportMenu() {
    const box = document.querySelector(".exports");
    if (!box || box.dataset.exportPatchReady) return;
    box.dataset.exportPatchReady = "true";
    const dot = document.getElementById("exportDotBtn");
    const svg = document.getElementById("exportSvgBtn");
    const png = document.getElementById("exportPngBtn");
    [dot, svg, png].forEach((button) => button?.classList.add("export-hidden-source"));
    box.insertAdjacentHTML("afterbegin", [
      '<button id="exportMenuBtn" class="export-menu-btn" type="button" aria-haspopup="menu" aria-expanded="false">&#1069;&#1082;&#1089;&#1087;&#1086;&#1088;&#1090;</button>',
      '<div id="exportMenu" class="export-menu" role="menu">',
      '  <button type="button" role="menuitem" data-export-action="svg">SVG</button>',
      '  <button type="button" role="menuitem" data-export-action="png">PNG</button>',
      '  <button type="button" role="menuitem" data-export-action="drawio">draw.io</button>',
      "</div>"
    ].join(""));
    const trigger = document.getElementById("exportMenuBtn");
    trigger?.addEventListener("click", (event) => {
      event.stopPropagation();
      const open = !box.classList.contains("open");
      box.classList.toggle("open", open);
      trigger.setAttribute("aria-expanded", String(open));
    });
    document.getElementById("exportMenu")?.addEventListener("click", (event) => {
      const action = event.target.closest("[data-export-action]")?.dataset.exportAction;
      if (!action) return;
      box.classList.remove("open");
      trigger?.setAttribute("aria-expanded", "false");
      if (action === "svg") exportSvg(svg);
      if (action === "png") exportPng(png);
      if (action === "drawio") exportDrawIo();
    });
    document.addEventListener("click", () => {
      box.classList.remove("open");
      trigger?.setAttribute("aria-expanded", "false");
    });
  }

  function exportSvg(button) {
    if (button) {
      button.click();
      return;
    }
    const svg = document.getElementById("graphSvg");
    if (svg) downloadText("schema.svg", `<?xml version="1.0" encoding="UTF-8"?>\n${svg.outerHTML}`, "image/svg+xml;charset=utf-8");
  }

  function exportPng(button) {
    if (button) {
      button.click();
      return;
    }
    const svg = document.getElementById("graphSvg");
    if (!svg) return;
    const image = new Image();
    const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: "image/svg+xml;charset=utf-8" }));
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1200, svg.clientWidth * 2);
      canvas.height = Math.max(800, svg.clientHeight * 2);
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = getComputedStyle(document.body).getPropertyValue("--bg") || "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      canvas.toBlob((blob) => downloadBlob("schema.png", blob), "image/png");
    };
    image.src = url;
  }

  function exportDrawIo() {
    const cells = buildDrawIoCells();
    const model = `<mxfile host="app.diagrams.net" modified="${new Date().toISOString()}" agent="GraphQL Visualizer" version="24.7.17"><diagram id="graphql-schema" name="GraphQL Schema"><mxGraphModel dx="1600" dy="900" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="1920" pageHeight="1080" math="0" shadow="0"><root><mxCell id="0"/><mxCell id="1" parent="0"/>${cells}</root></mxGraphModel></diagram></mxfile>`;
    downloadText("graphql-schema.drawio", model, "application/xml;charset=utf-8");
  }

  function buildDrawIoCells() {
    const nodes = Array.from(document.querySelectorAll("#graphSvg [data-node]"));
    const ids = new Map();
    const nodeCells = nodes.map((node, index) => {
      const id = `n${index + 1}`;
      ids.set(node.dataset.node || "", id);
      const box = nodeBox(node);
      const label = nodeLabel(node);
      return `<mxCell id="${id}" value="${escXml(label)}" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#ffffff;strokeColor=#d8dee9;fontColor=#1f2937;spacing=10;" vertex="1" parent="1"><mxGeometry x="${round(box.x)}" y="${round(box.y)}" width="${round(box.width)}" height="${round(box.height)}" as="geometry"/></mxCell>`;
    });
    const edgeCells = Array.from(document.querySelectorAll("#graphSvg [data-edge]")).map((edge, index) => {
      const parts = edgeParts(edge.dataset.edge || "");
      if (!parts || !ids.has(parts.source) || !ids.has(parts.target)) return "";
      return `<mxCell id="e${index + 1}" value="${escXml(parts.label)}" style="edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#e30611;endArrow=block;endFill=1;" edge="1" parent="1" source="${ids.get(parts.source)}" target="${ids.get(parts.target)}"><mxGeometry relative="1" as="geometry"/></mxCell>`;
    });
    return nodeCells.concat(edgeCells).join("");
  }

  function nodeBox(node) {
    const rect = node.querySelector("rect");
    return {
      x: Number(node.dataset.x || 0),
      y: Number(node.dataset.y || 0),
      width: Number(rect?.getAttribute("width") || 260),
      height: Number(rect?.getAttribute("height") || 120)
    };
  }

  function nodeLabel(node) {
    const title = node.dataset.node || node.querySelector(".title")?.textContent?.trim() || "";
    const fields = Array.from(node.querySelectorAll(".field-row")).map((row) => {
      const name = row.querySelector(".field-name")?.textContent?.trim() || row.dataset.field || "";
      const type = row.querySelector(".field-type")?.textContent?.trim() || "";
      return `${name}: ${type}`;
    });
    return [title].concat(fields).filter(Boolean).join("<br/>");
  }

  function edgeParts(id) {
    const match = String(id).match(/^(.+?)->(.+?):(.+)$/);
    return match ? { source: match[1], target: match[2], label: match[3] } : null;
  }

  function downloadText(name, content, type) {
    downloadBlob(name, new Blob([content], { type: type || "text/plain;charset=utf-8" }));
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

  function round(value) {
    return Math.round(Number(value || 0));
  }

  function escXml(value) {
    return String(value || "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
  }

  window.addEventListener("load", () => setTimeout(init, 260));
})();