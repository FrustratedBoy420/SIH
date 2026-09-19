"""VRSBench loading.

The published layout, confirmed by running `--inspect` against the real
download rather than assumed from the paper:

    VRSBench/
      Annotations_train/00002_0000.json     one JSON per image, ~59,000 of them
      Annotations_val/...
      Images_train/00002_0000.png           ~29,600 images
      Images_val/...

Each annotation file is a dict:

    {"caption": "...", "image": "00002_0000.png",
     "objects": [...], "qa_pairs": [{"question": ..., "answer": ...}, ...]}

So the unit on disk is an image, not a split file, and the QA pairs are nested.
Both facts are handled below. Field names are still discovered rather than
hard-coded -- a loader that assumes `record["question"]` fails silently the day
an upload uses `Question`, and that failure looks like a bad model rather than
a bad key.
"""

from __future__ import annotations

import json
import random
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterator

# Candidate field names, most specific first. Extend these rather than rewriting
# the loader.
QUESTION_KEYS = ("question", "Question", "q", "instruction", "text")
ANSWER_KEYS = ("ground_truth", "answer", "Answer", "gt_answer", "gt", "output", "response")
IMAGE_KEYS = ("image", "image_id", "img", "file_name", "filename", "image_path")
TYPE_KEYS = ("type", "question_type", "category", "qa_type")
ID_KEYS = ("question_id", "qid", "id")

# Keys whose value may be a LIST of question/answer pairs for one image.
NESTED_KEYS = ("qa_pairs", "conversations", "questions", "qa", "annotations")

IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg", ".tif", ".tiff", ".bmp"}

# The published archives were zipped on macOS, which writes a parallel
# `__MACOSX/` tree of `._name` resource forks -- 29,608 of them here. They are
# small binary blobs, not JSON, and they shadow every real folder name:
# `__MACOSX/Annotations_val` matches a search for "val" exactly as well as the
# real one does. Excluded at the scan, so nothing downstream has to know they
# existed.
JUNK_DIRS = {"__MACOSX", ".ipynb_checkpoints"}
JUNK_PREFIX = "._"

# Directory-name hints, in the order a split is preferred when none is asked
# for. A baseline is measured on held-out data, so validation beats train.
SPLIT_PREFERENCE = ("val", "test", "eval", "train")


@dataclass(frozen=True)
class VQAItem:
    uid: str
    image: Path
    question: str
    answer: str
    qtype: str


@dataclass
class Scan:
    """One filesystem walk, reused. Three separate rglobs over 89,000 files is
    three times the wait for the same information."""

    root: Path
    images: dict[str, Path] = field(default_factory=dict)
    image_count: int = 0
    json_groups: dict[Path, list[Path]] = field(default_factory=lambda: defaultdict(list))

    @property
    def json_count(self) -> int:
        return sum(len(v) for v in self.json_groups.values())


def is_junk(path: Path) -> bool:
    """macOS archive residue, and notebook checkpoints."""
    return (
        any(part in JUNK_DIRS for part in path.parts)
        or path.name.startswith(JUNK_PREFIX)
    )


def scan(root: Path) -> Scan:
    """Walk the dataset once: index images, group annotation files by folder."""
    result = Scan(root=root)
    seen: set[Path] = set()

    for path in root.rglob("*"):
        if not path.is_file() or is_junk(path):
            continue
        suffix = path.suffix.lower()
        if suffix in IMAGE_SUFFIXES:
            if path not in seen:
                seen.add(path)
                result.image_count += 1
            # Both spellings map to the same file so a reference of either
            # shape resolves. This inflates dict length, never the count above.
            result.images.setdefault(path.name, path)
            result.images.setdefault(path.stem, path)
        elif suffix == ".json" and path.stat().st_size > 0:
            result.json_groups[path.parent].append(path)

    return result


# --------------------------------------------------------------------------
# Locating the download
# --------------------------------------------------------------------------

def find_root(explicit: str | Path | None = None) -> Path:
    """Where VRSBench landed.

    Prefers an explicit path. Otherwise asks the HuggingFace cache where it put
    the snapshot -- `local_files_only` so this never triggers a download as a
    side effect of merely looking.
    """
    if explicit:
        root = Path(explicit).expanduser()
        if not root.is_dir():
            raise FileNotFoundError(f"--data path does not exist: {root}")
        return root

    try:
        from huggingface_hub import snapshot_download

        from . import config

        return Path(
            snapshot_download(
                repo_id=config.VRSBENCH_REPO,
                repo_type="dataset",
                local_files_only=True,
            )
        )
    except Exception as exc:  # not downloaded yet
        raise FileNotFoundError(
            "VRSBench not found in the HuggingFace cache and no --data path "
            "given. Download it first, then re-run:\n\n"
            "    from huggingface_hub import snapshot_download\n"
            "    snapshot_download(repo_id=VRSBENCH_REPO, repo_type=\"dataset\")\n"
        ) from exc


# --------------------------------------------------------------------------
# Inspection -- run this once, before the first real evaluation
# --------------------------------------------------------------------------

def inspect(root: Path, detail: int = 2) -> None:
    """Summarise the layout.

    Deliberately capped. VRSBench ships ~59,000 annotation files; printing each
    one floods the notebook and tells you nothing the first two did not. The
    per-directory counts are the part that matters.
    """
    found = scan(root)

    print(f"root: {found.root}\n")
    print(f"images:          {found.image_count:,}")
    print(f"annotation json: {found.json_count:,}")
    print(f"json folders:    {len(found.json_groups)}\n")

    for folder, files in sorted(found.json_groups.items(), key=lambda kv: -len(kv[1])):
        rel = folder.relative_to(found.root) if folder != found.root else Path(".")
        print(f"--- {rel}/   {len(files):,} files")

        for path in sorted(files)[:detail]:
            try:
                data = json.loads(path.read_text(encoding="utf-8"))
            except Exception as exc:
                print(f"    {path.name}: unreadable: {exc}")
                continue

            records = _as_records(data)
            head = records[0] if records else None
            keys = sorted(head.keys()) if isinstance(head, dict) else "not a dict"
            print(f"    {path.name}  keys={keys}")

            rows = list(_expand(head)) if head else []
            print(f"      qa rows in this file: {len(rows)}")
            if rows:
                text = json.dumps(rows[0], ensure_ascii=False)
                tail = "..." if len(text) > 300 else ""
                print(f"      first row: {text[:300]}{tail}")
        print()

    print(f"split folders detected: {[p.name for p in found.json_groups]}")


def _as_records(data: Any) -> list[Any]:
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        for key in ("data", "records"):
            if isinstance(data.get(key), list):
                return data[key]
        return [data]
    return []


# --------------------------------------------------------------------------
# Loading
# --------------------------------------------------------------------------

def _first(record: dict, keys: tuple[str, ...]) -> Any:
    for key in keys:
        if key in record and record[key] not in (None, ""):
            return record[key]
    return None


def _expand(record: Any) -> Iterator[dict]:
    """One record may hold one QA pair, or many for a single image."""
    if not isinstance(record, dict):
        return

    for key in NESTED_KEYS:
        nested = record.get(key)
        if isinstance(nested, list) and nested:
            shared = {k: v for k, v in record.items() if k != key}
            for item in nested:
                if isinstance(item, dict):
                    yield {**shared, **item}
            return

    if _first(record, QUESTION_KEYS) is not None:
        yield record


def choose_group(found: Scan, split: str = "auto") -> tuple[Path, list[Path]]:
    """Pick which annotation folder to read.

    `split="auto"` prefers validation over train, because a baseline measured
    on training data is not a baseline. An explicit split wins outright.
    """
    if not found.json_groups:
        raise FileNotFoundError(f"no .json under {found.root}")

    groups = dict(found.json_groups)

    if split != "auto":
        matches = {k: v for k, v in groups.items() if split.lower() in k.name.lower()}
        if not matches:
            raise FileNotFoundError(
                f"no folder matching split={split!r}. "
                f"Available: {[p.name for p in groups]}"
            )
        groups = matches
    else:
        for hint in SPLIT_PREFERENCE:
            matches = {k: v for k, v in groups.items() if hint in k.name.lower()}
            if matches:
                groups = matches
                break

    folder = max(groups, key=lambda k: len(groups[k]))
    if len(groups) > 1:
        # Never resolve an ambiguity silently: which split was read decides
        # whether the number means anything, so it gets said out loud.
        others = [str(p.relative_to(found.root)) for p in groups if p != folder]
        print(f"  note: several folders matched; reading {folder.name}/, ignoring {others}")
    return folder, groups[folder]


def load_vqa(
    root: Path,
    json_path: Path | None = None,
    limit: int | None = None,
    split: str = "auto",
    seed: int = 0,
) -> list[VQAItem]:
    """Read a split into a uniform shape.

    The file order is SHUFFLED with a fixed seed before any limit is applied.
    VRSBench filenames are tile-ordered, so taking the alphabetically first N
    would sample a handful of neighbouring locations -- the same geographic
    clustering that `docs/03_Model_Specification.md` section 10 warns makes a
    reported number meaningless. A seeded shuffle keeps the subset both
    representative and reproducible.

    Items whose image cannot be found are dropped and *counted*, not silently
    skipped. A large drop count means the image archive was never extracted,
    and that is worth knowing before a six-hour run rather than after it.
    """
    found = scan(root)

    if json_path:
        folder, files = json_path.parent, [json_path]
    else:
        folder, files = choose_group(found, split)

    files = sorted(files)
    random.Random(seed).shuffle(files)

    items: list[VQAItem] = []
    missing_image = 0
    missing_field = 0
    files_read = 0

    for path in files:
        files_read += 1
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            continue

        for record in _as_records(data):
            for position, row in enumerate(_expand(record)):
                question = _first(row, QUESTION_KEYS)
                answer = _first(row, ANSWER_KEYS)
                image_ref = _first(row, IMAGE_KEYS)

                if question is None or answer is None or image_ref is None:
                    missing_field += 1
                    continue

                image_path = _resolve_image(str(image_ref), found.images, root)
                if image_path is None:
                    missing_image += 1
                    continue

                uid = str(_first(row, ID_KEYS) or f"{path.stem}:{position}")
                items.append(
                    VQAItem(
                        uid=uid,
                        image=image_path,
                        question=str(question).strip(),
                        answer=str(answer).strip(),
                        qtype=str(_first(row, TYPE_KEYS) or "unspecified"),
                    )
                )

        if limit and len(items) >= limit:
            break

    if limit:
        items = items[:limit]

    print(
        f"loaded {len(items):,} VQA items from {folder.name}/  "
        f"({files_read:,} files read, seed={seed}; "
        f"dropped {missing_image:,} no image, {missing_field:,} missing field)"
    )
    if missing_image and not items:
        raise RuntimeError(
            "every item was dropped for a missing image. The image archives are "
            "probably still zipped -- extract them under the dataset root first."
        )
    return items


def _resolve_image(ref: str, index: dict[str, Path], root: Path) -> Path | None:
    name = Path(ref).name
    for key in (name, Path(name).stem, ref):
        if key in index:
            return index[key]
    direct = root / ref
    return direct if direct.is_file() else None
