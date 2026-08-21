# SAAKSHYA — Understand It in 10 Minutes

*A plain-language guide for anyone presenting or reviewing this project — even if you've never seen it before (or forgot it). No jargon left unexplained.*

---

## 1. What it is, in one line

**Existing tools map the forest-rights claims that were *granted*. SAAKSHYA rebuilds the proof for the claims that were *rejected*.**

It's a web platform that uses 50 years of satellite photos to prove tribal families were living on their forest land *before* the legal cutoff date — so their wrongly-rejected land claims can be won on appeal.

---

## 2. The problem (know this cold — it's the heart of the pitch)

- Tribal and forest-dwelling families in India have lived on forest land **for generations**, but historically had **no legal papers** for it. The government could evict them anytime.
- The **Forest Rights Act (FRA), 2006** fixed this: if you occupied forest land **before 13 December 2005**, you can legally claim it. Approved claim → a **patta** (title deed).
- **The catch:** to get the claim approved you must *prove* you were there before 2005. Most families have **no documents** going back that far.
- **The result:** claims get **rejected** — about **48,000 community claims** nationally. The land is genuinely theirs; they just can't prove it on paper.

> One coral dot on our map = one family/community whose rightful claim was denied.

**The insight SAAKSHYA is built on:** the families can't prove it, but **satellites can**. Landsat has photographed the whole Earth every year **since 1972**; declassified Corona spy photos go back to **1967**. If we can show the satellite saw farms/houses on that land in, say, 1990 — that's evidence they were there before 2005.

---

## 3. Why this is different (the "innovation" answer)

The government already has an FRA Atlas that maps *granted* claims and delivers schemes to title-holders. Several student projects rebuild that. **All of them look *forward* — at claims that already succeeded.**

SAAKSHYA looks **backward** — at the **rejections**, and at the one thing that causes them: **missing proof of pre-2005 occupation**. Nobody else attacks that. That's the whole edge.

---

## 4. How it works — 3 engines (say them by name)

Think of it as three teams working on one rejected claim:

| Engine | Nickname | What it does (plain) |
|---|---|---|
| **KAAL** | "the time machine" | Reads satellite archives back to 1972/1967 and finds the **year** a patch of forest turned into farmland or a settlement. If that year is before 2005 → strong evidence. Gives a **confidence score** and honestly flags what it can't prove. *This is the star.* |
| **SEEMA** | "the boundary check" | Uses today's satellite imagery to map farms/forest/water and spot **overlapping or disputed claim boundaries** — another common rejection reason. |
| **VAANI / NYAYA / SETU** | "the paperwork & appeal" | **VAANI** reads the rejection order and works out *why* it was rejected. **NYAYA** matches that reason to the evidence that answers it and shows the correct **appeal forum + 60-day deadline**. **SETU** lists which government schemes the family qualifies for once recognised. |

---

## 5. Walk the app, screen by screen

Open **http://localhost:8080**. Here's each screen and what to say.

### Landing
The India-at-night hero. *"Every one of those city lights is a place people live — including forest communities the system forgot."* Click **Sign in**.

### Atlas (the map)
- The map of **Dindori district, Madhya Pradesh**. Every dot is one FRA claim: green = granted, amber = pending, **coral = rejected**.
- Left panel = **layers** (turn statuses on/off) and **overlays**:
  - **Conflict/overlap** → draws links between disputed claims.
  - **Evidence-strength** → recolors every dot by how strong KAAL's satellite proof is.
- Bottom stats: how many rejected / granted / **recoverable** (rejected claims where KAAL found pre-2005 evidence).
- **Click a coral dot** → the right panel shows that claim's evidence. Click **Open evidence**.

### KAAL evidence (the money screen)
For one claim (e.g. FRA-DND-0007):
- **Verdict banner** — green "REJECTION ANSWERED" means the satellite proof beats the rejection reason.
- **Decade strip** — one satellite snapshot per era (1967→now). Watch it flip from **green (forest)** to **tan (farmland)** — that flip *is* the proof.
- **The chart** — greenness of the land each year. The **red line = the year it changed** (the "breakpoint"). If it's left of the **2005** line → they were farming before the cutoff.
- **Confidence dial** — how sure the engine is (e.g. 0.91).
- Buttons: **Generate dossier** (a printable evidence PDF) and **Open NYAYA appeal**.

### NYAYA appeal
- **Rejection-reason match** table: *stated reason* → *what answers it* → *verdict*.
- **Appeal window**: which committee to appeal to (SDLC/DLC) and the **60-day deadline** (often already LAPSED — that's part of the real tragedy).
- **SETU** chips: schemes the family gets once recognised (Jal Jeevan, MGNREGA, DAJGUA…).

### Officer dashboard
District overview for an official: how many rejected, how many **recoverable**, and a **queue** of claims ranked by evidence — click any row to jump to its evidence.

### Gram Sabha view
The same result in **plain language + Hindi**, for the villager themselves: "Satellite shows your family farmed here before 2005." Big buttons to get the evidence paper, record an elder's testimony, or trace the boundary.

---

## 6. A 2-minute demo script (click path)

1. **Landing** → "families the system forgot" → **Sign in**.
2. **Atlas** → "these coral dots are rejected claims in one block." Tick **Evidence-strength** → "green = we found strong satellite proof."
3. Click **FRA-DND-0007** → **Open evidence**.
4. **KAAL** → point at the decade strip flipping green→tan, then the chart: *"the satellite saw this land become farmland in ~1996 — nine years before the 2005 cutoff. The rejection was wrong."*
5. **Open NYAYA** → "here's the rejection reason, here's our matching evidence, and the appeal deadline."
6. **Generate dossier** → "one click turns it into a court-ready evidence paper."
7. Close on the **honest limit**: *"satellite evidence is supporting proof, not the sole proof — and we're upfront about that."*

---

## 7. The honest limits (these are strengths — say them, don't hide them)

- **Satellite = supporting evidence.** Under the law (Rule 13), imagery can support a claim but is **never the sole/decisive proof**. We're built exactly to that standard. (Courts have actually *struck down* rejections that relied on satellite imagery alone — so we use it *for* claimants, to the standard the courts demanded.)
- **ST vs OTFD.** For **Scheduled Tribe** families the bar is "before 2005" — satellites cover that. For **Other Traditional Forest Dwellers** the bar is ~75 years (back to ~1930) — **beyond any satellite**, so we only *strengthen* those cases, never claim to *prove* them. The app shows this honestly (amber "STRENGTHENED, not proven" verdict).
- **Prototype + synthetic data.** The demo district (Dindori) uses realistic but **fabricated** claims — real per-claim records aren't public. The satellite engine here is a faithful stand-in; wiring the real Google Earth Engine pipeline is a one-function swap (same data shape).

---

## 8. What's real vs mocked (for the technical question)

| Part | Status |
|---|---|
| Web app, routing, map, all screens | **Real, working** (open it, click around) |
| Leaflet WebGIS map + claim markers/overlays | **Real** |
| KAAL logic (breakpoint dating, confidence, ST/OTFD rules) | **Real logic, on synthetic input** — mirrors the real Earth Engine pipeline's output exactly |
| NYAYA appeal + SETU scheme rules | **Real, computed** from the data |
| Satellite pixel-crunching (LandTrendr on real Landsat) | **Designed, not wired** — needs Earth Engine credentials; the code skeleton exists (`spike/01_kaal_gee.py`) |
| Claim records + rejection orders | **Synthetic demo data** (labelled "DEMO") |

---

## 9. Glossary (every term on screen)

- **FRA** — Forest Rights Act, 2006.
- **IFR / CR / CFR** — Individual / Community / Community-Forest-Resource right (the 3 claim types).
- **Patta** — the land-title deed you get if a claim is approved.
- **Gram Sabha** — the village assembly; verifies claims first.
- **SDLC / DLC** — Sub-District / District Level Committees; the approval and appeal levels.
- **2005 cutoff** — 13 Dec 2005; you must have occupied the land before this date.
- **Patta holder** — a family whose claim was granted.
- **KAAL confidence** — 0–1 score of how sure the satellite engine is about the year-of-change.
- **Breakpoint** — the year the satellite detects the land changed (forest → farm/settlement).
- **NDVI** — a greenness number from satellite; high = forest, low = bare/farm.
- **Landsat / Corona** — satellite photo archives (1972→ / 1967–72 spy photos).
- **Rule 13** — the FRA rule listing acceptable evidence (satellite imagery is one, and supplementary).

---

## 10. Likely questions (and answers)

- **"Isn't this just the government's FRA Atlas?"** No — that maps *granted* claims. We attack *rejections* and rebuild lost pre-2005 proof. Empty space nobody else works in.
- **"Can satellite evidence actually win a claim?"** It's *supporting* evidence under Rule 13, combined with testimony and Gram Sabha records — it strengthens the bundle, it isn't the sole proof. We're deliberately honest about that.
- **"What about families before satellites existed?"** For the pre-1967 bar (some OTFD cases) we say so plainly — the app returns "strengthened, not proven." Honesty is the design.
- **"Is the data real?"** The app is real and working; the claim data is synthetic (labelled DEMO) because real records aren't public. The satellite engine is a faithful stand-in for the real Earth Engine pipeline.
- **"Who uses it?"** Both the **district officer** (dashboard, queue) and the **Gram Sabha / claimant** (plain-language view) — dual-user by design.

---

*Everything above is visible in the app's built-in **"How it works"** page (sidebar) too. Open `http://localhost:8080`, click around, and this guide narrates what you see.*
