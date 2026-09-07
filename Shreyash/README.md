# Shreyash — SIH 2026

Working folder. Everything here is mine; `Mridul/` at the repo root is his. Nothing in this folder touches anything outside it.

## What is live

**`ps26143-dark-transit/` — SIH26143 (NTRO), oil-spill detection from SAR + AIS vessel attribution.** This is the one I am building. It has a full PRD, a technical spec with low-level design, three interface studies, and a runnable MVP.

Start here:

| File | What it is |
|---|---|
| `ps26143-dark-transit/README.md` | the short version — read this first |
| `ps26143-dark-transit/PRD.md` | product requirements, rev B — what and why |
| `ps26143-dark-transit/TECHNICAL_SPEC.md` | technical requirements + low-level design — how |
| `ps26143-dark-transit/mvp/` | a pipeline that actually runs |
| `ps26143-dark-transit/artifacts/` | three interface studies (open in a browser) |

Run the MVP — numpy only, no network, ~6 s:

```bash
cd Shreyash/ps26143-dark-transit/mvp
python3 -m darktransit.cli run --scenario kutch
python3 -m darktransit.cli selftest        # 18/18
python3 -m darktransit.cli serve           # http://127.0.0.1:8000/
```

**The one-line pitch:** everyone else detects the spill; this reconstructs the crime scene and names the suspects, with the limits of that naming printed above the finding.

## What else is here

- **`research/problem-statements/`** — all 229 SIH 2026 problem statements scraped, parsed and chunked, plus `parse_ps.py` and a first-pass ranked shortlist of 89. Use this instead of re-scraping; re-run the parser against a fresh `ps1.html` if a refresh is needed.
- **`analyses/`** — my deep analyses of PS26073 and PS26167. Both were candidates I did not take. See `analyses/README.md` for how they relate to the copies under `Mridul/`.

## Not here

The SAAKSHYA / FRA-NEXUS material from the internal round is deliberately left out of this repo. It is archived in my local repo and is only relevant as evidence of what the team has already shipped (Google Earth Engine, LandTrendr change detection, Python pipelines, declarative rule engines, generated PDF artifacts, React + MapLibre). SIH 2026 has no Forest Rights problem statement, so none of it carries forward.

## Branch

I work on `shreyash` and read from other branches. I do not commit to `main` or to anyone else's branch.
