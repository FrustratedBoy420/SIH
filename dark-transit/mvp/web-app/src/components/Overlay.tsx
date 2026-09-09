/**
 * The chart overlay: how the picture on the left was arrived at.
 *
 * Detection first, because it is the only stage with a learned component and
 * the one a judge will press on. The method sentence is written by the
 * pipeline at run time and says what actually segmented *this* scene — fitted
 * or hand-set coefficients, U-Net present or degraded — rather than restating
 * the design.
 */

import type { LogLine, Run } from '../types'

interface Props {
  run: Run
  log: LogLine[]
}

export default function Overlay({ run, log }: Props) {
  const d = run.detection
  const g = run.geometry
  const drift = run.drift
  const dark = run.dark
  const seg = d?.segmentation

  return (
    <div className="chart-overlay">
      <section className="block">
        <div className="block-head">
          <span className="eyebrow">Detection</span>
          {d?.confidence != null && (
            <span className="eyebrow">
              confidence <span className="num">{d.confidence.toFixed(2)}</span>
            </span>
          )}
        </div>

        {g && (
          <dl className="kv">
            <dt>Area</dt>
            <dd>{g.area_km2.toFixed(2)} km²</dd>
            <dt>Principal axis</dt>
            <dd>{g.principal_axis_deg.toFixed(1)}°</dd>
            <dt>Elongation</dt>
            <dd>{g.elongation.toFixed(2)}</dd>
            <dt>Age</dt>
            <dd>
              {g.age_hours.toFixed(1)} h [{g.age_hours_lo.toFixed(1)}–
              {g.age_hours_hi.toFixed(1)}]
            </dd>
          </dl>
        )}

        {d && (
          <>
            <dl className="kv" style={{ marginTop: 8 }}>
              <dt>Raw components</dt>
              <dd>{d.raw_components.toLocaleString()}</dd>
              <dt>Candidates</dt>
              <dd>{d.candidates}</dd>
              <dt>Retained</dt>
              <dd>{d.retained}</dd>
              <dt>Sea / slick</dt>
              <dd>
                {d.sea_db.toFixed(1)} / {d.slick_db?.toFixed(1) ?? '—'} dB
              </dd>
            </dl>
            <p className="note" style={{ marginTop: 10 }}>
              {d.method}
            </p>
          </>
        )}

        {seg && <Segmentation seg={seg} />}
      </section>

      {drift && (
        <section className="block">
          <span className="eyebrow">Hindcast</span>
          <dl className="kv" style={{ marginTop: 8 }}>
            <dt>Particles</dt>
            <dd>{drift.n_particles.toLocaleString()}</dd>
            <dt>Integrator</dt>
            <dd>{drift.integrator}</dd>
            <dt>Leeway α</dt>
            <dd>{drift.leeway_alpha}</dd>
            <dt>Diffusivity</dt>
            <dd>{drift.k_h} m²/s</dd>
            <dt>Origin window</dt>
            <dd>
              {drift.origin_window_h[0].toFixed(1)} to {drift.origin_window_h[1].toFixed(1)} h
            </dd>
            <dt>Union r95</dt>
            <dd>{drift.r95_union_km.toFixed(1)} km</dd>
            <dt>Region parts</dt>
            <dd>{drift.origin_region_parts}</dd>
          </dl>
          {drift.forward?.landfall && (
            <p className="note warn" style={{ marginTop: 10 }}>
              Forecast reaches the coast. First contact{' '}
              {drift.forward.first_contact_utc ?? drift.forward.eta_utc}.
            </p>
          )}
        </section>
      )}

      {dark && (
        <section className="block">
          <span className="eyebrow">Dark channel</span>
          {dark.available ? (
            <>
              <dl className="kv" style={{ marginTop: 8 }}>
                <dt>CFAR targets</dt>
                <dd>{dark.targets}</dd>
                <dt>Matched to AIS</dt>
                <dd>{dark.matched}</dd>
                <dt>Unmatched</dt>
                <dd style={{ color: dark.unmatched ? 'var(--amber)' : undefined }}>
                  {dark.unmatched}
                </dd>
                <dt>P(false alarm)</dt>
                <dd>{dark.cfar.pfa}</dd>
              </dl>
              {dark.unmatched_targets.map((t) => (
                <p className="note" key={t.target_id} style={{ marginTop: 8 }}>
                  <b style={{ color: 'var(--amber)' }}>{t.target_id}</b> —{' '}
                  {t.est_length_m.toFixed(0)} m estimated, peak {t.peak_db.toFixed(1)} dB,{' '}
                  {t.in_origin_region ? 'inside' : 'outside'} the origin region. A radar
                  return with no transponder behind it.
                </p>
              ))}
            </>
          ) : (
            <p className="note" style={{ marginTop: 8 }}>
              {dark.note}
            </p>
          )}
        </section>
      )}

      <section className="block">
        <span className="eyebrow">Run log</span>
        <div className="log" style={{ marginTop: 8 }}>
          {log.map((l, i) => (
            <div key={i}>
              <b>{l.t.toFixed(2)}s</b> {l.stage} — {l.event}
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

function Segmentation({ seg }: { seg: NonNullable<Run['detection']>['segmentation'] }) {
  if (!seg) return null
  const det = seg.detector

  if (det.source !== 'unet') {
    return (
      <p className="note warn" style={{ marginTop: 10 }}>
        Learned segmentation not running: {det.error ?? det.note ?? 'no weights pack'}. The
        classical path stands in and this run is on its documented degraded route.
      </p>
    )
  }

  return (
    <>
      <div className="block-head" style={{ marginTop: 14 }}>
        <span className="eyebrow">Learned refinement</span>
        <span className="eyebrow">{det.corpus}</span>
      </div>
      <dl className="kv">
        <dt>Architecture</dt>
        <dd>{det.architecture}</dd>
        <dt>Parameters</dt>
        <dd>{det.parameters?.toLocaleString()}</dd>
        <dt>Operating threshold</dt>
        <dd>{det.threshold?.toFixed(2)}</dd>
        {det.holdout && (
          <>
            <dt>Holdout IoU</dt>
            <dd>{det.holdout.iou.toFixed(3)}</dd>
            <dt>Holdout F1</dt>
            <dd>{det.holdout.f1.toFixed(3)}</dd>
          </>
        )}
        <dt>Refined</dt>
        <dd>
          {seg.candidates_refined} of {seg.candidates_seen}
        </dd>
        {seg.mean_iou_with_classical != null && (
          <>
            <dt>IoU vs classical</dt>
            <dd>{seg.mean_iou_with_classical.toFixed(3)}</dd>
          </>
        )}
        {det.export_parity != null && (
          <>
            <dt>torch ↔ numpy</dt>
            <dd>{det.export_parity.toExponential(1)}</dd>
          </>
        )}
      </dl>
      <p className="note" style={{ marginTop: 8 }}>
        The network redraws boundaries inside a dilation of the classical mask. It cannot
        originate a detection, so a bad model degrades the geometry rather than inventing
        an incident.
      </p>
    </>
  )
}
