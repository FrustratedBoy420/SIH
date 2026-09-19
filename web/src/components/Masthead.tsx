import { useEffect, useState } from 'react'
import { NavLink, Link, useLocation } from 'react-router-dom'
import EngineBadge from './EngineBadge'
import { api } from '@/lib/api'
import { useStation } from '@/lib/store'
import { cn } from '@/lib/utils'

const NAV: { to: string; label: string; short?: string }[] = [
  { to: '/workstation', label: 'Workstation' },
  { to: '/data', label: 'Data + Models', short: 'Data' },
  { to: '/results', label: 'Results' },
]

const item = 'relative whitespace-nowrap px-1 py-1.5 text-[11px] font-medium uppercase tracking-[0.08em] sm:px-3 sm:text-[11.5px]'
const active = 'text-ink after:absolute after:inset-x-1 after:-bottom-[13px] after:h-[3px] after:bg-ink sm:after:inset-x-3'

/**
 * The masthead reads like a publication's, not a product's: a wordmark, what
 * the instrument is, four sections. It compresses on scroll by type alone —
 * the height stays 56 px, because the pinned landing and the workstation are
 * laid out against it.
 */
export default function Masthead() {
  const [compact, setCompact] = useState(false)
  useEffect(() => {
    const on = () => setCompact(window.scrollY > 24)
    on()
    window.addEventListener('scroll', on, { passive: true })
    return () => window.removeEventListener('scroll', on)
  }, [])

  // REPORT opens the run on screen, else the most recent one on record.
  const current = useStation((s) => s.result?.run_id)
  const { pathname } = useLocation()
  const [recent, setRecent] = useState<string | undefined>()
  useEffect(() => { setRecent(api.runs()[0]?.run_id) }, [current, pathname])
  const report = current ?? recent

  return (
    <header className="no-print sticky top-0 z-50 border-b border-ink bg-paper">
      <div className="flex h-14 items-center gap-3 px-4 sm:gap-6 sm:px-6">
        <Link to="/" className="flex items-baseline gap-2.5" aria-label="SatQuery — home">
          <span className={cn('font-display font-extrabold uppercase tracking-[-0.03em] transition-[font-size] duration-200', compact ? 'text-[17px] sm:text-[18px]' : 'text-[18px] sm:text-[22px]')}>SatQuery</span>
          <span className={cn('mono hidden text-[10.5px] uppercase tracking-[0.08em] text-ink-2 transition-opacity duration-200 lg:inline', compact && 'lg:opacity-0')}>Remote sensing / agentic vision</span>
        </Link>
        <nav aria-label="Primary" className="ml-auto flex items-center">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} aria-label={n.label}
              className={({ isActive }) => cn(item, 'text-ink-2 hover:text-ink', isActive && active)}>
              {n.short ? <><span className="sm:hidden">{n.short}</span><span className="hidden sm:inline">{n.label}</span></> : n.label}
            </NavLink>
          ))}
          {report
            ? <NavLink to={`/report/${report}`} className={({ isActive }) => cn(item, 'text-ink-2 hover:text-ink', (isActive || pathname.startsWith('/report/')) && active)} data-testid="nav-report">Report</NavLink>
            : <span className={cn(item, 'cursor-not-allowed text-ink-3')} title="Run a query first — the report is of a run" aria-disabled="true" data-testid="nav-report">Report</span>}
        </nav>
        <EngineBadge className="hidden md:block" />
      </div>
    </header>
  )
}
