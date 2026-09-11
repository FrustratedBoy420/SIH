/**
 * Everything the landing shows is computed, not written: the scene is
 * generated, RQ-4 is actually run on it, and the telemetry is measured from
 * the pixels. The numbers on the page are therefore the pipeline's numbers.
 */

import { useQuery } from '@tanstack/react-query'
import { api, type LoadedRaster } from '@/lib/api'
import type { QueryResult } from '@/lib/contract'
import { RQ4 } from '@/lib/examples'

/**
 * The same 512 px scene the workstation loads, so every number on the landing
 * is the number a judge gets when they ask the same question in the tool —
 * and the worker's cache makes the workstation open instantly afterwards.
 */
export const HERO_SIZE = 512

export interface LandingData {
  optical: LoadedRaster
  sar: LoadedRaster
  fusion: string
  stats: { built_db: number | null; other_db: number | null; cloud_pct: number }
  result: QueryResult
}

export function useLanding() {
  return useQuery({
    queryKey: ['landing'],
    queryFn: async (): Promise<LandingData> => {
      const [optical, sar] = await api.demo('crossmodal', HERO_SIZE)
      const [fusion, stats] = await Promise.all([
        api.derived('fusion', optical.local_id, sar.local_id),
        api.stats(optical.local_id, sar.local_id),
      ])
      const result = await api.query(
        { query: RQ4, inputs: { optical: optical.raster_id, sar: sar.raster_id } },
        { optical: optical.local_id, sar: sar.local_id }, { save: false })
      return { optical, sar, fusion, stats, result }
    },
  })
}

export const REFUSAL_Q = 'What changed between these two dates?'

export function useRefusal(optical?: LoadedRaster) {
  return useQuery({
    queryKey: ['landing-refusal', optical?.raster_id],
    enabled: !!optical,
    queryFn: () => api.query({ query: REFUSAL_Q, inputs: { optical: optical!.raster_id } }, { optical: optical!.local_id }, { save: false }),
  })
}
