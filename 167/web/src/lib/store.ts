/** UI state for the workstation. Server state (health, catalog, evaluation) lives in TanStack Query. */

import { create } from 'zustand'
import type { LoadedRaster } from './api'
import type { Modality, QueryResult, Role } from './contract'
import { replaySeconds } from './replay'

export type View = 'map' | 'stack' | 'compare'

interface State {
  inputs: Partial<Record<Role, LoadedRaster>>
  loading: Partial<Record<Role, boolean>>
  derived: { fusion?: string; change?: string }
  result: QueryResult | null
  running: boolean
  /** the trace of the current result is still replaying; evidence waits for it */
  replaying: boolean
  threshold: number
  view: View
  base: string
  overlays: Record<Modality, boolean>
  selected: number | null
  separation: number
  setInput: (role: Role, r: LoadedRaster | undefined) => void
  setLoading: (role: Role, v: boolean) => void
  setDerived: (d: State['derived']) => void
  setResult: (r: QueryResult | null) => void
  setRunning: (v: boolean) => void
  setThreshold: (v: number) => void
  setView: (v: View) => void
  setBase: (v: string) => void
  toggleOverlay: (m: Modality) => void
  select: (i: number | null) => void
  setSeparation: (v: number) => void
}

export const useStation = create<State>((set, get) => ({
  inputs: {},
  loading: {},
  derived: {},
  result: null,
  running: false,
  replaying: false,
  threshold: 0.45,
  view: 'map',
  base: 'optical:base',
  overlays: { optical: true, sar: true, fused: true, temporal: true, derived: true },
  selected: null,
  separation: 0.55,
  setInput: (role, r) => set((s) => {
    const inputs = { ...s.inputs }
    if (r) inputs[role] = r
    else delete inputs[role]
    return { inputs }
  }),
  setLoading: (role, v) => set((s) => ({ loading: { ...s.loading, [role]: v } })),
  setDerived: (derived) => set({ derived }),
  setResult: (result) => {
    const t = result ? replaySeconds(result.trace) : 0
    set({ result, selected: null, replaying: t > 0 })
    // only the result that started this clock may stop it
    if (t > 0) setTimeout(() => { if (get().result === result) set({ replaying: false }) }, t * 1000)
  },
  setRunning: (running) => set({ running }),
  setThreshold: (threshold) => set({ threshold }),
  setView: (view) => set({ view }),
  setBase: (base) => set({ base }),
  toggleOverlay: (m) => set((s) => ({ overlays: { ...s.overlays, [m]: !s.overlays[m] } })),
  select: (selected) => set({ selected }),
  setSeparation: (separation) => set({ separation }),
}))
