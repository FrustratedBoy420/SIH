/* ────────────────────────────────────────────────────────────────────────
   Parcel renderer — draws a claim parcel the way the archive saw it.

   Two palettes, because they answer different questions.

   NATURAL is the default, and it is the one that has to be readable without
   a caption: dry-season central India, where closed sal canopy is a dark
   olive green and worked ground is a mosaic of golden stubble, standing rabi
   crop, and bare laterite the colour of brick. Forest and farm cannot be
   mistaken for one another. That is the whole finding, so it must be the
   thing you see first.

   INFRARED is what a change-detection analyst actually works in — Landsat
   bands 4-3-2, where the near infrared puts vegetation in red and worked soil
   in cyan. It separates crop vigour far better than natural colour does. It
   is available on a toggle, not as the default, because it needs explaining.

   Sensor era is simulated honestly either way: MSS pixels are 60 m and
   striped across its six detectors, ETM+ after May 2003 carries the
   scan-line-corrector failure wedges, Corona is 1.8 m panchromatic film with
   grain and scratches.

   CLASSIFY is a third, invisible mode: it paints one flat colour per land
   class so the interface can read the frame back and say, in words, what is
   in it.

   One WebGL context is shared by every frame on screen. Callers render into
   it and blit the result into their own 2-D canvas.
   ──────────────────────────────────────────────────────────────────────── */

export type Sensor = "corona" | "mss" | "tm" | "etm" | "oli" | "s2";
export type Palette = "natural" | "infrared";

export interface ParcelParams {
  seed: number;
  canopy: number;
  sensor: Sensor;
  trajectory: "forest_to_cultivation" | "forest_to_settlement" | "shifting_cultivation" | "stable_forest";
  year: number;
  obs: number;
  /** natural colour by default; infrared is the analyst's view */
  palette?: Palette;
  /** feature frequency: 1 for a full frame, ~0.4 for a contact-sheet frame */
  detail?: number;
  /** render resolution; keep small for contact-sheet frames */
  res?: number;
  /** internal: paint flat class colours instead of an image */
  classify?: boolean;
}

const VERT = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main(){ vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;

const FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;

uniform float uSeed;
uniform float uCanopy;
uniform float uPixel;     // ground sample distance, in tile pixels
uniform float uMono;      // 1 = Corona panchromatic film
uniform float uStripe;    // MSS six-detector striping
uniform float uSlc;       // ETM+ scan-line-corrector failure
uniform float uSharp;     // sensor sharpness 0..1
uniform float uSettle;    // homestead fraction
uniform float uShift;     // podu / jhum plot pattern
uniform float uHaze;      // thin cloud from low valid-observation counts
uniform float uDetail;    // feature frequency: 1 full frame, <1 contact sheet
uniform float uIR;        // 1 = false-colour infrared, 0 = natural colour
uniform float uClassify;  // 1 = flat land-class colours, for readback

float h21(vec2 p){ p = fract(p * vec2(127.11, 311.7)); p += dot(p, p + 34.23); return fract(p.x * p.y); }
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = h21(i), b = h21(i + vec2(1,0)), c = h21(i + vec2(0,1)), d = h21(i + vec2(1,1));
  return mix(mix(a,b,f.x), mix(c,d,f.x), f.y);
}
float fbm(vec2 p, int oct){
  float s = 0.0, a = 0.5, n = 0.0;
  for(int i=0;i<7;i++){ if(i>=oct) break; s += a * vnoise(p); n += a; p = p * 2.03 + 11.7; a *= 0.5; }
  return s / max(n, 0.001);
}
mat2 rot(float a){ float c=cos(a), s=sin(a); return mat2(c,-s,s,c); }

/* the land itself: ridges and valleys, which everything else follows */
float terrain(vec2 p, int oct){
  return mix(fbm(p * 1.05, oct), fbm(p * 2.6 + 40.0, oct - 1), 0.28);
}

void main(){
  float sd = uSeed;
  float D = max(0.30, uDetail);
  int OC = int(clamp(3.0 + 4.0 * uDetail, 3.0, 7.0));

  // quantise to the sensor ground sample distance
  float px = uPixel * D;
  vec2 q = px >= 4.0 ? (floor(vUv * px) + 0.5) / px : vUv;
  // Landscape structure is measured in kilometres and must NOT follow the
  // sensor's pixel size, or a coarse sensor turns the ground into confetti.
  // pm carries ridges, valleys and clearings; pf carries crowns and furrows.
  vec2 pm = q * (1.15 * D) + sd;
  vec2 pf = q * (6.5 * D) + sd;

  // relief, lit from the north-west
  float e = 0.010;
  float t0 = terrain(pm, OC);
  float tx = terrain(pm + vec2(e, 0.0), OC) - t0;
  float ty = terrain(pm + vec2(0.0, e), OC) - t0;
  float shade = clamp(0.86 + (-tx - ty * 0.7) * 21.0, 0.38, 1.48);

  // ── canopy structure
  vec2 w = vec2(fbm(pf * 1.7, OC - 1), fbm(pf * 1.7 + 5.2, OC - 1));
  float canopyTex = fbm(pf * 3.1 + w * 1.4, OC);
  float crown = fbm(pf * 9.0 + w * 0.6, OC - 1);
  float dens = fbm(pm * 2.3 + 7.0, OC - 1);
  float cmix = clamp((canopyTex - 0.5) * 1.15 + (crown - 0.5) * 0.8 + (dens - 0.5) * 1.05 + 0.5, 0.0, 1.0);

  // ── field mosaic
  float fieldRot = h21(vec2(sd, 4.0)) * 3.14159;
  vec2 fp = (q - 0.5) * rot(fieldRot) * ((uShift > 0.5 ? 5.5 : 8.5) * D);
  vec2 cell = floor(fp);
  vec2 fr = fract(fp);
  float cellR  = h21(cell + sd);
  float cellR2 = h21(cell + sd + 19.0);
  float cellR3 = h21(cell + sd + 47.0);
  float bund = 1.0 - smoothstep(0.0, 0.06, min(min(fr.x, 1.0 - fr.x), min(fr.y, 1.0 - fr.y)));
  float planted = step(0.44, cellR);
  float bareSoil = (1.0 - planted) * step(cellR3, 0.42);

  // ── which class is this pixel?
  // The clearing field is roughly gaussian around 0.5, so it is stretched to
  // 0..1 first; then the canopy figure reads as a quantile — canopy 0.4 means
  // about sixty per cent of the ground has been opened. The gate keeps a
  // closed-canopy frame genuinely closed instead of speckling it with farms.
  float fieldRaw = fbm(pm * 1.35 + 3.0, OC) * 0.62 + (1.0 - t0) * 0.38;
  float field = smoothstep(0.33, 0.67, fieldRaw);
  float gate = smoothstep(0.88, 0.74, uCanopy);
  float cleared = smoothstep(uCanopy - 0.08, uCanopy + 0.12, field) * gate;
  float valley = 1.0 - smoothstep(0.0015, 0.0075, abs(t0 - 0.44));
  float roofs = 0.0;
  if(uSettle > 0.01){
    vec2 hp = q * (36.0 * D) + sd * 3.0;
    float clusterM = smoothstep(0.42, 0.68, fbm(pm * 2.4 + 21.0, OC - 2));
    roofs = step(0.94 - uSettle * 0.07, h21(floor(hp))) * clusterM * cleared;
  }

  // ── flat class colours, for the readback that lets the interface describe
  //    the frame in words: red forest, green cultivated, blue homestead,
  //    yellow water
  if(uClassify > 0.5){
    vec3 c = mix(vec3(1,0,0), vec3(0,1,0), step(0.5, cleared));
    c = mix(c, vec3(0,0,1), step(0.5, roofs));
    c = mix(c, vec3(1,1,0), step(0.5, valley));
    outColor = vec4(c, 1.0);
    return;
  }

  vec3 forest, crop, water, roofCol, bundCol;
  if(uIR > 0.5){
    // Landsat 4-3-2: vegetation red, worked soil cyan, water near-black
    forest  = mix(vec3(0.095,0.018,0.044), vec3(0.74,0.19,0.225), cmix);
    vec3 standing = mix(vec3(0.78,0.255,0.30), vec3(0.955,0.405,0.425), cellR2);
    vec3 fallow   = mix(vec3(0.71,0.755,0.61), vec3(0.60,0.815,0.815), cellR2);
    vec3 bare     = mix(vec3(0.80,0.86,0.86), vec3(0.68,0.78,0.80), cellR2);
    crop    = mix(mix(fallow, bare, bareSoil), standing, planted);
    water   = vec3(0.038,0.072,0.125);
    roofCol = vec3(0.80,0.855,0.875);
    bundCol = vec3(0.42,0.355,0.285);
  } else {
    // dry-season central India: closed sal canopy against worked laterite
    forest  = mix(vec3(0.255,0.335,0.160), vec3(0.052,0.092,0.042), cmix);
    vec3 standing = mix(vec3(0.315,0.415,0.185), vec3(0.475,0.545,0.265), cellR2);
    vec3 fallow   = mix(vec3(0.645,0.575,0.375), vec3(0.775,0.705,0.505), cellR2);
    vec3 bare     = mix(vec3(0.505,0.335,0.215), vec3(0.625,0.435,0.285), cellR2);
    crop    = mix(mix(fallow, bare, bareSoil), standing, planted);
    water   = vec3(0.055,0.115,0.145);
    roofCol = mix(vec3(0.60,0.545,0.485), vec3(0.80,0.795,0.775), cellR3);
    bundCol = vec3(0.325,0.285,0.205);
  }

  crop = mix(crop, bundCol, bund * 0.6);
  crop *= 0.93 + fbm(pf * 9.0, OC - 2) * 0.15;

  vec3 col = mix(forest, crop, cleared);
  col = mix(col, roofCol, roofs * 0.9);
  col = mix(col, water, valley * 0.82);
  col *= shade;

  // ── sensor character
  float g = h21(q * 900.0 + sd * 17.0);
  col *= 0.95 + g * 0.10 * (2.0 - uSharp);

  if(uStripe > 0.5){
    float band = mod(floor(vUv.y * 96.0), 6.0);
    col *= 0.94 + 0.05 * band / 5.0;
    col = mix(col, vec3(dot(col, vec3(0.34,0.42,0.24))), 0.13);
    col *= vec3(1.01, 1.0, 0.96);
  }

  if(uSlc > 0.5){
    // the scan-line corrector wedges: nothing at nadir, widening to the swath
    // edge. Real gap-filled products interpolate, so these are dark, not void.
    float d = abs(vUv.x - 0.5) * 2.0;
    float stripe = fract((vUv.x * 0.62 + vUv.y) * 17.0);
    float gap = step(stripe, 0.03 + 0.09 * d) * smoothstep(0.70, 0.92, d);
    col = mix(col, col * 0.44 + vec3(0.010,0.014,0.018), gap * 0.8);
  }

  if(uMono > 0.5){
    // Corona is panchromatic film: canopy reads dark and heavily speckled,
    // worked ground reads bright
    float lum = 0.30 + cleared * 0.46;
    lum -= (1.0 - cleared) * (0.16 - (crown - 0.5) * 0.42);
    lum += cleared * (canopyTex - 0.5) * 0.22;
    lum += roofs * 0.28;
    lum *= mix(0.82, 1.18, clamp(shade - 0.4, 0.0, 1.0));
    lum -= valley * 0.20;
    lum = pow(clamp(lum, 0.0, 1.0), 0.92);
    col = mix(vec3(0.062,0.054,0.045), vec3(0.955,0.925,0.845), lum);
    float sg = h21(q * 1400.0 + sd);
    col *= 0.86 + sg * 0.28;
    float scratch = step(0.9991, h21(vec2(floor(q.x * 420.0), sd)));
    col += scratch * 0.18;
    float vig = 1.0 - 0.5 * pow(length(vUv - 0.5) * 1.42, 2.6);
    col *= clamp(vig, 0.0, 1.0);
  }

  if(uHaze > 0.01){
    float cl = smoothstep(0.52, 0.80, fbm(pm * 1.9 + 40.0, OC - 2));
    col = mix(col, vec3(0.86,0.88,0.90), cl * uHaze);
  }

  outColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

const SENSOR_CFG: Record<Sensor, { pixel: number; mono: number; stripe: number; sharp: number }> = {
  corona: { pixel: 1, mono: 1, stripe: 0, sharp: 0.95 },
  mss: { pixel: 22, mono: 0, stripe: 1, sharp: 0.25 },
  tm: { pixel: 44, mono: 0, stripe: 0, sharp: 0.55 },
  etm: { pixel: 44, mono: 0, stripe: 0, sharp: 0.6 },
  oli: { pixel: 46, mono: 0, stripe: 0, sharp: 0.8 },
  s2: { pixel: 132, mono: 0, stripe: 0, sharp: 1 },
};

const SIZE = 1024;
let gl: WebGL2RenderingContext | null = null;
let canvas: HTMLCanvasElement | null = null;
let prog: WebGLProgram | null = null;
const uloc: Record<string, WebGLUniformLocation | null> = {};
let failed = false;

const UNIFORMS = [
  "uSeed", "uCanopy", "uPixel", "uMono", "uStripe", "uSlc", "uSharp",
  "uSettle", "uShift", "uHaze", "uDetail", "uIR", "uClassify",
];

function init(): boolean {
  if (gl) return true;
  if (failed) return false;
  canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("webgl2", { antialias: false, preserveDrawingBuffer: true, alpha: false });
  if (!ctx) { failed = true; return false; }
  gl = ctx;
  const mk = (type: number, src: string) => {
    const s = gl!.createShader(type)!;
    gl!.shaderSource(s, src);
    gl!.compileShader(s);
    if (!gl!.getShaderParameter(s, gl!.COMPILE_STATUS)) console.error(gl!.getShaderInfoLog(s));
    return s;
  };
  prog = gl.createProgram()!;
  gl.attachShader(prog, mk(gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, mk(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  gl.useProgram(prog);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, "aPos");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  for (const n of UNIFORMS) uloc[n] = gl.getUniformLocation(prog, n);
  return true;
}

export interface Rendered { canvas: HTMLCanvasElement; sx: number; sy: number; size: number; }

function draw(p: ParcelParams, res: number) {
  const cfg = SENSOR_CFG[p.sensor];
  const slc = p.sensor === "etm" && p.year >= 2003 ? 1 : 0;
  const haze = p.sensor === "corona" ? 0 : Math.max(0, Math.min(0.5, (10 - p.obs) / 22));
  gl!.viewport(0, SIZE - res, res, res);
  gl!.uniform1f(uloc.uSeed!, (p.seed % 9973) / 97.0);
  gl!.uniform1f(uloc.uCanopy!, p.canopy);
  gl!.uniform1f(uloc.uPixel!, cfg.pixel);
  gl!.uniform1f(uloc.uMono!, p.classify ? 0 : cfg.mono);
  gl!.uniform1f(uloc.uStripe!, p.classify ? 0 : cfg.stripe);
  gl!.uniform1f(uloc.uSlc!, p.classify ? 0 : slc);
  gl!.uniform1f(uloc.uSharp!, cfg.sharp);
  gl!.uniform1f(uloc.uSettle!, p.trajectory === "forest_to_settlement" ? 0.7 : 0.18);
  gl!.uniform1f(uloc.uShift!, p.trajectory === "shifting_cultivation" ? 1 : 0);
  gl!.uniform1f(uloc.uHaze!, p.classify ? 0 : haze);
  gl!.uniform1f(uloc.uDetail!, p.detail ?? 1);
  gl!.uniform1f(uloc.uIR!, (p.palette ?? "natural") === "infrared" ? 1 : 0);
  gl!.uniform1f(uloc.uClassify!, p.classify ? 1 : 0);
  gl!.drawArrays(gl!.TRIANGLES, 0, 3);
}

/** Renders one parcel into the shared buffer and returns where it landed. */
export function renderParcel(p: ParcelParams): Rendered | null {
  if (!init() || !gl || !canvas) return null;
  const res = Math.min(SIZE, Math.max(64, Math.round(p.res ?? SIZE)));
  draw(p, res);
  return { canvas, sx: 0, sy: 0, size: res };
}

export function parcelAvailable() { return init(); }

/** Draws a render into a 2-D context, centre-cropped to the destination aspect. */
export function blitCover(
  r: Rendered, ctx: CanvasRenderingContext2D,
  dx: number, dy: number, dw: number, dh: number,
) {
  const want = dw / dh;
  let sw = r.size, sh = r.size;
  if (want > 1) sh = Math.round(r.size / want);
  else sw = Math.round(r.size * want);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(r.canvas, r.sx + (r.size - sw) / 2, r.sy + (r.size - sh) / 2, sw, sh, dx, dy, dw, dh);
}

/* ── reading the frame back ──────────────────────────────────────────────
   So the interface can say what is in the picture instead of leaving the
   viewer to guess. One 64 × 64 classify pass, tallied by class, plus the
   centroid of the cleared ground so an annotation can point at it. */

export interface Cover {
  forest: number;
  cultivated: number;
  homestead: number;
  water: number;
  /** centre of cleared ground, normalised to the square frame, top-left origin */
  clearedAt: [number, number] | null;
  /** centre of remaining canopy, same convention */
  canopyAt: [number, number] | null;
}

const COVER_RES = 64;
const coverCache = new Map<string, Cover>();

export function sampleCover(p: ParcelParams): Cover | null {
  if (!init() || !gl) return null;
  const key = `${p.seed}|${p.canopy.toFixed(3)}|${p.trajectory}|${p.detail ?? 1}`;
  const hit = coverCache.get(key);
  if (hit) return hit;

  draw({ ...p, classify: true, res: COVER_RES }, COVER_RES);
  const buf = new Uint8Array(COVER_RES * COVER_RES * 4);
  gl.readPixels(0, SIZE - COVER_RES, COVER_RES, COVER_RES, gl.RGBA, gl.UNSIGNED_BYTE, buf);

  let forest = 0, crop = 0, roof = 0, water = 0;
  let cx = 0, cy = 0, fx = 0, fy = 0;
  for (let row = 0; row < COVER_RES; row++) {
    // readPixels is bottom-up; flip into image space
    const y = (COVER_RES - 1 - row) / (COVER_RES - 1);
    for (let col = 0; col < COVER_RES; col++) {
      const i = (row * COVER_RES + col) * 4;
      const r = buf[i], g = buf[i + 1], b = buf[i + 2];
      const x = col / (COVER_RES - 1);
      if (r > 180 && g > 180) { water++; }
      else if (b > 180) { roof++; }
      else if (g > 180) { crop++; cx += x; cy += y; }
      else { forest++; fx += x; fy += y; }
    }
  }
  const total = COVER_RES * COVER_RES;
  const out: Cover = {
    forest: forest / total,
    cultivated: crop / total,
    homestead: roof / total,
    water: water / total,
    clearedAt: crop > total * 0.04 ? [cx / crop, cy / crop] : null,
    canopyAt: forest > total * 0.06 ? [fx / forest, fy / forest] : null,
  };
  coverCache.set(key, out);
  return out;
}

/** Legend entries, in the order they are stacked. */
export const COVER_CLASSES = [
  { key: "forest" as const, label: "Closed canopy", natural: "#2A3E1C", infrared: "#8C2136" },
  { key: "cultivated" as const, label: "Cultivated", natural: "#B0A070", infrared: "#D4626F" },
  { key: "homestead" as const, label: "Homestead", natural: "#B4AEA4", infrared: "#CCD8DC" },
  { key: "water" as const, label: "Water", natural: "#1B3540", infrared: "#0A1220" },
];
