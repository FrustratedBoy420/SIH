/** Blur Fade — Magic UI (magicui.design/r/blur-fade), MIT. Defaults tuned to 06 §6 (short, small travel). */

import { useRef, type ReactNode } from 'react'
import { motion, useInView, type MotionProps, type Variants } from 'motion/react'

interface Props extends MotionProps {
  children: ReactNode
  className?: string
  duration?: number
  delay?: number
  offset?: number
  direction?: 'up' | 'down' | 'left' | 'right'
  inView?: boolean
  blur?: string
}

export function BlurFade({ children, className, duration = 0.42, delay = 0, offset = 10, direction = 'down', inView = true, blur = '6px', ...props }: Props) {
  const ref = useRef(null)
  const seen = useInView(ref, { once: true, margin: '-60px' })
  const visible = !inView || seen
  const axis = direction === 'left' || direction === 'right' ? 'x' : 'y'
  const variants: Variants = {
    hidden: { [axis]: direction === 'right' || direction === 'down' ? -offset : offset, opacity: 0, filter: `blur(${blur})` },
    visible: { [axis]: 0, opacity: 1, filter: 'blur(0px)' },
  }
  return (
    <motion.div
      ref={ref}
      initial="hidden"
      animate={visible ? 'visible' : 'hidden'}
      variants={variants}
      transition={{ delay: 0.04 + delay, duration, ease: [0.2, 0.7, 0.3, 1] }}
      className={className}
      {...props}
    >
      {children}
    </motion.div>
  )
}
