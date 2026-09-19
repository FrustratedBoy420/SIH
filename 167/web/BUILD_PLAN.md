# Frontend Build Plan

**Owner: Shreyash.** Scope: the web application — landing, workstation, data and models, results, reports.

Requirements come from `docs/07_PRD.md` §4, §10–§11, §13, §19 and `docs/08_TRD.md` §3.14 (UI-01–13), §5 (API) and §6 (NFR-12, NFR-13, NFR-15). Written against the docs, **not** the early prototype in this folder: keep whatever already meets the requirements, rebuild the rest.

> **Direction override (11 Sep, by instruction).** This plan asks for a bold, editorial, heavily animated interface built largely from online React component libraries. That departs from `07_PRD.md` §11's "borrow interaction, author identity" row and from `06_Design_System.md` §6/§8 on motion restraint and component sourcing. The amendment is offered in the PRD/TRD audit (A4). Everything else in `06` still holds — especially the **light theme**, which this plan keeps.

---

## 1. The brief, stated plainly

**Be unique. Do not build a boring website.** No SaaS dashboard. No dark navy with a purple gradient. No glass cards everywhere. No generic hero with three feature tiles. A judge has seen forty of those by lunch.

**Light theme — not dark.** `06` §1 already argues it: imagery reads truer on a light ground, and every competing space-tech entry will be dark.

**Zara-type bold, but not minimalist.** Take Zara's *confidence* — enormous display type, tight tracking, oversized numerals, imagery treated as full-bleed editorial photography — and refuse its *emptiness*. Where Zara fills the frame with white space, this product fills it with its own material: real sensor imagery, live telemetry, motion. Same boldness, opposite density.

**Use as much animation as you can.** Don't hold back. The one discipline: every animation shows something real — data arriving, a scan revealing, a layer separating, a number counting to its measured value. Motion that means something reads as an instrument; motion that means nothing reads as a template.

**Don't hand-build components.** Search the online React libraries below, take what fits, restyle it to the tokens.

---

## 2. Theme — "Editorial Instrument"

The survey office from `06` §1 (cartographic plates, optical bench, spectrometer readout) photographed like a fashion campaign.

### 2.1 The signature move

**Every scene is a campaign plate.**

- The satellite image is **full-bleed**, edge to edge — a photograph, not a thumbnail in a card.
- A **huge headline** is set straight across it: Bricolage Grotesque, weight 800, tracking −0.04em, at `clamp(56px, 11vw, 200px)`.
- **Real telemetry runs at the same scale** as a second headline, in IBM Plex Mono with tabular numerals: the coordinate, `EPSG:4326`, the backscatter in dB, the confidence, the acquisition time in UTC. Nobody else will give a sensor reading the typographic weight of a campaign slogan. The data already exists, so it costs nothing, and it can't be mistaken for a template.

That is where the boldness goes. The layouts around it stay disciplined.

### 2.2 Tokens

Colour comes from `06` §2 and is derived from remote sensing (false-colour infrared, radar backscatter). Keep it. It's the least generic thing in the design.

| Token | Hex | Use |
|---|---|---|
| `--paper` | `#F3F5F4` | page ground (never pure white) |
| `--surface` | `#FFFFFF` | raised surfaces |
| `--ink` | `#0F1613` | display type, near-black map ink |
| `--ink-2` / `--ink-3` | `#4A5551` / `#7C8783` | secondary text / non-essential labels ≥ 11 px |
| `--accent` | `#0E7C86` | **interaction only** — links, focus, primary action |
| `--optical` | `#B8763A` | optical identity mark |
| `--sar` | `#2C7A8C` | SAR identity mark |
| `--fusion` | `#6B5CA5` | fusion identity mark |
| `--nir` | `#C4342A` | change and refusal only |
| `--good` / `--warn` | `#2F7D5A` / `#A1740F` | semantic states |

Rules: one accent carries interaction. Modality hues are **marks** (a dot, a rule, a label), never large fills. Red means change or refusal, nothing else.

### 2.3 Type

| Role | Face | Setting |
|---|---|---|
| Display | **Bricolage Grotesque** (variable: weight, width, optical size) | 800, −0.04em, hero `clamp(56px, 11vw, 200px)`; section `clamp(36px, 6vw, 96px)` |
| Body / UI | **IBM Plex Sans** | 15–16 px / 1.55 |
| Data | **IBM Plex Mono** | `tabular-nums` always; can also run at display scale for the signature move |

Every value (coordinate, band, dB, confidence, version, hectares) is set in mono with tabular numerals (`06` §3). Self-host all fonts, with no CDN at runtime (OPS-06).

### 2.4 Layout

Editorial grid for the story pages: big type, asymmetric columns, imagery bleeding off the edges. **Bento instrument grid** for the workstation (`06` §5): imagery is the largest region, the trace is always visible, evidence sits above the trace, and the query is a bar at the bottom, not a chat sidebar.

---

## 3. Motion plan — heavy, and every piece earns it

| Moment | Motion | Library |
|---|---|---|
| Page load | Imagery **develops**: a radar-sweep / scan-line wipe uncovers the scene (a SAR sensor literally scans) | Motion (`motion/react`) + canvas/shader mask |
| Headline entrance | Letter-by-letter or line-mask reveal of the display type | React Bits text animations; Motion |
| Telemetry | Numbers **count up** to their measured value on arrival | Magic UI *Number Ticker* |
| Landing scroll | Scroll-driven narrative that replays the real pipeline: validate → route → specialists → fuse → answer. Each stage pins, animates its evidence, releases | Motion `useScroll`; GSAP ScrollTrigger if needed |
| Capability strip | Continuous marquee of real band names, EPSG codes, dataset scales | Magic UI *Marquee* |
| Scene switching | **Hard cuts** like a campaign film, not soft crossfades | Motion |
| Optical vs SAR | Drag-to-compare slider between the two sensors of one scene | Motion Primitives *Image Comparison* |
| Modality stack | Optical / fusion / SAR planes pull apart in 3D; idle drift until touched | react-three-fiber + drei |
| Query submitted | Trace steps land one by one with their timings; evidence cards stagger in | Motion `AnimatePresence`, stagger |
| Refusal | The compatibility step fails visibly in `--nir`; the remedy slides in | Motion |
| Evidence on map | Boxes draw their outlines, then fill; hectares tick up | Motion + map layer animation |
| Hover | Magnetic buttons, cursor-following spotlight on imagery tiles | Aceternity UI / React Bits |
| Results page | Bars and metrics animate from the anchor value to the measured value, so the anchor stays visible | Motion; chart library |

**Non-negotiable even at maximum motion:** `prefers-reduced-motion` switches everything to instant transitions and stops idle drift (UI-13, NFR-15). No animation blocks input. Nothing animates faster than it can be read.

---

## 4. Component sourcing — search, take, restyle

| Library | Take from it |
|---|---|
| **[React Bits](https://reactbits.dev)** | Text reveals, split-text, scroll reveals, magnetic/click effects, animated lists. Its CLI copies source in |
| **[Aceternity UI](https://ui.aceternity.com)** | Spotlight, bento grids, parallax scroll, text-generate effects, focus cards |
| **[Magic UI](https://magicui.design)** | Number Ticker, Marquee, animated beam (pipeline diagram), dock, blur-fade |
| **[Motion Primitives](https://motion-primitives.com)** | Image Comparison (optical vs SAR), text effects, in-view reveals, morphing dialogs |
| **[21st.dev](https://21st.dev)** / **shadcn/ui** | Solved primitives: command palette, tabs, dialog, dropdown, toast, file-upload dropzone |
| **react-three-fiber + drei** | The modality stack; an orientation globe (`react-globe.gl` or `r3f-globe`) |
| **OpenLayers** or **MapLibre** | The map viewer with GeoJSON evidence overlays (OpenLayers has the strongest GeoTIFF support) |

Rules:
1. **Restyle everything to the tokens.** A borrowed component left on library defaults is one a judge recognises.
2. **Skip the fingerprinted shader backgrounds**: React Bits *Silk*, *Iridescence* and *LiquidChrome*. They're the most recognisable effect of the current wave of AI-made sites. Everything else is fair game.
3. Record what was borrowed and from where in a `CREDITS.md`. If a judge asks "did you build this?" they deserve a straight answer (`06` §8).
4. Everything bundled locally, with no runtime CDN (OPS-06).

---

## 5. Pages

### 5.1 Landing — the thesis
- **Hero:** the campaign plate. A full-bleed optical scene with cloud over a settlement, the headline across it, and the telemetry headline beside it. Scroll and the SAR layer wipes in under the cloud to show what radar recovers. That's R4 shown before a word of explanation.
- **Scroll narrative:** the five mandatory capabilities as the real pipeline sequence, not five identical cards (PRD §3.1).
- **The refusal moment:** a short animated replay of the system refusing a change question on one image. It's the trust story (PRD §8.2).
- **Numbers band:** adaptation gain and ablation headline figures, each with its anchor. Shows `XX.X` until measured (EVL-01).
- **Disclosure line**, permanent: which imagery is synthetic or constructed (UI-10).

### 5.2 Workstation — the instrument
- **Inputs:** a dropzone per role (optical, SAR, T1, T2) calling `POST /api/rasters`; each raster shows CRS, bands, GSD, sensor and alignment (UI-05, ING-09). Built-in demo scenes are one click away.
- **Scene region (largest):** map viewer with evidence overlays, the 3D modality stack, and the optical↔SAR compare slider, all switchable.
- **Evidence panel** above the **trace panel**, both always visible (UI-03, UI-04). Every claim shows confidence, source model and hectares.
- **Query bar** at the bottom, with a command palette of example queries including RQ-1–RQ-5.
- **Refusal and abstention** are visually distinct and say what to do next (UI-07).
- **Exports:** GeoJSON and the report, from the run (OUT-01, OUT-02).
- **Fallback label:** if a result is pre-computed, a visible badge (TRC-04).

### 5.3 Data & Models
All four public datasets and the hidden ISRO/SAC set, with purpose, scale, source and **actual** local state. Models M0–M6 with weight status (UI-08). Editorial layout, big numbers: **464,044 pairs · ~9.6 M annotations** stated correctly (DAT-01).

### 5.4 Results
Per-capability metrics, the adaptation gain, the adaptation ablation (A/B), the system ablation (C–E), the cross-modal ablation, and calibration, each with its published anchor and every composite shown with its formula (UI-09, EVL-03, EVL-05). Load the `dataviz` skill before building the charts.

### 5.5 Report view
A print-styled page mirroring the downloadable report: query, answer, evidence, trace, parameters, "what this cannot establish".

---

## 6. Engineering

- **Stack** (`08` §11): React + TypeScript, Vite, Tailwind with the tokens above, Motion, react-three-fiber/drei, OpenLayers or MapLibre, TanStack Query for the API, a small store for UI state.
- **API:** consume the contract in `satquery/BUILD_PLAN.md` §2.8. The result shape is identical for success and refusal, so the UI never branches on missing fields (VAL-08).
- **Degradation:** no WebGL means the modality stack becomes three stacked 2D panels (UI-12). No map tiles, because everything is offline by design.
- **Budget:** bundle < 1.5 MB before compression (NFR-13). Lazy-load 3D and the map. Code-split per page.
- **Quality floor:** zero console errors (NFR-12); WCAG AA text; visible focus rings in `--accent`; keyboard reachable; modality never colour-only (UI-13).
- **Headless checks** use `data-testid`, never styling classes (NFR-16): landing loads, upload works, query answers, trace populates, refusal visible, export downloads, deep links survive refresh.

---

## 7. Calendar

| When | Deliverable |
|---|---|
| 11–12 Sep | Tokens, fonts, type scale; component shortlist from §4 |
| 13–15 Sep | Workstation shell: inputs, scene region, evidence + trace, query bar (against the API contract) |
| 16–18 Sep | Landing campaign plate, scan reveal, scroll pipeline narrative |
| 19–21 Sep | Results and Data pages; exports; refusal/abstention states |
| **24 Sep** | Upload end to end with the backend |
| Oct–Nov | Map overlays at full fidelity, compare slider, motion polish, accessibility pass, venue-laptop test |

> If the portal closes **20 Sep**, freeze the landing and workstation on 19 Sep. The rest moves to Build.

---

## 8. Definition of done — frontend

- [ ] Light theme; no dark tokens anywhere
- [ ] Campaign-plate hero with real telemetry at display scale
- [ ] Motion throughout, all of it tied to real state, with reduced motion honoured
- [ ] Components from the §4 libraries, restyled, credited in `CREDITS.md`
- [ ] Upload per role → metadata shown → query → evidence + trace → exports
- [ ] Refusal and abstention visibly distinct, with remedies
- [ ] Results page with anchors and formulas; Data page with actual state
- [ ] Zero console errors; bundle budget met; works offline; degrades without WebGL
- [ ] A first-time judge completes `07_PRD.md` §19 unaided
