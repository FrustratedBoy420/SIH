/**
 * The workstation — the instrument (06 §5, bento). Imagery is the largest
 * region; evidence sits above the trace and both are always visible
 * (UI-03, UI-04); the query is a bar along the bottom.
 *
 * Deep links survive a refresh: `?scene=crossmodal|bitemporal|optical|full|none`
 * chooses the built-in scene and `?q=` re-asks a question.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api, asApiError, type DemoKind } from '@/lib/api'
import type { ApiError, Role } from '@/lib/contract'
import { ROLES } from '@/lib/contract'
import { EXAMPLES } from '@/lib/examples'
import { lat, lon } from '@/lib/format'
import { useEngineMode } from '@/lib/hooks'
import { useStation } from '@/lib/store'
import { cn, download } from '@/lib/utils'
import AnswerBlock, { type Remedy } from '@/components/AnswerBlock'
import EvidenceList from '@/components/EvidenceList'
import InputsPanel from '@/components/InputsPanel'
import QueryBar from '@/components/QueryBar'
import SceneRegion, { layerOptions } from '@/components/SceneRegion'
import TracePanel from '@/components/TracePanel'
import { CommandPalette } from '@/components/ui/CommandPalette'
import EngineBadge from '@/components/EngineBadge'

const DEMO_ROLES: Record<DemoKind, Role[]> = {
  crossmodal: ['optical', 'sar'], bitemporal: ['t1', 't2'], optical: ['optical'], sar: ['sar'], full: ['optical', 'sar', 't1', 't2'],
}
const st = useStation.getState

export default function Workstation() {
  const s = useStation()
  const { data: mode } = useEngineMode()
  const preview = mode !== 'http'
  const [params, setParams] = useSearchParams()
  const [query, setQuery] = useState(params.get('q') ?? '')
  const [palette, setPalette] = useState(false)
  const [errors, setErrors] = useState<Partial<Record<Role, ApiError>>>({})
  const [queryError, setQueryError] = useState<ApiError | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const booted = useRef(false)

  /* ------------------------------------------------------------- inputs */

  const loadDemo = useCallback(async (kind: DemoKind) => {
    const roles = DEMO_ROLES[kind]
    roles.forEach((r) => st().setLoading(r, true))
    try {
      const list = await api.demo(kind, 512)
      list.forEach((r) => st().setInput(r.role, r))
      setErrors((e) => { const n = { ...e }; roles.forEach((r) => delete n[r]); return n })
    } finally { roles.forEach((r) => st().setLoading(r, false)) }
  }, [])

  const onFile = useCallback(async (role: Role, f: File) => {
    st().setLoading(role, true)
    setErrors((e) => ({ ...e, [role]: undefined }))
    try {
      const prev = st().inputs[role]
      const r = await api.upload(role, f)
      if (prev && !prev.summary.synthetic) api.remove(prev.local_id)
      st().setInput(role, r)
    } catch (e) {
      setErrors((x) => ({ ...x, [role]: asApiError(e) }))
    } finally { st().setLoading(role, false) }
  }, [])

  const onRemove = useCallback((role: Role) => {
    const r = st().inputs[role]
    if (r && !r.summary.synthetic) api.remove(r.local_id)
    st().setInput(role, undefined)
  }, [])

  // derived layers follow the pairs
  const o = s.inputs.optical?.local_id, sa = s.inputs.sar?.local_id, t1 = s.inputs.t1?.local_id, t2 = s.inputs.t2?.local_id
  useEffect(() => {
    let live = true
    Promise.all([
      o && sa ? api.derived('fusion', o, sa).catch(() => undefined) : undefined,
      t1 && t2 ? api.derived('change', t1, t2).catch(() => undefined) : undefined,
    ]).then(([fusion, change]) => { if (live) st().setDerived({ fusion, change }) })
    return () => { live = false }
  }, [o, sa, t1, t2])

  /* -------------------------------------------------------------- query */

  const run = useCallback(async (q: string) => {
    const text = q.trim()
    setQuery(text)
    setQueryError(null)
    st().setRunning(true)
    const inputs = st().inputs
    const ids: Partial<Record<Role, string>> = {}, local: Partial<Record<Role, string>> = {}
    for (const role of ROLES) { const r = inputs[role]; if (r) { ids[role] = r.raster_id; local[role] = r.local_id } }
    try {
      const r = await api.query({ query: text, inputs: ids, threshold: st().threshold }, local)
      st().setResult(r)
      // pick the plate that shows this answer best
      const pick = r.task === 'temporal_change' ? 'derived:change' : r.task === 'cross_modal' ? 'optical:base' : null
      const opts = layerOptions(st().inputs, st().derived).map((x) => x.value)
      if (pick && opts.includes(pick)) st().setBase(pick)
      else if (!opts.includes(st().base) && opts[0]) st().setBase(opts[0])
      if (st().view !== 'map' && r.evidence.items.some((i) => i.boxes.length) && r.task !== 'cross_modal') st().setView('map')
      setParams((p) => { const n = new URLSearchParams(p); if (text) n.set('q', text); else n.delete('q'); return n }, { replace: true })
    } catch (e) {
      setQueryError(asApiError(e))
    } finally { st().setRunning(false) }
  }, [setParams])

  // first visit: a built-in scene, then any deep-linked question
  useEffect(() => {
    if (booted.current) return
    booted.current = true
    const scene = (params.get('scene') ?? 'crossmodal') as DemoKind | 'none'
    const q = params.get('q')
    const has = Object.keys(st().inputs).length > 0
    const ready = scene !== 'none' && !has ? loadDemo(scene in DEMO_ROLES ? scene as DemoKind : 'crossmodal') : Promise.resolve()
    ready.then(() => { if (q) run(q) })
  }, [loadDemo, run, params])

  // keyboard: ⌘K / Ctrl+K palette, "/" focuses the bar
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette((v) => !v) }
      else if (e.key === '/' && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement)) { e.preventDefault(); input.current?.focus() }
    }
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [])

  /* ---------------------------------------------------------- remedies */

  const result = s.result
  const remedies: Remedy[] = useMemo(() => {
    if (!result) return []
    const again = (kind: DemoKind) => async () => { await loadDemo(kind); run(result.query) }
    if (result.refused) {
      const a = result.answer
      if (/T1|bi-temporal/.test(a)) return [{ label: 'Load the bi-temporal pair and re-ask', run: again('bitemporal') }]
      if (/SAR/.test(a)) return [{ label: 'Load the cross-modal pair and re-ask', run: again('crossmodal') }]
      if (/No imagery|at least one/.test(a)) return [{ label: 'Load the cross-modal pair and re-ask', run: again('crossmodal') }]
      if (/No query/.test(a)) return [{ label: 'Ask RQ-4', run: () => run(EXAMPLES[3].q) }]
    }
    if (result.abstained) return [{ label: 'Ask about the water instead', run: () => run('Highlight the water body') }]
    return []
  }, [result, loadDemo, run])

  /* ------------------------------------------------------------ exports */

  const exportGeojson = async () => {
    if (!result) return
    const href = (await api.exportHrefs(result.run_id)).geojson
    if (href) { location.href = href; return }
    download(`satquery-${result.run_id}.geojson`, JSON.stringify(result.geojson, null, 2), 'application/geo+json')
  }

  /* ------------------------------------------------------------- header */

  // a question asked while a scene is still being read would be refused for want of it
  const reading = Object.values(s.loading).some(Boolean)
  const loaded = ROLES.filter((r) => s.inputs[r])
  const first = loaded.map((r) => s.inputs[r]!)[0]
  const inputsLabel = s.inputs.t1 && s.inputs.t2 ? 'bi-temporal pair' : s.inputs.optical && s.inputs.sar ? 'optical + SAR pair' : loaded.length ? `single · ${loaded[0]}` : 'no imagery'
  // evidence is drawn once the trace has replayed — what the run produced last appears last
  const items = s.replaying ? [] : result?.evidence.items ?? []
  const groups = [...new Set(EXAMPLES.map((e) => e.group))].map((g) => ({
    heading: g,
    items: EXAMPLES.filter((e) => e.group === g).map((e) => ({ id: e.id, label: e.q, meta: `${e.rq ? e.rq + ' · ' : ''}${e.needs}`, onSelect: () => run(e.q) })),
  }))

  return (
    <div className="lg:grid lg:h-[calc(100dvh-89px)] lg:grid-cols-[288px_minmax(0,1fr)_392px] lg:grid-rows-[auto_minmax(0,1fr)_auto]" data-testid="workstation">
      {/* instrument header */}
      <div className="col-span-3 flex flex-wrap items-center gap-x-5 gap-y-1 border-b border-rule bg-surface px-4 py-2 text-[11.5px]">
        <h1 className="font-display text-[17px] font-extrabold tracking-[-0.03em]">Workstation</h1>
        <span className="mono text-ink-2">{inputsLabel}</span>
        {first?.summary.georeferenced && <span className="mono">{lat(first.summary.centre[0])} {lon(first.summary.centre[1])}</span>}
        {first && <span className="mono text-ink-2">{first.summary.crs}</span>}
        {first?.summary.gsd_m ? <span className="mono text-ink-2">GSD {first.summary.gsd_m.toFixed(1)} m</span> : null}
        <span className="mono text-ink-2">{loaded.length} raster{loaded.length === 1 ? '' : 's'}</span>
        <span className="ml-auto flex items-center gap-3">
          <Link to="/results" className="text-accent underline-offset-2 hover:underline">Results →</Link>
          <EngineBadge className="md:hidden" />
        </span>
      </div>

      <aside className="border-rule bg-surface lg:row-start-2 lg:min-h-0 lg:border-r" aria-label="Inputs">
        <InputsPanel inputs={s.inputs} loading={s.loading} errors={errors} onFile={onFile} onRemove={onRemove} onDemo={loadDemo}
          reading={s.replaying && result ? result.manifest.rasters.map((r) => r.role).filter((r): r is Role => !!r && (ROLES as string[]).includes(r)) : []} />
      </aside>

      <section className="h-[64vh] min-h-0 lg:row-start-2 lg:h-auto" aria-label="Scene">
        <SceneRegion items={items} onLoadCrossModal={() => loadDemo('crossmodal')} />
      </section>

      <aside className="flex min-h-0 flex-col border-rule bg-surface lg:row-start-2 lg:border-l" aria-label="Evidence and trace">
        <section className="flex min-h-0 flex-[1.25] flex-col overflow-hidden border-b border-ink" aria-labelledby="ev-h">
          <div className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1.5 px-4 pb-2 pt-3">
            <h2 id="ev-h" className="label !text-ink">Evidence</h2>
            {result && <span className="mono whitespace-nowrap text-[11px] text-ink-2">{result.evidence.passing}/{result.evidence.count} pass · gate {result.evidence.threshold.toFixed(2)}</span>}
            <span className="ml-auto flex shrink-0 gap-1.5 whitespace-nowrap">
              <button type="button" disabled={!result || result.refused} onClick={exportGeojson} data-testid="export-geojson"
                className="mono border border-rule px-2 py-0.5 text-[11px] hover:border-ink disabled:opacity-40">GeoJSON ↓</button>
              {result
                ? <Link to={`/report/${result.run_id}`} data-testid="export-report" className="mono border border-rule px-2 py-0.5 text-[11px] hover:border-ink">Report →</Link>
                : <span className="mono border border-rule px-2 py-0.5 text-[11px] opacity-40">Report →</span>}
            </span>
          </div>
          {/* one scroll container: the answer and its evidence move together */}
          <div className="scroll-thin min-h-[180px] flex-1 overflow-y-auto px-4 pb-3">
            <AnswerBlock result={result} running={s.running} replaying={s.replaying} remedies={remedies} preview={preview} />
            {queryError && <p role="alert" className="mt-2 border-l-2 border-nir px-2 text-[12.5px] text-nir">{queryError.message} <span className="text-ink-2">{queryError.remedy}</span></p>}
            <div className={cn('mt-2', s.replaying && 'hidden')}>
              <EvidenceList items={items} threshold={result?.evidence.threshold ?? s.threshold} selected={s.selected} onSelect={s.select} runKey={result?.run_id ?? ''} />
            </div>
          </div>
        </section>
        <section className="flex min-h-0 flex-1 flex-col" aria-labelledby="tr-h">
          <div className="flex items-center gap-2 px-4 pb-1 pt-3">
            <h2 id="tr-h" className="label !text-ink">Execution trace</h2>
            {result && <span className="mono ml-auto text-[10.5px] text-ink-2">router rules · engine {result.engine}</span>}
          </div>
          <div className="scroll-thin min-h-[160px] flex-1 overflow-y-auto px-4 pb-3">
            <TracePanel steps={result?.trace ?? []} runKey={result?.run_id ?? ''} />
          </div>
        </section>
      </aside>

      <div className="sticky bottom-8 z-40 col-span-3 lg:static">
        <QueryBar ref={input} value={query} onChange={setQuery} onSubmit={() => run(query)} running={s.running || s.replaying || reading} busy={reading && !s.running ? 'Reading inputs…' : undefined}
          threshold={s.threshold} onThreshold={s.setThreshold} onPalette={() => setPalette(true)} inputsLabel={inputsLabel} />
      </div>

      <CommandPalette open={palette} onOpenChange={setPalette} groups={groups} />
    </div>
  )
}
