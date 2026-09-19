# SAAKSHYA — Mockup Design Decisions

Running log. I describe each page (purpose + features + elements); you decide the look; I record it here. When all pages are settled, I build the mockups from this file.

**Global style:** Orbital control-room (dark #0c1512, panels #12211b, neon-lime + amber glows, HUD grid lines, satellite imagery front, mono/grotesk type). — *can still be adjusted per page.*

**Screens to build:** Atlas · Claim + KAAL evidence · NYAYA appeal DSS · Officer dashboard · Gram Sabha view

---

## Page 0 — Landing / Hero (public, shown only when NOT signed in) — LOOK: ✅ SETTLED

**Reference:** user image — full-bleed Earth centered on India, giant centered "Saakshya" wordmark, navbar on top, CTA band below.

**Decisions:**
- **Background:** full-bleed **rendered video of Earth slowly rotating around India**, **NO country/place labels** (unlike the ref image, which had labels). Cinematic, satellite look.
  - *Mockup build:* use a still India-centered satellite globe on black (can't embed video in a static artboard). *Real MVP build:* looping video OR a WebGL globe (three-globe / Cesium) slow auto-rotate, labels off.
- **Wordmark:** "Saakshya" — huge, centered, **white**, wide letter-spacing (like ref), clean grotesk. Sits over the globe, India roughly behind the text.
- **Navbar (top):** translucent dark glass bar (NOT the ref's red). Logo left; links right (About · Problem · Login) + a **Sign in** button.
- **Below-fold / CTA band:** short value line + **Sign in / Login** button. Page exists only for signed-out users; signed-in users land in the app (Atlas).
- **Color theme (my pick, approved "up to you"):** space-black `#05070a` + stars, realistic satellite Earth with faint blue atmosphere rim, white wordmark, **amber `#f0a839` accent** for the CTA (ties to the "evidence" theme). NOT red. Cool/white UI, one warm accent.
- **Motion (real build):** globe rotates slowly; wordmark fades/settles on load; subtle scroll cue.

**Open Qs (revisit later):** scroll-down sections — SKIP for now. Landing = hero + a **Sign in / Login** button at the bottom only. Must look good as a screenshot.

**Direction handed to me:** design all remaining pages myself "with this energy" — cinematic, dark, satellite-forward orbital control-room. Screenshot-first. Global palette: space-black `#05070a` / panels `#0e1a15`, neon-lime `#7dffb0` (evidence/positive glow), amber `#f0a839` (2005 cutoff / warn), coral `#ff6a4d` (rejected), text `#cfe0d6`, HUD grid + crosshairs + mono labels. Type: Chivo (display) + JetBrains Mono (data).

## Page 1 — Atlas (map) — LOOK: _TBD_

## Page 2 — Claim + KAAL evidence — LOOK: _TBD_

## Page 3 — NYAYA appeal DSS — LOOK: _TBD_

## Page 4 — Officer dashboard — LOOK: _TBD_

## Page 5 — Gram Sabha view — LOOK: _TBD_
