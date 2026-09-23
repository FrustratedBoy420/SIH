/**
 * Datasets and models — the registry from `satquery/datasets.py`, and a
 * snapshot of the local state for when the API (which reads it from disk) is
 * not running. The snapshot says where it came from; it is never presented as
 * live.
 */

import type { DatasetEntry, ModelEntry } from '@/lib/contract'

export const STATE_SNAPSHOT =
  'Snapshot of the repository checkout, 23 Sep 2026: no corpus is staged. The M1 pack manifest is in models/adapters/m1-rs-vqa/ — trained and measured (zero-shot 0.527 → adapted 0.660) — but its weights are gitignored, so a checkout does not carry them. The API reads this live from disk when it runs.'

type Base = Omit<DatasetEntry, 'status' | 'present' | 'missing' | 'path'> & { expect: string[]; local_dir: string }

const DATASETS: Base[] = [
  {
    key: 'bigearthnet', name: 'BigEarthNet.txt', role: 'training',
    purpose: 'The dataset the PS names for remote-sensing adaptation. Its imagery is a separate ~155 GB set, so it follows M1 rather than feeding it — VRSBench trains M1 (Decision Record §4).',
    requirement: 'R1 remote-sensing adaptation', serves: ['M4 SAR encoder (Build)', 'post-M1 adaptation'],
    size: 'annotations ~467 MB · imagery ~155 GB, separate',
    records: '464,044 co-registered Sentinel-1/Sentinel-2 pairs · ~9.6 M text annotations',
    source: 'https://txt.bigearth.net/', huggingface: 'BIFOLD-BigEarthNetv2-0/BigEarthNet.txt', paper: 'arXiv:2603.29630',
    licence: 'CDLA-Permissive-1.0', split_policy: 'geographic, tile level — ADR-006',
    notes: '464,044 is the number of image PAIRS; ~9.6 M is the number of TEXT ANNOTATIONS (DAT-01).',
    local_dir: 'data/bigearthnet', expect: ['metadata.parquet', 'annotations.jsonl'],
  },
  {
    key: 'vrsbench', name: 'VRSBench', role: 'benchmark',
    purpose: 'M1 training corpus and the single-image benchmark: VQA and grounding. Also chooses the base model by zero-shot score.',
    requirement: 'R1 + R2 single-image baseline', serves: ['M0 base selection', 'M1 rs_vqa', 'M2 grounding'],
    size: '12.5 GB', records: '29,614 images · 123,221 VQA pairs · 52,472 object references',
    source: 'https://github.com/lx709/VRSBench', huggingface: 'xiang709/VRSBench', paper: 'arXiv:2406.12384 · NeurIPS 2024',
    licence: 'CC-BY-4.0', split_policy: 'official split — never resplit',
    notes: 'Anchors: GeoChat 40.8 % VQA zero-shot → 60.6 % fine-tuned; grounding Acc@0.5 39.6 %.',
    local_dir: 'data/vrsbench', expect: ['VRSBench_EVAL_vqa.json', 'images'],
  },
  {
    key: 'rsvqa', name: 'RSVQA (LR + HR)', role: 'benchmark',
    purpose: 'Baseline VQA benchmark, reported per question category rather than as one mean.',
    requirement: 'R2 single-image baseline', serves: ['M1 rs_vqa'],
    size: 'LR small · HR larger', records: 'LR: 772 images at 256×256, 10 m · 77,232 QA pairs',
    source: 'https://rsvqa.sylvainlobry.com/', paper: 'arXiv:2003.07333', licence: 'see project page',
    split_policy: 'official tile-level split', notes: 'Host timed out when last checked (09 §3).',
    local_dir: 'data/rsvqa', expect: ['USGS_split_train_questions.json', 'Images_LR'],
  },
  {
    key: 'cdvqa', name: 'CDVQA', role: 'benchmark',
    purpose: 'Change-based question answering — the only public benchmark that targets it directly.',
    requirement: 'R3 multi-image change analysis', serves: ['M3 change_vqa'],
    size: '~3k pairs', records: '2,968 bi-temporal pairs at 512×512 · 122,000+ QA pairs',
    source: 'https://github.com/YZHJessica/CDVQA', paper: 'arXiv:2112.06343', licence: 'see repository',
    split_policy: 'official split', notes: 'A seasonal crop change and a construction project produce similar pixel deltas; the semantic layer separates them.',
    local_dir: 'data/cdvqa', expect: ['Images', 'questions.json'],
  },
  {
    key: 'isro_sac', name: 'ISRO/SAC evaluation set', role: 'hidden',
    purpose: 'The set the system is scored on. Cannot be obtained, tuned against, or inspected.',
    requirement: 'Final scoring', serves: ['everything'],
    size: 'unknown', records: 'pre-georeferenced, co-registered Cartosat-2S optical + RISAT SAR pairs; annotations undisclosed',
    source: 'not public', licence: 'n/a', split_policy: 'n/a',
    notes: 'Indian, sub-metre and unseen: the objective is robustness, not benchmark peak. Co-registration is done — validate it, do not solve it.',
    local_dir: '', expect: [],
  },
]

export function datasetsSnapshot(): DatasetEntry[] {
  return DATASETS.map(({ expect, local_dir, ...d }) => ({
    ...d,
    status: d.role === 'hidden' ? 'unavailable' : 'absent',
    present: [],
    missing: d.role === 'hidden' ? [] : expect,
    path: local_dir || undefined,
  }))
}

export function modelsSnapshot(): ModelEntry[] {
  return [
    { id: 'M0', name: 'Base VLM', kind: 'frozen', trained: false, datasets: [], candidates: ['MBZUAI/geochat-7B', 'Qwen/Qwen2-VL-7B-Instruct'], note: 'Chosen by zero-shot VRSBench score, not reputation — ADR-010. ~15 GB fp16, ~6 GB at 4-bit.', weights_present: null, status: 'frozen' },
    { id: 'M1', name: 'RS-adapted VQA', kind: 'lora', adapter: 'adapter_A_rs_general', trained: true, datasets: ['vrsbench'], requirement: 'R1 + R2', note: 'The mandatory adaptation. QLoRA on Qwen2-VL-7B, 12,000 VRSBench samples: zero-shot 0.527 → adapted 0.660, +13.3 points on 2,000 held-out items (train/val overlap counted: 0). Not yet serving — the inference path is open.', weights_present: false, weights_path: 'models/adapters/m1-rs-vqa', status: 'trained' },
    { id: 'M2', name: 'Grounding', kind: 'lora', adapter: 'adapter_B_grounding', trained: true, datasets: ['vrsbench'], requirement: 'R2', note: 'Chosen over captioning — ADR-002. Target Acc@0.5 30–45 %. Build phase.', weights_present: false, weights_path: 'adapters/adapter_B_grounding', status: 'not trained' },
    { id: 'M3', name: 'Change / change-VQA', kind: 'lora', adapter: 'adapter_C_change', trained: true, datasets: ['cdvqa'], requirement: 'R3', note: 'Siamese encoding plus a difference head. Build phase.', weights_present: false, weights_path: 'adapters/adapter_C_change', status: 'not trained' },
    { id: 'M4', name: 'SAR encoder + fusion', kind: 'separate', adapter: 'fusion_late_v0', trained: true, datasets: ['bigearthnet'], requirement: 'R4', note: 'Outside the shared base — backscatter is not reflectance (ADR-003). Late fusion (ADR-005). Build phase.', weights_present: false, weights_path: 'adapters/fusion_late_v0', status: 'not trained' },
    { id: 'M5', name: 'Router', kind: 'rules', trained: false, datasets: ['synthetic'], requirement: 'R5', note: 'Plain Python rules today; a small classifier on 5–20k paraphrases replaces them only if it wins on the held-out set — ADR-004.', weights_present: null, status: 'rule-based' },
    { id: 'M6', name: 'Answer generator', kind: 'frozen', trained: false, datasets: [], requirement: 'output layer', note: 'Templates today. Receives evidence records, never pixels — ADR-007.', weights_present: null, status: 'frozen' },
  ]
}
