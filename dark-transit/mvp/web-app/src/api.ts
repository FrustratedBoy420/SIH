/**
 * The API client. Routes are TECHNICAL_SPEC section 13, unchanged.
 *
 * Everything is served from the same origin as this app, so there is no base
 * URL to configure and no CORS to negotiate: `cli serve` puts the built bundle
 * and the API behind one port on purpose.
 */

import type { Cloud, LogLine, Ranked, Run } from './types'

export class ApiError extends Error {
  status?: number

  constructor(message: string, status?: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(path, init)
  } catch {
    throw new ApiError(
      `Cannot reach the pipeline at ${path}. Start it with: python -m darktransit.cli serve`,
    )
  }
  if (!res.ok) {
    throw new ApiError(`${path} returned ${res.status} ${res.statusText}`, res.status)
  }
  return (await res.json()) as T
}

export const listRuns = () => json<string[]>('/runs')

export const getRun = (id?: string) =>
  json<Run>(id ? `/runs/${encodeURIComponent(id)}/run.json` : '/run.json')

export const getCloud = (id: string) => json<Cloud>(`/runs/${encodeURIComponent(id)}/cloud.json`)

export async function getLog(id: string): Promise<LogLine[]> {
  const res = await fetch(`/runs/${encodeURIComponent(id)}/log`)
  if (!res.ok) return []
  const text = await res.text()
  return text
    .split('\n')
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as LogLine]
      } catch {
        return []
      }
    })
}

export interface RescoreResult {
  ranked: Ranked[]
  leader_margin: number
  weights: Record<string, number>
}

/**
 * Re-rank against stored artefacts. Nothing upstream of stage 07 depends on
 * the weights, which is what makes this a pure function of a run that has
 * already happened — and why a slider can move without re-running physics.
 */
export const rescore = (id: string, weights: Record<string, number>) =>
  json<RescoreResult>(`/runs/${encodeURIComponent(id)}/rescore`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ weights }),
  })

export const runFile = (id: string, file: string) =>
  `/runs/${encodeURIComponent(id)}/${encodeURIComponent(file)}`
