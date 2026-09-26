// Build the SatQuery AI technical report: HTML -> PDF (two passes) and DOCX.
//   node build.mjs
// Needs: Chrome installed, python with pymupdf (for page lookup + bookmarks).
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import puppeteer from "puppeteer-core";
import { blocks, meta, ASSET_DIR } from "./content.mjs";
import { charts } from "./charts.mjs";
import { buildDocx } from "./docx.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPORT = path.resolve(HERE, "..");
const OUT = path.join(HERE, "out");
const IMG = path.join(OUT, "img");
fs.mkdirSync(IMG, { recursive: true });

const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASENAME = "SatQuery_AI_Technical_Report_Team_BUGHEBUG";

// ─────────────────────────────────────────────────────────── numbering
export function numberBlocks(list) {
  let h1 = 0, h2 = 0, fig = 0, tab = 0;
  const heads = [];
  for (const b of list) {
    if (b.h === 1) {
      if (!b.unnumbered) { h1++; h2 = 0; b.num = String(h1); }
      b.id = b.id || `s${h1}`;
      heads.push(b);
    } else if (b.h === 2) {
      h2++; b.num = `${h1}.${h2}`;
      b.id = b.id || `s${h1}-${h2}`;
      heads.push(b);
    } else if (b.h === 3) {
      b.id = b.id || `h3-${heads.length}-${Math.random().toString(36).slice(2, 7)}`;
    } else if (b.fig) {
      fig++; b.fig.num = fig; b.fig.key = `fig${fig}`;
    } else if (b.table && !b.table.noCaption) {
      tab++; b.table.num = tab;
    }
  }
  return heads;
}

// ─────────────────────────────────────────────────────────── inline markup
const INLINE = /\*\*(.+?)\*\*|~(.+?)~|\[([^\]]+)\]\((https?:[^)]+)\)|\[(\d{1,2})\]|\*([^*]+?)\*/g;
export function parseInline(s) {
  const out = [];
  let last = 0, m;
  INLINE.lastIndex = 0;
  while ((m = INLINE.exec(s))) {
    if (m.index > last) out.push({ t: "text", text: s.slice(last, m.index) });
    if (m[1] !== undefined) out.push({ t: "b", text: m[1] });
    else if (m[2] !== undefined) out.push({ t: "code", text: m[2] });
    else if (m[3] !== undefined) out.push({ t: "link", text: m[3], url: m[4] });
    else if (m[5] !== undefined) out.push({ t: "cite", n: +m[5] });
    else if (m[6] !== undefined) out.push({ t: "i", text: m[6] });
    last = INLINE.lastIndex;
  }
  if (last < s.length) out.push({ t: "text", text: s.slice(last) });
  return out;
}
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
function inlineHtml(s) {
  return parseInline(s).map((x) => {
    switch (x.t) {
      case "b": return `<strong>${inlineHtml(x.text)}</strong>`;
      case "i": return `<em>${esc(x.text)}</em>`;
      case "code": return `<code>${esc(x.text)}</code>`;
      case "link": return `<a href="${esc(x.url)}">${esc(x.text)}</a>`;
      case "cite": return `<a class="cite" href="#ref-${x.n}">[${x.n}]</a>`;
      default: return esc(x.text);
    }
  }).join("");
}

// ─────────────────────────────────────────────────────────── mermaid
const CLASSDEFS = `
classDef accent fill:#e8f1fc,stroke:#2a78d6,stroke-width:1.6px,color:#0b2545
classDef good fill:#e5f4ea,stroke:#1e7b34,stroke-width:1.6px,color:#0b2545
classDef warn fill:#fff4d6,stroke:#a86f00,stroke-width:1.6px,color:#3a2a00
classDef bad fill:#fbe8e7,stroke:#b42318,stroke-width:1.6px,color:#3a0a0a`;

const MERMAID_CFG = {
  startOnLoad: false,
  securityLevel: "loose",
  theme: "base",
  fontFamily: "Segoe UI, Calibri, Arial, sans-serif",
  flowchart: { htmlLabels: true, curve: "basis", padding: 12, nodeSpacing: 36, rankSpacing: 44 },
  sequence: { useMaxWidth: false, actorMargin: 30, width: 130, boxMargin: 6, messageMargin: 26, messageFontSize: 16, actorFontSize: 15, noteFontSize: 15, wrap: false },
  themeVariables: {
    fontSize: "14px",
    primaryColor: "#f3f5f8", primaryBorderColor: "#8a94a6", primaryTextColor: "#0b2545",
    secondaryColor: "#fafbfc", tertiaryColor: "#ffffff",
    lineColor: "#5b6475", textColor: "#0b2545",
    clusterBkg: "#f8f9fb", clusterBorder: "#c5ccd6",
    edgeLabelBackground: "#ffffff",
    actorBkg: "#e8f1fc", actorBorder: "#2a78d6", actorTextColor: "#0b2545",
    signalColor: "#3d4757", signalTextColor: "#0b2545",
    noteBkgColor: "#fff4d6", noteBorderColor: "#a86f00",
    labelBoxBkgColor: "#e8f1fc", labelBoxBorderColor: "#2a78d6",
  },
};

async function renderFigures(browser, figs) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 1000, deviceScaleFactor: 2.5 });
  await page.setContent(`<!doctype html><html><head><style>
    body{margin:0;background:#fff;font-family:"Segoe UI",Calibri,Arial,sans-serif}
    #stage{display:inline-block;padding:10px;background:#fff}
  </style></head><body><div id="stage"></div></body></html>`);
  await page.addScriptTag({ path: path.join(HERE, "node_modules/mermaid/dist/mermaid.min.js") });
  await page.evaluate((cfg) => window.mermaid.initialize(cfg), MERMAID_CFG);

  for (const f of figs) {
    let svg;
    if (f.mermaid) {
      const src = f.mermaid.trim().startsWith("flowchart") ? f.mermaid + "\n" + CLASSDEFS : f.mermaid;
      svg = await page.evaluate(async (id, code) => {
        const r = await window.mermaid.render(id, code);
        return r.svg;
      }, "m" + f.key, src);
    } else if (f.chart) {
      svg = charts[f.chart]();
    } else continue;

    // natural size from the rendered element
    await page.evaluate((s) => { document.getElementById("stage").innerHTML = s; }, svg);
    const box = await page.evaluate(() => {
      const el = document.querySelector("#stage svg");
      const vb = el.viewBox && el.viewBox.baseVal;
      const r = el.getBoundingClientRect();
      return { w: vb && vb.width ? vb.width : r.width, h: vb && vb.height ? vb.height : r.height };
    });
    // Fix the SVG to its natural size for the PNG
    await page.evaluate((w, h) => {
      const el = document.querySelector("#stage svg");
      el.removeAttribute("style");
      el.setAttribute("width", w); el.setAttribute("height", h);
    }, box.w, box.h);
    const handle = await page.$("#stage");
    const png = path.join(IMG, `${f.key}.png`);
    await handle.screenshot({ path: png });
    f.svg = svg;
    f.w = box.w; f.h = box.h;
    f.png = png;
  }
  await page.close();
}

function sizeFor(f, maxWmm, maxHmm) {
  const PX = 0.2646; // mm per CSS px
  const w = f.w * PX, h = f.h * PX;
  const s = Math.min(1.0, maxWmm / w, maxHmm / h);
  return { wmm: w * s, hmm: h * s };
}

// ─────────────────────────────────────────────────────────── HTML
function figureHtml(f) {
  const cap = `<figcaption><span class="fn">Figure ${f.num}.</span> ${inlineHtml(f.caption)}</figcaption>`;
  if (f.img) {
    return `<figure class="shot"><img src="../../${ASSET_DIR}/${f.img}" alt="">${cap}</figure>`;
  }
  const { wmm, hmm } = sizeFor(f, 170, f.tall ? 205 : 118);
  let svg = f.svg
    .replace(/<svg([^>]*?)\sstyle="[^"]*"/, "<svg$1")
    .replace(/<svg([^>]*?)\swidth="[^"]*"/, "<svg$1")
    .replace(/<svg([^>]*?)\sheight="[^"]*"/, "<svg$1")
    .replace("<svg", `<svg width="${wmm.toFixed(1)}mm" height="${hmm.toFixed(1)}mm"`);
  return `<figure class="diag">${svg}${cap}</figure>`;
}

function tableHtml(t) {
  const cols = t.widths ? `<colgroup>${t.widths.map((w) => `<col style="width:${(w * 100).toFixed(1)}%">`).join("")}</colgroup>` : "";
  const head = `<thead><tr>${t.head.map((h) => `<th>${inlineHtml(h)}</th>`).join("")}</tr></thead>`;
  const body = `<tbody>${t.rows.map((r) => `<tr>${r.map((c) => `<td>${inlineHtml(c)}</td>`).join("")}</tr>`).join("")}</tbody>`;
  return `<table>${cols}${head}${body}</table>`;
}

function tocHtml(heads, pages) {
  const rows = heads.filter((h) => h.id !== "doc-control").map((h) => {
    const pg = pages?.[h.id] ?? "";
    const cls = h.h === 1 ? "t1" : "t2";
    const num = h.num ? `<span class="tn">${h.num}</span>` : `<span class="tn"></span>`;
    return `<a class="trow ${cls}" href="#${h.id}">${num}<span class="tt">${esc(h.text)}</span><span class="tl"></span><span class="tp">${pg}</span></a>`;
  }).join("");
  return `<section class="toc"><h1 id="index" class="nonum">Index</h1>${rows}</section>`;
}

function refsHtml(groups) {
  return groups.map((g) => `<h3>${esc(g.group)}</h3><ol class="refs">${g.items.map((r) =>
    `<li id="ref-${r.n}"><span class="rn">[${r.n}]</span><div><div>${inlineHtml(r.t)}</div>${r.role ? `<div class="role">→ ${esc(r.role)}</div>` : ""}<div class="url"><a href="${esc(r.url)}">${esc(r.url)}</a></div></div></li>`
  ).join("")}</ol>`).join("");
}

function kpiHtml(k) {
  return `<div class="kpis">${k.map((x) => `<div class="kpi"><div class="v">${esc(x.v)}</div><div class="l">${esc(x.l)}</div></div>`).join("")}</div>`;
}

function coverHtml() {
  const dots = Array.from({ length: 220 }, (_, i) => {
    const x = (i * 73) % 100, y = (i * 37) % 100;
    const o = ((i * 13) % 10) / 22 + 0.06;
    return `<circle cx="${x}" cy="${y}" r="0.55" fill="#ffffff" opacity="${o.toFixed(2)}"/>`;
  }).join("");
  return `<section class="cover">
    <svg class="dots" viewBox="0 0 100 100" preserveAspectRatio="none">${dots}</svg>
    <div class="ctop">
      <div class="kicker">${esc(meta.event)} · Problem Statement ${meta.psId} · ${esc(meta.org)}</div>
      <div class="ctitle">${esc(meta.title)}</div>
      <div class="csub">${esc(meta.subtitle)}</div>
      <div class="cbar"></div>
      <div class="ctype">${esc(meta.docType)}</div>
    </div>
    <div class="cbottom">
      <div class="team"><div class="tl1">Team</div><div class="tl2">${esc(meta.team)}</div></div>
      <table class="cmeta">
        <tr><td>Problem Statement ID</td><td>${meta.psId}</td></tr>
        <tr><td>Organisation</td><td>${esc(meta.org)}</td></tr>
        <tr><td>Theme / Category</td><td>${esc(meta.theme)} / ${esc(meta.category)}</td></tr>
        <tr><td>Version</td><td>${meta.version} · ${esc(meta.date)}</td></tr>
      </table>
    </div>
  </section>`;
}

const CSS = `
@page { size: A4; margin: 22mm 18mm 20mm 18mm;
  @top-left { content: "SatQuery AI — Technical Report"; font: 8pt "Segoe UI", Calibri, sans-serif; color: #6b7280; }
  @top-right { content: "Team BUGHEBUG · PS 26167 · SIH 2026"; font: 8pt "Segoe UI", Calibri, sans-serif; color: #6b7280; }
  @bottom-right { content: "Page " counter(page) " of " counter(pages); font: 8pt "Segoe UI", Calibri, sans-serif; color: #6b7280; }
  @bottom-left { content: "Confidential — prepared for ISRO / SIH 2026 evaluation"; font: 8pt "Segoe UI", Calibri, sans-serif; color: #9ca3af; }
}
@page cover { margin: 0; @top-left { content: none } @top-right { content: none } @bottom-right { content: none } @bottom-left { content: none } }
:root { --ink:#1f2937; --navy:#0b2545; --blue:#2a78d6; --saffron:#eda100; --muted:#6b7280; --rule:#d8dde5; --soft:#f4f6f9; }
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin:0; font-family: Calibri, "Segoe UI", Arial, sans-serif; font-size: 10.6pt; line-height: 1.46; color: var(--ink); background:#fff; }
a { color: var(--blue); text-decoration: none; }
a.cite { font-size: 0.92em; }
p { margin: 0 0 8pt; text-align: justify; hyphens: auto; }
h1, h2, h3 { font-family: "Segoe UI", Calibri, sans-serif; color: var(--navy); break-after: avoid; }
h1 { font-size: 20pt; font-weight: 600; margin: 0 0 12pt; padding-bottom: 6pt; border-bottom: 2.5pt solid var(--navy); position: relative; }
h1::after { content:""; position:absolute; left:0; bottom:-2.5pt; width: 42mm; border-bottom: 2.5pt solid var(--saffron); }
h1 .num { color: var(--blue); margin-right: 8pt; }
h2 { font-size: 13.5pt; font-weight: 600; margin: 16pt 0 6pt; }
h2 .num { color: var(--blue); margin-right: 7pt; }
h3 { font-size: 11pt; font-weight: 600; margin: 12pt 0 5pt; color: #24324a; }
section.chapter { break-before: page; }
ul, ol { margin: 0 0 9pt; padding-left: 18pt; }
li { margin-bottom: 3pt; }
code { font-family: Consolas, "Cascadia Mono", monospace; font-size: 0.88em; background: var(--soft); border: 0.5pt solid #e3e7ee; border-radius: 2pt; padding: 0 2.5pt; }
pre { font-family: Consolas, "Cascadia Mono", monospace; font-size: 8.3pt; line-height: 1.4; background: #0f1b2d; color: #e6edf6; border-radius: 4pt; padding: 9pt 11pt; margin: 4pt 0 10pt; white-space: pre-wrap; break-inside: avoid; border-left: 3pt solid var(--saffron); }
table { width: 100%; border-collapse: collapse; margin: 4pt 0 11pt; font-size: 9.3pt; line-height: 1.38; break-inside: auto; }
thead { display: table-header-group; }
tr { break-inside: avoid; }
th { background: var(--navy); color: #fff; text-align: left; font-weight: 600; padding: 5pt 6pt; font-family: "Segoe UI", Calibri, sans-serif; font-size: 8.8pt; }
td { padding: 4.5pt 6pt; border-bottom: 0.6pt solid var(--rule); vertical-align: top; }
tbody tr:nth-child(even) td { background: #f8f9fb; }
td code, th code { font-size: 0.86em; }
figure { margin: 8pt 0 12pt; text-align: center; break-inside: avoid; }
figure.diag p, figure.diag div, figure.diag span { text-align: center !important; hyphens: none !important; margin: 0; line-height: 1.3; }
figure.diag svg { display: block; margin: 0 auto; }
figure.shot img { width: 100%; border: 0.6pt solid var(--rule); border-radius: 3pt; }
figcaption { font-size: 8.8pt; color: var(--muted); margin-top: 5pt; text-align: center; font-style: italic; }
figcaption .fn { font-style: normal; font-weight: 600; color: var(--navy); }
.callout { border-left: 3.5pt solid var(--blue); background: #eef4fc; padding: 8pt 11pt; margin: 6pt 0 11pt; border-radius: 0 4pt 4pt 0; break-inside: avoid; }
.callout.key { border-color: var(--saffron); background: #fff8e6; }
.callout.warn { border-color: #b42318; background: #fdf1f0; }
.callout .ct { font-family: "Segoe UI", Calibri, sans-serif; font-weight: 700; font-size: 8.6pt; letter-spacing: 0.06em; text-transform: uppercase; color: var(--navy); margin-bottom: 3pt; }
.callout p:last-child { margin-bottom: 0; }
.kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6pt; margin: 8pt 0 12pt; break-inside: avoid; }
.kpi { border: 0.6pt solid var(--rule); border-top: 3pt solid var(--blue); border-radius: 3pt; padding: 8pt 8pt 7pt; background: #fbfcfd; }
.kpi .v { font-family: "Segoe UI", Calibri, sans-serif; font-size: 15pt; font-weight: 700; color: var(--navy); line-height: 1.15; }
.kpi .l { font-size: 8.3pt; color: var(--muted); margin-top: 3pt; line-height: 1.3; }
/* index */
.toc .trow { display: flex; align-items: baseline; color: var(--ink); padding: 1.5pt 0; }
.toc .trow.t1 { font-weight: 600; color: var(--navy); margin-top: 4.5pt; font-family: "Segoe UI", Calibri, sans-serif; font-size: 10.5pt; }
.toc .trow.t2 { padding-left: 11mm; font-size: 9.8pt; }
.toc .tn { min-width: 11mm; color: var(--blue); }
.toc .trow.t2 .tn { min-width: 10mm; }
.toc .tl { flex: 1; border-bottom: 0.8pt dotted #9aa3ae; margin: 0 5pt; transform: translateY(-3pt); }
.toc .tp { min-width: 8mm; text-align: right; }
/* references */
ol.refs { list-style: none; padding-left: 0; }
ol.refs li { display: flex; gap: 8pt; margin-bottom: 6pt; break-inside: avoid; font-size: 9.6pt; }
ol.refs .rn { min-width: 9mm; font-weight: 700; color: var(--navy); }
ol.refs .role { color: #1e7b34; font-size: 9pt; }
ol.refs .url a { font-size: 8.6pt; word-break: break-all; }
/* cover */
.cover { page: cover; width: 210mm; height: 297mm; position: relative; background: var(--navy); color: #fff; overflow: hidden; break-after: page; }
.cover .dots { position: absolute; right: 0; top: 0; width: 120mm; height: 150mm; }
.cover .ctop { position: absolute; left: 20mm; right: 20mm; top: 52mm; }
.cover .kicker { font-family: "Segoe UI", sans-serif; font-size: 9pt; letter-spacing: 0.12em; text-transform: uppercase; color: #aeb9cc; }
.cover .ctitle { font-family: "Segoe UI", sans-serif; font-weight: 700; font-size: 50pt; line-height: 1.05; margin-top: 10mm; }
.cover .csub { font-family: "Segoe UI", sans-serif; font-weight: 300; font-size: 16pt; line-height: 1.35; margin-top: 6mm; color: #dce4f0; max-width: 160mm; }
.cover .cbar { width: 34mm; height: 2.4mm; background: var(--saffron); margin: 11mm 0 6mm; }
.cover .ctype { font-size: 12.5pt; color: #fff; font-family: "Segoe UI", sans-serif; }
.cover .cbottom { position: absolute; left: 20mm; right: 20mm; bottom: 24mm; display: flex; justify-content: space-between; align-items: flex-end; border-top: 0.6pt solid #3a5578; padding-top: 8mm; }
.cover .team .tl1 { font-size: 9pt; letter-spacing: 0.14em; text-transform: uppercase; color: #aeb9cc; font-family: "Segoe UI", sans-serif; }
.cover .team .tl2 { font-family: "Segoe UI", sans-serif; font-size: 30pt; font-weight: 700; color: var(--saffron); letter-spacing: 0.04em; }
.cover table.cmeta { width: auto; margin: 0; font-size: 9pt; }
.cover table.cmeta td { border: 0; background: none !important; color: #dce4f0; padding: 1.5pt 0 1.5pt 10pt; }
.cover table.cmeta td:first-child { color: #8fa0bb; text-align: right; }
.pb { break-after: page; }
`;

function bodyHtml(list, heads, pages) {
  const parts = [];
  let open = false;
  for (const b of list) {
    if (b.h === 1) {
      if (open) parts.push("</section>");
      parts.push(`<section class="chapter">`); open = true;
      parts.push(`<h1 id="${b.id}">${b.num ? `<span class="num">${b.num}</span>` : ""}${esc(b.text)}</h1>`);
    } else if (b.h === 2) parts.push(`<h2 id="${b.id}"><span class="num">${b.num}</span>${esc(b.text)}</h2>`);
    else if (b.h === 3) parts.push(`<h3 id="${b.id}">${esc(b.text)}</h3>`);
    else if (b.p) parts.push(`<p>${inlineHtml(b.p)}</p>`);
    else if (b.ul) parts.push(`<ul>${b.ul.map((x) => `<li>${inlineHtml(x)}</li>`).join("")}</ul>`);
    else if (b.ol) parts.push(`<ol>${b.ol.map((x) => `<li>${inlineHtml(x)}</li>`).join("")}</ol>`);
    else if (b.table) parts.push(tableHtml(b.table));
    else if (b.fig) parts.push(figureHtml(b.fig));
    else if (b.code) parts.push(`<pre>${esc(b.code)}</pre>`);
    else if (b.callout) parts.push(`<div class="callout ${b.callout.kind}"><div class="ct">${esc(b.callout.title)}</div><p>${inlineHtml(b.callout.text)}</p></div>`);
    else if (b.kpis) parts.push(kpiHtml(b.kpis));
    else if (b.refs) parts.push(refsHtml(b.refs));
    else if (b.toc) { if (open) parts.push("</section>"); open = false; parts.push(`<section class="chapter">${tocHtml(heads, pages)}</section>`); }
    // explicit page breaks are implied by chapter sections in HTML
  }
  if (open) parts.push("</section>");
  return parts.join("\n");
}

function fullHtml(heads, pages) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>SatQuery AI — Technical Report (Team BUGHEBUG)</title>
<meta name="author" content="Team BUGHEBUG"><meta name="description" content="${esc(meta.subtitle)}">
<style>${CSS}</style></head><body>${coverHtml()}${bodyHtml(blocks, heads, pages)}</body></html>`;
}

// ─────────────────────────────────────────────────────────── main
const heads = numberBlocks(blocks);
const figs = blocks.filter((b) => b.fig).map((b) => b.fig);

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox", "--allow-file-access-from-files"] });
try {
  console.log(`rendering ${figs.filter((f) => !f.img).length} diagrams/charts…`);
  await renderFigures(browser, figs);

  const htmlPath = path.join(OUT, "report.html");
  const pdfPath = path.join(OUT, `${BASENAME}.pdf`);
  const pageMapPath = path.join(OUT, "pages.json");

  async function printPdf(pages) {
    fs.writeFileSync(htmlPath, fullHtml(heads, pages));
    const page = await browser.newPage();
    await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "networkidle0" });
    await page.pdf({ path: pdfPath, format: "A4", printBackground: true, preferCSSPageSize: true, tagged: true, outline: false });
    await page.close();
  }

  await printPdf(null);
  const headsJson = heads.filter((h) => h.id !== "doc-control").map((h) => ({ id: h.id, level: h.h, num: h.num || "", text: h.text }));
  fs.writeFileSync(path.join(OUT, "heads.json"), JSON.stringify(headsJson, null, 1));
  execFileSync("python", [path.join(HERE, "pdfpages.py"), "find", pdfPath, path.join(OUT, "heads.json"), pageMapPath], { stdio: "inherit" });
  const pages = JSON.parse(fs.readFileSync(pageMapPath, "utf8"));
  await printPdf(pages);
  execFileSync("python", [path.join(HERE, "pdfpages.py"), "outline", pdfPath, path.join(OUT, "heads.json"), pageMapPath], { stdio: "inherit" });

  fs.copyFileSync(pdfPath, path.join(REPORT, `${BASENAME}.pdf`));
  console.log("PDF  ->", path.join(REPORT, `${BASENAME}.pdf`));

  await buildDocx({ blocks, heads, meta, figs, assetDir: path.join(REPORT, ASSET_DIR), outPath: path.join(REPORT, `${BASENAME}.docx`), parseInline });
  console.log("DOCX ->", path.join(REPORT, `${BASENAME}.docx`));
} finally {
  await browser.close();
}
