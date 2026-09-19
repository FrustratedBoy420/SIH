import { useEffect, useState } from 'react'
import { NavLink, Link, useLocation } from 'react-router-dom'
import EngineBadge from './EngineBadge'
import Mark from './Mark'
import { api } from '@/lib/api'
import { useStation } from '@/lib/store'
import { cn } from '@/lib/utils'

const NAV: { to: string; label: string; short?: string }[] = [
  { to: '/workstation', label: 'Workstation' },
  { to: '/data', label: 'Data & models', short: 'Data' },
  { to: '/results', label: 'Results' },
]

const item = 'relative whitespace-nowrap px-1.5 py-1.5 text-[14px] font-medium sm:px-3 sm:text-[15px]'
const active = 'text-ink after:absolute after:inset-x-1.5 after:-bottom-[3px] after:h-[2px] after:bg-ink sm:after:inset-x-3'

/**
 * Wordmark left, three sections and the report right, one action in yellow.
 * The height is fixed (--masthead) because the workstation and the landing
 * hero are laid out against it.
 */
export default function Masthead() {
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8)
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
  const inStation = pathname.startsWith('/workstation')

  return (
    <header className={cn('no-print sticky top-0 z-50 border-b bg-paper transition-colors', scrolled || inStation ? 'border-ink' : 'border-transparent')}>
      <div className="flex h-16 items-center gap-3 px-4 sm:gap-6 sm:px-8">
        <Link to="/" className="flex items-center gap-2.5" aria-label="SatQuery — home">
          <Mark className="size-7" />
          <span className="text-[19px] font-semibold tracking-[-0.02em]">SatQuery<span className="ml-1 text-ink-3">AI</span></span>
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
        {!inStation && <Link to="/workstation" className="btn btn-sun btn-sm hidden lg:inline-flex">Ask the imagery</Link>}
      </div>
    </header>
  )
}
