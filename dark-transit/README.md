# SIH26143 — Dark Transit

**Leveraging satellite imagery to determine oil spills at sea along with AIS data correlations to identify the vessel responsible.**
National Technical Research Organisation · Software · Disaster Management · portal closes 20 September 2026.

Ships discharge oily bilge and slop residue at sea because it is cheaper than paying for a reception facility in port. A satellite finds the slick hours or days later, by which time the vessel is gone. The gap is not detection — detection is a solved research problem with a public labelled dataset. The gap is the step from *there is oil here* to *this hull put it here*.

**Everyone else detects the spill. This one reconstructs the crime scene and names the suspects — with the limits of that naming printed above the finding, not buried under it.**

---

## What is here

```
PRD.md                          the product requirements document, revision B — what and why
TECHNICAL_SPEC.md               technical requirements and low-level design — how
docs/PS26143_Brief.md           the original problem-statement brief
artifacts/                      the three interface studies
  dark-transit-prd.html           PRD rev A, narrative form
  dark-transit-workstation.html   the analyst workstation (mockup)
  forty-hours-back.html           the pitch narrative (mockup, invented numbers)
mvp/                            a runnable reference implementation — see mvp/README.md
  web/index.html                  the same narrative page, now reading real pipeline output
```

`artifacts/forty-hours-back.html` is the original study: every vessel, coordinate and score on it was invented for demonstration. `mvp/web/index.html` is that page rewired — same design, but every number is read from `run.json`, the output of a pipeline that actually detects, hindcasts, filters, scores and refuses. Nothing on the live page is typed in by hand, and a test asserts it.

## Run it

No dependency beyond numpy. Offline. Deterministic under a recorded seed.

```bash
cd mvp
python3 -m darktransit.cli run --scenario kutch    # full pipeline, ~6 s
python3 -m darktransit.cli selftest                # the acceptance criteria of PRD §19
python3 -m darktransit.cli serve                   # then open http://127.0.0.1:8000/
```

## The three claims

1. **The slick's shape is a bearing.** A discharge made under way is a line source, so an elongated slick's principal axis is a heading. Comparing it against each candidate's course is the strongest single factor, and it is the one factor that does not inherit the drift reconstruction's error.
2. **Silence is a signal, scored against the vessel's own baseline.** A gap matters because it deviates from what *that* hull normally does, not because it exceeds a fixed threshold — satellite AIS coverage genuinely thins offshore and a naive detector would flag half the ocean.
3. **A hull is bright on radar whether or not it speaks.** CFAR over the same scene gives a second channel that survives a switched-off transponder. The problem statement does not ask for it.

## What the system refuses to do

Five gates halt or degrade a run and report themselves either way. A halt is a successful outcome.

| Gate | Fires when | Result |
|---|---|---|
| 1 | detection confidence < 0.50 | look-alike; no origin region, no vessel named |
| 2 | origin region r₉₅ > 36 km | the region no longer constrains traffic; attribution unavailable |
| 3 | no radar pass over the origin window | dark channel declared unavailable, single-channel result |
| 4 | leader margin < 0.10 | the evidence does not separate the candidates; name neither |
| 5 | AIS archive shorter than the drift horizon | refuse to start, before compute is spent |

Each has a scenario that fires it: `--scenario lookalike | wide | no-radar | ambiguous | short-archive`, plus `clean` as the negative control.

## Status

`TECHNICAL_SPEC.md` is the engineering counterpart to the PRD: numbered technical requirements (units, coordinate frames, determinism, numerical rules, performance budgets, safety controls in code), the data contracts field by field, and a module-by-module low-level design with measured numbers, complexity, and the defects found while building it.

The MVP covers build steps 1–3 of PRD §18 plus the classical detection path, the dark channel, the gates, the scoring model and the dossier. It does not include the fine-tuned segmentation network or the real Copernicus/ERA5/AIS pulls. PRD §22 states exactly which requirement is implemented and which is a Phase 1 target — read it before quoting any capability as done.

Every incident is synthetic and declared as such in the run log, in the interface and on page 1 of every dossier. MMSIs are minted under the prefix 999, which is not an assigned Maritime Identification Digit, so no generated identity can collide with a real vessel.
