/**
 * The landing globe: the Earth as square pixels, India lit, and a marker on
 * the scene the rest of the page analyses. Land comes from a 1°-per-pixel
 * Natural Earth mask (public/landmask.png, baked by tools/make_landmask.py);
 * dots sit on a Fibonacci sphere so spacing is even from pole to equator.
 *
 * Imperative three.js with named imports, as in ModalityStack, to keep the
 * bundle tree-shaken. Slow drift until touched; none under reduced motion.
 * Without WebGL the same dots are drawn once, flat, on a 2D canvas (UI-12).
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  BufferGeometry, Color, Float32BufferAttribute, Mesh, MeshBasicMaterial, PerspectiveCamera, Points, PointsMaterial,
  RingGeometry, Scene, SphereGeometry, SRGBColorSpace, Vector3, WebGLRenderer, DoubleSide,
} from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { hasWebGL } from '@/lib/hooks'

const N = 9000
const INK = '#0e2129', GREEN = '#3b7552', SAGE = '#9cc384', SUN = '#ffc000', OCEAN = '#e4e2de'

/** India as the Survey of India draws it (all of J&K), coarse — the dots are ~2.4° apart. */
const INDIA: [number, number][] = [
  [68.2, 23.7], [70.0, 20.8], [72.8, 19.0], [73.4, 16.0], [74.8, 12.8], [76.3, 9.5], [77.5, 8.0], [78.2, 8.9],
  [79.9, 10.3], [80.3, 13.0], [80.1, 15.8], [82.3, 16.6], [84.8, 19.2], [86.9, 21.5], [88.9, 21.6], [88.7, 24.2],
  [88.1, 26.4], [89.8, 26.0], [92.0, 25.1], [92.6, 22.0], [93.4, 23.9], [94.6, 25.5], [95.2, 27.0], [97.2, 28.0],
  [95.4, 29.2], [91.6, 27.8], [88.8, 27.3], [88.1, 27.9], [84.0, 27.4], [80.1, 28.8], [81.0, 30.2], [79.0, 31.3],
  [78.8, 32.5], [79.5, 32.9], [80.3, 35.4], [77.8, 35.6], [76.8, 36.0], [74.8, 37.1], [72.5, 36.6], [73.7, 34.4],
  [74.5, 32.8], [75.3, 32.3], [74.6, 31.0], [74.5, 30.0], [73.4, 29.9], [72.0, 28.3], [70.6, 27.8], [69.5, 26.7],
  [70.2, 25.7], [71.0, 24.4], [68.8, 24.3],
]

function inPoly(lon: number, lat: number, poly: [number, number][]) {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j]
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** Same convention as three-globe: +Y north, lon 0 on +Z. */
function xyz(lat: number, lon: number, r = 1): [number, number, number] {
  const phi = ((90 - lat) * Math.PI) / 180, th = ((lon + 180) * Math.PI) / 180
  return [-r * Math.sin(phi) * Math.cos(th), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(th)]
}

type Dot = { lat: number; lon: number; colour: string }

async function loadDots(): Promise<Dot[]> {
  const img = new Image()
  img.src = `${import.meta.env.BASE_URL}landmask.png`
  await img.decode()
  const c = document.createElement('canvas')
  c.width = 360; c.height = 180
  const ctx = c.getContext('2d')!
  ctx.drawImage(img, 0, 0)
  const px = ctx.getImageData(0, 0, 360, 180).data
  const dots: Dot[] = []
  const golden = Math.PI * (3 - Math.sqrt(5))
  for (let i = 0; i < N; i++) {
    const y = 1 - (i / (N - 1)) * 2
    const lat = (Math.asin(y) * 180) / Math.PI
    const lon = ((((i * golden * 180) / Math.PI) % 360) + 360) % 360 - 180
    const x = Math.min(359, Math.floor(lon + 180)), row = Math.min(179, Math.floor(90 - lat))
    if (px[(row * 360 + x) * 4] < 128) continue
    // deterministic pixel-art mix: mostly green, some ink, a little sage
    const h = Math.sin(i * 12.9898) * 43758.5453, f = h - Math.floor(h)
    const colour = inPoly(lon, lat, INDIA) ? SUN : f < 0.62 ? GREEN : f < 0.9 ? INK : SAGE
    dots.push({ lat, lon, colour })
  }
  return dots
}

export interface GlobeProps { marker?: [number, number]; className?: string }

export default function Globe({ marker, className }: GlobeProps) {
  const [gl] = useState(hasWebGL)
  const [failed, setFailed] = useState(false)
  const fail = useCallback(() => setFailed(true), [])
  // primitives, so a new array from the parent does not rebuild the scene
  const [lat, lon] = marker ?? [17.40, 78.31]   // the built-in scene, west Hyderabad
  return gl && !failed
    ? <GlobeGL lat={lat} lon={lon} className={className} onError={fail} />
    : <GlobeFlat lat={lat} lon={lon} className={className} />
}

interface At { lat: number; lon: number; className?: string }

function GlobeGL({ lat, lon, className, onError }: At & { onError: () => void }) {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = host.current
    if (!el) return
    let renderer: WebGLRenderer
    try {
      renderer = new WebGLRenderer({ antialias: true, alpha: true })
    } catch { onError(); return }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.outputColorSpace = SRGBColorSpace
    renderer.domElement.style.display = 'block'
    renderer.domElement.addEventListener('webglcontextlost', onError)
    el.appendChild(renderer.domElement)

    const scene = new Scene()
    const camera = new PerspectiveCamera(32, 1, 0.1, 50)
    camera.position.set(...xyz(lat - 4, lon, 4.1))
    const controls = new OrbitControls(camera, renderer.domElement)
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    Object.assign(controls, { enableDamping: true, dampingFactor: 0.08, enableZoom: false, enablePan: false, rotateSpeed: 0.5, autoRotate: !still, autoRotateSpeed: 0.35 })
    const stop = () => { controls.autoRotate = false }
    controls.addEventListener('start', stop)

    // the ocean: an opaque ball just inside the dots, so the far side is hidden
    const oceanGeo = new SphereGeometry(0.985, 64, 48)
    const oceanMat = new MeshBasicMaterial({ color: OCEAN })
    scene.add(new Mesh(oceanGeo, oceanMat))

    const dotGeo = new BufferGeometry()
    const dotMat = new PointsMaterial({ size: 0.042, vertexColors: true, sizeAttenuation: true })
    let live = true
    loadDots().then((dots) => {
      if (!live) return
      const pos: number[] = [], col: number[] = []
      const c = new Color()
      for (const d of dots) {
        pos.push(...xyz(d.lat, d.lon))
        c.set(d.colour) // set() already converts sRGB hex to linear
        col.push(c.r, c.g, c.b)
      }
      dotGeo.setAttribute('position', new Float32BufferAttribute(pos, 3))
      dotGeo.setAttribute('color', new Float32BufferAttribute(col, 3))
      scene.add(new Points(dotGeo, dotMat))
    }).catch(onError)

    // the scene marker: an ink square on the surface and a ring that breathes
    const at = new Vector3(...xyz(lat, lon, 1.004))
    const pinGeo = new BufferGeometry().setAttribute('position', new Float32BufferAttribute(at.toArray(), 3))
    const pinMat = new PointsMaterial({ size: 0.07, color: INK, sizeAttenuation: true })
    scene.add(new Points(pinGeo, pinMat))
    const ringGeo = new RingGeometry(0.05, 0.062, 4, 1, Math.PI / 4)
    const ringMat = new MeshBasicMaterial({ color: INK, transparent: true, side: DoubleSide })
    const ring = new Mesh(ringGeo, ringMat)
    ring.position.copy(at)
    ring.lookAt(at.clone().multiplyScalar(2))
    scene.add(ring)

    const resize = () => {
      const w = el.clientWidth, h = el.clientHeight
      if (!w || !h) return
      renderer.setSize(w, h)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    }
    const ro = new ResizeObserver(resize)
    ro.observe(el)
    resize()

    let raf = 0
    const t0 = performance.now()
    const tick = () => {
      raf = requestAnimationFrame(tick)
      const t = ((performance.now() - t0) / 1600) % 1
      const s = still ? 1.4 : 1 + t * 1.8
      ring.scale.set(s, s, s)
      ringMat.opacity = still ? 1 : 1 - t
      controls.update()
      renderer.render(scene, camera)
    }
    tick()

    return () => {
      live = false
      cancelAnimationFrame(raf)
      ro.disconnect()
      controls.removeEventListener('start', stop)
      controls.dispose()
      for (const d of [oceanGeo, oceanMat, dotGeo, dotMat, pinGeo, pinMat, ringGeo, ringMat]) d.dispose()
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [lat, lon, onError])

  return <div ref={host} className={className} data-testid="globe" role="img" aria-label="Globe of the Earth drawn in square pixels, India highlighted, with a marker on the demo scene, west Hyderabad. Drag to turn it." />
}

/** No WebGL: the same dots, orthographic, drawn once. */
function GlobeFlat({ lat, lon, className }: At) {
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    let live = true
    loadDots().then((dots) => {
      const c = canvas.current
      if (!live || !c) return
      const S = 720
      c.width = S; c.height = S
      const ctx = c.getContext('2d')!
      const r = S * 0.46, cx = S / 2, cy = S / 2
      const lat0 = ((lat - 4) * Math.PI) / 180, lon0 = (lon * Math.PI) / 180
      ctx.fillStyle = OCEAN
      ctx.beginPath(); ctx.arc(cx, cy, r * 0.985, 0, Math.PI * 2); ctx.fill()
      const project = (a: number, o: number) => {
        const p = (a * Math.PI) / 180, l = (o * Math.PI) / 180 - lon0
        const cosc = Math.sin(lat0) * Math.sin(p) + Math.cos(lat0) * Math.cos(p) * Math.cos(l)
        if (cosc < 0) return null
        return [cx + r * Math.cos(p) * Math.sin(l), cy - r * (Math.cos(lat0) * Math.sin(p) - Math.sin(lat0) * Math.cos(p) * Math.cos(l))]
      }
      for (const d of dots) {
        const q = project(d.lat, d.lon)
        if (!q) continue
        ctx.fillStyle = d.colour
        ctx.fillRect(q[0] - 5, q[1] - 5, 10, 10)
      }
      const m = project(lat, lon)
      if (m) {
        ctx.fillStyle = INK
        ctx.fillRect(m[0] - 7, m[1] - 7, 14, 14)
        ctx.strokeStyle = INK; ctx.lineWidth = 2
        ctx.strokeRect(m[0] - 16, m[1] - 16, 32, 32)
      }
    })
    return () => { live = false }
  }, [lat, lon])
  return (
    <div className={className} data-testid="globe-fallback">
      <canvas ref={canvas} className="mx-auto block aspect-square h-full max-w-full object-contain" role="img" aria-label="Globe of the Earth drawn in square pixels, India highlighted, with a marker on the demo scene, west Hyderabad." />
    </div>
  )
}
