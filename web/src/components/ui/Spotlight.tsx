/**
 * Spotlight — Motion Primitives (motion-primitives.com, ibelick/motion-primitives), MIT.
 * Restyled from zinc to a paper-white lamp — a light table over a plate.
 * Hidden entirely under reduced motion.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { motion, useReducedMotion, useSpring, useTransform } from 'motion/react'
import { cn } from '@/lib/utils'

export function Spotlight({ className, size = 260 }: { className?: string; size?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState(false)
  const [parent, setParent] = useState<HTMLElement | null>(null)
  const reduce = useReducedMotion()
  const mx = useSpring(0, { bounce: 0 }), my = useSpring(0, { bounce: 0 })
  const left = useTransform(mx, (x) => `${x - size / 2}px`)
  const top = useTransform(my, (y) => `${y - size / 2}px`)

  useEffect(() => { if (ref.current?.parentElement) setParent(ref.current.parentElement) }, [])
  const onMove = useCallback((e: MouseEvent) => {
    if (!parent) return
    const r = parent.getBoundingClientRect()
    mx.set(e.clientX - r.left); my.set(e.clientY - r.top)
  }, [mx, my, parent])

  useEffect(() => {
    if (!parent) return
    const ac = new AbortController()
    parent.addEventListener('mousemove', onMove, { signal: ac.signal })
    parent.addEventListener('mouseenter', () => setHover(true), { signal: ac.signal })
    parent.addEventListener('mouseleave', () => setHover(false), { signal: ac.signal })
    return () => ac.abort()
  }, [parent, onMove])

  if (reduce) return <div ref={ref} hidden />
  return (
    <motion.div
      ref={ref}
      aria-hidden
      className={cn(
        'pointer-events-none absolute z-[1] rounded-full mix-blend-soft-light blur-2xl transition-opacity duration-200',
        'bg-[radial-gradient(circle_at_center,rgb(255_255_255/0.95),rgb(221_238_240/0.5)_45%,transparent_72%)]',
        hover ? 'opacity-100' : 'opacity-0', className,
      )}
      style={{ width: size, height: size, left, top }}
    />
  )
}
