/** Formatting for values. Every value is set in mono with tabular figures — these only decide the digits. */

export const PLACEHOLDER = 'XX.X'

export function num(v: number | null | undefined, d = 1): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return PLACEHOLDER
  return v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })
}

export function lat(v: number, d = 4) { return `${Math.abs(v).toFixed(d)}°${v >= 0 ? 'N' : 'S'}` }
export function lon(v: number, d = 4) { return `${Math.abs(v).toFixed(d)}°${v >= 0 ? 'E' : 'W'}` }

/** "2024-01-15T05:42:00Z" → "2024-01-15 05:42Z" */
export function utc(iso: string) {
  if (!iso) return '—'
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(iso)
  return m ? `${m[1]} ${m[2]}Z` : iso
}

export function ha(v: number) {
  return v >= 100 ? `${num(v, 0)} ha` : `${num(v, 2)} ha`
}

export function db(v: number | null) { return v === null ? '— dB' : `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(1)} dB` }

export function ms(v: number) { return v >= 1000 ? `${(v / 1000).toFixed(2)} s` : `${v.toFixed(v < 10 ? 1 : 0)} ms` }

export const TASK_LABEL: Record<string, string> = {
  single_vqa: 'single-image VQA',
  grounding: 'grounding',
  temporal_change: 'change analysis',
  cross_modal: 'cross-modal',
  unknown: 'unclassified',
}

export const MODALITY_LABEL: Record<string, string> = {
  optical: 'optical', sar: 'SAR', fused: 'fused', temporal: 'temporal', derived: 'derived',
}

/** A modality's identity mark. Used as a dot or a rule, never as a fill. */
export const MODALITY_VAR: Record<string, string> = {
  optical: 'var(--color-optical)', sar: 'var(--color-sar)', fused: 'var(--color-fusion)',
  temporal: 'var(--color-nir)', derived: 'var(--color-ink-3)',
}

export const ROLE_LABEL: Record<string, string> = { optical: 'Optical', sar: 'SAR', t1: 'T1 · before', t2: 'T2 · after' }
