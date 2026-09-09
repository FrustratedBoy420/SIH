/**
 * The rail: who is ranked, why, and what the ranking rests on.
 *
 * The suspect rows carry a stacked bar of the five weighted factors rather
 * than a single score bar. A composite number tells an analyst nothing about
 * whether the lead came from geometry or from a transponder gap, and those two
 * have very different evidential weight. Moving a weight slider re-proportions
 * every stack at once, which is the fastest honest way to show how much the
 * conclusion depends on an assumption somebody chose.
 */

import type { Attribution, FactorName, Ranked, Run } from '../types'

const FACTORS: FactorName[] = ['containment', 'timing', 'heading', 'broadcast', 'class_prior']

const FACTOR_LABEL: Record<FactorName, string> = {
  containment: 'Containment',
  timing: 'Timing',
  heading: 'Heading',
  broadcast: 'Broadcast',
  class_prior: 'Vessel class',
}

/**
 * The pack stores weights in whatever units its author found readable —
 * `weights.v4.json` uses 22, 18, 26, 24, 10 — and the scorer normalises them on
 * read. So the slider works in the pack's own units, and everything the reader
 * compares is shown as a share of the total. A slider hardcoded to 0–1 would
 * sit pinned at its maximum against this pack, which is exactly what it did
 * before this was written down.
 */
function shares(weights: Record<string, number>): Record<string, number> {
  const total = FACTORS.reduce((s, f) => s + Math.max(0, weights[f] ?? 0), 0)
  if (total <= 0) return Object.fromEntries(FACTORS.map((f) => [f, 0]))
  return Object.fromEntries(FACTORS.map((f) => [f, Math.max(0, weights[f] ?? 0) / total]))
}

/** Slider range: twice the largest weight in the pack, rounded up to a step. */
function sliderMax(weights: Record<string, number>): number {
  const peak = Math.max(1, ...FACTORS.map((f) => weights[f] ?? 0))
  return Math.ceil((peak * 2) / 5) * 5
}

interface Props {
  run: Run
  attribution: Attribution | undefined
  ranked: Ranked[]
  leaderMargin: number
  weights: Record<string, number>
  onWeights: (w: Record<string, number>) => void
  onResetWeights: () => void
  selected: string | null
  onSelect: (mmsi: string | null) => void
  rescoring: boolean
}

export default function Rail({
  run,
  attribution,
  ranked,
  leaderMargin,
  weights,
  onWeights,
  onResetWeights,
  selected,
  onSelect,
  rescoring,
}: Props) {
  const chosen = ranked.find((r) => r.mmsi === selected) ?? null
  const share = shares(weights)
  const wMax = sliderMax(attribution?.weights ?? weights)

  return (
    <aside className="rail">
      <section className="block">
        <div className="block-head">
          <span className="eyebrow">Shortlist</span>
          <span className="eyebrow">
            margin <span className="num">{leaderMargin.toFixed(3)}</span>
          </span>
        </div>

        {ranked.length === 0 && (
          <p className="note">
            No vessel survived the traffic filter. Nothing here to rank.
          </p>
        )}

        {ranked.map((r) => (
          <button
            key={r.mmsi ?? r.name}
            className="suspect"
            aria-current={r.mmsi === selected}
            onClick={() => onSelect(r.mmsi === selected ? null : r.mmsi)}
          >
            <span className="suspect-top">
              <span className="rank num">{String(r.rank).padStart(2, '0')}</span>
              <span className="vessel-name">{r.name}</span>
              <span className="score num">{r.score.toFixed(3)}</span>
            </span>
            <span className="suspect-sub">
              <span>{r.ship_type.replace(/_/g, ' ')}</span>
              <span className="num">{r.length_m.toFixed(0)} m</span>
              {r.channel === 'ais-gap' && <span style={{ color: 'var(--amber)' }}>went dark</span>}
            </span>
            <span className="stack" aria-hidden="true">
              {FACTORS.map((f) => {
                // Each segment is this factor's share of the composite score,
                // so the bar's full width is the score and the segments are
                // where it came from.
                const part = (r.factors[f] ?? 0) * share[f]
                return (
                  <i
                    key={f}
                    className={`f-${f}`}
                    style={{ flex: `0 0 ${(part * 100).toFixed(2)}%` }}
                    title={`${FACTOR_LABEL[f]} ${(r.factors[f] ?? 0).toFixed(2)}`}
                  />
                )
              })}
            </span>
          </button>
        ))}

        <div className="legend">
          {FACTORS.map((f) => (
            <span key={f}>
              <i className={`f-${f}`} />
              {FACTOR_LABEL[f]}
            </span>
          ))}
        </div>
      </section>

      <section className="block">
        <div className="block-head">
          <span className="eyebrow">Weights</span>
          <button className="ghost" onClick={onResetWeights}>
            Reset
          </button>
        </div>

        {FACTORS.map((f) => (
          <div className="weight" key={f}>
            <label htmlFor={`w-${f}`}>{FACTOR_LABEL[f]}</label>
            <output htmlFor={`w-${f}`} className="num">
              {(share[f] * 100).toFixed(0)} %
            </output>
            <input
              id={`w-${f}`}
              type="range"
              min={0}
              max={wMax}
              step={1}
              value={weights[f] ?? 0}
              aria-valuetext={`${FACTOR_LABEL[f]}, ${(share[f] * 100).toFixed(0)} percent of the total weight`}
              onChange={(e) => onWeights({ ...weights, [f]: Number(e.target.value) })}
            />
          </div>
        ))}

        <p className="hint">
          {rescoring ? (
            'Re-ranking\u2026'
          ) : (
            <>
              Shown as a share of the total, because weights normalise on read — one can
              move without rebalancing the rest. Drop <b>Heading</b> to zero and watch the
              margin collapse: that is how much of the conclusion rests on one geometric
              argument.
            </>
          )}
        </p>
        {attribution && (
          <p className="hint">
            Pack <span className="num">{attribution.weight_pack}</span>{' '}
            {attribution.weight_pack_version}
          </p>
        )}
      </section>

      {chosen && <Breakdown vessel={chosen} weights={weights} />}

      {!chosen && attribution && (
        <section className="block">
          <span className="eyebrow">Finding</span>
          <p className="note" style={{ marginTop: 8 }}>
            {attribution.finding}
          </p>
        </section>
      )}

      <section className="block">
        <span className="eyebrow">What this cannot establish</span>
        <div style={{ marginTop: 8 }}>
          {run.limitations.map((l) => (
            <p className="note" key={l.title}>
              <b style={{ color: 'var(--ink)' }}>{l.title}.</b> {l.text}
            </p>
          ))}
        </div>
      </section>
    </aside>
  )
}

function Breakdown({
  vessel,
  weights,
}: {
  vessel: Ranked
  weights: Record<string, number>
}) {
  const share = shares(weights)
  return (
    <section className="block">
      <div className="block-head">
        <span className="eyebrow">Score breakdown</span>
        <span className="eyebrow">{vessel.mmsi ?? 'no MMSI'}</span>
      </div>

      <dl className="kv" style={{ marginBottom: 12 }}>
        <dt>Type</dt>
        <dd>{vessel.ship_type.replace(/_/g, ' ')}</dd>
        <dt>Length</dt>
        <dd>{vessel.length_m.toFixed(0)} m</dd>
        {vessel.cog !== null && (
          <>
            <dt>Course through region</dt>
            <dd>{vessel.cog.toFixed(0)}°</dd>
          </>
        )}
        {vessel.delta_axis !== null && (
          <>
            <dt>Δ to slick axis</dt>
            <dd>{vessel.delta_axis.toFixed(0)}°</dd>
          </>
        )}
        <dt>Closest approach</dt>
        <dd>{vessel.closest_approach_km.toFixed(2)} km</dd>
        <dt>Baseline cadence</dt>
        <dd>{vessel.baseline_cadence_s.toFixed(0)} s</dd>
        {vessel.implausible_fixes > 0 && (
          <>
            <dt>Implausible fixes</dt>
            <dd style={{ color: 'var(--amber)' }}>{vessel.implausible_fixes}</dd>
          </>
        )}
      </dl>

      {FACTORS.map((f) => {
        const suppressed = vessel.suppressed.includes(f)
        const value = vessel.factors[f]
        return (
          <div key={f}>
            <div className="factor-row">
              <span>{FACTOR_LABEL[f]}</span>
              <span className={`meter${suppressed ? ' suppressed' : ''}`}>
                <i style={{ width: `${(value ?? 0) * 100}%` }} />
              </span>
              <span>{suppressed ? '—' : (value ?? 0).toFixed(2)}</span>
            </div>
            {vessel.justifications[f] && <p className="just">{vessel.justifications[f]}</p>}
            {suppressed && (
              <p className="just">
                Suppressed: this factor could not be computed for this vessel, so it is
                withheld rather than scored zero, and its {(share[f] * 100).toFixed(0)} %
                of the weight is redistributed across the rest.
              </p>
            )}
          </div>
        )
      })}

      {vessel.corroboration && (
        <p className="note warn" style={{ marginTop: 10 }}>
          {vessel.corroboration.text}
        </p>
      )}

      {vessel.gaps.map((g, i) => (
        <p className="note" key={i} style={{ marginTop: 8 }}>
          Not broadcasting {formatDuration(g.duration_s)} against its own{' '}
          {g.baseline_cadence_s.toFixed(0)} s baseline. Its reachable set over that period
          covers {(g.overlap * 100).toFixed(0)} % of the origin region.
        </p>
      ))}
    </section>
  )
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.round((seconds % 3600) / 60)
  return h ? `${h} h ${String(m).padStart(2, '0')} min` : `${m} min`
}
