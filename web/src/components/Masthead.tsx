import { NavLink, Link } from 'react-router-dom'
import EngineBadge from './EngineBadge'
import { cn } from '@/lib/utils'

const NAV = [
  { to: '/', label: 'Thesis', end: true },
  { to: '/workstation', label: 'Workstation' },
  { to: '/data', label: 'Data & Models' },
  { to: '/results', label: 'Results' },
]

export default function Masthead() {
  return (
    <header className="no-print sticky top-0 z-50 border-b border-ink bg-paper">
      <div className="flex h-14 items-center gap-6 px-4 sm:px-6">
        <Link to="/" className="flex items-baseline gap-1.5" aria-label="SatQuery AI — home">
          <span className="font-display text-[22px] font-extrabold tracking-[-0.04em]">SatQuery</span>
          <span className="mono text-[11px] text-ink-2">AI</span>
        </Link>
        <span className="mono hidden text-[11px] text-ink-2 lg:inline">PS26167 · ISRO · SIH 2026</span>
        <nav aria-label="Primary" className="ml-auto flex items-center overflow-x-auto">
          {NAV.map((n) => (
            <NavLink
              key={n.to} to={n.to} end={n.end}
              className={({ isActive }) => cn(
                'relative whitespace-nowrap px-2.5 py-1.5 text-[13.5px] text-ink-2 hover:text-ink sm:px-3',
                isActive && 'text-ink after:absolute after:inset-x-2.5 after:-bottom-[13px] after:h-[3px] after:bg-ink sm:after:inset-x-3',
              )}
            >
              {n.label}
            </NavLink>
          ))}
        </nav>
        <EngineBadge className="hidden md:block" />
      </div>
    </header>
  )
}
