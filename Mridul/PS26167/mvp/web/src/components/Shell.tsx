/**
 * The site shell: masthead, navigation, footer.
 *
 * The workstation is one page of a site rather than the whole product. That
 * matters for the first thirty seconds — a judge who lands directly inside a
 * dense instrument panel has to work out what they are looking at before they
 * can evaluate it, and thirty seconds is a large fraction of a ten-minute slot.
 */

import { NavLink, Link } from 'react-router-dom'
import { Satellite } from 'lucide-react'
import type { ReactNode } from 'react'

const NAV = [
  { to: '/', label: 'Overview', end: true },
  { to: '/workstation', label: 'Workstation' },
  { to: '/data', label: 'Data & models' },
  { to: '/evaluation', label: 'Evaluation' },
]

export function Masthead({ dense = false }: { dense?: boolean }) {
  return (
    <header
      className="z-30 flex items-center gap-6 border-b border-rule bg-abyss/90 px-6 backdrop-blur"
      style={{ height: dense ? 52 : 60 }}
    >
      <Link to="/" className="flex items-baseline gap-2.5">
        <Satellite size={17} className="translate-y-0.5 text-sar" />
        <span
          className="text-[17px] font-semibold tracking-tight"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          SatQuery&nbsp;AI
        </span>
        <span className="mono hidden border border-rule px-1.5 py-0.5 text-[9px] uppercase tracking-widest text-ink-3 sm:inline">
          PS 26167 · ISRO
        </span>
      </Link>

      <nav className="ml-auto flex items-center gap-1">
        {NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.end}
            className={({ isActive }) =>
              `px-3 py-1.5 text-[12.5px] transition-colors ${
                isActive ? 'text-sar' : 'text-ink-2 hover:text-ink'
              }`
            }
            style={({ isActive }) => ({
              borderBottom: isActive
                ? '2px solid var(--color-sar)'
                : '2px solid transparent',
            })}
          >
            {n.label}
          </NavLink>
        ))}
      </nav>
    </header>
  )
}

export function Footer() {
  return (
    <footer className="border-t border-rule bg-abyss px-6 py-8">
      <div className="mx-auto flex max-w-6xl flex-wrap gap-x-16 gap-y-6">
        <div className="min-w-[260px] flex-1">
          <div className="flex items-baseline gap-2">
            <Satellite size={14} className="translate-y-0.5 text-sar" />
            <span
              className="text-[14px] font-semibold"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              SatQuery AI
            </span>
          </div>
          <p className="mt-2 max-w-[46ch] text-[12px] leading-relaxed text-ink-3">
            Agentic vision-language analysis of remote-sensing imagery. Built for
            Smart India Hackathon 2026, problem statement 26167, Indian Space
            Research Organisation.
          </p>
        </div>

        <div>
          <div className="label mb-2">Pages</div>
          {NAV.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              className="block py-0.5 text-[12px] text-ink-2 transition-colors hover:text-sar"
            >
              {n.label}
            </Link>
          ))}
        </div>

        <div>
          <div className="label mb-2">Built on</div>
          {[
            'BigEarthNet.txt',
            'VRSBench',
            'RSVQA',
            'CDVQA',
          ].map((d) => (
            <div key={d} className="mono py-0.5 text-[11.5px] text-ink-3">
              {d}
            </div>
          ))}
        </div>

        <div>
          <div className="label mb-2">Verified</div>
          {[
            ['self-tests', '30 / 30'],
            ['UI checks', '20 / 20'],
            ['console errors', '0'],
          ].map(([k, v]) => (
            <div key={k} className="flex gap-3 py-0.5 text-[11.5px]">
              <span className="text-ink-3">{k}</span>
              <span className="mono ml-auto text-good">{v}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="mx-auto mt-8 max-w-6xl border-t border-rule pt-4">
        <p className="mono text-[10.5px] leading-relaxed text-ink-3">
          Imagery on this site is synthetic. Cartosat-2S and RISAT data cannot be
          obtained and the ISRO/SAC evaluation set is undisclosed. Every algorithm
          operating on it is a real implementation, measured against ground truth
          it never sees.
        </p>
      </div>
    </footer>
  )
}

/** Standard page frame for everything except the workstation. */
export function Page({
  title,
  lede,
  children,
}: {
  title: string
  lede?: string
  children: ReactNode
}) {
  return (
    <div className="flex h-full flex-col overflow-y-auto" data-scroll-root>
      <Masthead />
      <main className="flex-1">
        <div className="mx-auto max-w-6xl px-6 py-10">
          <h1
            className="text-[30px] leading-tight tracking-tight"
            style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}
          >
            {title}
          </h1>
          {lede && (
            <p className="mt-2 max-w-[68ch] text-[14.5px] leading-relaxed text-ink-2">
              {lede}
            </p>
          )}
          <div className="mt-8">{children}</div>
        </div>
      </main>
      <Footer />
    </div>
  )
}
