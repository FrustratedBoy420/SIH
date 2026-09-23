# `models/` — the adaptation work

Separate from `satquery/` on purpose. The classical pipeline runs on any machine
with no GPU and no `torch`; everything here needs both. Keeping them apart means
a broken CUDA install cannot take down the demo.

```
models/
├── MANIFEST.md          measured results — one row per pack, numbers only
├── requirements.txt
├── eval_baseline.py     the BEFORE number  ← start here
└── common/
    ├── config.py        base model ids, precision, published anchors
    ├── vrsbench.py      dataset discovery and loading
    └── metrics.py       VQA accuracy, per-category
```

---

## Why the baseline comes first

The problem statement's requirement 1 asks for evidence of *remote-sensing
adaptation*. A trained model reporting 58 % evidences nothing by itself — 58 %
of what? The evidence is the gain:

```
zero-shot   41 %
adapted     58 %
gain       +17 points     ← this is the deliverable
```

Measuring the "before" needs **no training and almost no GPU quota**. It is the
cheapest step in the project and every downstream number depends on it.
`docs/10_Decision_Record.md` §8 makes it the gate the schedule turns on.

---

## Kaggle par kaise chalayein

### 1. Notebook setup (ek baar)

- `kaggle.com/settings` → **Phone Verification** karo, warna Internet toggle
  greyed out rahega
- `Code` → `New Notebook`
- Right panel: **Accelerator** = `GPU T4 x2`, **Internet** = `On`,
  **Persistence** = `Files only`

### 2. Internet sach mein on hai ya nahi — check karo

```python
!curl -sI https://huggingface.co | head -1
```

`HTTP/2 200` aaye toh theek. Kuch na aaye toh abhi off hai — guess mat karo,
internet off hone par download **hang** hota hai, error nahi deta.

### 3. Dataset download (~10 min Kaggle par, 3 ghante aapke laptop par)

```python
!pip install -q transformers accelerate bitsandbytes huggingface_hub

from huggingface_hub import snapshot_download
path = snapshot_download(repo_id="xiang709/VRSBench", repo_type="dataset")
print(path)
```

`local_dir=` **mat** dena. `/kaggle/working` sirf 20 GB ka hai aur wo checkpoints
ke liye chahiye. Default HuggingFace cache bade disk par hai.

### 4. Ye repo notebook mein laao

```python
!git clone https://github.com/<your-user>/<this-repo>.git repo
%cd repo
```

### 5. Pehle dekho dataset mein hai kya (1 minute)

```python
!python models/eval_baseline.py --inspect
```

Ye per-folder summary deta hai (har file nahi — VRSBench mein ~59,000
annotation files hain, sab print karne se notebook bhar jaata hai).

Asli layout, jo `--inspect` chalane par confirm hua:

```
VRSBench/
  Annotations_train/00002_0000.json    ek JSON per image, ~59,000 files
  Annotations_val/...
  Images_train/00002_0000.png          ~29,600 images
  Images_val/...
```

Har annotation file aisi hai:

```json
{"caption": "...", "image": "00002_0000.png",
 "objects": [...], "qa_pairs": [{"question": "...", "answer": "...", "type": "..."}]}
```

Loader field names discover karta hai, assume nahi — agar koi key handle na ho
toh `common/vrsbench.py` ke top par tuple mein add kar dena. Bas wahi ek edit.

### 6. Smoke test — 20 items (5 minute)

```python
!python models/eval_baseline.py --limit 20 --load-in-4bit
```

Poora raasta chal raha hai ya nahi, ye confirm karta hai: model load, image
read, prompt, generate, score. **Iske bina 6 ghante ka run mat shuru karna.**

### 7. Asli run

```python
!python models/eval_baseline.py --base qwen2vl  --limit 2000 --load-in-4bit --resume
!python models/eval_baseline.py --base geochat  --limit 2000 --load-in-4bit --resume
```

Dono base models par chalao. `docs/10_Decision_Record.md` §5 kehta hai: maano
mat, naapo. GeoChat pehle se remote-sensing adapted hai — score zyada, par gain
dikhane ko kam bachta hai. Qwen2-VL generic se shuru hota hai. Requirement 1
gain se evidence hoti hai, isliye generic base behtar submission ho sakta hai
kam absolute score ke bawajood.

### 8. Session mar jaye toh

Kaggle 9 ghante mein session band kar deta hai. Results har item ke baad JSONL
mein likhe ja rahe hain, isliye:

```python
!python models/eval_baseline.py --base qwen2vl --limit 2000 --load-in-4bit --resume
```

Wahi command dobara. `--resume` jo ho chuka hai use skip kar dega.

---

## Results kahan jaate hain

```
/kaggle/working/baseline/
├── qwen2vl_predictions.jsonl    har item: question, truth, prediction, correct
└── qwen2vl_summary.json         overall + per-category accuracy
```

`_summary.json` download karo (chhoti file hai) aur number `MANIFEST.md` mein
likho — **jab wo naapa gaya hai tab, yaad karke baad mein nahi.**

---

## Training — `train_rs_vqa.py`

Baseline naap lene ke **baad** hi. Zero-shot number pehle `MANIFEST.md` mein
hona chahiye, warna gain kis se compare karoge?

### Ladder — ek saath poora mat chalao

**Measured 18 September 2026** on a Kaggle T4, 4-bit weights, gradient
checkpointing, `--max-pixels 512*512`: **2.0 sec per sample** (63.8 s per
optimizer step at `--grad-accum 32`). Budget samples, not epochs:

| Rung | Command | Time | Sawaal |
|---|---|---|---|
| 1 | `--limit 4000 --epochs 1` | ~2.2 h | gain aata bhi hai ya nahi? |
| 2 | `--limit 12000 --epochs 1` | ~6.7 h | **ek Kaggle session mein fit** |
| 3 | `--limit 12000 --epochs 2` | ~13.3 h | do session, `--resume` zaroori |

Pehla andaza 1.0–1.5 s/sample tha; measurement ne 2.0 nikala, aur ladder us
hisaab se dobara likhi gayi. Guess ki jagah naapa hua number.

**Rung 1 pehle chalao aur naapo.** Jo run 4,000 samples pe gain nahi deta, wo
40,000 pe bhi nahi dega — aur ye pata karne mein 1.5 ghanta lagega, poora
hafte ka quota nahi.

```python
!python models/train_rs_vqa.py --data /kaggle/working/VRSBench \
    --limit 4000 --epochs 1
```

Session mar jaye toh wahi command `--resume` ke saath:

```python
!python models/train_rs_vqa.py --data /kaggle/working/VRSBench \
    --limit 4000 --epochs 1 --resume
```

### Do safety features

- **Wall-clock guard** (`--max-hours`, default 8): Kaggle 9 ghante pe session
  kaat deta hai aur tab tak ka kaam chala jaata hai. Ye script khud ruk kar
  **save** karti hai uske pehle.
- **Split guard**: `--split val` dene par script **mana kar deti hai**. Jis
  split pe baseline naapa gaya usi pe train karna gain ko bekaar kar deta hai.

### Training ke baad — "after" number

Bilkul wahi command jo baseline ke liye tha, bas `--adapter` add:

```python
!python models/eval_baseline.py --data /kaggle/working/VRSBench \
    --limit 2000 --load-in-4bit \
    --adapter /kaggle/working/adapters/qwen2vl_rs_vqa/adapter
```

`--limit`, `--split`, `--seed` **wahi rakhna** jo baseline mein the. Inme se ek
bhi badla toh dono numbers ka farak adaptation nahi, subset ban jaata hai.

Adapted results alag file mein jaate hain — baseline overwrite nahi hota.

## M1 ko laptop par chalana — `precompute_m1.py`

Laptop par 4 GB VRAM hai, M1 (4-bit 7B) ko ~6 GB chahiye. Isliye demo ke
sawaalon ke jawab Kaggle par **pehle se** nikaal lo — wahi code jo server GPU
par chalata (`satquery.runtime.M1Live`), toh jawab bilkul wahi hote hain.

```python
# Kaggle par (GPU on), repo ke 167/ folder se
!python models/precompute_m1.py \
    --adapter-dir /kaggle/working/adapters/qwen2vl_rung2/adapter \
    --out /kaggle/working/precomputed.jsonl
```

Script demo scenes aur un sawaalon par chalti hai jo router sach mein `rs_vqa`
(M1) ko bhejta hai (abhi 12 mein se 11). Apni GeoTIFFs bhi de sakte ho:
`--images a.tif b.tif`.

Phir laptop par:

```
copy precomputed.jsonl models\adapters\m1-rs-vqa\
python models/precompute_m1.py --check models/adapters/m1-rs-vqa/precomputed.jsonl
```

`--check` ko GPU nahi chahiye. Wo batata hai kaunse demo jawab is machine par
milenge (`hit`) aur kaunse classical par girenge (`MISS`). Key image ke exact
pixels ka hash hai; agar do machines scene ko ek grey-level bhi alag render
karein, toh wo jawab miss hoga — aur system classical path se jawab dega aur
trace mein wajah likhega, galat image ka jawab nahi dega.

## Flags

| Flag | Kya karta hai |
|---|---|
| `--inspect` | dataset ka layout print karke exit — pehli baar ye chalao |
| `--base` | `qwen2vl`, `qwen2vl-2b`, `geochat`, `llava`, ya koi bhi HF id |
| `--limit N` | sirf N items — smoke test ke liye |
| `--split` | `auto` (val prefer karta hai), ya `train` / `val` / `test` |
| `--seed` | subset shuffle seed. Runs ke beech **same rakhna** |
| `--load-in-4bit` | 4-bit weights, kam VRAM |
| `--dtype` | Kaggle par `fp16` (default). T4/P100 bf16 support nahi karte |
| `--resume` | JSONL mein jo ho chuka hai wo skip karo |
| `--data PATH` | agar dataset HF cache mein nahi hai |

---

## Do cheezein jo galat samajhi jaati hain

**Lenient accuracy ko kabhi quote mat karna.** Script do numbers deta hai. Exact
match headline hai — published anchors (GeoChat 60.6 %, GPT-4V 65.6 %) usi
tarah naape gaye hain. Lenient sirf diagnostic hai: agar wo exact se bahut zyada
hai, matlab model sahi jawab de raha hai par lamba bol raha hai, aur ye prompting
ki problem hai, model ki nahi.

**40 % grounding failure nahi hai.** Specification §5: *"Teams abandon this
problem because they hit 40 % and assume failure. They have not failed."* VQA ke
liye realistic band 55–62 % hai. Isse upar target rakhna ek acche result ko
failure jaisa dikha deta hai.
