# reference/

## `router_heldout.jsonl` — the held-out router set (RTR-07)

The router's accuracy is only meaningful on questions written **without
having read its rules** (`satquery/router.py`). Whoever writes this file must
not open that file, the in-sample cases in `satquery/evaluate.py`
(`ROUTER_CASES`), or the example queries in the UI first. Once the file
exists, do not edit the router to fix what it gets wrong on it — that turns
the measurement back into development feedback. Keep it out of any training
data (M5).

Target: **at least 200 lines**, spread across the four tasks, refusal bait,
two-tool questions and implicit-temporal phrasing (RQ-5 style: "has it grown?"
with no date words). One JSON object per line; `#` lines are comments:

```jsonl
{"query": "Where is the river in this picture?", "task": "grounding"}
{"query": "Tell me what kind of land this is.", "task": "single_vqa"}
{"query": "Is there more housing now than before?", "task": "temporal_change"}
{"query": "Combine the radar and the photo to find buildings under the clouds.", "task": "cross_modal"}
{"query": "Write me a poem about the sea.", "task": "unknown"}
```

Labels: `single_vqa`, `grounding`, `temporal_change`, `cross_modal`, `unknown`
(for questions the system should not route to any tool).

Run it:

```bash
satquery heldout                 # accuracy, confusion matrix, every miss
```

`/api/evaluation` and the Results page report the same figure; with no file
they report it as not measured, never as a number.
