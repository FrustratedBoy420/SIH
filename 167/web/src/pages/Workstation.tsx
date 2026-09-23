/**
 * The workstation. Framed cards on a map table: imagery is the largest
 * region; evidence sits above the trace and both are always visible
 * (UI-03, UI-04); the query is a bar floating under the scene.
 *
 * Deep links survive a refresh: `?scene=crossmodal|bitemporal|optical|full|none`
 * chooses the built-in scene and `?q=` re-asks a question.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api, asApiError, type DemoKind, type M1Questions } from '@/lib/api'
import type { ApiError, Role } from '@/lib/contract'
import { ROLES } from '@/lib/contract'
import { EXAMPLES, type Scenario } from '@/lib/examples'
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
  const [m1q, setM1q] = useState<M1Questions | null>(null)
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
      if (prev && !prev.summary.synthetic && !prev.summary.builtin) api.remove(prev.local_id)
      // The first file of your own replaces the demo, not one slot of it: an
      // uploaded photo beside the demo SAR read as an "optical + SAR pair"
      // that nobody chose. Later uploads keep what is already yours.
      const others = Object.entries(st().inputs).filter(([k, v]) => k !== role && v)
      if (others.length && others.every(([, v]) => v!.summary.synthetic || v!.summary.builtin)) {
        others.forEach(([k]) => st().setInput(k as Role, undefined))
      }
      st().setInput(role, r)
    } catch (e) {
      setErrors((x) => ({ ...x, [role]: asApiError(e) }))
    } finally { st().setLoading(role, false) }
  }, [])

  const onRemove = useCallback((role: Role) => {
    const r = st().inputs[role]
    if (r && !r.summary.synthetic && !r.summary.builtin) api.remove(r.local_id)
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

  // A scenario is a clean slate: roles its scene does not use are cleared, so
  // a leftover T1/T2 cannot change what the router sees.
  const scenario = useCallback(async (sc: Scenario) => {
    ROLES.filter((r) => !DEMO_ROLES[sc.scene].includes(r)).forEach((r) => onRemove(r))
    await loadDemo(sc.scene)
    run(sc.q)
  }, [loadDemo, onRemove, run])

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
  const opticalId = s.inputs.optical?.raster_id
  const inputsLabel = s.inputs.t1 && s.inputs.t2 ? 'bi-temporal pair' : s.inputs.optical && s.inputs.sar ? 'optical + SAR pair' : loaded.length ? `single · ${loaded[0]}` : 'no imagery'
  // evidence is drawn once the trace has replayed — what the run produced last appears last
  const items = s.replaying ? [] : result?.evidence.items ?? []
  const exampleGroups = [...new Set(EXAMPLES.map((e) => e.group))].map((g) => ({
    heading: g,
    items: EXAMPLES.filter((e) => e.group === g).map((e) => ({ id: e.id, label: e.q, meta: `${e.rq ? e.rq + ' · ' : ''}${e.needs}`, onSelect: () => run(e.q) })),
  }))
  // Questions M1 can already answer on this exact image come first. Without
  // them, a presenter with a real photo had to type questions from a sheet,
  // word for word, to reach the model at all.
  const groups = m1q?.questions.length
    ? [{
        heading: 'M1 has answers for this image',
        items: m1q.questions.map((q, i) => ({
          id: `m1-${i}`, label: q.question,
          meta: q.withheld ? 'M1 unsure · below the gate, will not be used' : 'answered by M1 · pre-computed',
          onSelect: () => run(q.question),
        })),
      }, ...exampleGroups]
    : exampleGroups

  // the imagery evidence thumbnails are cropped from: the after-date for change, else the first plate
  const plateRaster = result?.task === 'temporal_change' ? s.inputs.t2 ?? first : first
  const plate = plateRaster ? { src: plateRaster.layers.base, width: plateRaster.summary.width, height: plateRaster.summary.height } : undefined
  const card = 'frame bg-surface'

  // Ask the API which questions M1 holds answers for whenever the optical
  // image changes. A failure only means no suggestions — never a broken page.
  useEffect(() => {
    let live = true
    if (!opticalId) { setM1q(null); return }
    api.m1Questions(opticalId).then((r) => { if (live) setM1q(r) }).catch(() => { if (live) setM1q(null) })
    return () => { live = false }
  }, [opticalId])

  return (
    <div className="bg-surface-2 lg:grid lg:h-[calc(100dvh-var(--chrome))] lg:grid-cols-[292px_minmax(0,1fr)_404px] lg:grid-rows-[auto_minmax(0,1fr)_auto] lg:gap-3 lg:p-3" data-testid="workstation">
      {/* scene header */}
      <div className={cn(card, 'col-span-3 flex flex-wrap items-center gap-x-5 gap-y-1 px-4 py-2.5 text-[12px]')}>
        <h1 className="t-display text-[20px]">Workstation</h1>
        <span className="bg-sun px-2 py-0.5 text-[12.5px] font-medium">{inputsLabel}</span>
        {first?.summary.georeferenced && <span className="mono">{lat(first.summary.centre[0])} {lon(first.summary.centre[1])}</span>}
        {first && <span className="mono text-ink-2">{first.summary.crs}</span>}
        {first?.summary.gsd_m ? <span className="mono text-ink-2">GSD {first.summary.gsd_m.toFixed(1)} m</span> : null}
        <span className="mono text-ink-2">{loaded.length} raster{loaded.length === 1 ? '' : 's'}</span>
        <span className="ml-auto flex items-center gap-3">
          <Link to="/results" className="text-[13.5px] font-medium underline decoration-sun decoration-2 underline-offset-4 hover:decoration-ink">Results →</Link>
          <EngineBadge className="md:hidden" />
        </span>
      </div>

      <aside className={cn(card, 'lg:row-span-2 lg:row-start-2 lg:min-h-0 lg:overflow-hidden')} aria-label="Inputs">
        <InputsPanel inputs={s.inputs} loading={s.loading} errors={errors} onFile={onFile} onRemove={onRemove} onDemo={loadDemo} onScenario={scenario}
          reading={s.replaying && result ? result.manifest.rasters.map((r) => r.role).filter((r): r is Role => !!r && (ROLES as string[]).includes(r)) : []} />
      </aside>

      <section className={cn(card, 'h-[64vh] min-h-0 overflow-hidden lg:row-start-2 lg:h-auto')} aria-label="Scene">
        <SceneRegion items={items} onLoadCrossModal={() => loadDemo('crossmodal')} />
      </section>

      <aside className="flex min-h-0 flex-col gap-3 lg:row-span-2 lg:row-start-2" aria-label="Evidence and trace">
        <section className={cn(card, 'flex min-h-0 flex-[1.4] flex-col overflow-hidden')} aria-labelledby="ev-h">
          <div className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1.5 border-b border-rule px-4 pb-2.5 pt-3">
            <h2 id="ev-h" className="label">Answer & evidence</h2>
            {result && <span className="mono whitespace-nowrap text-[11px] text-ink-2">{result.evidence.passing}/{result.evidence.count} pass · gate {result.evidence.threshold.toFixed(2)}</span>}
            <span className="ml-auto flex shrink-0 gap-1.5 whitespace-nowrap">
              <button type="button" disabled={!result || result.refused} onClick={exportGeojson} data-testid="export-geojson"
                className="btn btn-line btn-sm !px-2.5 !py-1 !text-[12px] disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-ink">GeoJSON ↓</button>
              {result
                ? <Link to={`/report/${result.run_id}`} data-testid="export-report" className="btn btn-ink btn-sm !px-2.5 !py-1 !text-[12px]">Report →</Link>
                : <span className="btn btn-ink btn-sm !px-2.5 !py-1 !text-[12px] opacity-40">Report →</span>}
            </span>
          </div>
          {/* one scroll container: the answer and its evidence move together */}
          <div className="scroll-thin min-h-[180px] flex-1 overflow-y-auto px-4 pb-3 pt-3">
            <AnswerBlock result={result} running={s.running} replaying={s.replaying} remedies={remedies} preview={preview} />
            {queryError && <p role="alert" className="mt-2 border border-nir bg-nir-bg px-3 py-2 text-[13px] text-nir">{queryError.message} <span className="text-ink-2">{queryError.remedy}</span></p>}
            <div className={cn('mt-3', (s.replaying || !result) && 'hidden')}>
              <EvidenceList items={items} threshold={result?.evidence.threshold ?? s.threshold} selected={s.selected} onSelect={s.select} runKey={result?.run_id ?? ''} plate={plate} />
            </div>
          </div>
        </section>
        <section className={cn(card, 'flex min-h-0 flex-1 flex-col overflow-hidden')} aria-labelledby="tr-h">
          <div className="flex items-center gap-2 border-b border-rule px-4 pb-2.5 pt-3">
            <h2 id="tr-h" className="label">Execution trace</h2>
            {result && <span className="mono ml-auto text-[10.5px] text-ink-2">router rules · engine {result.engine}</span>}
          </div>
          <div className="scroll-thin min-h-[160px] flex-1 overflow-y-auto px-4 pb-3 pt-2">
            <TracePanel steps={result?.trace ?? []} runKey={result?.run_id ?? ''} />
          </div>
        </section>
      </aside>

      <div className="sticky bottom-8 z-40 px-2 pb-2 lg:static lg:col-start-2 lg:row-start-3 lg:p-0">
        <QueryBar ref={input} value={query} onChange={setQuery} onSubmit={() => run(query)} running={s.running || s.replaying || reading} busy={reading && !s.running ? 'Reading inputs…' : undefined}
          threshold={s.threshold} onThreshold={s.setThreshold} onPalette={() => setPalette(true)} inputsLabel={inputsLabel} />
      </div>

      <CommandPalette open={palette} onOpenChange={setPalette} groups={groups} />
    </div>
  )
}
