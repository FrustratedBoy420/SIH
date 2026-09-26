// Word renderer for the report — consumes the same blocks as the PDF.
import fs from "node:fs";
import path from "node:path";
import {
  AlignmentType, BorderStyle, Bookmark, Document, ExternalHyperlink, Footer, Header, HeadingLevel,
  ImageRun, InternalHyperlink, LevelFormat, Packer, PageBreak, PageNumber, Paragraph, ShadingType,
  Table, TableCell, TableLayoutType, TableRow, TabStopType, TextRun, VerticalAlign, WidthType, LeaderType,
  HeightRule,
} from "docx";

const NAVY = "0B2545", BLUE = "2A78D6", SAFFRON = "EDA100", INK = "1F2937", MUTED = "6B7280", RULE = "D8DDE5";
const PAGE_W = 11906, PAGE_H = 16838, MARGIN = 1080; // A4, 0.75 in margins
const CONTENT_W = PAGE_W - 2 * MARGIN; // 9746 DXA
const MAX_IMG_PX = Math.floor((CONTENT_W / 1440) * 96); // ~650 px

const bm = (id) => "bm_" + String(id).replace(/[^A-Za-z0-9_]/g, "_");

function pngSize(file) {
  const b = fs.readFileSync(file);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), buf: b };
}

function runs(parseInline, s, base = {}) {
  const out = [];
  for (const x of parseInline(s)) {
    if (x.t === "b") out.push(...runs(parseInline, x.text, { ...base, bold: true }));
    else if (x.t === "i") out.push(new TextRun({ ...base, text: x.text, italics: true }));
    else if (x.t === "code") out.push(new TextRun({ ...base, text: x.text, font: "Consolas", size: Math.round((base.size || 21) * 0.9), shading: { type: ShadingType.CLEAR, fill: "EEF1F5", color: "auto" } }));
    else if (x.t === "link") out.push(new ExternalHyperlink({ link: x.url, children: [new TextRun({ ...base, text: x.text, color: BLUE, underline: {} })] }));
    else if (x.t === "cite") out.push(new InternalHyperlink({ anchor: bm(`ref_${x.n}`), children: [new TextRun({ ...base, text: `[${x.n}]`, color: BLUE })] }));
    else out.push(new TextRun({ ...base, text: x.text }));
  }
  return out;
}

const cellBorders = (color = RULE) => ({
  top: { style: BorderStyle.SINGLE, size: 4, color },
  bottom: { style: BorderStyle.SINGLE, size: 4, color },
  left: { style: BorderStyle.SINGLE, size: 4, color },
  right: { style: BorderStyle.SINGLE, size: 4, color },
});
const noBorders = {
  top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
};

function dataTable(parseInline, t) {
  const widths = (t.widths || t.head.map(() => 1 / t.head.length)).map((w) => Math.round(w * CONTENT_W));
  const diff = CONTENT_W - widths.reduce((a, b) => a + b, 0);
  widths[widths.length - 1] += diff;
  const header = new TableRow({
    tableHeader: true,
    children: t.head.map((h, i) => new TableCell({
      width: { size: widths[i], type: WidthType.DXA },
      shading: { type: ShadingType.CLEAR, fill: NAVY, color: "auto" },
      borders: cellBorders(NAVY),
      margins: { top: 70, bottom: 70, left: 100, right: 100 },
      children: [new Paragraph({ spacing: { after: 0 }, children: runs(parseInline, h, { bold: true, color: "FFFFFF", size: 18, font: "Segoe UI" }) })],
    })),
  });
  const body = t.rows.map((r, ri) => new TableRow({
    cantSplit: true,
    children: r.map((c, i) => new TableCell({
      width: { size: widths[i], type: WidthType.DXA },
      shading: { type: ShadingType.CLEAR, fill: ri % 2 ? "F8F9FB" : "FFFFFF", color: "auto" },
      borders: cellBorders(),
      margins: { top: 60, bottom: 60, left: 100, right: 100 },
      children: [new Paragraph({ spacing: { after: 0, line: 264 }, children: runs(parseInline, c, { size: 19 }) })],
    })),
  }));
  return new Table({ width: { size: CONTENT_W, type: WidthType.DXA }, columnWidths: widths, layout: TableLayoutType.FIXED, rows: [header, ...body] });
}

function boxTable(children, { fill, left, leftSize = 24, textColor } = {}) {
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA }, columnWidths: [CONTENT_W], layout: TableLayoutType.FIXED,
    rows: [new TableRow({ cantSplit: true, children: [new TableCell({
      width: { size: CONTENT_W, type: WidthType.DXA },
      shading: { type: ShadingType.CLEAR, fill, color: "auto" },
      borders: { ...noBorders, left: { style: BorderStyle.SINGLE, size: leftSize, color: left || fill } },
      margins: { top: 120, bottom: 120, left: 180, right: 180 },
      children,
    })] })],
  });
}

const SPACERS = new WeakSet();
const spacer = (after = 120) => { const p = new Paragraph({ spacing: { after }, children: [] }); SPACERS.add(p); return p; };

export async function buildDocx({ blocks, heads, meta, figs, assetDir, outPath, parseInline }) {
  const body = [];
  const caption = (label, text) => new Paragraph({
    alignment: AlignmentType.CENTER, spacing: { before: 60, after: 220 }, keepLines: true,
    children: [new TextRun({ text: `${label} `, bold: true, color: NAVY, size: 17 }), ...runs(parseInline, text, { italics: true, color: MUTED, size: 17 })],
  });

  let firstH1 = true;
  for (const b of blocks) {
    if ((b.h === 1 || b.toc) && body.length && SPACERS.has(body[body.length - 1])) body.pop();
    if (b.h === 1) {
      const label = b.num ? `${b.num}   ${b.text}` : b.text;
      body.push(new Paragraph({
        heading: HeadingLevel.HEADING_1, pageBreakBefore: !firstH1,
        border: { bottom: { style: BorderStyle.SINGLE, size: 18, color: NAVY, space: 4 } },
        children: [new Bookmark({ id: bm(b.id), children: [new TextRun({ text: label })] })],
      }));
      firstH1 = false;
    } else if (b.h === 2) {
      body.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new Bookmark({ id: bm(b.id), children: [new TextRun({ text: `${b.num}   ${b.text}` })] })] }));
    } else if (b.h === 3) {
      body.push(new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun({ text: b.text })] }));
    } else if (b.p) {
      body.push(new Paragraph({ alignment: AlignmentType.JUSTIFIED, children: runs(parseInline, b.p) }));
    } else if (b.ul) {
      for (const x of b.ul) body.push(new Paragraph({ numbering: { reference: "bullets", level: 0 }, children: runs(parseInline, x) }));
      body.push(spacer(60));
    } else if (b.ol) {
      const inst = Math.floor(Math.random() * 1e6);
      for (const x of b.ol) body.push(new Paragraph({ numbering: { reference: "numbers", level: 0, instance: inst }, children: runs(parseInline, x) }));
      body.push(spacer(60));
    } else if (b.table) {
      body.push(dataTable(parseInline, b.table), spacer(160));
    } else if (b.fig) {
      const f = b.fig;
      let file, wpx, hpx;
      if (f.img) {
        const s = pngSize(path.join(assetDir, f.img));
        file = s.buf; const k = MAX_IMG_PX / s.w; wpx = MAX_IMG_PX; hpx = Math.round(s.h * k);
      } else {
        const s = pngSize(f.png);
        file = s.buf;
        const maxH = f.tall ? 760 : 440;
        const k = Math.min(1, MAX_IMG_PX / f.w, maxH / f.h);
        wpx = Math.round(f.w * k); hpx = Math.round(f.h * k);
      }
      body.push(new Paragraph({ alignment: AlignmentType.CENTER, keepNext: true, spacing: { before: 120, after: 0 }, children: [new ImageRun({ type: "png", data: file, transformation: { width: wpx, height: hpx } })] }));
      body.push(caption(`Figure ${f.num}.`, f.caption));
    } else if (b.code) {
      const lines = b.code.split("\n").map((ln) => new Paragraph({ spacing: { after: 0, line: 240 }, children: [new TextRun({ text: ln || " ", font: "Consolas", size: 16, color: "E6EDF6" })] }));
      body.push(boxTable(lines, { fill: "0F1B2D", left: SAFFRON, leftSize: 30 }), spacer(160));
    } else if (b.callout) {
      const c = b.callout;
      const fill = c.kind === "key" ? "FFF8E6" : c.kind === "warn" ? "FDF1F0" : "EEF4FC";
      const left = c.kind === "key" ? SAFFRON : c.kind === "warn" ? "B42318" : BLUE;
      body.push(boxTable([
        new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: c.title.toUpperCase(), bold: true, size: 17, color: NAVY, font: "Segoe UI", characterSpacing: 20 })] }),
        new Paragraph({ spacing: { after: 0 }, children: runs(parseInline, c.text) }),
      ], { fill, left, leftSize: 30 }), spacer(160));
    } else if (b.kpis) {
      const w = Math.floor(CONTENT_W / b.kpis.length);
      const widths = b.kpis.map((_, i) => (i === b.kpis.length - 1 ? CONTENT_W - w * (b.kpis.length - 1) : w));
      body.push(new Table({
        width: { size: CONTENT_W, type: WidthType.DXA }, columnWidths: widths, layout: TableLayoutType.FIXED,
        rows: [new TableRow({ children: b.kpis.map((k, i) => new TableCell({
          width: { size: widths[i], type: WidthType.DXA },
          shading: { type: ShadingType.CLEAR, fill: "FBFCFD", color: "auto" },
          borders: { ...cellBorders(), top: { style: BorderStyle.SINGLE, size: 24, color: BLUE } },
          margins: { top: 100, bottom: 100, left: 120, right: 120 },
          children: [
            new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: k.v, bold: true, size: 28, color: NAVY, font: "Segoe UI" })] }),
            new Paragraph({ spacing: { after: 0, line: 240 }, children: [new TextRun({ text: k.l, size: 16, color: MUTED })] }),
          ],
        })) })],
      }), spacer(160));
    } else if (b.refs) {
      for (const g of b.refs) {
        body.push(new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun({ text: g.group })] }));
        for (const r of g.items) {
          const kids = [new Bookmark({ id: bm(`ref_${r.n}`), children: [new TextRun({ text: `[${r.n}]`, bold: true, color: NAVY })] }), new TextRun({ text: "\t" }), ...runs(parseInline, r.t, { size: 19 })];
          body.push(new Paragraph({ keepNext: true, keepLines: true, indent: { left: 620, hanging: 620 }, tabStops: [{ type: TabStopType.LEFT, position: 620 }], spacing: { after: 20 }, children: kids }));
          if (r.role) body.push(new Paragraph({ keepNext: true, indent: { left: 620 }, spacing: { after: 20 }, children: [new TextRun({ text: `→ ${r.role}`, color: "1E7B34", size: 18 })] }));
          body.push(new Paragraph({ indent: { left: 620 }, spacing: { after: 130 }, children: [new ExternalHyperlink({ link: r.url, children: [new TextRun({ text: r.url, color: BLUE, underline: {}, size: 17 })] })] }));
        }
      }
    } else if (b.toc) {
      body.push(new Paragraph({ heading: HeadingLevel.HEADING_1, pageBreakBefore: true, border: { bottom: { style: BorderStyle.SINGLE, size: 18, color: NAVY, space: 4 } }, children: [new TextRun({ text: "Index" })] }));
      body.push(new Paragraph({ spacing: { after: 160 }, children: [new TextRun({ text: "Every entry is a link to its section. In Word, the Navigation Pane (View → Navigation Pane) shows the same outline.", italics: true, color: MUTED, size: 18 })] }));
      for (const h of heads) {
        if (h.id === "doc-control") continue;
        const top = h.h === 1;
        body.push(new Paragraph({
          spacing: { before: top ? 120 : 0, after: top ? 30 : 20 },
          indent: { left: top ? 0 : 560 },
          tabStops: [{ type: TabStopType.LEFT, position: top ? 560 : 1160 }],
          children: [new InternalHyperlink({ anchor: bm(h.id), children: [
            new TextRun({ text: h.num || "", color: BLUE, bold: top, size: top ? 21 : 19 }),
            new TextRun({ text: "\t" + h.text, color: top ? NAVY : INK, bold: top, size: top ? 21 : 19 }),
          ] })],
        }));
      }
    }
  }

  // Cover
  const coverCell = (children, fill, h) => new TableRow({
    height: { value: h, rule: HeightRule.EXACT },
    children: [new TableCell({ width: { size: CONTENT_W, type: WidthType.DXA }, shading: { type: ShadingType.CLEAR, fill, color: "auto" }, borders: noBorders, margins: { top: 400, bottom: 300, left: 480, right: 480 }, verticalAlign: VerticalAlign.TOP, children })],
  });
  const cover = [
    new Table({
      width: { size: CONTENT_W, type: WidthType.DXA }, columnWidths: [CONTENT_W], layout: TableLayoutType.FIXED,
      rows: [
        coverCell([
          new Paragraph({ spacing: { before: 900, after: 300 }, children: [new TextRun({ text: `${meta.event.toUpperCase()}  ·  PROBLEM STATEMENT ${meta.psId}  ·  ISRO`, color: "AEB9CC", size: 18, font: "Segoe UI", characterSpacing: 30 })] }),
          new Paragraph({ spacing: { after: 200 }, children: [new TextRun({ text: meta.title, bold: true, color: "FFFFFF", size: 96, font: "Segoe UI" })] }),
          new Paragraph({ spacing: { after: 420 }, children: [new TextRun({ text: meta.subtitle, color: "DCE4F0", size: 30, font: "Segoe UI Light" })] }),
          new Paragraph({ border: { top: { style: BorderStyle.SINGLE, size: 36, color: SAFFRON, space: 1 } }, indent: { right: 7400 }, spacing: { after: 200 }, children: [] }),
          new Paragraph({ children: [new TextRun({ text: meta.docType, color: "FFFFFF", size: 24, font: "Segoe UI" })] }),
        ], NAVY, 9800),
        coverCell([
          new Paragraph({ spacing: { before: 200 }, children: [new TextRun({ text: "TEAM", color: "8FA0BB", size: 18, font: "Segoe UI", characterSpacing: 40 })] }),
          new Paragraph({ spacing: { after: 260 }, children: [new TextRun({ text: meta.team, bold: true, color: SAFFRON, size: 60, font: "Segoe UI" })] }),
          ...[
            ["Problem Statement ID", meta.psId], ["Organisation", meta.org], ["Theme / Category", `${meta.theme} / ${meta.category}`], ["Version", `${meta.version} · ${meta.date}`],
          ].map(([k, v]) => new Paragraph({ spacing: { after: 40 }, tabStops: [{ type: TabStopType.LEFT, position: 2600 }], children: [new TextRun({ text: k, color: "8FA0BB", size: 18 }), new TextRun({ text: "\t" + v, color: "DCE4F0", size: 18 })] })),
        ], "0E2D52", 3700),
      ],
    }),
  ];

  const headerFooter = {
    headers: { default: new Header({ children: [new Paragraph({
      tabStops: [{ type: TabStopType.RIGHT, position: CONTENT_W }],
      border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: RULE, space: 4 } },
      children: [new TextRun({ text: "SatQuery AI — Technical Report", size: 16, color: MUTED }), new TextRun({ text: "\tTeam BUGHEBUG · PS 26167 · SIH 2026", size: 16, color: MUTED })],
    })] }) },
    footers: { default: new Footer({ children: [new Paragraph({
      tabStops: [{ type: TabStopType.RIGHT, position: CONTENT_W }],
      children: [
        new TextRun({ text: "Confidential — prepared for ISRO / SIH 2026 evaluation", size: 16, color: "9CA3AF" }),
        new TextRun({ children: ["\tPage ", PageNumber.CURRENT, " of ", PageNumber.TOTAL_PAGES], size: 16, color: MUTED }),
      ],
    })] }) },
  };

  const doc = new Document({
    creator: "Team BUGHEBUG",
    title: "SatQuery AI — Technical Report",
    description: meta.subtitle,
    styles: {
      default: { document: { run: { font: "Calibri", size: 21, color: INK }, paragraph: { spacing: { after: 120, line: 264 } } } },
      paragraphStyles: [
        { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true, run: { font: "Segoe UI", size: 38, bold: true, color: NAVY }, paragraph: { spacing: { before: 0, after: 240 }, outlineLevel: 0, keepNext: true } },
        { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true, run: { font: "Segoe UI", size: 27, bold: true, color: NAVY }, paragraph: { spacing: { before: 320, after: 120 }, outlineLevel: 1, keepNext: true } },
        { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true, run: { font: "Segoe UI", size: 22, bold: true, color: "24324A" }, paragraph: { spacing: { before: 220, after: 90 }, outlineLevel: 2, keepNext: true } },
      ],
    },
    numbering: { config: [
      { reference: "bullets", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 460, hanging: 260 } } } }] },
      { reference: "numbers", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 460, hanging: 300 } } } }] },
    ] },
    sections: [
      { properties: { page: { size: { width: PAGE_W, height: PAGE_H }, margin: { top: 720, bottom: 720, left: MARGIN, right: MARGIN } } }, children: cover },
      { properties: { page: { size: { width: PAGE_W, height: PAGE_H }, margin: { top: 1300, bottom: 1100, left: MARGIN, right: MARGIN, header: 600, footer: 560 } } }, ...headerFooter, children: body },
    ],
  });
  fs.writeFileSync(outPath, await Packer.toBuffer(doc));
}
