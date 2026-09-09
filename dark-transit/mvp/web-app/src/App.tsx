/**
 * The workstation shell.
 *
 * One rule governs the whole app: it holds no incident knowledge of its own.
 * Every number rendered here came out of `run.json`, and nothing about this
 * incident is hardcoded — PRD UI-5, and the reason the same view serves any
 * scenario the pipeline can produce, including the ones that halt at a gate.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import Chart, { type LayerToggles } from './components/Chart'
import Overlay from './components/Overlay'
import Rail from './components/Rail'
import Transport from './components/Transport'
import { ApiError, getCloud, getLog, getRun, listRuns, rescore, runFile } from './api'
import type { Cloud, LogLine, Ranked, Run } from './types'

const DEFAULT_LAYERS: LayerToggles = {
  sar: true,
  slick: true,
  particles: true,
  origin: true,
  tracks: true,
  reachable: true,
  radar: true,
  forecast: true,
}

const LAYER_LABEL: Array<[keyof LayerToggles, string, string]> = [
  ['sar', 'SAR scene', '#8a97a5'],
  ['slick', 'Slick', '#eef4fa'],
  ['origin', 'Origin region', '#e0409a'],
  ['particles', 'Drift cloud', '#4fd5d0'],
  ['tracks', 'AIS tracks', '#5b7fb8'],
  ['reachable', 'Reachable set', '#5b7fb8'],
  ['radar', 'Unmatched radar', '#e8a33d'],
  ['forecast', 'Forecast', '#e8a33d'],
]

export default function App() {
  const [runIds, setRunIds] = useState<string[]>([])
  const [runId, setRunId] = useState<string | null>(null)
  const [run, setRun] = useState<Run | null>(null)
  const [cloud, setCloud] = useState<Cloud | null>(null)
  const [log, setLog] = useState<LogLine[]>([])
  const [error, setError] = useState<string | null>(null)

  const [hour, setHour] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [layers, setLayers] = useState<LayerToggles>(DEFAULT_LAYERS)

  const [weights, setWeights] = useState<Record<string, number>>({})
  const [ranked, setRanked] = useState<Ranked[]>([])
  const [margin, setMargin] = useState(0)
  const [rescoring, setRescoring] = useState(false)

  // ---- load -------------------------------------------------------------- //
  useEffect(() => {
    let live = true
    void (async () => {
      try {
        // `?run=<id>` opens a named run, so a link to an incident is a link to
        // that incident and not to whichever one happened to finish last.
        const asked = new URLSearchParams(window.location.search).get('run')
        const [ids, latest] = await Promise.all([
          listRuns().catch((): string[] => []),
          asked ? getRun(asked).catch(() => getRun()) : getRun(),
        ])
        if (!live) return
        setRunIds(ids)
        setRunId(asked && ids.includes(asked) ? asked : latest.run_id)
        setError(null)
      } catch (e) {
        if (live) setError(e instanceof ApiError ? e.message : String(e))
      }
    })()
    return () => {
      live = false
    }
  }, [])

  useEffect(() => {
    if (!runId) return
    let live = true
    void (async () => {
      try {
        const doc = await getRun(runId)
        if (!live) return
        setRun(doc)
        setError(null)
        setSelected(null)
        setHour(0)
        setPlaying(false)
        const att = doc.attribution
        setWeights(att ? { ...att.weights } : {})
        setRanked(att?.ranked ?? [])
        setMargin(att?.leader_margin ?? 0)
        const [c, l] = await Promise.all([
          getCloud(runId).catch(() => null),
          getLog(runId).catch(() => []),
        ])
        if (!live) return
        setCloud(c)
        setLog(l)
      } catch (e) {
        if (live) setError(e instanceof ApiError ? e.message : String(e))
      }
    })()
    return () => {
      live = false
    }
  }, [runId])

  // ---- re-ranking -------------------------------------------------------- //
  const pending = useRef<number | undefined>(undefined)
  const applyWeights = useCallback(
    (next: Record<string, number>) => {
      setWeights(next)
      if (!runId) return
      window.clearTimeout(pending.current)
      pending.current = window.setTimeout(() => {
        setRescoring(true)
        rescore(runId, next)
          .then((res) => {
            setRanked(res.ranked)
            setMargin(res.leader_margin)
          })
          .catch((e: unknown) => setError(e instanceof ApiError ? e.message : String(e)))
          .finally(() => setRescoring(false))
      }, 140)
    },
    [runId],
  )

  const resetWeights = useCallback(() => {
    const att = run?.attribution
    if (att) applyWeights({ ...att.weights })
  }, [run, applyWeights])

  const provenance = useMemo(() => {
    const p = run?.provenance
    return p ? `AIS ${p.ais} · scene ${p.scene} · forcing ${p.forcing}` : ''
  }, [run])

  if (error && !run) {
    return (
      <div className="centre">
        <span className="eyebrow">No pipeline</span>
        <p className="note" style={{ maxWidth: 460 }}>
          {error}
        </p>
        <code>python -m darktransit.cli run &amp;&amp; python -m darktransit.cli serve</code>
      </div>
    )
  }

  if (!run) {
    return (
      <div className="centre">
        <span className="eyebrow">Loading the run</span>
      </div>
    )
  }

  return (
    <div className="shell">
      <header className="strip">
        <span className="mark">
          Dark<span>·</span>Transit
        </span>

        <div className="strip-meta">
          <span>
            <b>{run.scenario_label}</b>
          </span>
          <span className="num">{run.detection_utc}</span>
          <span>{provenance}</span>
        </div>

        <div className="strip-right">
          <span
            className="night-note"
            title="S-52 night colour table. A duty desk running SAR imagery is a darkened room, and a bright display costs dark adaptation."
          >
            night
          </span>

          <div className="gates" role="group" aria-label="Gate decisions">
            {run.gates.map((g) => (
              <button
                key={g.id}
                type="button"
                className={`lamp ${g.halts ? 'halt' : 'ok'}`}
                title={`Gate ${g.id} · ${g.name}: ${g.detail}`}
                aria-label={`Gate ${g.id} ${g.name}: ${g.detail}`}
              />
            ))}
          </div>

          {runIds.length > 1 && (
            <select
              value={runId ?? ''}
              onChange={(e) => {
                setRunId(e.target.value)
                const url = new URL(window.location.href)
                url.searchParams.set('run', e.target.value)
                window.history.replaceState(null, '', url)
              }}
              aria-label="Run"
            >
              {runIds.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
          )}

          <a
            className="link"
            href={runFile(run.run_id, 'dossier.html')}
            target="_blank"
            rel="noreferrer"
          >
            Dossier
          </a>
          {run.dossier_pdf && (
            <a
              className="link"
              href={runFile(run.run_id, run.dossier_pdf)}
              target="_blank"
              rel="noreferrer"
            >
              PDF{run.dossier_pdf_pages ? ` · ${run.dossier_pdf_pages} pp` : ''}
            </a>
          )}
        </div>
      </header>

      <Rail
        run={run}
        attribution={run.attribution}
        ranked={ranked}
        leaderMargin={margin}
        weights={weights}
        onWeights={applyWeights}
        onResetWeights={resetWeights}
        selected={selected}
        onSelect={setSelected}
        rescoring={rescoring}
      />

      <div className="chart">
        <Chart
          run={run}
          cloud={cloud}
          hour={hour}
          ranked={ranked}
          selected={selected}
          onSelect={setSelected}
          layers={layers}
        />

        <Overlay run={run} log={log} />

        <div className="layers">
          <span className="eyebrow">Layers</span>
          {LAYER_LABEL.map(([key, label, colour]) => (
            <label className="layer" key={key}>
              <input
                type="checkbox"
                checked={layers[key]}
                onChange={(e) => setLayers({ ...layers, [key]: e.target.checked })}
              />
              <i className="swatch" style={{ background: colour }} />
              {label}
            </label>
          ))}
        </div>
      </div>

      <Transport
        drift={run.drift}
        detectionUtc={run.detection_utc}
        hour={hour}
        onHour={setHour}
        playing={playing}
        onPlaying={setPlaying}
      />

      {run.halted && (
        <div
          role="status"
          style={{
            position: 'fixed',
            left: 16,
            bottom: 'calc(var(--transport) + 16px)',
            maxWidth: 380,
            background: 'rgba(8,17,27,0.96)',
            border: '1px solid var(--amber)',
            borderRadius: 2,
            padding: '10px 12px',
          }}
        >
          <span className="eyebrow" style={{ color: 'var(--amber)' }}>
            Halted at gate {run.halted.id}
          </span>
          <p className="note" style={{ margin: '6px 0 0' }}>
            {run.halted.detail}
          </p>
        </div>
      )}
    </div>
  )
}
