/**
 * Evaluation.
 *
 * The page that decides whether a judge believes the rest of the site. Three
 * things it deliberately does:
 *
 *   - shows what is NOT claimed as prominently as what is
 *   - explains why the segmentation column is flat across the last three
 *     ablation rows, instead of quietly reporting only the column that moves
 *   - states that ground truth is unreadable by every analysis module, which is
 *     the only condition under which a synthetic benchmark measures anything
 */

import { useEffect, useState } from 'react'
import { ShieldOff, TerminalSquare } from 'lucide-react'
import { Page } from '@/components/Shell'
import { Ablation, Metrics } from '@/components/panels'
import { api, type Evaluation } from '@/lib/api'

export default function EvaluationPage() {
  const [ev, setEv] = useState<Evaluation | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.evaluation().then(setEv)
      .catch(() => setError('backend unreachable — start `python -m satquery.cli serve`'))
  }, [])

  return (
    <Page
      title="Evaluation"
      lede="Measured against ground truth that no analysis module can read. Every
            number on this page is reproducible with one command, and the numbers
            that are not claimed are listed alongside the ones that are."
    >
      {error && (
        <p className="mono border border-[#5c2318] bg-[#170a08] px-3 py-2 text-[12px] text-nir">
          {error}
        </p>
      )}

      <div className="flex items-center gap-2 border border-rule bg-surface px-3.5 py-2.5">
        <TerminalSquare size={14} className="shrink-0 text-sar" />
        <code className="mono text-[12px] text-ink">python -m satquery.cli eval</code>
        <span className="mono ml-auto text-[10.5px] text-ink-3">
          regenerates everything below
        </span>
      </div>

      <div className="mt-8 grid gap-10 lg:grid-cols-2">
        <section>
          <h2 className="text-[19px] font-semibold tracking-tight"
              style={{ fontFamily: 'var(--font-display)' }}>
            Per-task accuracy
          </h2>
          <p className="mt-1.5 max-w-[56ch] text-[13px] leading-relaxed text-ink-2">
            Each row runs the shipped specialist — not a reimplementation of it.
            An earlier version of this harness scored water grounding at 0.058
            because the evaluator recomputed the mask with a plain Otsu threshold
            instead of calling the code that ships. An evaluation that
            reimplements the algorithm measures the reimplementation.
          </p>
          <div className="mt-4 border border-rule bg-surface px-3.5 py-3">
            {ev ? <Metrics e={ev} />
              : <p className="mono text-[12px] text-ink-3">loading…</p>}
          </div>
          {ev && (
            <p className="mono mt-2 text-[10.5px] leading-relaxed text-ink-3">
              calibration measured over {ev.calibration.n} predictions · expected
              calibration error is the mean gap between stated confidence and
              observed accuracy
            </p>
          )}
        </section>

        <section>
          <h2 className="text-[19px] font-semibold tracking-tight"
              style={{ fontFamily: 'var(--font-display)' }}>
            Ablation — what each layer contributes
          </h2>
          <p className="mt-1.5 max-w-[56ch] text-[13px] leading-relaxed text-ink-2">
            Five configurations, from a bare brightness threshold to the full
            system. Every row is classical computer vision — no neural model is
            loaded in this ablation; the trained adapters replace these rows
            rather than renaming them. The
            segmentation column is flat across C, D and E because the router and
            the evidence layer do not sharpen masks — they add capability the
            mask metric cannot see. Reporting the flat column anyway is the
            point; the composite is what separates the rows.
          </p>
          <div className="mt-4">
            {ev ? <Ablation rows={ev.ablation.rows} />
              : <p className="mono text-[12px] text-ink-3">loading…</p>}
          </div>
          <p className="mono mt-2 text-[10.5px] leading-relaxed text-ink-3">
            capability = 0.50 × segmentation F1 + 0.25 × router accuracy
            + 0.25 × cross-modal recovery — a composite defined by this project,
            not a standard metric; the weights are a stated judgement.
          </p>
        </section>
      </div>

      {/* what is not claimed */}
      <section className="mt-12 border border-[#4a3d18] bg-[#141005] p-5">
        <div className="flex items-center gap-2">
          <ShieldOff size={15} style={{ color: '#d9b26a' }} />
          <h2 className="text-[16px] font-semibold" style={{ color: '#d9b26a' }}>
            Not claimed
          </h2>
        </div>
        <div className="mt-3 grid gap-5 md:grid-cols-2">
          <div>
            <p className="text-[13px] leading-relaxed text-ink-2">
              <strong className="text-ink">No VRSBench, RSVQA or CDVQA scores.</strong>{' '}
              Those benchmarks need the trained LoRA adapters of §5.1, which need
              GPU time not yet spent. The published anchors are known — GeoChat
              reaches 40.8% zero-shot on VRSBench VQA and 60.6% fine-tuned — and
              quoting them as though they were ours would be the easiest lie on
              this site to tell and the easiest to catch.
            </p>
          </div>
          <div>
            <p className="text-[13px] leading-relaxed text-ink-2">
              <strong className="text-ink">The imagery is synthetic.</strong>{' '}
              Cartosat-2S and RISAT data cannot be obtained and the ISRO/SAC
              evaluation set is undisclosed. Ground truth lives in{' '}
              <code className="mono text-[12px]">Scene.truth</code> and is read
              only by the evaluator — a test asserts that no analysis module
              imports it. Without that separation these numbers would measure
              nothing at all.
            </p>
          </div>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-[19px] font-semibold tracking-tight"
            style={{ fontFamily: 'var(--font-display)' }}>
          Router dispatch
        </h2>
        <p className="mt-1.5 max-w-[72ch] text-[13px] leading-relaxed text-ink-2">
          Nineteen cases covering each of the four task types, the paraphrases
          that should route to them, the queries that should be refused for
          missing inputs, and the ones that should abstain because nothing in the
          scene answers them. Refusal is a measured behaviour here, not an error
          path — a system that answers a bi-temporal question from a single image
          is worse than one that declines.
        </p>
      </section>
    </Page>
  )
}
