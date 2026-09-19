/**
 * What you can ask — four capabilities, each shown on its own built-in scene
 * and each a deep link that loads that scene and asks that question in the
 * workstation (?scene=&q=). The last one refuses on purpose.
 */

import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { SCENARIOS } from '@/lib/examples'
import type { LandingData } from './useLanding'

const PICK = ['fusion', 'change', 'water', 'refuse']

export default function AskCards({ data }: { data?: LandingData }) {
  // the worker is serial: ask for the change pair only once the hero's run is in
  const { data: pair } = useQuery({ queryKey: ['landing-bitemporal'], queryFn: () => api.demo('bitemporal', 256), enabled: !!data })
  const image: Record<string, string | undefined> = {
    fusion: data?.fusion,
    change: pair?.[1]?.layers.base,
    water: data?.optical.layers.base,
    refuse: data?.optical.layers.base,
  }
  const cards = PICK.map((id) => SCENARIOS.find((s) => s.id === id)!)

  return (
    <section className="px-5 py-24 sm:px-8" aria-labelledby="ask-h" data-testid="ask-cards">
      <p className="label mb-4">What you can ask</p>
      <h2 id="ask-h" className="t-section mb-12 max-w-[820px]">One question box for every kind of analysis</h2>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <Link key={c.id} to={`/workstation?scene=${c.scene}&q=${encodeURIComponent(c.q)}`}
            className="group frame flex flex-col bg-surface transition-colors hover:bg-paper">
            <div className="relative aspect-[4/3] overflow-hidden border-b border-ink bg-surface-2">
              {image[c.id] && <img src={image[c.id]} alt="" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]" />}
              <span className="absolute left-3 top-3 bg-paper px-2 py-0.5 text-[12px] font-medium">{c.capability}</span>
            </div>
            <div className="flex flex-1 flex-col p-5">
              <h3 className="t-display text-[24px]">{c.title}</h3>
              <p className="mt-3 flex-1 text-[15px] leading-[1.5] text-ink-2">“{c.q}”</p>
              <p className="mono mt-4 text-[12px] text-ink-3">{c.needs}</p>
              <span className="mt-4 text-[15px] font-medium underline decoration-sun decoration-2 underline-offset-4 group-hover:decoration-ink">Ask it in the workstation →</span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}
