/**
 * The landing page.
 *
 * Its job is the first thirty seconds: what this is, why it is hard, and what
 * makes it different — before anyone is asked to operate anything.
 *
 * The hero carries the live modality stack rather than a picture of one. It is
 * the product's single strongest idea and it is interactive from the first
 * frame, which is a better argument than any sentence about it.
 */

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight, Ban, CloudOff, Layers3, Radar, ScanSearch, ShieldCheck, Timer,
} from 'lucide-react'
import ModalityStack from '@/components/ModalityStack'
import { Masthead, Footer } from '@/components/Shell'
import { api, type Evaluation, type ScenePayload } from '@/lib/api'

/* ------------------------------------------------------------------ hero */

function Hero({ scene }: { scene: ScenePayload | null }) {
  const [sep, setSep] = useState(0.15)

  // Ease the stack open once on load. The planes start nearly closed and drift
  // apart, so the central idea animates itself into view without the viewer
  // needing to know there is a control.
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setSep(0.5)
      return
    }
    const id = setTimeout(() => setSep(0.5), 700)
    return () => clearTimeout(id)
  }, [])

  return (
    <section className="graticule relative border-b border-rule">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="sweep absolute inset-y-0 w-1/3"
          style={{
            background:
              'linear-gradient(90deg, transparent, rgba(53,224,232,0.03), transparent)',
          }}
        />
      </div>

      <div className="mx-auto grid max-w-6xl items-center gap-8 px-6 py-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
        <div>
          <div className="mono mb-4 inline-flex items-center gap-2 border border-rule px-2.5 py-1 text-[10px] uppercase tracking-widest text-ink-3">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-good" />
            Smart India Hackathon 2026 · ISRO
          </div>

          <h1
            className="text-[clamp(30px,4.4vw,50px)] leading-[1.05] tracking-tight"
            style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}
          >
            {/* the space matters: without it the accessible name, and anything
                reading textContent, gets "imagerya question" */}
            Ask satellite imagery{' '}
            <br />
            <span className="text-sar">a question.</span>
          </h1>

          <p className="mt-5 max-w-[52ch] text-[15px] leading-relaxed text-ink-2">
            Remote-sensing analysis today needs a specialist: which model applies,
            how the sensor behaves, which parameters to set. SatQuery AI takes the
            question instead — it selects the right specialist model, checks the
            imagery can actually answer it, and returns the evidence alongside the
            answer.
          </p>

          <div className="mt-7 flex flex-wrap gap-3">
            <Link
              to="/workstation"
              className="inline-flex items-center gap-2 px-5 py-2.5 text-[13.5px] font-medium transition-opacity hover:opacity-90"
              style={{ background: 'var(--color-sar)', color: 'var(--color-void)' }}
            >
              Open the workstation <ArrowRight size={15} />
            </Link>
            <Link
              to="/evaluation"
              className="inline-flex items-center gap-2 border border-rule-2 px-5 py-2.5 text-[13.5px] text-ink-2 transition-colors hover:border-sar hover:text-sar"
            >
              See the measurements
            </Link>
          </div>

          <p className="mono mt-5 text-[10.5px] leading-relaxed text-ink-3">
            Imagery is synthetic — Cartosat-2S and RISAT data cannot be obtained.
            Every algorithm operating on it is real and measured.
          </p>
        </div>

        <div className="relative h-[380px] border border-rule bg-void lg:h-[440px]">
          {scene ? (
            <>
              <ModalityStack
                separation={sep}
                layerUrl={api.layerUrl}
                hidden={new Set()}
                focus={null}
                onSelect={() => {}}
                boxes={[]}
                scene={scene.optical}
                fit={0.76}
                interactive={false}
              />
              <div className="pointer-events-none absolute bottom-3 left-3 flex flex-col gap-1">
                <span className="mono text-[10px] text-ink-3">
                  drag to orbit — the three planes are the same ground, seen three ways
                </span>
              </div>
            </>
          ) : (
            <div className="flex h-full items-center justify-center">
              <span className="mono text-[11px] text-ink-3">loading scene…</span>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

/* ------------------------------------------------------- the difference */

function Differentiator() {
  return (
    <section className="border-b border-rule bg-abyss">
      <div className="mx-auto max-w-6xl px-6 py-14">
        <div className="label mb-3">The difference</div>
        <h2
          className="max-w-[22ch] text-[clamp(22px,3vw,32px)] leading-tight tracking-tight"
          style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}
        >
          Radar sees what the cloud is hiding.
        </h2>
        <p className="mt-4 max-w-[64ch] text-[14.5px] leading-relaxed text-ink-2">
          Optical sensors measure reflected sunlight, so cloud blinds them
          completely. Radar emits its own pulse, passes straight through cloud,
          and built structures return strongly from corner reflection. Put the two
          together and you recover ground that neither sensor gives alone.
        </p>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {[
            {
              icon: CloudOff,
              tone: 'var(--color-optical)',
              title: 'Optical is blinded',
              body: 'A cloud deck covers part of the scene. Under it the sensor records cloud, not ground — and the system quantifies exactly how much of the scene that is.',
            },
            {
              icon: Radar,
              tone: 'var(--color-sar)',
              title: 'Radar is not',
              body: 'The SAR plane has no cloud at all. Structures are bright because corners reflect straight back; smooth water is nearly black because the pulse reflects away.',
            },
            {
              icon: Layers3,
              tone: 'var(--color-nir)',
              title: 'The recovery is measured',
              body: 'Intersect the two and you get built-up area visible to radar and invisible to optical — reported in hectares, with geometry you can export.',
            },
          ].map((c) => (
            <div
              key={c.title}
              className="border border-rule bg-surface p-5"
              style={{ borderTop: `2px solid ${c.tone}` }}
            >
              <c.icon size={18} style={{ color: c.tone }} />
              <h3 className="mt-3 text-[14px] font-medium">{c.title}</h3>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-2">
                {c.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------ capabilities */

const CAPS = [
  {
    icon: ScanSearch,
    n: '§5.2',
    title: 'Ask and locate',
    body: 'Visual question answering over a single image, plus text-guided grounding that returns boxes in real geographic coordinates.',
  },
  {
    icon: Timer,
    n: '§5.3',
    title: 'Compare two dates',
    body: 'Change detection across a bi-temporal pair, classified semantically — construction and regrowth are told apart, not merely detected.',
  },
  {
    icon: Radar,
    n: '§5.4',
    title: 'Combine two sensors',
    body: 'Complementary extraction from a co-registered optical–SAR pair, with each modality’s contribution kept separable and reported.',
  },
  {
    icon: Ban,
    n: '§5.5',
    title: 'Refuse when it must',
    body: 'The router checks the imagery can support the question before any model runs. Ask what changed with one image and it declines, and says what to upload.',
  },
]

function Capabilities() {
  return (
    <section className="border-b border-rule">
      <div className="mx-auto max-w-6xl px-6 py-14">
        <div className="label mb-3">What it does</div>
        <h2
          className="text-[clamp(22px,3vw,30px)] tracking-tight"
          style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}
        >
          Five mandatory capabilities, all implemented
        </h2>

        <div className="mt-8 grid gap-px bg-rule sm:grid-cols-2">
          {CAPS.map((c) => (
            <div key={c.title} className="bg-void p-6">
              <div className="flex items-center gap-2.5">
                <c.icon size={16} className="text-sar" />
                <span className="mono text-[10px] text-ink-3">{c.n}</span>
              </div>
              <h3 className="mt-3 text-[15px] font-medium">{c.title}</h3>
              <p className="mt-1.5 max-w-[52ch] text-[13px] leading-relaxed text-ink-2">
                {c.body}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-6 flex items-start gap-2.5 border border-rule bg-surface p-4">
          <ShieldCheck size={16} className="mt-0.5 shrink-0 text-good" />
          <p className="text-[13px] leading-relaxed text-ink-2">
            <span className="text-ink">The rule the system is built around:</span>{' '}
            vision models produce the facts, and the language layer only phrases
            them. The answer generator receives measurements and never an image,
            so it cannot invent a number it was not given.
          </p>
        </div>
      </div>
    </section>
  )
}

/* ---------------------------------------------------------------- metrics */

function Metrics() {
  const [ev, setEv] = useState<Evaluation | null>(null)
  useEffect(() => {
    api.evaluation().then(setEv).catch(() => {})
  }, [])

  const headline = [
    { k: 'Water grounding', v: ev?.tasks.find((t) => t.task === 'grounding:water')?.value, unit: 'IoU' },
    { k: 'SAR built-up', v: ev?.tasks.find((t) => t.task === 'sar:structures')?.value, unit: 'F1' },
    { k: 'Router dispatch', v: ev?.tasks.find((t) => t.task === 'router')?.value, unit: 'acc' },
    { k: 'Calibration', v: ev?.calibration.ece, unit: 'ECE' },
  ]

  return (
    <section className="border-b border-rule bg-abyss">
      <div className="mx-auto max-w-6xl px-6 py-14">
        <div className="label mb-3">Measured, not claimed</div>
        <h2
          className="max-w-[26ch] text-[clamp(22px,3vw,30px)] leading-tight tracking-tight"
          style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}
        >
          Against ground truth the pipeline never sees
        </h2>

        <div className="mt-8 grid gap-px bg-rule sm:grid-cols-2 lg:grid-cols-4">
          {headline.map((m) => (
            <div key={m.k} className="bg-void p-5">
              <div className="label">{m.k}</div>
              <div
                className="mono mt-1.5 text-[26px] leading-none"
                style={{ color: m.v === undefined ? 'var(--color-ink-3)' : 'var(--color-good)' }}
              >
                {m.v === undefined ? '—' : m.v.toFixed(4)}
              </div>
              <div className="mono mt-1 text-[10px] text-ink-3">{m.unit}</div>
            </div>
          ))}
        </div>

        <p className="mt-5 max-w-[70ch] text-[12.5px] leading-relaxed text-ink-3">
          Scene generation records ground truth that no analysis module can read —
          a test asserts it. Public-benchmark numbers on VRSBench, RSVQA and CDVQA
          are <span className="text-ink-2">not claimed</span>: those require the
          trained adapters, and stating them before running them would be
          fabrication.
        </p>

        <Link
          to="/evaluation"
          className="mt-6 inline-flex items-center gap-2 text-[13px] text-sar transition-opacity hover:opacity-80"
        >
          The full ablation, A to E <ArrowRight size={14} />
        </Link>
      </div>
    </section>
  )
}

/* -------------------------------------------------------------------- CTA */

function CallToAction() {
  return (
    <section className="border-b border-rule">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-6 px-6 py-12">
        <div className="min-w-[280px] flex-1">
          <h2
            className="text-[clamp(20px,2.6vw,26px)] tracking-tight"
            style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}
          >
            Two things worth trying first
          </h2>
          <p className="mt-2 max-w-[58ch] text-[13.5px] leading-relaxed text-ink-2">
            Ask <span className="text-ink">“what changed between these two dates?”</span>{' '}
            with a single pair loaded and watch it refuse — no model is invoked.
            Then ask it to use both sensors together, and pull the stack apart.
          </p>
        </div>
        <Link
          to="/workstation"
          className="inline-flex items-center gap-2 px-6 py-3 text-[14px] font-medium transition-opacity hover:opacity-90"
          style={{ background: 'var(--color-sar)', color: 'var(--color-void)' }}
        >
          Open the workstation <ArrowRight size={16} />
        </Link>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------- page */

export default function Landing() {
  const [scene, setScene] = useState<ScenePayload | null>(null)
  useEffect(() => {
    api.scene().then(setScene).catch(() => {})
  }, [])

  return (
    <div className="h-full overflow-y-auto" data-scroll-root>
      <Masthead />
      <Hero scene={scene} />
      <Differentiator />
      <Capabilities />
      <Metrics />
      <CallToAction />
      <Footer />
    </div>
  )
}
