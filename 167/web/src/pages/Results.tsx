/**
 * Results (UI-09, US-10): per-capability metrics, the adaptation gain, the
 * adaptation ablation (A/B), the system ablation (C–E), the cross-modal
 * ablation and calibration — each beside its published anchor, every
 * composite with its formula (EVL-03, EVL-05).
 *
 * Two kinds of number, never mixed: MEASURED (a run exists — here, on
 * synthetic scenes, with the time and scene stated) and PENDING (needs a
 * model run; reads XX.X). Nothing is estimated to fill a gap (EVL-01).
 */

import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { num, PLACEHOLDER } from '@/lib/format'
import { useEngineMode } from '@/lib/hooks'
import BarChart from '@/components/charts/BarChart'
import { cn } from '@/lib/utils'

function Section({ n, title, req, children, lede }: { n: string; title: string; req: string; lede: string; children: React.ReactNode }) {
  return (
    // Plain section, not an in-view reveal: a results page must print and
    // capture whole, so nothing on it waits for the viewport to arrive.
    <section className="grid gap-8 border-t border-ink py-16 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)]">
      <div>
        <p className="grid size-10 place-items-center bg-sun font-display text-[18px] font-bold">{n}</p>
        <h2 className="t-display mt-4 text-[clamp(28px,3vw,40px)]">{title}</h2>
        <p className="mono mt-3 inline-block border border-ink px-2 py-0.5 text-[11.5px]">{req}</p>
        <p className="mt-4 max-w-[420px] text-[14.5px] leading-[1.55] text-ink-2">{lede}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  )
}

const Pending = ({ owner, what }: { owner: string; what: string }) => (
  <p className="mt-4 inline-block bg-warn-bg px-2 py-0.5 text-[12.5px] text-warn">Pending · {what} · owner {owner}</p>
)

export default function Results() {
  const { data: ev, isLoading } = useQuery({ queryKey: ['evaluation'], queryFn: api.evaluation })
  const { data: mode } = useEngineMode()
  const pct = (v: number) => `${(v * 100).toFixed(1)} %`

  return (
    <div className="px-5 pb-24 pt-14 sm:px-8" data-testid="results-page">
      <p className="label">Results · UI-09</p>
      <h1 className="t-hero mt-4 max-w-[900px]">What it measured, and what it hasn’t yet</h1>
      <div className="mt-8 grid max-w-[1100px] gap-4 md:grid-cols-2">
        <p className="frame bg-surface px-4 py-3 text-[14px]" data-testid="provenance">
          <span className="label mr-2 !text-ink">Measured</span>
          {ev ? <>on synthetic scenes ({ev.scene.size} px, seed {ev.scene.seed}) against ground truth the pipeline never reads — {ev.source === 'browser' ? 'in this browser, by the preview engine' : 'by the API'}, at <span className="mono">{ev.measured_at.slice(11, 19)}Z</span>. Reproducible: reload and it runs again.</> : isLoading ? 'measuring…' : '—'}
        </p>
        <p className="border border-warn bg-warn-bg px-4 py-3 text-[14px]">
          <span className="label mr-2 !text-warn">Not claimed</span>
          Public-benchmark numbers need the trained adapter and read <span className="mono">{PLACEHOLDER}</span> until a recorded run fills them. A figure on this page is either measured or absent — never estimated.
        </p>
      </div>

      <Section n="01" title="Adaptation gain" req="R1 · ADP-04 · the disqualifying requirement"
        lede="The evidence for adaptation is the gain over the same base, zero-shot, on the same VRSBench test split — not the adapted score alone. Bars animate from the published anchor to the measured value, so the anchor stays in view.">
        <div className="mb-8 flex flex-wrap items-end gap-10">
          <div>
            <p className="label">Gain · zero-shot → M1</p>
            <p className="mt-2 text-[64px] font-semibold leading-none tracking-tight text-ink-3" data-testid="gain">+{num(ev?.adaptation.gain ?? null)}<span className="text-[22px]"> pts</span></p>
          </div>
          <div className="mono pb-2 text-[12.5px] text-ink-2">target +10 to +20 · anchor GeoChat 40.8 % → 60.6 % = +19.8</div>
        </div>
        <BarChart testId="chart-adaptation" caption="VQA accuracy on the VRSBench test split, zero-shot base versus the adapted M1, with published anchors"
          max={100} ticks={[0, 25, 50, 75, 100]} fmt={(v) => `${v.toFixed(1)}`}
          band={[55, 62, 'target 55–62']}
          refs={[{ value: 40.8, label: 'GeoChat 0-shot 40.8' }, { value: 60.6, label: 'GeoChat FT 60.6' }, { value: 65.6, label: 'GPT-4V 65.6' }]}
          rows={[
            { key: 'A', label: 'A · base, zero-shot', sub: 'M0 · GeoChat-7B or Qwen2-VL-7B', value: ev?.adaptation.zero_shot ?? null },
            { key: 'B', label: 'B · M1, LoRA-adapted', sub: 'QLoRA on VRSBench train', value: ev?.adaptation.adapted ?? null, from: 40.8 },
          ]} />
        <Pending owner="Mridul" what="zero-shot baseline due 13 Sep; adapted run after M1 trains" />
      </Section>

      <Section n="02" title="Per-capability measurements" req="R2 · R3 · R4 · R5 · EVL-03"
        lede="Each specialist measured standing alone, against the generator’s ground truth. These are real measurements of the classical path; they say nothing about benchmark performance, and the router figure is in-sample — its held-out number is section 05.">
        <BarChart testId="chart-tasks" caption="Per-capability measurements on the synthetic scene" max={1}
          rows={(ev?.tasks ?? []).map((t) => ({ key: t.task, label: t.task, sub: t.metric, value: t.value, tip: Object.entries(t.detail).map(([k, v]) => `${k} ${v}`).join(' · ') }))} />
      </Section>

      <Section n="03" title="System ablation" req="C → D → E · EVL-05"
        lede="Each layer switched on in turn, on the same clouded scene. Mean F1 is flat from C to E because the router and the gate add capability, not sharper masks; the composite is what separates them. Its weights are a choice — printed, so they can be argued with.">
        <div className="grid gap-8 xl:grid-cols-2">
          <div>
            <p className="label mb-2 !text-ink">Mean F1 · built-up and water</p>
            <BarChart testId="chart-ablation-f1" caption="Mean segmentation F1 per ablation configuration" max={1}
              rows={(ev?.system_ablation.rows ?? []).map((r) => ({ key: r.config, label: `${r.config} · ${r.name}`, value: r.mean_f1, tip: r.runs }))} />
          </div>
          <div>
            <p className="label mb-2 !text-ink">Capability · composite</p>
            <BarChart testId="chart-ablation-cap" caption="Composite capability score per ablation configuration" max={1}
              rows={(ev?.system_ablation.rows ?? []).map((r) => ({ key: r.config, label: `${r.config} · ${r.name}`, value: r.capability, tip: `Δ vs A ${r.delta_vs_A >= 0 ? '+' : ''}${r.delta_vs_A.toFixed(3)}` }))} />
          </div>
        </div>
        <p className="frame mono mt-6 bg-surface px-3 py-2 text-[12.5px]" data-testid="formula">{ev?.system_ablation.formula}</p>
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-left text-[12.5px]">
            <thead><tr className="border-b border-ink">{['Config', 'What actually runs', 'built F1', 'water F1', 'mean F1', 'router', 'recovered %', 'capability', 'Δ vs A'].map((h) => <th key={h} className="label py-2 pr-3 font-medium">{h}</th>)}</tr></thead>
            <tbody>
              {ev?.system_ablation.rows.map((r) => (
                <tr key={r.config} className="border-b border-rule">
                  <td className="py-2 pr-3 font-medium">{r.config} · {r.name}</td><td className="pr-3 text-ink-2">{r.runs}</td>
                  <td className="mono pr-3">{r.built_f1.toFixed(3)}</td><td className="mono pr-3">{r.water_f1.toFixed(3)}</td><td className="mono pr-3">{r.mean_f1.toFixed(3)}</td>
                  <td className="mono pr-3">{r.router_accuracy === null ? '—' : r.router_accuracy.toFixed(2)}</td><td className="mono pr-3">{r.recovered_under_cloud_pct === null ? '—' : r.recovered_under_cloud_pct.toFixed(1)}</td>
                  <td className="mono pr-3 font-medium">{r.capability.toFixed(3)}</td><td className="mono">{r.delta_vs_A >= 0 ? '+' : ''}{r.delta_vs_A.toFixed(3)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[13px] text-ink-2">{ev?.system_ablation.note} Rows A and B are classical floors, labelled by what runs — no vision-language model runs in any row. The adaptation ablation is section 01.</p>
      </Section>

      <Section n="04" title="Cross-modal ablation" req="R4 · EVL-06"
        lede="The claim that optical and SAR are complementary is proved only if the pair beats both single modalities on the same scenes. Until that run exists, it is not shown as proved.">
        <BarChart testId="chart-crossmodal" caption="Built-up F1 by input modality" max={1}
          rows={[
            { key: 'o', label: 'optical only', mark: 'var(--color-optical)', value: ev?.cross_modal.optical ?? null },
            { key: 's', label: 'SAR only', mark: 'var(--color-sar)', value: ev?.cross_modal.sar ?? null },
            { key: 'b', label: 'optical + SAR', mark: 'var(--color-fusion)', value: ev?.cross_modal.both ?? null },
          ]} />
        <Pending owner="Mridul + Shreyash" what={`${ev?.cross_modal.metric ?? 'built-up F1'} on held-out co-registered pairs`} />
      </Section>

      <Section n="05" title="Router, held out" req="R5 · RTR-07"
        lede="Dispatch accuracy on at least 200 paraphrases written before looking at the rules. The in-sample figure in section 02 is 1.00 and proves nothing on its own — the rules were written with those queries in view.">
        <BarChart testId="chart-router" caption="Router dispatch accuracy on held-out paraphrases" max={1} refs={[{ value: 0.85, label: 'target 0.85' }]}
          rows={[{ key: 'h', label: 'held-out paraphrases', sub: `n = ${ev?.router_heldout.n ?? 0} of ≥ 200`, value: ev?.router_heldout.accuracy ?? null }]} />
        <Pending owner="Shreyash" what="held-out set written blind to the rules" />
      </Section>

      <Section n="06" title="Calibration" req="NFR-06 · does 0.9 mean right nine times in ten?"
        lede="A confidence nobody validated invites trust it has not earned. Expected calibration error is reported only over at least 200 predictions, with the bins stated.">
        <div className="grid gap-8 xl:grid-cols-[440px_minmax(0,1fr)]">
          <figure className="max-w-[440px]" data-testid="chart-calibration">
            <svg viewBox="0 0 220 220" className="w-full" role="img"
              aria-label={ev?.calibration.reliability?.length ? `Reliability diagram: ${ev.calibration.reliability.map((b) => `confidence ${b.confidence}, accuracy ${b.accuracy}, n ${b.n}`).join('; ')}. The diagonal marks perfect calibration.` : 'Reliability diagram: no predictions plotted yet; the diagonal marks perfect calibration.'}>
              {[0, 0.25, 0.5, 0.75, 1].map((v) => (
                <g key={v}>
                  <line x1={30 + v * 180} x2={30 + v * 180} y1={10} y2={190} stroke="var(--color-rule)" strokeWidth={1} />
                  <line x1={30} x2={210} y1={190 - v * 180} y2={190 - v * 180} stroke="var(--color-rule)" strokeWidth={1} />
                  <text x={30 + v * 180} y={204} textAnchor="middle" className="mono" fontSize={8} fill="var(--color-ink-2)">{v}</text>
                  <text x={24} y={193 - v * 180} textAnchor="end" className="mono" fontSize={8} fill="var(--color-ink-2)">{v}</text>
                </g>
              ))}
              <line x1={30} y1={190} x2={210} y2={10} stroke="var(--color-ink-2)" strokeDasharray="3 3" strokeWidth={1} />
              {ev?.calibration.reliability?.length
                ? ev.calibration.reliability.map((b) => {
                  const r = Math.max(2.5, Math.min(9, Math.sqrt(b.n) * 0.8))
                  return <circle key={b.lo} cx={30 + b.confidence * 180} cy={190 - b.accuracy * 180} r={r} fill="var(--color-accent)" stroke="var(--color-surface)" strokeWidth={1.5}><title>{`confidence ${b.lo}–${b.hi}: mean ${b.confidence}, accuracy ${b.accuracy}, n ${b.n}`}</title></circle>
                })
                : <text x={120} y={100} textAnchor="middle" fontSize={10} fill="var(--color-ink-2)" className="mono">{PLACEHOLDER} · no bins yet</text>}
              <text x={120} y={217} textAnchor="middle" fontSize={8} fill="var(--color-ink-2)">stated confidence</text>
            </svg>
            <figcaption className="mono mt-2 text-[12px]">ECE {ev?.calibration.ece === null || ev?.calibration.ece === undefined ? PLACEHOLDER : ev.calibration.ece.toFixed(3)} · n = {ev?.calibration.n ?? 0} of ≥ {ev?.calibration.required_n ?? 200} · {ev?.calibration.bins ?? 10} equal-width bins · dot area ∝ records</figcaption>
          </figure>
          {ev?.calibration.by_kind && (
            <div className="min-w-0">
              <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] border-collapse text-left text-[12.5px]" data-testid="calibration-by-kind">
                <thead><tr className="border-b border-ink">{['Record', 'n', 'right', 'stated', 'gap'].map((h) => <th key={h} className="label py-2 pr-3 font-medium">{h}</th>)}</tr></thead>
                <tbody>
                  {Object.entries(ev.calibration.by_kind).map(([k, v]) => {
                    const over = v.mean_confidence - v.accuracy
                    return (
                      <tr key={k} className="border-b border-rule">
                        <td className="mono py-2 pr-3">{k}</td><td className="mono pr-3">{v.n}</td>
                        <td className="mono pr-3">{v.accuracy.toFixed(3)}</td><td className="mono pr-3">{v.mean_confidence.toFixed(3)}</td>
                        <td className={cn('whitespace-nowrap', over > 0.1 ? 'text-nir' : 'text-ink-2')}>{over > 0.1 ? `over by ${over.toFixed(2)}` : over < -0.1 ? `under by ${(-over).toFixed(2)}` : 'within 0.10'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              </div>
              <p className="mt-3 text-[13px] text-ink-2">
                <b className="font-medium text-ink">right</b> is the share of records the ground truth confirms; <b className="font-medium text-ink">stated</b> is their mean confidence. {ev.calibration.design && <>Recorded study: {ev.calibration.design.scenes} synthetic scenes ({ev.calibration.design.size_px} px, seeds {ev.calibration.design.seeds.join('–')}, pixel noise σ {ev.calibration.design.noise_sd.join(' / ')}), every record judged against ground truth — correct if {ev.calibration.design.correct_if}. </>}
                {ev.calibration.measured_at && <>Measured {ev.calibration.measured_at.slice(0, 10)} by <span className="mono">satquery calibrate</span>{ev.calibration.version ? ` ${ev.calibration.version}` : ''}.</>}
              </p>
            </div>
          )}
        </div>
        {!(ev?.calibration.n && ev.calibration.n >= (ev.calibration.required_n ?? 200)) && <Pending owner="Shreyash" what="≥ 200 labelled predictions across tasks" />}
      </Section>

      <Section n="07" title="Stress" req="EVL-08 · behaviour under bad input"
        lede="Accuracy on a clean scene says little about trust. Each case breaks the scene one specific way and checks what a trustworthy system owes the user: refuse what it cannot answer, abstain when nothing clears the gate, flag and pay for doubt, stay within tolerance when the damage is mild.">
        {ev?.stress ? (
          <div data-testid="stress">
            <p className="mb-4 text-[15px]"><b className="font-semibold">{ev.stress.passed} of {ev.stress.total}</b> cases behave as their expectation states.</p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-left text-[12.5px]">
                <thead><tr className="border-b border-ink">{['', 'Case', 'Condition', 'Expected', 'Observed'].map((h) => <th key={h} className="label py-2 pr-3 font-medium">{h}</th>)}</tr></thead>
                <tbody>
                  {ev.stress.cases.map((c) => (
                    <tr key={c.name} className="border-b border-rule align-top">
                      <td className={cn('py-2 pr-2 font-semibold', c.ok ? 'text-good' : 'text-nir')} aria-label={c.ok ? 'as expected' : 'not as expected'}>{c.ok ? '✓' : '✕'}</td>
                      <td className="py-2 pr-3 font-medium">{c.name}</td>
                      <td className="py-2 pr-3 text-ink-2">{c.condition}</td>
                      <td className="py-2 pr-3">{c.expect}</td>
                      <td className="mono py-2 text-[11.5px] text-ink-2">{c.observed}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-[13px] text-ink-2">Recorded {ev.stress.measured_at.slice(0, 10)} by <span className="mono">satquery stress</span> {ev.stress.version}; the API runs it live on every request.</p>
          </div>
        ) : <Pending owner="Shreyash" what="stress suite not recorded in this build" />}
      </Section>

      <p className="mt-6 max-w-[900px] text-[13px] text-ink-2">{ev?.note} Engine: {mode === 'http' ? 'API' : 'browser preview'}. Percentages here are fractions of one unless marked; {pct(0.5)} means 0.50.</p>
    </div>
  )
}
