/**
 * The time transport.
 *
 * This is not a slider on a groove. The track is a plot of r95 — the radius
 * containing 95 % of the particle cloud — against time, so the further back
 * you scrub, the wider the envelope grows beneath the handle.
 *
 * That is the honest statement the whole product rests on. Backward drift
 * diverges: at the detection hour the cloud is 3 km across, and 40 hours back
 * it is 14. A workstation that drew a confident dot at the origin would be
 * lying, and a workstation that buried the growth in a table would be hiding.
 * Putting it in the control means an analyst cannot rewind without watching
 * the certainty go with them.
 *
 * Two marks are fixed on the axis: detection at hour zero, and the origin
 * window the hindcast converged on.
 */

import { useCallback, useEffect, useRef } from 'react'
import type { Drift } from '../types'

interface Props {
  drift: Drift | undefined
  detectionUtc: string
  hour: number
  onHour: (h: number) => void
  playing: boolean
  onPlaying: (p: boolean) => void
}

const W = 1000
const H = 44

export default function Transport({
  drift,
  detectionUtc,
  hour,
  onHour,
  playing,
  onPlaying,
}: Props) {
  const scale = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  const series = drift?.r95_series ?? []
  const forwardHours = drift?.forward?.available ? (drift.forward.hours ?? 0) : 0
  const minHour = series.length ? -Math.max(...series.map((p) => p.hour_back)) : -24
  const maxHour = forwardHours || 0
  const span = maxHour - minHour || 1
  const maxR95 = Math.max(1, ...series.map((p) => p.r95_km), drift?.forward?.r95_km ?? 0)

  const xOf = useCallback((h: number) => ((h - minHour) / span) * W, [minHour, span])

  // ---- scrubbing --------------------------------------------------------- //
  const setFromClientX = useCallback(
    (clientX: number) => {
      const box = scale.current?.getBoundingClientRect()
      if (!box || box.width === 0) return
      const f = Math.min(1, Math.max(0, (clientX - box.left) / box.width))
      onHour(Math.round((minHour + f * span) * 4) / 4)
    },
    [minHour, span, onHour],
  )

  useEffect(() => {
    const move = (e: PointerEvent) => dragging.current && setFromClientX(e.clientX)
    const up = () => (dragging.current = false)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  }, [setFromClientX])

  // ---- playback ---------------------------------------------------------- //
  useEffect(() => {
    if (!playing) return
    let raf = 0
    let last = performance.now()
    let h = hour
    const tick = (now: number) => {
      const dt = (now - last) / 1000
      last = now
      h -= dt * 6 // six simulated hours a second: the rewind reads as a rewind
      if (h <= minHour) {
        onHour(minHour)
        onPlaying(false)
        return
      }
      onHour(Math.round(h * 4) / 4)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
    // `hour` is read once at the start of a playback run, deliberately: adding
    // it to the deps would restart the animation on every frame it emits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, minHour, onHour, onPlaying])

  // ---- the envelope ------------------------------------------------------ //
  const yOf = (r: number) => (H / 2) * (1 - Math.min(1, r / maxR95) * 0.82)
  const points = [...series].sort((a, b) => -a.hour_back - -b.hour_back)
  const upper = points.map((p) => `${xOf(-p.hour_back).toFixed(1)},${yOf(p.r95_km).toFixed(1)}`)
  const lower = [...points]
    .reverse()
    .map((p) => `${xOf(-p.hour_back).toFixed(1)},${(H - yOf(p.r95_km)).toFixed(1)}`)
  const envelope = upper.length ? `${upper.join(' ')} ${lower.join(' ')}` : ''

  const window0 = drift?.origin_window_h?.[0]
  const window1 = drift?.origin_window_h?.[1]
  const current = series.reduce<number | null>(
    (acc, p) =>
      acc === null || Math.abs(-p.hour_back - hour) < Math.abs(acc - hour) ? -p.hour_back : acc,
    null,
  )
  const currentR95 =
    series.find((p) => -p.hour_back === current)?.r95_km ?? drift?.forward?.r95_km ?? 0

  return (
    <div className="transport">
      <div className="transport-head">
        <button className="play" onClick={() => onPlaying(!playing)}>
          {playing ? 'Pause' : 'Rewind'}
        </button>
        <span className="clock">{utcAt(detectionUtc, hour)}</span>
        <span className="eyebrow">
          {hour === 0 ? 'detection' : `${hour > 0 ? '+' : ''}${hour.toFixed(2)} h`}
        </span>
        <span className="transport-keys" style={{ marginLeft: 'auto' }}>
          <span>
            95 % containment <b className="num">{currentR95.toFixed(1)} km</b>
          </span>
          {window0 !== undefined && (
            <span>
              origin window{' '}
              <b className="num">
                {window0.toFixed(1)} to {window1?.toFixed(1)} h
              </b>
            </span>
          )}
        </span>
      </div>

      <div
        className="transport-scale"
        ref={scale}
        role="slider"
        tabIndex={0}
        aria-label="Incident time, hours relative to detection"
        aria-valuemin={minHour}
        aria-valuemax={maxHour}
        aria-valuenow={hour}
        aria-valuetext={`${hour.toFixed(2)} hours, 95 percent containment ${currentR95.toFixed(1)} kilometres`}
        onPointerDown={(e) => {
          dragging.current = true
          onPlaying(false)
          setFromClientX(e.clientX)
        }}
        onKeyDown={(e) => {
          const step = e.shiftKey ? 4 : 1
          if (e.key === 'ArrowLeft') onHour(Math.max(minHour, hour - step))
          else if (e.key === 'ArrowRight') onHour(Math.min(maxHour, hour + step))
          else if (e.key === 'Home') onHour(minHour)
          else if (e.key === 'End') onHour(maxHour)
          else return
          e.preventDefault()
          onPlaying(false)
        }}
      >
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
          {/* the origin window, the interval the hindcast actually converged on */}
          {window0 !== undefined && window1 !== undefined && (
            <rect
              x={xOf(window0)}
              y={0}
              width={Math.max(2, xOf(window1) - xOf(window0))}
              height={H}
              fill="rgba(224,64,154,0.13)"
            />
          )}

          {envelope && <polygon points={envelope} fill="rgba(79,213,208,0.16)" />}
          {envelope && (
            <polyline
              points={upper.join(' ')}
              fill="none"
              stroke="#4fd5d0"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          )}

          <line x1={0} y1={H / 2} x2={W} y2={H / 2} stroke="#1c2b3b" strokeWidth={1} />

          {/* hour ticks, every six */}
          {tickHours(minHour, maxHour).map((h) => (
            <line
              key={h}
              x1={xOf(h)}
              y1={H / 2 - 3}
              x2={xOf(h)}
              y2={H / 2 + 3}
              stroke="#2b405a"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          ))}

          {/* detection */}
          <line
            x1={xOf(0)}
            y1={0}
            x2={xOf(0)}
            y2={H}
            stroke="#eef4fa"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />

          {/* the handle */}
          <line
            x1={xOf(hour)}
            y1={0}
            x2={xOf(hour)}
            y2={H}
            stroke="#e0409a"
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      </div>

      <div className="transport-keys">
        <span>
          <b className="num">{minHour.toFixed(0)} h</b> hindcast limit
        </span>
        <span>detection</span>
        {maxHour > 0 && (
          <span>
            <b className="num">+{maxHour.toFixed(0)} h</b> forecast
          </span>
        )}
        <span style={{ marginLeft: 'auto' }}>
          the shaded band is the cloud radius, not decoration — it widens because the
          hindcast does
        </span>
      </div>
    </div>
  )
}

function tickHours(min: number, max: number): number[] {
  const out: number[] = []
  for (let h = Math.ceil(min / 6) * 6; h <= max; h += 6) out.push(h)
  return out
}

function utcAt(detectionUtc: string, hours: number): string {
  const t = new Date(detectionUtc).getTime() + hours * 3600_000
  return new Date(t).toISOString().replace('T', ' ').replace(/\.\d+Z$/, 'Z')
}
