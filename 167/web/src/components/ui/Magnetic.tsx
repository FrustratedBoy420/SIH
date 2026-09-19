/** Magnetic — Motion Primitives (motion-primitives.com, ibelick/motion-primitives), MIT. Inert under reduced motion. */

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { motion, useMotionValue, useReducedMotion, useSpring } from 'motion/react'

export function Magnetic({ children, intensity = 0.35, range = 90, className }: { children: ReactNode; intensity?: number; range?: number; className?: string }) {
  const [hover, setHover] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const reduce = useReducedMotion()
  const x = useMotionValue(0), y = useMotionValue(0)
  const sx = useSpring(x, { stiffness: 26.7, damping: 4.1, mass: 0.2 })
  const sy = useSpring(y, { stiffness: 26.7, damping: 4.1, mass: 0.2 })

  useEffect(() => {
    if (reduce) return
    const onMove = (e: MouseEvent) => {
      if (!ref.current) return
      const r = ref.current.getBoundingClientRect()
      const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2)
      const dist = Math.hypot(dx, dy)
      if (hover && dist <= range) {
        const k = 1 - dist / range
        x.set(dx * intensity * k); y.set(dy * intensity * k)
      } else { x.set(0); y.set(0) }
    }
    document.addEventListener('mousemove', onMove)
    return () => document.removeEventListener('mousemove', onMove)
  }, [hover, intensity, range, reduce, x, y])

  return (
    <motion.div
      ref={ref} className={className}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => { setHover(false); x.set(0); y.set(0) }}
      style={{ x: sx, y: sy }}
    >
      {children}
    </motion.div>
  )
}
