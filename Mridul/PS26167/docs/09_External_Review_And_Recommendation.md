# PS26167 — External Review and Recommendation

**Reviewed commit:** `2d55bd3` ("commits", 9 Sep 2026)
**Review date:** 10 September 2026
**Reviewer:** Claude Opus 5, working from Shreyash's workspace
**Portal closes:** 20 September 2026 — **10 days**

---

## 0. Read this part first

**I have a conflict of interest and you should discount this document accordingly.**

I built the competing entry. `dark-transit/` on branch `shreyash` is PS26143 (NTRO,
oil-spill detection and vessel attribution), and I wrote most of it — including
the U-Net, the PDF dossier, the Sentinel-1 reader and the MapLibre workstation
that landed today. The recommendation at the end of this document is that the
team submit PS26143 and not PS26167. A reviewer recommending their own work is
the weakest kind of reviewer, and you are entitled to weigh it that way.

What I can offer against that bias is that **every claim here is something I ran
or fetched, not something I read in a doc**, and every one is cited to a file and
line or to a command you can re-run. Check the ones that matter to you. Where I
found the code better than the documentation claimed, I have said so.

Two things I want on the record before the criticism:

1. **The analysis in this folder is better than most SIH teams will produce.**
   `00_Official_Problem_Statement.md` catching that ISRO shipped the statement
   with an unfilled `Add 'Evaluation/Judging Criteria' table here` placeholder,
   and that the `Dataset Link` field is truncated at 355 characters, is real
   diligence. Ten ADRs with genuine trade-offs. A build contract with published
   anchors rather than invented targets.
2. **The MVP is a working system, not a mock.** 30/30 self-tests, a real
   pipeline, a real refusal path. I ran all of it. It works.

---

## 1. What I ran, and what happened

Everything below was executed against `2d55bd3` on 10 September 2026.

| Command | Result |
|---|---|
| `python3 -m satquery.cli selftest` | **30 passed, 0 failed** (1.4 s) |
| `python3 -m satquery.cli eval` | runs; metrics reproduce the README |
| `cd web && npm install && npm run build` | clean, 1.15 s |
| `node verify.mjs http://127.0.0.1:8000` | **26 passed, 1 failed** |

The pipeline is genuinely real. Specifically verified working:

- **The refusal.** Asking *"what changed between these two dates?"* with an
  optical+SAR pair loaded is correctly refused, the compatibility check fails in
  the trace, and no model is invoked. This is the single best thing in the build
  and most teams will not have it.
- **The cross-modal answer.** `POST /api/query` returns
  `"SAR detects 6 built-up areas totalling 2825.4 ha. Cloud obscures 6.0% of the
  optical scene. 1 of them — 1616.3 ha — lies beneath that cloud…"`, confidence
  0.929, 8 trace steps.
- **Ground-truth isolation.** `Scene.truth` is read only by `evaluate.py`, and a
  test asserts it. That is the only arrangement under which a synthetic benchmark
  measures anything, and it is correctly done.
- **The answer layer cannot hallucinate numbers.** `pipeline.answer()` takes an
  `EvidenceSet` and no raster. Enforced by the type signature, asserted by a test.

---

## 2. Two defects found by running it that reading would not have found

### 2.1 The documented demo command does not serve the UI

`satquery/server.py:243` computes the `dist` path, and `:245` imports
`fastapi.staticfiles` — **the static mount lives entirely inside the FastAPI
branch.** The stdlib fallback handler serves `/api/*` routes and nothing else.

`mvp/README.md` declares:

> **Dependencies: numpy and Pillow.** No torch, no scipy, no OpenCV, no GDAL.

and

> `python -m satquery.cli serve` — serves the built UI + API on one origin

Both cannot be true at once. On a machine with numpy and Pillow only — which is
what the README tells a judge to expect — `cli serve` starts, prints its banner,
answers `/api/health` with 200, and returns **404 at `/`**. I hit exactly this:
the UI never loaded until I installed FastAPI, after which all 26 checks passed.

A judge who clones the repo and follows the README does not see the workstation.

**Fix:** either add `fastapi` and `uvicorn` to the declared dependencies, or
teach the stdlib fallback to serve `web/dist`. The second is ~20 lines and
preserves the dependency claim, which is worth preserving.

### 2.2 The headless harness has rotted and no longer guards what it claims

`web/verify.mjs:121` locates the answer text with:

```js
await page.locator('p.text-\\[13px\\]').first().textContent()
```

That is a Tailwind utility class. The UI refactor in `2d55bd3` rewrote
`App.tsx`, `panels.tsx` and `index.css`, and the class no longer matches. The
check `cross-modal query answers` fails with `null` — **while the feature itself
works perfectly**, as the API response above shows.

This is the one failing check out of 27, and it is a false alarm. But the commit
message for `6ca1b6a` states "20/20 headless UI checks", and the suite has not
been re-run since the refactor. A test coupled to a styling class is a test that
reports green until someone restyles, then reports red for the wrong reason.

**Fix:** anchor on `data-testid` attributes, not on utility classes.

> Both defects are the same failure mode: **a claim in prose that no longer
> matches the machine.** A dependency list written before FastAPI was added; a
> selector written before the restyle. Neither survives `git clone && follow the
> README`, which is precisely the path a judge takes.

---

## 3. Feasibility — can this actually be built?

I verified every source rather than trusting §2's "Every source below has been
verified to exist." **The claim holds.** All six are live, ungated, and
permissively licensed:

| Source | HTTP | Licence | Size |
|---|---|---|---|
| `MBZUAI/geochat-7B` | 200 | **Apache-2.0** | 14.1 GB |
| `BIFOLD-BigEarthNetv2-0/BigEarthNet.txt` | 200 | CDLA-Permissive-1.0 | **467 MB** |
| `hackelle/BigEarthNetV2-LMDB` (imagery) | 200 | — | **155 GB** |
| `hackelle/BigEarthNetV2-Lithuania-Summer-LMDB` | 200 | — | **2.5 GB** |
| `xiang709/VRSBench` | 200 | CC-BY-4.0 | 12.5 GB |
| `Qwen/Qwen2-VL-7B-Instruct`, `OpenGVLab/InternVL2-8B`, `llava-hf/llava-1.5-7b-hf` | 200 | apache-2.0 / mit / llama2 | — |
| `github.com/YZHJessica/CDVQA`, `github.com/lx709/VRSBench` | 200 | — | — |
| `rsvqa.sylvainlobry.com` | **timed out at 40 s** | — | — |

Two notes the spec should absorb:

**GeoChat being Apache-2.0 matters more than it looks.** The deliverable is
*"Codes and models including test and demonstration"* — trained weights handed to
a government agency. The fallback `llava-1.5-7b-hf` is Llama-2 licensed, which is
a different conversation. §3 already says "check the licence before committing";
it is right, and GeoChat passes.

**`BigEarthNet.txt` is annotations, not imagery.** 467 MB of text keyed by
`patch_id` / `s1_name`. The Sentinel-1/2 pixels those keys point at are a
separate 155 GB dataset. §2 says this correctly ("full imagery ~145 GB") but the
table's *Size* column reads "annotations ~467 MB" first, and a team that
downloads the 467 MB and starts building will lose a day discovering the rest.

### 3.1 Compute

**The team's laptop cannot do this.** Measured on the machine this review was
written on:

```
$ nvidia-smi
no nvidia GPU
$ lspci -v -s 02:00.0
  Memory at 6000000000 (64-bit, prefetchable) [size=4G]
$ ls /dev/nvidia*
  no /dev/nvidia* devices
```

RTX 2050 mobile, **4 GB VRAM**, and the driver is not loaded. §12 sets the floor
at 16 GB for QLoRA. Even 4-bit *inference* of a 7B model wants 6–8 GB by §12's own
table. Local training is out; a local demo of the quantised model is also out.

**This is solvable with rented compute** — Kaggle's free 2×T4 (16 GB, ~30 GPU-h
per week) or a student cloud plan. §12's reference figure is ~16 GPU-hours for
one adapter, so four adapters is roughly 40–60 GPU-hours, or about two weeks of
Kaggle's weekly quota. Fourteen weeks remain before December. **It fits.**

### 3.2 Bandwidth

Measured, three hosts, after pausing all other transfers:

| Host | Throughput |
|---|---|
| HuggingFace | 0.95 – 1.32 MB/s |
| Cloudflare speed test | 0.94 – 1.43 MB/s |
| GitHub | 0.87 MB/s |

Uniform. **This is the link, not HuggingFace throttling** — roughly 8–11 Mbit/s.

Downloading locally at that rate: GeoChat 3.0 h, VRSBench 2.6 h, Lithuania subset
42 min, full imagery **32 hours**. Available disk on this machine is 17 GB, so the
full corpus does not fit regardless.

**Renting the GPU dissolves this too**, and that is the important structural point:
the corpus must live wherever the GPU lives. Move training to a cloud instance and
the path becomes HuggingFace → datacentre at 100–1000 MB/s; the team's link never
appears in it, and 155 GB becomes minutes. The only bytes that must come back down
the slow link afterwards are the trained LoRA adapters — r=8 on a 7B base is
roughly 20–80 MB each, so four is ~320 MB, about five minutes.

**What does not dissolve is the December demo.** A 4-bit 7B is ~4.5 GB of weights
against 4 GB of VRAM. It does not fit. The options are a rented GPU at the venue
(depends on nodal-centre internet), CPU inference (works, slow, 15 GB RAM is
enough), a smaller 2B-class base (fits, costs accuracy), or pre-computed results.
§12 already gives the right instruction — *"Quantise before December, test on the
actual venue laptop, and pre-compute results for every demo image so a failure
degrades the demo rather than ending it"* — and it should be treated as binding.

---

## 4. Gap analysis against the five mandatory requirements

The PS lists five compulsory items and states plainly: *"A generic LLM or VLM
without remote-sensing adaptation will not satisfy the requirements."*

| # | Mandatory | State | Evidence |
|---|---|---|---|
| 1 | **Remote-sensing adaptation (fine-tuning)** | **Not started** | no `torch`, `transformers` or `peft` anywhere in `satquery/`; `specialists.py:105` `adapter_loaded: bool = False` with no code that ever sets it |
| 2 | Single-image VQA + one more single-image task | Shape present, classical | `specialists.py` `VQA`, `Grounding`; classical CV plus templates |
| 3 | Bi-temporal change analysis | Shape present, classical | `specialists.py` `Change`, change-vector analysis |
| 4 | Optical–SAR cross-modal | Shape present, classical | `specialists.py` `Fusion` |
| 5 | Agentic orchestration | Present | `router.py`, fixed registry, validation, refusal |

Requirement 1 is the one the PS says is disqualifying, and it is the one with
nothing behind it. `adapter_loaded` is a labelled socket with no wire — the
docstring at `specialists.py:12` describes the neural path correctly, and the
`method` property returns `"neural+classical"` when the flag is true, but nothing
sets it and no loader exists.

### 4.1 Deliverables outside the five

The PS also requires *"Input upload and compatibility checking"* and supported
formats *"GeoTIFF or TIFF"*.

**There is no upload.** The workstation contains exactly two `<input>` elements —
`Workstation.tsx:280`, a range slider for the 3D layer separation, and
`Workstation.tsx:372`, the query text box. No upload endpoint, no multipart
handling anywhere in `server.py`.

**And the reader that would make it work is dead code.** `raster.py:262` has a
working `read()` that handles GeoTIFF through rasterio with a Pillow fallback.
Nothing in `server.py` or `pipeline.py` calls it. Every scene comes from
`scene.build()`.

> This is the inverse of a seam problem. The hard half — a real raster reader —
> is written and tested. The easy half — a POST endpoint that hands an uploaded
> file to it — is missing. Wiring `read()` to an upload route is roughly a day's
> work and converts "a demo of a simulation" into "a system that eats the file a
> judge hands it." **If only one thing on this list gets done, it should be this
> one.**

**Downloadable reports** are partial: `Workstation.tsx:106` exports the evidence
GeoJSON. The PS asks for reports alongside visual evidence, confidence and
execution summaries; geometry alone is not that.

**Benchmark ingestion is absent.** Final scoring uses prescribed VRSBench, RSVQA
and CDVQA test splits plus the hidden ISRO/SAC set. There is no loader for any of
them, so no scoreable number exists. The README says so honestly ("Not claimed"),
which is the right posture — but it means the project currently has no number
that the actual evaluation would recognise.

---

## 5. Measurement integrity

These were raised in an earlier review and are unchanged in `2d55bd3`. They
matter more than the missing features, because a judge who finds one stops
believing the rest.

### 5.1 Router accuracy 1.0000 is measured on its own construction

`router.py:144` defines **4 regex patterns**. `evaluate.py:195` defines
`ROUTER_CASES` with **19 labelled queries**. I checked the overlap directly:

```
ROUTER_CASES entries: 19
regex patterns: 4
cases matched by a hand-written pattern: 19 of 19
```

Every test query is matched by a pattern written to match it. The reported
accuracy of 1.0000 is not a measurement of dispatch quality; it is a restatement
that the regexes were written after the examples. `classify()`'s docstring is
admirably honest that the rule set is a stand-in — the *metric* should be equally
honest, or be dropped until there is a held-out query set.

**Fix:** write 200 paraphrases without looking at the patterns, split them, and
report accuracy on the held-out half. Expect it to fall, and say so — a router at
0.82 on unseen phrasing is a far stronger claim than 1.00 on its own examples.

### 5.2 Ablation row A is not a VLM

`evaluate.py:223` labels configuration A *"Generic VLM, no adaptation"*. There is
no VLM in the codebase. Row A is grayscale Otsu, and at `evaluate.py:258` the
water prediction is:

```python
pred_w = g <= cv.otsu(g)
```

— the exact complement of the built-up prediction. A baseline that is bad by
construction. The function's own docstring is candid ("Configurations are
simulated by disabling capabilities"), but the *table a judge reads* says
"Generic VLM", and the gap between 0.171 and 0.924 will be read as evidence about
VLMs. It is not.

**Fix:** relabel to what it is — "no domain knowledge: panchromatic Otsu" — and
say in the caption that the neural ablation will replace these rows.

### 5.3 `capability` is an invented composite

`evaluate.py:291`:

```python
capability = round(0.50 * mean_f1
                   + 0.25 * (router_acc or 0.0)
                   + 0.25 * (1.0 if recovered is not None else 0.0), 4)
```

The headline "A 0.086 → E 0.953" is an artifact of chosen weights, not a measured
quantity, and one of its three terms is a boolean for whether a code path ran.
Present the three components separately, or name the metric something that does
not sound standard.

### 5.4 The flagship number is manufactured by the generator

`scene.py:223`:

```python
# -- cloud deck, deliberately over the built-up cluster -------------------
```

The README's "two things to try first" sells *"57 % recovered under cloud"* as a
discovery. The cloud was placed over the town so that it would be. The comment is
honest; the README is not, and the arithmetic gives it away — 6 % cloud cover
containing 57 % of the built-up area is ~8× what random placement would produce.

**Fix:** say it on the slide. *"We construct a scene where cloud sits over the
settlement, because that is the case where the two sensors differ — and here is
what the system does with it."* That is a stronger demo than an accidental
discovery, and it cannot be attacked.

---

## 6. Recommendation

**Submit PS26143. Do not submit PS26167.**

The team gets one nomination. Ranked reasons:

**1. One project's hard requirement is done; the other's has not started.**
PS26167's requirement 1 is remote-sensing fine-tuning, which the PS says is
disqualifying to omit — and there is no neural code at all. PS26143's equivalent
ML obligation (DT-3, SAR slick segmentation) was trained today: a 487,009-parameter
U-Net, holdout IoU 0.938 / F1 0.968 on a tile-disjoint split, torch-to-numpy export
parity verified at 3.4e-5 before the weights were written, running in the shipped
pipeline. One entry has cleared its gate. The other has not approached it.

**2. PS26167's scoring is a black box that cannot be hedged.** The judging
criteria table is an unfilled editorial placeholder — `00_Official_Problem_
Statement.md` documents this. You cannot optimise for weights nobody published.
Then the final evaluation runs on an undisclosed Cartosat-2S / RISAT set while
you train on Sentinel-1/2: a domain gap you have no way to measure. §2's advice
("optimise for robustness, not benchmark peak") is correct and is also an
admission that the target cannot be aimed at. PS26143 is judged by a panel
watching a demo you control end to end.

**3. Cost asymmetry.** PS26167 needs rented GPU, ~30 GB of downloads, 40–60
GPU-hours across four adapters, benchmark harnesses for three public datasets, an
upload path, and a report exporter. PS26143 needs no GPU rental at all; its
remaining work is data plumbing behind seams that were named before the code
existed.

**4. Demo risk.** PS26167's December demo needs a 7B model on a 4 GB laptop, or
venue internet. PS26143 runs on numpy, offline, start to finish in 41 seconds.

**5. Crowding.** ISRO and Space Technology attract everyone. PS26143 (NTRO,
Disaster Management) showed 0 of 500 submissions at scrape time.

### 6.1 This is not "PS26167 cannot be done"

It can. The spec is well grounded — real anchors from the GeoChat paper (40.8% →
60.6% VQA, grounding SOTA ~40%), a correct build order that puts the router last,
a QLoRA config that genuinely fits 16 GB, and an honest data ladder. With rented
compute and the fourteen weeks available, four adapters is achievable.

The recommendation is about **which single bet the team places**, not about
whether the work is possible. Four unstarted mandatory items plus an invisible
rubric is the wrong risk profile for a one-shot nomination.

### 6.2 What would change my mind

- ISRO publishes the judging weights before 20 September.
- The team's genuine strength is VLM work rather than geospatial pipelines, and
  the presenter will be whoever built this.
- SIH permits a second team, in which case PS26167 should be entered as-is —
  the documentation alone is competitive.
- A trained M1 adapter lands with a measured zero-shot → adapted gain before the
  deadline, which would convert requirement 1 from "not started" to "evidenced".

### 6.3 Decide now, not in December

PS26167's training needs weeks of lead time against a weekly-capped free GPU
quota. Deferring the choice past mid-October chooses PS26143 by default — just
with Mridul's time already spent. The decision is cheap today and expensive later.

---

## 7. Do these regardless of the decision

Ranked by cost-to-benefit. The first three are hours, not days.

1. **Add `fastapi` and `uvicorn` to the declared dependencies**, or teach the
   stdlib fallback to serve `web/dist`. Today a judge following the README gets a
   404 at `/`. (§2.1)
2. **Unpin `verify.mjs` from Tailwind class names.** Use `data-testid`. (§2.2)
3. **Relabel ablation row A** and caption the `capability` column with its
   formula. (§5.2, §5.3)
4. **Put the cloud placement on the slide** rather than in a source comment. (§5.4)
5. **Wire `raster.read()` to an upload endpoint.** Highest value per day of work
   in the whole list: it satisfies a mandatory deliverable and it is the first
   thing a judge will try. (§4.1)
6. **Build a held-out router set** and report the honest accuracy. (§5.1)
7. **Train M1 on a rented GPU** and report the adaptation gain, not the absolute.
   Even one adapter converts requirement 1 from absent to evidenced.

---

## 8. Closing

The engineering here is careful and the documentation is unusually honest — the
refusal path, the ground-truth isolation, and the type-enforced separation between
evidence and phrasing are all things most teams will not have thought to build.
Nothing in §5 is dishonesty; it is the ordinary gap between what a system measures
and what its summary says, and every instance is already admitted somewhere in the
source. The fix is to move those admissions from code comments into the table a
judge actually reads.

The recommendation against submitting it is not a judgement on the work. It is a
judgement about a one-shot nomination, an unpublished rubric, and a mandatory
requirement that has not been started with ten days left.

*Written by Claude Opus 5 at Shreyash's request. Every measurement in this
document was taken on 10 September 2026 against commit `2d55bd3` and can be
re-run.*
