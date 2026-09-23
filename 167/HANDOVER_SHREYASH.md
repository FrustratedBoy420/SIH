# Handover — changes to your layers, and what is yours to do

**For:** Shreyash · **From:** Mridul · **Date:** 23 Sep 2026 · **Submission:** 30 Sep

While wiring M1 into the pipeline and running the whole system end to end, I
changed code in your scope (`satquery/`, `web/`). Every change is below with the
reason, so you can review it rather than rediscover it. Selftest is **57/57**;
`web/verify.mjs` is **37/37** against the live backend and in preview mode.

Commits: `dd45273`, `1ddfaaa`, `10e04a9`, `ce6aa3c`, plus the uncommitted work
this file ships with. `git diff 5d4ef63 -- 167/satquery 167/web` shows all of it.

---

## 1. Read these first — behaviour you will notice

| Change | Before | Now | Why |
|---|---|---|---|
| **Hectare figures on EPSG:4326 imagery** | ~9 % high | correct | pixel area ignored `cos(latitude)`. Demo: 2,786 → **2,539 ha**. **Any deck or doc quoting old hectare figures is now wrong.** |
| **UTM uploads** (EPSG:326xx/327xx) | 164 ha image → **48,948,962,480 ha**; eastings printed as longitudes; metres in GeoJSON labelled EPSG:4326 | converted to WGS84, measured in metres | Cartosat/Sentinel ship in UTM — the ISRO/SAC hidden set almost certainly does. Checked against PROJ to 1.2 mm. Other projections → pixel space with a stated reason. |
| **Unreferenced images** (plain PNG/JPEG) | summary said `EPSG:4326`, `GSD 217.4 m`; plate drew a 20 km scale bar; GeoJSON declared pixels as degrees | `crs: "none"`, `gsd_m: null`, no scale bar, GeoJSON CRS `urn:satquery:def:crs:image-pixels` | the unit-square transform produced invented numbers |
| **Co-registration penalty** | applied to **every** record whenever two rasters were loaded | only when a tool combines the pair (`optical_sar`, `change_vqa`) | a photo uploaded while the demo SAR stayed loaded had M1's 0.74 answer penalised to 0.44 and abstained |
| **`engine`** | `neural+classical` whenever a pack was *installed* | only when a model actually *answered this query* | installing the M1 pack made results claim neural on answers from a 3-class Otsu split |
| **Model status** (`/api/models`, Data page) | `loaded` meant serving | `trained` / `loaded` / `serving` (+ `mode`) | three different facts had been one word |
| **"How much X is there?"** | answered **"yes."** | an area in hectares | `is there` matched before `how much` (Python **and** browser engine) |
| **Bare "area" in a question** | "rural or urban **area**?" → hectares | not a measurement | only `area of / how large / hectare / extent / coverage` are |
| **Single-VQA "Shares:" line** | printed threshold diagnostics under counts | only for land-cover shares | the label was attached to any record's `supporting` |
| **Results page** | adaptation "pending"; gain would read `+0.1 pts` | **52.7 → 66.0, +13.3 pts** | numbers were hard-coded null; units were fractions, anchors percent |

---

## 2. File by file

### `satquery/raster.py`
- `GeoTransform` gains `crs` (bound from `Raster.crs` in `Raster.__post_init__`),
  `kind`, `can_georeference`, `pixel_to_lonlat()`, `pixel_area_m2()`.
- `crs_kind`, `utm_zone`, `utm_to_lonlat`, `lonlat_to_utm` — Snyder PP 1395, no pyproj.
- `bounds()`/`centre()` report WGS84 lon/lat for any convertible CRS.
- `summary()`: `crs_kind`; `crs`/`gsd_m` are `"none"`/`null` when unreferenced.
- `write_geotiff()` writes **every band as a float page** (was an 8-bit RGB
  rendering: SAR lost `vh` and came back as red/green/blue). Files are bigger
  (~4 MB per 512 px scene). UTM is written as `ProjectedCSType`.

### `satquery/evidence.py`
- `GeoBox.from_pixels` and `mask_area_ha` use `pixel_to_lonlat` / `pixel_area_m2`.
- `PIXEL_CRS` constant for unreferenced output.

### `satquery/pipeline.py`
- **`_adapted()`** — the M1 hook. After a tool runs, asks the runtime; M1's
  answer becomes one `Evidence` record. Rules, each with a test:
  - optical only — SAR never goes to M1;
  - below the gate → kept as evidence, **not used**, `engine` stays classical;
  - measured count/area leads its question; on a **conflict** the measurement
    leads and M1's disagreement is recorded (audit A3);
  - out-of-vocabulary **grounding questions** (`where/which/what…`) fall back
    to M1 in words, **no box**; instructions ("highlight the unicorn") still abstain.
- `Result.precomputed` is set when M1 answered from pre-computed output (ADP-09).
- Trace says why M1 did not answer (installed-not-serving / cache miss / gated / SAR).
- `answer()`: M1 phrasing; "M1 agrees" only after a real comparison.
- Co-registration penalty scoped to `_PAIR_TOOLS`.
- EvidenceSet CRS = `PIXEL_CRS` when no input is georeferenced.

### `satquery/runtime.py`
- `available()` means **can serve**, not "a pack exists".
- `M1Live` — base + adapter, 4-bit, mirrors `models/eval_baseline.py` exactly
  (300/300 identical answers to the evaluated run).
- Pre-computed serving from `precomputed.jsonl`, keyed by SHA-256 of the exact
  pixels M1 sees + normalised question. `mode()`, `questions_for()`,
  `not_serving_reason()`. `describe()` reports `adapters_serving`, `packs`, `mode`.
- `HttpRuntime` sends pixels as PNG (was about to send a numpy array).

### `satquery/server.py`
- Health note distinguishes loaded / serving / pre-computed.
- `/api/models` rows: `serving`, `mode`, honest `weights_present`, status vocabulary.
- **New:** `GET /api/m1/questions?optical=<raster_id>` — questions M1 holds
  answers for on that image (questions only, never answers; `withheld` flag).
- `m1_questions_for()` sits under the "request body" heading — move it if you
  prefer; it is placement, not logic.

### `satquery/specialists.py`
- `_intent`: `how much` before presence; bare `area` no longer an area query.

### `satquery/evaluate.py`
- `m1_adaptation()` reads the M1 pack manifest, in percent.

### `satquery/tests.py` — 35 → 57 checks
Projections (6), M1 serving (11), adapter socket rewritten for `runtime=` (5),
upload/pixel/penalty/results checks. Every new check was **mutation-tested**:
the bug was reintroduced and the check confirmed to fail. ADR-008 allowlist now
includes `Co-registration checked` (it was red on `main` before this).

### `web/`
- `lib/contract.ts` — status vocabulary, `serving`, `mode`, `gsd_m: number | null`, adaptation in percent.
- `lib/api.ts` — `api.m1Questions()` (http mode only).
- `pages/Workstation.tsx` — **Ctrl+K palette** shows *"M1 has answers for this image"* first.
- `pages/DataModels.tsx` — serving vs packs counted separately; mode shown.
- `pages/Results.tsx` — pending note only when unmeasured; split named *validation*.
- `engine/specialists.ts` — the two intent fixes, mirrored.
- `engine/catalog.ts` — preview snapshot: M1 `trained`, with its numbers.
- `PlateViewer.tsx`, `landing/Hero.tsx`, `landing/Pipeline.tsx` — nullable GSD.
- `verify.mjs` — the UTM upload check now asserts the **area is possible**, not
  just that text appeared (it passed on "48,948,962,480 ha").
- `fixtures/optical_utm.tif` — the fixture `verify.mjs` needed (EPSG:32644).
- `check_m1_palette.mjs` — one-off browser check for the palette; fold it into
  `verify.mjs` if you want it permanent.

---

## 3. Yours to do before 30 Sep

**Needed**

- [x] **Review §1 and §2.** Done in the merge (`b3668a6`). Two things for you in §5.
- [ ] **Deck and docs:** *(docs done in `5370f89`: presentation guide, ADR-010. Deck slide 2 still open: its screenshot and figures are from the old synthetic scene, so it needs a new screenshot, not a number swap.)* replace any hectare figure computed before 23 Sep (≈ 9 % lower now), and any "M1 pending" wording. Measured: **52.7 → 66.0, +13.3 pts, McNemar p = 1.2e-35**.
- [ ] **Router held-out paraphrase set** — still the one Results tile marked pending; your item per `ml/BUILD_PLAN.md` §1.
- [x] **Which UI mode ships.** *(`ca1300c`: the server marks every page it serves with `<meta name="sq-engine" content="http">`, which `api.ts` reads before `VITE_ENGINE`. Any build served by `satquery serve` or Docker now uses the API; a static host stays in preview.)* A plain `npm run build` produces the preview engine, which never calls the API — no M1, no uploads to the backend. When the backend serves the UI, build with `VITE_ENGINE=http` (or make the served build default to `auto`).

**Worth doing**

- [x] **Browser engine areas** *(`892cde8`: `pixelAreaM2` mirrors `pixel_area_m2`; identical to 1e-12 on a 4326 scene)* still ignore `cos(latitude)` (`engine/raster.ts:111`): preview mode shows hectares ~9 % above live mode for the same scene.
- [x] **Stale demo inputs:** *(`dc90af3`: the first upload of your own clears the demo slots)* uploading an optical photo leaves the demo SAR loaded, so the header says "optical + SAR pair". The penalty no longer punishes it, but clearing demo slots on the first upload (or saying so) would be clearer.
- [x] **Calibration tile** *(Results §06 now shows M1's own reliability diagram and per-question-type table from your 300 rows, scored against the 0.45 gate: 23 withheld, 19 of them wrong, 0.715 on what is answered)* asks for ≥ 200 labelled predictions. M1 has **300** in `models/results/m1_calibration.jsonl` (answer, confidence, correct) — the audit B8 hand-over. Confidence is well ordered (0.9+ → 97 % right; < 0.4 → 8 %), over-stated between 0.4 and 0.6.
- [x] **Upload limit** *(`63282af`: `SATQUERY_MAX_UPLOAD_MB`, and an oversize file is refused before it is read)* is 200 MB; on a 512 MB free host (Render) that can kill the process. Lower it for any free deployment.

---

## 4. How M1 behaves — for anyone presenting

- On this laptop M1 serves **pre-computed** answers only (no GPU). Known images:
  the VRSBench photos in `demo/real_vrsbench/` — see its
  `guide.md`. Any other image → classical path, and the trace says why.
- On a CUDA GPU it runs **live** on anything, through the same code.
- On the generated demo scenes M1 is weak and says so ("Space", "Map" at ~0.2
  confidence — gated). On real imagery it is ~68 % right. **Demonstrate M1 on
  the real photos; demonstrate the classical specialists on the demo scenes.**
- Start: `python -m satquery.cli serve --adapters models/adapters`, open
  `/workstation`, upload, then **Ctrl+K**. (Any build works now: the server tells
  the page to use the API.)

Numbers, caveats and the full record: `models/MANIFEST.md`.

---

## 5. Back to Mridul — from the merge (Shreyash, 23 Sep)

- **Demo scenes lost their pre-computed answers.** The built-in scenes are now
  real Sentinel crops over west Hyderabad (`web/public/scenes/`), not the
  generator, so no key in `precomputed.jsonl` matches them. Re-run
  `models/precompute_m1.py` on Kaggle; `demo_sources()` already reads the new
  scenes through `scene_bundle`. The VRSBench photos still hit.
- **What M1 is shown.** My branch gave `Raster.rgb()` a 2–98 % display
  stretch; that changed the pixels your cache is keyed on, so M1 now reads
  `rgb(stretch=False)` — your keys are intact. But unstretched Sentinel
  reflectance (0–0.3) is a dark image. Before re-running the precompute,
  decide whether M1 should see the stretched RGB instead; precompute and
  serving must use the same one.
- **EPSG:3857 — changed, tell me if you disagree.** The API now converts Web
  Mercator like the browser engine (`mercator` kind; area = det · cos²lat;
  both engines agree to 1e-12). Your "cannot be converted" check now uses
  EPSG:27700, which really is unsupported, and a new check covers 3857.
- **`adapted.py`** is my claims contract for M2–M4 and remote runtimes; M1
  keeps your `_adapted()`. `pipeline.py` routes by adapter.
- Selftest is 73/73 and `verify.mjs` 42/42 against the live backend, with your
  palette check folded in.
