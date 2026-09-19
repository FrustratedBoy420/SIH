/**
 * Animated Beam — Magic UI (magicui.design/r/animated-beam), MIT.
 * Restyled: the beam is the accent (interaction/data flow), the path a rule.
 * Used for the pipeline diagram, where it shows data moving stage to stage.
 */

import { useEffect, useId, useState, type RefObject } from 'react'
import { motion } from 'motion/react'
import { cn } from '@/lib/utils'

export interface AnimatedBeamProps {
  className?: string
  containerRef: RefObject<HTMLElement | null>
  fromRef: RefObject<HTMLElement | null>
  toRef: RefObject<HTMLElement | null>
  curvature?: number
  reverse?: boolean
  pathColor?: string
  pathWidth?: number
  pathOpacity?: number
  gradientStartColor?: string
  gradientStopColor?: string
  delay?: number
  duration?: number
}

export function AnimatedBeam({
  className, containerRef, fromRef, toRef, curvature = 0, reverse = false, duration = 4, delay = 0,
  pathColor = 'var(--color-rule-2)', pathWidth = 1.5, pathOpacity = 1,
  gradientStartColor = '#0e7c86', gradientStopColor = '#6b5ca5',
}: AnimatedBeamProps) {
  const id = useId()
  const [d, setD] = useState('')
  const [dim, setDim] = useState({ width: 0, height: 0 })
  const g = reverse
    ? { x1: ['90%', '-10%'], x2: ['100%', '0%'], y1: ['0%', '0%'], y2: ['0%', '0%'] }
    : { x1: ['10%', '110%'], x2: ['0%', '100%'], y1: ['0%', '0%'], y2: ['0%', '0%'] }

  useEffect(() => {
    const update = () => {
      if (!containerRef.current || !fromRef.current || !toRef.current) return
      const c = containerRef.current.getBoundingClientRect()
      const a = fromRef.current.getBoundingClientRect()
      const b = toRef.current.getBoundingClientRect()
      setDim({ width: c.width, height: c.height })
      const sx = a.left - c.left + a.width / 2, sy = a.top - c.top + a.height / 2
      const ex = b.left - c.left + b.width / 2, ey = b.top - c.top + b.height / 2
      setD(`M ${sx},${sy} Q ${(sx + ex) / 2},${sy - curvature} ${ex},${ey}`)
    }
    const ro = new ResizeObserver(update)
    if (containerRef.current) ro.observe(containerRef.current)
    update()
    return () => ro.disconnect()
  }, [containerRef, fromRef, toRef, curvature])

  return (
    <svg fill="none" width={dim.width} height={dim.height} className={cn('pointer-events-none absolute top-0 left-0', className)} viewBox={`0 0 ${dim.width} ${dim.height}`} aria-hidden>
      <path d={d} stroke={pathColor} strokeWidth={pathWidth} strokeOpacity={pathOpacity} strokeLinecap="round" />
      <path d={d} strokeWidth={pathWidth + 0.5} stroke={`url(#${id})`} strokeLinecap="round" />
      <defs>
        <motion.linearGradient
          id={id}
          gradientUnits="userSpaceOnUse"
          initial={{ x1: '0%', x2: '0%', y1: '0%', y2: '0%' }}
          animate={{ x1: g.x1, x2: g.x2, y1: g.y1, y2: g.y2 }}
          transition={{ delay, duration, ease: [0.16, 1, 0.3, 1], repeat: Infinity }}
        >
          <stop stopColor={gradientStartColor} stopOpacity="0" />
          <stop stopColor={gradientStartColor} />
          <stop offset="32.5%" stopColor={gradientStopColor} />
          <stop offset="100%" stopColor={gradientStopColor} stopOpacity="0" />
        </motion.linearGradient>
      </defs>
    </svg>
  )
}
