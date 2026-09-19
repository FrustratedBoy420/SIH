# Credits — what was borrowed, and from where

`06_Design_System.md` §8: *a judge asking "did you build this?" deserves a straight answer.* This is it.

The rule was: **borrow interaction, author identity.** Every borrowed component was copied as source (not installed as a dependency), restyled to the project tokens, and changed where the original fell short of the accessibility floor. Everything not listed here — the campaign plate, the scan reveal, the plate viewer, the pipeline narrative, the evidence and trace panels, the refusal replay, the modality stack, the results charts, the report — is authored for this project.

## Copied as source and restyled

| Component | Source | Licence | Where it is used | What changed |
|---|---|---|---|---|
| Number Ticker | [Magic UI](https://magicui.design/docs/components/number-ticker) — registry `magicui.design/r/number-ticker` | MIT | Landing telemetry, numbers band, results | Tokens; reduced motion lands on the value at once; `startValue` used as the published anchor so a figure counts *from* its anchor; signed output |
| Marquee | [Magic UI](https://magicui.design/docs/components/marquee) — `magicui.design/r/marquee` | MIT | Landing capability strip | Tokens; copies after the first are `aria-hidden` |
| Animated Beam | [Magic UI](https://magicui.design/docs/components/animated-beam) — `magicui.design/r/animated-beam` | MIT | Landing pipeline diagram | Accent/fusion gradient, rule-coloured path |
| Blur Fade | [Magic UI](https://magicui.design/docs/components/blur-fade) — `magicui.design/r/blur-fade` | MIT | Section entrances | Shorter travel and duration per `06` §6 |
| Image Comparison | [Motion Primitives](https://motion-primitives.com/docs/image-comparison) — `ibelick/motion-primitives` | MIT | Optical ↔ SAR compare, landing and workstation | Pointer events; a real range input underneath so the divider is keyboard-operable and announced; text labels on both sides |
| Text Effect | [Motion Primitives](https://motion-primitives.com/docs/text-effect) | MIT | Headline reveals | Trimmed presets; added a line-mask `rise` preset |
| Magnetic | [Motion Primitives](https://motion-primitives.com/docs/magnetic) | MIT | Primary actions | Inert under reduced motion; lower intensity |
| Spotlight | [Motion Primitives](https://motion-primitives.com/docs/spotlight) | MIT | Hover light over imagery tiles | Paper-white "light table" instead of zinc; hidden under reduced motion |

## Installed as dependencies

| Package | Licence | Why |
|---|---|---|
| [cmdk](https://github.com/pacocoursey/cmdk) | MIT | The command palette primitive behind shadcn/ui's `Command`; styled here, not re-implemented |
| [motion](https://motion.dev) | MIT | Every animation |
| [three](https://threejs.org) (+ its `OrbitControls` addon) | MIT | The modality stack only (`06` §7). Used directly with named imports: react-three-fiber registers the whole `THREE` namespace, which defeated tree-shaking and alone broke the NFR-13 budget |
| [geotiff](https://github.com/geotiffjs/geotiff.js) | MIT | Reading uploaded GeoTIFFs in the browser |
| [@tanstack/react-query](https://tanstack.com/query), [zustand](https://github.com/pmndrs/zustand), [react-router](https://reactrouter.com) | MIT | Server state, UI state, routing |
| Bricolage Grotesque, IBM Plex Sans, IBM Plex Mono via [Fontsource](https://fontsource.org) | OFL-1.1 | Self-hosted — no font CDN at runtime (OPS-06) |

## Deliberately not taken

- React Bits *Silk*, *Iridescence* and *LiquidChrome* shader backgrounds — the most recognisable effect of the current wave of generated sites (`web/BUILD_PLAN.md` §4 rule 2).
- Any library hero block, bento template or "feature grid" preset.
- OpenLayers / MapLibre. Every scene is one georeferenced plate and there are no tiles offline, so the plate viewer is a small authored SVG layer over the image; it keeps the bundle inside NFR-13.
