# SatQuery AI — Backend Build Plan

**Owner: Shreyash. Scope: the `satquery/` package and its HTTP API — everything that is not model training.**

If a task needs `torch`, `transformers`, or `peft`, it does not belong in this plan — see `ml/BUILD_PLAN.md` and the interface contract in its §7, which is the only place this plan touches that one. Everything else — ingestion, orchestration, the API, evaluation honesty, the router, testing — is here.

Every item below is cited to the file and line where it currently stands, verified against `origin/main` at commit `554da63` on 2026-09-11, so nothing here is inherited secondhand from a document that may have drifted.

---

## 0. Current reality

```
satquery/
├── cli.py         (190) — selftest / demo / eval / serve commands
├── cv.py          (412) — Otsu, Lee filter, NDWI, morphology — classical CV primitives
├── datasets.py    (275) — dataset registry, real (not aspirational) local state
├── evaluate.py    (355) — metrics + the A–E ablation — §2 below
├── evidence.py    (210) — EvidenceSet, GeoBox — the normalised output schema
├── pipeline.py    (378) — Pipeline: orchestration, the adapters= hook (line ~112)
├── raster.py      (419) — read() at line 263, works, tested, called by nothing else — §3
├── router.py      (255) — classify / validate / plan / registry — §4
├── scene.py       (258) — synthetic scene generator
├── server.py      (358) — FastAPI + stdlib HTTP — §1, §3
├── specialists.py (571) — VQA, Grounding, Change, Fusion — Mridul's file, not yours
└── tests.py       (415) — 30 self-tests, `python -m satquery.cli selftest`
```

Self-test is green (30/30), `cli eval` reproduces the README's numbers, `web/verify.mjs` is 26/27 (the one failure is a rotted selector, not a broken feature — §5). Nothing below requires touching `specialists.py`'s model logic.

---

## 1. Fix the stdlib 404 — do this first, it's trivial

**`server.py`'s `_serve_stdlib` (the fallback path when FastAPI isn't installed) has no static-file case.** The FastAPI branch mounts `web/dist` at `server.py:243–245` via `SinglePageApp(StaticFiles)`; the stdlib `Handler.do_GET` only has cases for `/api/health`, `/api/scene`, `/api/scene/{layer}.png`, `/api/datasets`, `/api/models`, `/api/registry`, `/api/evaluation`, then falls through to a 404. On the numpy+Pillow-only install the README advertises (*"No torch, no scipy, no OpenCV, no GDAL"*), `cli serve` answers `/api/health` with 200 and returns **404 at `/`**. A judge following the README on a clean install sees a blank page before anything else.

**Fix, ~20 minutes:**

1. Reuse the same `dist` path computation the FastAPI branch already has: `Path(__file__).resolve().parent.parent / "web" / "dist"`.
2. In `Handler.do_GET`, before the final `self._send({"error": "not found"}, 404)`, add a branch: if `dist.exists()`, resolve the requested path under `dist` (falling back to `dist/index.html` for anything that isn't a real file, matching the FastAPI branch's SPA logic — a page refresh on `/workstation` needs the shell back, not a 404).
3. Guess the content type by extension (`mimetypes.guess_type`) and reuse the existing `_send(body, code, ctype)` helper — it already accepts arbitrary bytes and a content type (see the `.png` branch just above), so this needs no new plumbing, only a new branch.
4. Keep the `/api` guard the FastAPI branch already has (`server.py`'s `SinglePageApp.get_response`) — an unknown API path should 404, not silently return the HTML shell.

Do **not** solve this by adding `fastapi`/`uvicorn` to required dependencies instead — that contradicts the README's own numpy+Pillow-only claim, which is a real, tested property (`NFR-07`) worth keeping true.

**Checkpoint: 11 September — today.** `10_Decision_Record.md` §8 calls this "trivial — no excuse."

---

## 2. Evaluation honesty — two one-line fixes, verified still open

I re-read `evaluate.py` in full before writing this — both of these are confirmed **still present** in the current code, not already handled elsewhere:

**`evaluate.py:223`** — the `ABLATION` list's row A is labelled `"Generic VLM, no adaptation"`. There is no VLM anywhere in the codebase; row A is grayscale Otsu thresholding, and the code's own comment at line 254 already says so honestly (`"A -- no domain knowledge at all: panchromatic brightness, 2-class split"`). Change the display string at line 223 to match: `"No domain knowledge: panchromatic Otsu"`. One line.

**`evaluate.py:291`** — the `capability` composite (`0.50·mean_f1 + 0.25·router_acc + 0.25·(1.0 if recovered else 0.0)`) is invented for this project, not a metric from the literature, and nothing surfaces the formula next to the number — a judge sees `0.953` and no way to know a third of it is a boolean for whether a code path ran. Add a `"capability_formula"` string to `run_ablation()`'s return dict (near the existing `"note"` field at line ~308) spelling it out verbatim, so the CLI, `/api/evaluation`, and anything built on top of it (the frontend's evaluation page, a future slide) all carry the formula, not just the score.

**Checkpoint: 11 September — today.**

---

## 3. Held-out router set — `TR-056`

`router.py:144` defines 4 regex patterns. `evaluate.py:195`'s `ROUTER_CASES` defines 19 labelled queries — **and all 19 are matched by a pattern written to match them.** The reported `1.0000` in `eval_router()` is a construction check, not a generalisation measurement, and `README.md` already discloses this ("Router accuracy is deliberately not listed here").

**Fix:** write ~200 paraphrases of the same four task intents (`temporal_change`, `cross_modal`, `grounding`, `single_vqa`) **without looking at `router.py`'s patterns first** — draw from natural query variation, not from the regex source, or the same construction problem reappears in a new set. Run `eval_router()` against this new set, report that number (target ~0.85 per `10_Decision_Record.md` §3), and either replace the construction-set figure in the README/eval output or keep both, clearly labelled which is which. Expect it below 1.0 — a router at 0.82 on unseen phrasing is a stronger claim than 1.00 on its own examples.

~1 day. No blocker, start any time before submission.

---

## 4. Upload endpoint — the highest-value item on this list

There is currently **no way to give the system a file.** `raster.read()` (`raster.py:263`) handles GeoTIFF via `rasterio` with a Pillow fallback, is exercised by `tests.py`, and works — and is called by nothing outside the test suite. Zero `<input type=file>` elements exist anywhere in the interface (`web/src/pages/Workstation.tsx` has exactly two `<input>`s: a 3D layer-separation slider and the query text box). This is a **mandatory PS deliverable** ("Input upload and compatibility checking") with nothing behind it.

**Server side (yours):**

```python
@app.post("/api/upload")
async def upload(file: UploadFile, role: str = "optical"):
    data = await file.read()
    # check raster.read()'s exact signature before wiring — if it takes a
    # path only (not bytes/BytesIO), write to a NamedTemporaryFile first
    # rather than change read()'s contract for this one caller.
    raster = read(tmp_path)
    # run through the SAME Inputs/manifest path the synthetic scenes use —
    # see router.py's Inputs class. No separate, weaker validation branch.
    return manifest_for(raster, role)
```

**The validation must be the same path, not a parallel one** (`TR-017`): whatever `Inputs.manifest()` does for the synthetic scenes — modality/format/compatibility checking, the refusal logic — the uploaded file goes through identically. A judge who uploads something the system can't use should see the same refusal message a synthetic-scene mismatch produces, not a different, weaker error.

**Frontend side** (coordinate with `web/BUILD_PLAN.md` — that plan owns the control, this plan owns the endpoint it calls): an upload control in the workstation, wired to this route.

**Checkpoint: 24 September.** 2–3 days. Start any time — nothing blocks this.

---

## 5. `NFR-14` — unpin `verify.mjs` from a Tailwind class

`web/verify.mjs:121` locates the answer text with `page.locator('p.text-\[13px\]')` — a Tailwind utility class that the `2d55bd3` restyle broke. 26/27 checks pass; the one failure is this, and the underlying feature works (confirmed by the API response the external review quotes directly). Swap the selector for a `data-testid` attribute on the answer element. ~1 hour, low priority, do whenever — it's a false alarm, not a regression, but a green suite that's actually 26/27 is a smaller trust problem worth closing before submission.

---

## 6. The stub-adapter test — paired with Mridul, do this first

Same item as `ml/BUILD_PLAN.md` §6. `Pipeline(adapters=...)` has never been exercised by any of its 13 call sites. Before Mridul disappears into training and you move on to your own list above, spend an hour together writing a test in `tests.py` that constructs `Pipeline(adapters={"vqa": <stub object>, ...})` and asserts `.method == "neural+classical"`. This is the executable version of the interface contract below — agree the dict's key names here, in a passing test, not later by inspecting two implementations that may not agree.

---

## 7. Wire the adapter pack — blocked on Mridul, ~1 day once unblocked

Once `ml/BUILD_PLAN.md`'s `satquery/adapters.py::load_adapter_pack()` exists, change each of the 13 `Pipeline(...)` constructions to pass `adapters=load_adapter_pack(ADAPTER_PATH)` behind a config flag (env var or CLI arg), so the classical-only path stays the default and never breaks if the adapter isn't ready:

- `evaluate.py:326`
- `cli.py:98`
- `cli.py:105`
- `server.py:133`
- nine call sites in `tests.py`

**Checkpoint: 22 September.** This is the one item on this plan genuinely blocked on the other pathway — everything else here can start immediately.

---

## 8. Dataset/model registry — keep it honest as things change

`datasets.py`'s registry (`TR-070`–`TR-073`) reports **real** local state — which datasets actually exist on disk, which model weights actually exist — not an aspirational list. As Mridul downloads VRSBench and produces adapter weights, confirm `datasets.status()` and `datasets.models()` actually detect that new local state rather than continuing to report the pre-adapter picture. This is a "stays correct," not a "build once," item — check it at each checkpoint in §8 of `10_Decision_Record.md`, not only at the end.

---

## 9. API surface — current + this plan's addition

| Method | Route | Returns | Status |
|---|---|---|---|
| GET | `/api/health` | version, engine, whether adapters are loaded | built |
| GET | `/api/scene`, `/api/scene/{layer}.png` | scene metadata / layer image | built |
| GET | `/api/datasets`, `/api/models`, `/api/registry` | registries | built |
| GET | `/api/evaluation` | metrics + ablation, **now with `capability_formula`** (§2) | built, this plan corrects it |
| POST | `/api/query` | full pipeline result | built |
| GET | `/api/runs`, `/api/runs/{id}` | persisted runs | built |
| **POST** | **`/api/upload`** | manifest from an uploaded GeoTIFF/TIFF | **§4 — new** |

---

## 10. Definition of done

- [ ] `_serve_stdlib` serves the built UI without FastAPI installed — verify by uninstalling FastAPI and running `cli serve` cold
- [ ] Ablation row A relabelled; `capability_formula` present in `/api/evaluation`'s response
- [ ] Held-out router set built and reported (`TR-056`)
- [ ] `/api/upload` accepts a real GeoTIFF, runs it through the same manifest/refusal path as synthetic scenes, and a frontend control calls it
- [ ] `verify.mjs` back to 27/27 on a real selector, not a class name
- [ ] Stub-adapter test passing (paired with Mridul, §6)
- [ ] All 13 `Pipeline(...)` call sites wired to `load_adapter_pack()`, gated behind a config flag, once Mridul's pack lands
- [ ] `datasets.py`'s registry reflects real state at every checkpoint, not just at the start

## 11. Explicitly not this plan

Anything inside `specialists.py`'s model logic, anything under `torch`/`transformers`/`peft` — see `ml/BUILD_PLAN.md`. Frontend components and visual design — see `web/BUILD_PLAN.md`, except the API contract it depends on, which is this document's §9.

## 12. Read more

| Document | For |
|---|---|
| `docs/08_TRD.md` | The full atomic requirement list, now with an Owner column — every item above traces to a row there |
| `docs/10_Decision_Record.md` §7–§8 | Cost estimates and dates, kept in sync with this plan |
| `docs/09_External_Review_And_Recommendation.md` §2, §4.1, §5 | What was actually run against the code to find these gaps |
