import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { api } from './api'

export const useEngineMode = () => useQuery({ queryKey: ['mode'], queryFn: api.mode })
export const useHealth = () => useQuery({ queryKey: ['health'], queryFn: api.health })

/** WebGL availability, checked once. The stack degrades to 2D without it (UI-12). */
let gl: boolean | null = null
export function hasWebGL(): boolean {
  if (gl !== null) return gl
  try {
    if (new URLSearchParams(location.search).has('nowebgl')) return (gl = false)
    const c = document.createElement('canvas')
    gl = !!(c.getContext('webgl2') || c.getContext('webgl'))
  } catch { gl = false }
  return gl
}

export function useElementSize<T extends HTMLElement>(ref: React.RefObject<T | null>) {
  const [size, setSize] = useState({ w: 0, h: 0 })
  useEffect(() => {
    if (!ref.current) return
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }))
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [ref])
  return size
}

export function useMediaQuery(q: string) {
  const [m, setM] = useState(() => typeof matchMedia !== 'undefined' && matchMedia(q).matches)
  useEffect(() => {
    const mq = matchMedia(q)
    const on = () => setM(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [q])
  return m
}
