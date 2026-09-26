// Static SVG charts for the report (print: light surface only).
// Palette: series-1 blue #2a78d6 = our measurement; neutral grey = baseline / published anchor.
const BLUE = "#2a78d6", GREY = "#aab2bd", INK = "#1f2937", INK2 = "#52514e", GRID = "#e5e8ed";
const FONT = `font-family="Segoe UI, Calibri, Arial, sans-serif"`;

const t = (x, y, s, o = {}) =>
  `<text x="${x}" y="${y}" ${FONT} font-size="${o.size || 12}" fill="${o.fill || INK2}"` +
  `${o.anchor ? ` text-anchor="${o.anchor}"` : ""}${o.weight ? ` font-weight="${o.weight}"` : ""}>${s}</text>`;

// Horizontal bar with the data end rounded, anchored flat at the baseline.
function hbar(x, y, w, h, fill) {
  const r = Math.min(4, w / 2, h / 2);
  if (w <= 0) return "";
  return `<path d="M${x},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h - r} Q${x + w},${y + h} ${x + w - r},${y + h} H${x} Z" fill="${fill}"/>`;
}
function vbar(x, yBase, w, h, fill) {
  const r = Math.min(4, w / 2, h / 2);
  if (h <= 0) return "";
  const y = yBase - h;
  return `<path d="M${x},${yBase} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${yBase} Z" fill="${fill}"/>`;
}
function legend(x, y, items) {
  let cx = x, s = "";
  for (const [label, color] of items) {
    s += `<rect x="${cx}" y="${y - 9}" width="11" height="11" rx="2" fill="${color}"/>` + t(cx + 16, y, label, { size: 12, fill: INK });
    cx += 22 + label.length * 6.6;
  }
  return s;
}

function anchors() {
  const rows = [
    ["MiniGPT-v2 (published)", 0.371, false],
    ["GeoChat zero-shot (published)", 0.408, false],
    ["Ours — Qwen2-VL zero-shot", 0.527, true],
    ["GeoChat fine-tuned (published)", 0.606, false],
    ["Ours — adapted, rung 1", 0.6305, true],
    ["GPT-4V (published)", 0.656, false],
    ["Ours — adapted, rung 2 (shipped)", 0.66, true],
  ];
  const W = 760, L = 250, R = 60, top = 40, bh = 22, gap = 12;
  const H = top + rows.length * (bh + gap) + 34;
  const span = W - L - R, max = 0.7;
  const X = (v) => L + (v / max) * span;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">`;
  s += `<rect width="${W}" height="${H}" fill="#fff"/>`;
  s += legend(L, 20, [["Our measurement", BLUE], ["Published anchor", GREY]]);
  for (let g = 0; g <= 0.7001; g += 0.1) {
    const x = X(g);
    s += `<line x1="${x}" x2="${x}" y1="${top - 6}" y2="${H - 30}" stroke="${GRID}" stroke-width="1"/>`;
    s += t(x, H - 12, g.toFixed(1), { anchor: "middle", size: 11 });
  }
  rows.forEach(([label, v, ours], i) => {
    const y = top + i * (bh + gap);
    s += t(L - 10, y + bh / 2 + 4, label, { anchor: "end", size: 12.5, fill: ours ? INK : INK2, weight: ours ? 600 : 400 });
    s += hbar(L, y, X(v) - L, bh, ours ? BLUE : GREY);
    s += t(X(v) + 6, y + bh / 2 + 4, v.toFixed(3).replace(/0$/, ""), { size: 12, fill: INK, weight: ours ? 600 : 400 });
  });
  s += `<line x1="${L}" x2="${L}" y1="${top - 6}" y2="${H - 30}" stroke="#8a94a6" stroke-width="1.2"/>`;
  return s + "</svg>";
}

function categories() {
  const rows = [
    ["object existence", 429, 0.8578, 0.9301],
    ["object quantity", 349, 0.4814, 0.5616],
    ["object position", 299, 0.3478, 0.5686],
    ["object category", 275, 0.3127, 0.5091],
    ["object color", 190, 0.5474, 0.6],
    ["scene type", 185, 0.4757, 0.6108],
    ["object shape", 73, 0.274, 0.6164],
    ["object size", 62, 0.4194, 0.5323],
    ["image", 57, 0.6491, 0.9825],
    ["reasoning", 44, 0.7273, 0.6818],
    ["object direction", 24, 0.375, 0.4583],
    ["rural or urban", 13, 0.9231, 1.0],
  ];
  const W = 760, L = 200, R = 70, top = 44, bh = 11, pair = 2, gap = 12;
  const rowH = bh * 2 + pair + gap;
  const H = top + rows.length * rowH + 30;
  const span = W - L - R;
  const X = (v) => L + v * span;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#fff"/>`;
  s += legend(L, 20, [["Zero-shot", GREY], ["Adapted (rung 2)", BLUE]]);
  for (let g = 0; g <= 1.0001; g += 0.2) {
    const x = X(g);
    s += `<line x1="${x}" x2="${x}" y1="${top - 8}" y2="${H - 26}" stroke="${GRID}"/>`;
    s += t(x, H - 10, g.toFixed(1), { anchor: "middle", size: 11 });
  }
  rows.forEach(([label, n, zs, ad], i) => {
    const y = top + i * rowH;
    s += t(L - 10, y + bh + 3, label, { anchor: "end", size: 12.5, fill: INK });
    s += t(L - 10, y + bh + 15, `n = ${n}`, { anchor: "end", size: 10, fill: INK2 });
    s += hbar(L, y, X(zs) - L, bh, GREY);
    s += hbar(L, y + bh + pair, X(ad) - L, bh, BLUE);
    const d = Math.round((ad - zs) * 100);
    s += t(Math.max(X(ad), X(zs)) + 6, y + bh + 6, `${ad.toFixed(2)}  (${d >= 0 ? "+" : "−"}${Math.abs(d)})`, { size: 11.5, fill: INK, weight: 600 });
  });
  s += `<line x1="${L}" x2="${L}" y1="${top - 8}" y2="${H - 26}" stroke="#8a94a6" stroke-width="1.2"/>`;
  return s + "</svg>";
}

function calibration() {
  const bands = [
    ["0.3–0.4", 12, 0.083, 0.35], ["0.4–0.5", 26, 0.308, 0.45], ["0.5–0.6", 36, 0.361, 0.55],
    ["0.6–0.7", 48, 0.646, 0.65], ["0.7–0.8", 58, 0.707, 0.75], ["0.8–0.9", 59, 0.831, 0.85], ["0.9–1.0", 61, 0.967, 0.95],
  ];
  const W = 760, H = 330, L = 60, R = 20, top = 40, bottom = 60;
  const ph = H - top - bottom, pw = W - L - R;
  const Y = (v) => top + ph - v * ph;
  const bw = pw / bands.length;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#fff"/>`;
  s += legend(L, 20, [["Measured accuracy", BLUE]]);
  s += `<line x1="${L + 175}" x2="${L + 200}" y1="16" y2="16" stroke="${INK}" stroke-width="2" stroke-dasharray="5 4"/>` + t(L + 206, 20, "Perfect calibration (band midpoint)", { size: 12, fill: INK });
  for (let g = 0; g <= 1.0001; g += 0.2) {
    s += `<line x1="${L}" x2="${W - R}" y1="${Y(g)}" y2="${Y(g)}" stroke="${GRID}"/>` + t(L - 8, Y(g) + 4, `${Math.round(g * 100)}%`, { anchor: "end", size: 11 });
  }
  let pts = [];
  bands.forEach(([label, n, acc, mid], i) => {
    const x = L + i * bw + bw * 0.2, w = bw * 0.6;
    s += vbar(x, Y(0), w, Y(0) - Y(acc), BLUE);
    s += t(x + w / 2, Y(acc) - 6, `${(acc * 100).toFixed(0)}%`, { anchor: "middle", size: 12, fill: INK, weight: 600 });
    s += t(x + w / 2, Y(0) + 18, label, { anchor: "middle", size: 12, fill: INK });
    s += t(x + w / 2, Y(0) + 33, `n = ${n}`, { anchor: "middle", size: 10.5 });
    pts.push(`${x + w / 2},${Y(mid)}`);
  });
  s += `<polyline points="${pts.join(" ")}" fill="none" stroke="${INK}" stroke-width="2" stroke-dasharray="5 4"/>`;
  s += t(L + pw / 2, H - 6, "M1 stated confidence band", { anchor: "middle", size: 12, fill: INK2 });
  s += `<line x1="${L}" x2="${W - R}" y1="${Y(0)}" y2="${Y(0)}" stroke="#8a94a6" stroke-width="1.2"/>`;
  return s + "</svg>";
}

function ablation() {
  const rows = [
    ["A", "Brightness only", 0.0856], ["B", "+ spectral indices", 0.1055], ["C", "+ specialists", 0.462],
    ["D", "+ router", 0.712], ["E", "+ evidence fusion & gate", 0.962],
  ];
  const W = 760, H = 320, L = 60, R = 20, top = 30, bottom = 62;
  const ph = H - top - bottom, pw = W - L - R;
  const Y = (v) => top + ph - v * ph;
  const bw = pw / rows.length;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#fff"/>`;
  for (let g = 0; g <= 1.0001; g += 0.25) {
    s += `<line x1="${L}" x2="${W - R}" y1="${Y(g)}" y2="${Y(g)}" stroke="${GRID}"/>` + t(L - 8, Y(g) + 4, g.toFixed(2), { anchor: "end", size: 11 });
  }
  rows.forEach(([k, label, v], i) => {
    const x = L + i * bw + bw * 0.22, w = bw * 0.56;
    s += vbar(x, Y(0), w, Y(0) - Y(v), i === rows.length - 1 ? BLUE : "#8fb6e8");
    s += t(x + w / 2, Y(v) - 7, v.toFixed(3), { anchor: "middle", size: 12.5, fill: INK, weight: 600 });
    s += t(x + w / 2, Y(0) + 19, k, { anchor: "middle", size: 13, fill: INK, weight: 700 });
    s += t(x + w / 2, Y(0) + 36, label, { anchor: "middle", size: 11.5, fill: INK2 });
  });
  s += t(12, top + ph / 2, "", {});
  s += `<text ${FONT} font-size="12" fill="${INK2}" transform="translate(16 ${top + ph / 2}) rotate(-90)" text-anchor="middle">capability score</text>`;
  s += `<line x1="${L}" x2="${W - R}" y1="${Y(0)}" y2="${Y(0)}" stroke="#8a94a6" stroke-width="1.2"/>`;
  return s + "</svg>";
}

export const charts = { anchors, categories, calibration, ablation };
