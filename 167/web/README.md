# SatQuery AI — web application

The interface for PS26167, built to [`BUILD_PLAN.md`](BUILD_PLAN.md) against `docs/07_PRD.md` and `docs/08_TRD.md`. React + TypeScript, Vite, Tailwind v4, Motion, three.js.

```bash
npm install
npm run dev            # http://localhost:5173
npm run build          # typecheck + production bundle in dist/
npx vite preview --port 4173 &
node verify.mjs http://127.0.0.1:4173 <fixtures-dir>   # headless checks, screenshots in shots/
```

## Two engines, one client

The API service (`satquery/BUILD_PLAN.md` §2.8) is not running yet, so the app ships with a **preview engine**: the classical path of the Python pipeline — scene generator, CV primitives, the four specialists, router, evidence layer, answer layer — ported to TypeScript and run in a Web Worker (`src/engine/`). It computes on real pixels. It is not a mock that returns canned answers.

| `VITE_ENGINE` (`.env`) | What answers |
|---|---|
| `preview` (default today) | the in-browser engine. Every result says so, in the engine badge, the answer, the trace and the report |
| `http` | the API on the same origin |
| `auto` | probes `/api/health` once and picks. Switch to this when the API lands |

Override per visit with `?engine=preview|http|auto`, or from the engine badge in the masthead.

**Parity with the backend** (checked 11 Sep against `satquery` at the same seed). Water grounding 965.99 ha, identical. RQ-3 is identical: 10 regions, 1,824.93 ha, +4.37 pp. The system ablation matches within 0.002. Cross-modal areas differ by about 1 %, and the only cause is SAR speckle: the backend uses a numpy RNG and this engine a seeded mulberry32. One non-obvious detail from the port: the Python hashes the parcel grid in **float32**, so `scene.ts` uses `Math.fround` to pick the same soil parcels.

**Contract assumptions the backend has not confirmed** (`src/lib/api.ts`):
- the built-in demo rasters are addressed as `demo:<role>` in `POST /api/query` `inputs`
- `POST /api/rasters` takes multipart `file` + `role` and returns `{raster_id, summary}`
- errors come back as `{error: {code, message, remedy}}`
- `GET /api/evaluation` returns the shape of `Evaluation` in `src/lib/contract.ts`. The current prototype server returns an older shape

## Pages

| Route | What it is |
|---|---|
| `/` | The thesis. The hero is a campaign plate with measured telemetry. Scrolling wipes in the SAR plate under the cloud. Then RQ-4 is replayed as the five-stage pipeline, followed by optical↔SAR compare, a live refusal replay, and the numbers band with anchors |
| `/workstation` | The instrument: role dropzones, plate / 3D stack / compare views, evidence above trace, query bar with ⌘K palette (RQ-1–RQ-5), GeoJSON and report exports. `?scene=` and `?q=` deep-link |
| `/data` | Five datasets and M0–M6 with actual local state, plus the registry |
| `/results` | Adaptation gain, per-capability measurements, system ablation with its formula, cross-modal ablation, held-out router, calibration. Anything unmeasured reads `XX.X` |
| `/report/:runId` | Print-styled run report, with a self-contained `.html` download |

## Where the build departs from BUILD_PLAN.md, and why

- **No OpenLayers or MapLibre.** Each scene is one georeferenced plate with no tiles offline, so the map is an authored SVG plate viewer. It has a graticule, a scale bar, a cursor readout in EPSG:4326, zoom and pan, and animated evidence overlays. A map library would have cost more bundle than the rest of the interface.
- **three.js directly, not react-three-fiber.** r3f registers the whole `THREE` namespace, which defeats tree-shaking. That alone pushed the bundle over NFR-13. Rewriting the stack with named imports took the three chunk from 918 kB to 554 kB.
- **Result charts are single-series in ink.** The modality hues fail the categorical-palette validator (SAR↔fusion ΔE 5.8 under deutan). They appear only as labelled identity dots, never as series colours.
- **Catalogue figures are static and do not tick.** A count-up shows wrong figures mid-flight, and DAT-01 requires "464,044 pairs · ~9.6 M annotations" exactly. Tickers are kept for measurements arriving.
- **RQ-5 routing.** The Python rules send *"Has the built-up area increased…"* to single-image VQA. The preview router adds a trend rule, labelled in the trace as a preview rule, so it reaches change analysis (RTR-06). The backend needs the same fix.

## Verified (headless, `verify.mjs`, 38 checks)

Covered: landing, the hero scroll cut, the pipeline stages, and the refusal replay. In the workstation: metadata, RQ-4 evidence and trace, refusal with no tool executed, the remedy re-ask, abstention, the palette, GeoJSON export, the WebGL stack, and compare. Uploads: a UTM GeoTIFF reprojected to the correct centre, a malformed file with a readable error, and a PNG accepted without a CRS. Reports: view, standalone download, and deep link after refresh. Also the data and results deep links, the 404 page, reduced motion, the no-WebGL 2D fallback, no horizontal scroll at 390 px, and **zero console errors or uncaught exceptions**.

Bundle: 1.18 MB of application JS before compression. The Web Worker and the geotiff decoders add about 0.33 MB, and the decoders load only when a compressed TIFF of that kind is uploaded.

Borrowed components and their sources: [`CREDITS.md`](CREDITS.md).
