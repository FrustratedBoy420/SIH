# SatQuery AI — Frontend Build Plan

**Owner: Shreyash. Scope: the `web/` React app.** This plan carries an explicit creative-direction mandate, stated in full below, that supersedes parts of `docs/06_Design_System.md` where the two disagree — each disagreement is named, not left implicit.

---

## 0. The contradiction this plan resolves

`docs/06_Design_System.md` §1 argues for a **light** theme at length — two concrete reasons, not a preference: imagery reads truer on a light ground than surrounded by black, and every competing SIH space-tech submission will be dark, so light is real differentiation.

**The shipped `web/src/index.css` is currently dark.** Its own header comment calls it "Revision 2": a near-black ground (`--color-void: #0a0b0d`), light-on-dark ink, one desaturated accent, modality hues reduced to identity marks. The comment explaining Revision 2 is good reasoning — the *original* multi-hue palette put six accent colours on screen at once and read as noise, a real problem worth solving — but nothing in that comment, or anywhere else, argues for abandoning light-vs-dark specifically. It reads as a decision made in CSS, under deadline pressure, that never got reconciled with the document that governs it.

**You've now been told explicitly: light, not dark.** That instruction resolves the contradiction in the direction `06_Design_System.md` already argued for — you are not overriding the design system, you are correcting an implementation drift back to it. This plan reverts to light while **keeping** Revision 2's one genuinely good idea: colour is scarce, one accent carries interaction, modality hues survive as marks rather than fills. That principle is orthogonal to light-vs-dark and there's no reason to lose it along with the ground colour.

---

## 1. The direction

**Editorial-instrument maximalism.** Zara's typographic confidence — enormous, bold, tight-tracked display type; oversized numerals; imagery treated like campaign photography, not a thumbnail — applied to a live technical instrument's own data density, instead of to fashion's emptiness. You were told explicitly not to be minimal. The resolution isn't "less bold" — it's that Zara's boldness comes from huge type over a nearly-empty frame, and the fill for *this* product isn't negative space, it's the subject's own material: real sensor imagery, running telemetry, motion. Same confidence, opposite fill.

### The signature move

Treat every loaded scene like an editorial campaign plate, not a thumbnail in a panel:

- **Full-bleed imagery** — the optical/SAR/fusion scene fills the frame edge to edge, the way a campaign photograph does, not a bordered card floating on a background.
- **A huge, overlaid headline** — Bricolage Grotesque, weight 700–800, tight tracking (−0.03 to −0.04em), set directly across the image at a scale the current spec never reaches (its `display-l` tops out at `clamp(28px, 4vw, 42px)` — too restrained for this brief; go to `clamp(48px, 9vw, 160px)` for hero and section-opening moments).
- **The genuinely distinctive part: let real telemetry run at the same scale.** A coordinate string, an EPSG code, a backscatter figure in dB, a confidence score — set in IBM Plex Mono, tabular numerals, at hero size, as a *second* headline layer, not a small caption tucked in a corner. Nobody else at this event will have thought to give a raw sensor reading the same typographic weight as a marketing headline — and it costs nothing, because the data is already sitting in the file.

That's the one place to spend real boldness. Keep everything around it disciplined — the existing bento layout (`06_Design_System.md` §5: scene primary, trace always visible, evidence panel, chat as a bar not a sidebar) is sound and doesn't need reinventing, only reskinning and pushing the type/motion further inside it.

### Keep

- **The colour tokens** — `--optical` (warm amber, `#B8763A`), `--sar` (cool teal, `#2C7A8C`), `--fusion` (purple, `#6B5CA5`), and the teal accent. These are derived from false-colour infrared composites and radar backscatter, not from a UI trend, and that's exactly the kind of subject-grounded choice that doesn't read as templated. Put them back on a **light** ground (`06`'s `--paper #F3F5F4` / `--surface #FFFFFF` family).
- **One accent carries interaction; modality hues stay marks, not fills** — Revision 2's real lesson, kept, just re-based on light.
- **IBM Plex Sans for body text** — no reason to change it, it's doing its job.
- **The 3D modality stack** (`ModalityStack.tsx`) — pulling optical/fusion/SAR apart as physical planes is the strongest existing idea in the interface (it makes requirement §5.4's "complementary information" visible in one gesture, per `06_Design_System.md` §7). Reskin its chrome, don't replace its mechanism.

### Change

**Typography scale** — push Bricolage Grotesque far bigger and bolder than the current spec, as above. IBM Plex Mono gets promoted from caption duty to occasional *display* duty (the telemetry-as-headline move) — always `font-variant-numeric: tabular-nums` when it does.

**Motion — maximal, but still meaningful.** "As much animation as you can" doesn't have to mean decorative; the resolution is to animate *constantly* but always tie it to something real, which is actually easier here than on a generic product because the subject is already full of real motion (satellites orbit, drift, streams update). Concrete directions, each tied to real state:

- **Scene load as a reveal, not a fade-in.** A SAR sensor is literally a scanning instrument — a wipe or scan-line reveal that progressively uncovers the loaded scene is subject-grounded motion, not a generic entrance animation.
- **Telemetry counts up.** When a scene or a query result loads, the confidence score, the area figure, the coordinate — animate the number arriving (a real value, ticking to itself), not just appearing.
- **Hard cuts between states, not soft crossfades.** Campaign photography cuts; it doesn't dissolve. Switching between scenes, tabs, or result states should feel like a confident edit, not a fade.
- **Scroll-driven reveals on the landing page, tied to the actual pipeline.** As the user scrolls, re-enact the real execution trace — validate → route → specialists → fuse evidence → answer — as the page's own scroll narrative, instead of generic "feature card" reveals that could describe any product.
- **Push the existing motion table** (`06_Design_System.md` §6) further, not past it: it already specifies panel transitions, evidence-arrival staggering, idle scene rotation. Increase durations/frequency where it's cheap rather than inventing an unrelated animation system.

**One line that does not move regardless of "maximal":** `prefers-reduced-motion` is still honoured everywhere. That's an accessibility floor, not a stylistic choice, and "as much animation as you can" was never an instruction to drop it.

**Component sourcing — you now have explicit permission to use more than mechanics.** `06_Design_System.md` §8's old rule ("borrow interaction, author identity — never take identity") is loosened here by direct instruction: you don't have to hand-author every component. Named sources that fit this specific brief:

| Source | Use it for |
|---|---|
| [React Bits](https://reactbits.dev) | Text/scroll-reveal mechanics — copies source in, so everything is restylable |
| [Motion Primitives](https://motion-primitives.com) | Pairs natively with `motion` (already a dependency) — its **image comparison / slider** component is a genuine fit: showing optical vs SAR of the same scene with a drag-to-compare is real information, not decoration |
| [Aceternity UI](https://ui.aceternity.com) or [Magic UI](https://magicui.design) | Bold hero text reveals and **animated number-ticker** mechanics — exactly what the telemetry-as-headline move needs |
| [21st.dev](https://21st.dev) | Solved primitives — command palette, tabs, dialogs — shadcn-registry format, composes with what's already installed |

**One caution kept from the old rule, and only this one:** avoid React Bits' `Silk`, `Iridescence`, and `LiquidChrome` specifically — those three shader backgrounds are the single most recognisable effect in the current wave of AI-built sites, and using one turns "distinctive" into "the one that used React Bits." Everything else is fair game. Always restyle a borrowed component to this project's own tokens before shipping it — a component left on its library defaults is a component a judge will recognise.

---

## 2. What's already there and doesn't need reinventing

```
web/src/
├── App.tsx              (53)  — routing shell
├── main.tsx              (10)
├── index.css              — tokens; currently dark, revert to light (§0)
├── components/
│   ├── ModalityStack.tsx (317) — the 3D optical/fusion/SAR pull-apart. Keep the mechanism.
│   ├── panels.tsx        (442) — side panels: trace, evidence
│   └── Shell.tsx         (172) — layout chrome
├── pages/
│   ├── Landing.tsx       (368) — entry/marketing page — §3
│   ├── Workstation.tsx   (411) — the main analysis tool — §3
│   ├── DataPage.tsx      (123)
│   └── EvaluationPage.tsx(148) — metrics + ablation display — §3
└── lib/api.ts            (161) — the data layer
```

Stack already in place and worth keeping as-is: `react-router-dom` for the page structure, `zustand` for state, `@tanstack/react-query` for data fetching, `@react-three/fiber` + `drei` + `three` for the 3D stack, `motion` for animation (already a dependency — most of §1's motion direction needs no new library, just heavier use of what's installed), `lucide-react` for icons.

**One structural gap, worth naming since the frontend plan depends on it:** none of `01_Complete_Deep_Analysis.md`, `03_Model_Specification.md`, or `05_System_Design.md` reflect current reality on this point — all three describe a 2D map layer (OpenLayers or MapLibre) alongside the 3D stack. **`package.json` has no map library at all** — no OpenLayers, no MapLibre, no Leaflet. The Three.js modality stack *is* the entire spatial surface today. That's a legitimate design decision on its own (a traditional Leaflet/Mapbox base map is exactly the generic pattern `06_Design_System.md` warns against), but it means GeoJSON export (`TR-063`, `TR-085`) currently has nowhere to render inside the app itself — a judge has to open QGIS to see it. Decide deliberately whether that's acceptable for the finale or whether a lightweight map surface belongs in scope; this plan doesn't assume an answer either way, but the three architecture docs above should be corrected to describe what's actually built rather than what was originally planned.

---

## 3. Page by page

**`index.css`** — revert to a light palette (paper/surface/ink family from `06_Design_System.md` §2), keep the one-accent-for-interaction rule, add the new oversized type scale from §1, remove the dark "Revision 2" values (keep its comment as a record of the reasoning — the *why* is worth preserving even where the conclusion changes).

**`Landing.tsx`** — rebuild the hero as the campaign plate described in §1: full-bleed scene imagery, huge overlaid headline, huge telemetry readout. Replace generic feature-card sections with the scroll-driven pipeline narrative (validate → route → specialists → fuse → answer) — the five mandatory capabilities are already a real sequence; let the page's own scroll be that sequence rather than five identical cards.

**`Workstation.tsx` + `ModalityStack.tsx` + `panels.tsx` + `Shell.tsx`** — keep the bento composition (scene primary, trace always visible, evidence panel, query bar at the bottom not a sidebar). Reskin to the light palette and new type scale. Push panel-transition and evidence-arrival motion further per §1. Add the upload control here once `satquery/BUILD_PLAN.md` §4's endpoint exists — coordinate the two; this plan owns the control, that plan owns what it calls.

**`DataPage.tsx`, `EvaluationPage.tsx`** — retheme to light/bold. `EvaluationPage` specifically shows the ablation table and metrics — a natural home for the animated number-ticker component named in §1 (a metric counting up to its measured value on load is a real, non-decorative use of that mechanic). When you build the actual charts here, load the `dataviz` skill first for chart-specific colour and accessibility guidance — this plan covers the page's identity, not chart construction.

---

## 4. Definition of done

- [ ] No dark tokens remain in `index.css` — light ground confirmed against `06_Design_System.md` §2's palette
- [ ] At least one hero/section moment uses the oversized type scale with real telemetry set at display scale, not caption scale
- [ ] At least one component borrowed from a named library in §1, restyled to this project's tokens, doing real interaction work — not left on its defaults
- [ ] Motion is heavier than the current build throughout, and every animated element still ties to a real state change
- [ ] `prefers-reduced-motion` still honoured everywhere, unconditionally
- [ ] Upload control wired to `/api/upload` once `satquery/BUILD_PLAN.md` §4 lands
- [ ] `docs/06_Design_System.md` updated afterward to match whatever this pass actually ships — recommended as a follow-up, not done as part of this plan, so the doc reflects a finished decision rather than an in-progress one

## 5. Explicitly not this plan

The model/adapter work (`ml/BUILD_PLAN.md`), the upload endpoint's server-side implementation (`satquery/BUILD_PLAN.md` §4) — this plan owns only the control and its display, not the route it calls.
