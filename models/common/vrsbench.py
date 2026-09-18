"""VRSBench loading, written to survive not knowing the exact file layout.

The repository `xiang709/VRSBench` publishes its VQA split as JSON plus image
archives. The precise filenames and field names are not pinned here on purpose:
a loader that hard-codes `record["question"]` fails silently the day the upload
uses `Question`, and that failure looks like a bad model rather than a bad key.

So this module *discovers* instead of assuming. `inspect()` prints what is
actually on disk — run it once, read the output, and the loader below will
almost certainly already handle it. If it does not, add the key to the tuples
at the top of this file; that is the only edit needed.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterator

# Candidate field names, most specific first. Extend these rather than rewriting
# the loader.
QUESTION_KEYS = ("question", "Question", "q", "instruction", "text")
ANSWER_KEYS = ("ground_truth", "answer", "Answer", "gt_answer", "gt", "output", "response")
IMAGE_KEYS = ("image_id", "image", "img", "file_name", "filename", "image_path")
TYPE_KEYS = ("type", "question_type", "category", "qa_type")
ID_KEYS = ("question_id", "qid", "id")

# Keys whose value may be a LIST of question/answer pairs for one image.
NESTED_KEYS = ("qa_pairs", "conversations", "questions", "qa", "annotations")

IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg", ".tif", ".tiff", ".bmp"}


@dataclass(frozen=True)
class VQAItem:
    uid: str
    image: Path
    question: str
    answer: str
    qtype: str


# --------------------------------------------------------------------------
# Locating the download
# --------------------------------------------------------------------------

def find_root(explicit: str | Path | None = None) -> Path:
    """Where VRSBench landed.

    Prefers an explicit path. Otherwise asks the HuggingFace cache where it put
    the snapshot — `local_files_only` so this never triggers a download as a
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


def json_files(root: Path) -> list[Path]:
    return sorted(p for p in root.rglob("*.json") if p.stat().st_size > 0)


# --------------------------------------------------------------------------
# Inspection — run this before the first real evaluation
# --------------------------------------------------------------------------

def inspect(root: Path, sample: int = 1) -> None:
    """Print what is on disk. Cheap, and it removes every guess downstream."""
    print(f"root: {root}\n")

    images = index_images(root)
    print(f"images indexed: {len(images):,}")

    files = json_files(root)
    print(f"json files: {len(files)}\n")

    for path in files:
        size_mb = path.stat().st_size / 1e6
        print(f"--- {path.relative_to(root)}  ({size_mb:,.1f} MB)")
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except Exception as exc:
            print(f"    unreadable: {exc}\n")
            continue

        records = _as_records(data)
        print(f"    top-level: {type(data).__name__}, records: {len(records):,}")
        if records:
            head = records[0]
            keys = sorted(head.keys()) if isinstance(head, dict) else "not a dict"
            print(f"    keys: {keys}")
            for record in records[:sample]:
                text = json.dumps(record, ensure_ascii=False)
                tail = "..." if len(text) > 400 else ""
                print(f"    sample: {text[:400]}{tail}")
        print()


def _as_records(data: Any) -> list[Any]:
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        for key in ("data", "annotations", "questions", "records"):
            if isinstance(data.get(key), list):
                return data[key]
        return [data]
    return []


# --------------------------------------------------------------------------
# Image lookup
# --------------------------------------------------------------------------

def index_images(root: Path) -> dict[str, Path]:
    """Filename and stem to path, built once.

    A per-item `rglob` over 29,614 images turns a one-hour evaluation into a
    much longer one for no reason.
    """
    index: dict[str, Path] = {}
    for path in root.rglob("*"):
        if path.suffix.lower() in IMAGE_SUFFIXES and path.is_file():
            index.setdefault(path.name, path)
            index.setdefault(path.stem, path)
    return index


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

    if _first(record, QUESTION_KEYS) is not None:
        yield record
        return

    for key in NESTED_KEYS:
        nested = record.get(key)
        if isinstance(nested, list):
            shared = {k: v for k, v in record.items() if k != key}
            for item in nested:
                if isinstance(item, dict):
                    yield {**shared, **item}
            return


def pick_vqa_file(root: Path, prefer: str = "eval") -> Path:
    """Choose the VQA split file.

    `prefer` biases towards the evaluation split, which is what a baseline is
    measured on. The training split has the same shape and loads identically.
    """
    files = json_files(root)
    if not files:
        raise FileNotFoundError(f"no .json under {root}")

    def score(path: Path) -> tuple[bool, bool, int]:
        name = path.name.lower()
        return (
            "vqa" in name,
            prefer in name or any(t in name for t in ("test", "val")),
            -path.stat().st_size,  # tie-break towards the smaller eval file
        )

    best = max(files, key=score)
    if "vqa" not in best.name.lower():
        raise FileNotFoundError(
            f"no file with 'vqa' in its name under {root}. Run --inspect and "
            f"pass the right one with --json. Found: {[p.name for p in files]}"
        )
    return best


def load_vqa(
    root: Path,
    json_path: Path | None = None,
    limit: int | None = None,
) -> list[VQAItem]:
    """Read the VQA split into a uniform shape.

    Items whose image cannot be found are dropped and *counted*, not silently
    skipped. A large drop count means the image archive was never extracted,
    and that is worth knowing before a six-hour run rather than after it.
    """
    path = json_path or pick_vqa_file(root)
    data = json.loads(path.read_text(encoding="utf-8"))
    images = index_images(root)

    items: list[VQAItem] = []
    missing_image = 0
    missing_field = 0

    for index, record in enumerate(_as_records(data)):
        for row in _expand(record):
            question = _first(row, QUESTION_KEYS)
            answer = _first(row, ANSWER_KEYS)
            image_ref = _first(row, IMAGE_KEYS)

            if question is None or answer is None or image_ref is None:
                missing_field += 1
                continue

            image_path = _resolve_image(str(image_ref), images, root)
            if image_path is None:
                missing_image += 1
                continue

            uid = str(_first(row, ID_KEYS) or f"{path.stem}:{index}:{len(items)}")
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
        if limit and len(items) >= limit:
            break

    print(
        f"loaded {len(items):,} VQA items from {path.name}  "
        f"(dropped: {missing_image:,} no image, {missing_field:,} missing field)"
    )
    if missing_image and not items:
        raise RuntimeError(
            "every item was dropped for a missing image. The image archives are "
            "probably still zipped — extract them under the dataset root first."
        )
    return items


def _resolve_image(ref: str, index: dict[str, Path], root: Path) -> Path | None:
    name = Path(ref).name
    for key in (name, Path(name).stem, ref):
        if key in index:
            return index[key]
    direct = root / ref
    return direct if direct.is_file() else None
