/**
 * The modality stack — the one place three dimensions carry information
 * (06 §7). Optical above, fusion between, SAR below; pull them apart and the
 * complementarity the PS asks for (R4) is seen rather than claimed:
 *
 *   OPTICAL  cloud over the main town, and nothing visible beneath it
 *   SAR      no cloud — radar passes through it — and structures bright
 *   FUSION   what SAR recovered from beneath that cloud, in the change hue
 *
 * Written against three.js directly, with named imports, rather than through
 * react-three-fiber: r3f registers the whole THREE namespace, which defeats
 * tree-shaking and alone put the bundle over NFR-13. The scene is small
 * enough that the imperative version is also the clearer one.
 *
 * Idle drift until first touch; none under reduced motion. Labels are DOM,
 * projected each frame, so they are real text. Everything here is also in the
 * evidence and trace panels — the canvas is never the only path (UI-13).
 */

import { useEffect, useRef } from 'react'
import {
  Color, EdgesGeometry, Group, LineBasicMaterial, LineSegments, Mesh, MeshBasicMaterial, PerspectiveCamera,
  PlaneGeometry, Raycaster, Scene, SRGBColorSpace, TextureLoader, Vector2, Vector3, WebGLRenderer, DoubleSide,
  type Texture,
} from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { GeoBox } from '@/lib/contract'

const PLANE_W = 3.2
export type LayerKey = 'optical' | 'fusion' | 'sar'

const LAYERS: { key: LayerKey; y: number; label: string; colour: string }[] = [
  { key: 'optical', y: 1, label: 'OPTICAL', colour: '#b8763a' },
  { key: 'fusion', y: 0, label: 'FUSION', colour: '#6b5ca5' },
  { key: 'sar', y: -1, label: 'SAR', colour: '#2c7a8c' },
]

interface Props {
  urls: Record<LayerKey, string>
  subs: Record<LayerKey, string>
  separation: number
  boxes: GeoBox[]
  bounds?: number[]
  aspect?: number
  interactive?: boolean
  fit?: number
  onError?: () => void
}

export default function ModalityStack({ urls, subs, separation, boxes, bounds, aspect = 1, interactive = true, fit = 1, onError }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const labels = useRef<(HTMLDivElement | null)[]>([])
  const sep = useRef(separation)
  sep.current = separation
  const api = useRef<{ setBoxes: (b: GeoBox[], bounds?: number[]) => void } | null>(null)

  useEffect(() => {
    const el = host.current
    if (!el) return
    let renderer: WebGLRenderer
    try {
      renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' })
    } catch { onError?.(); return }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.outputColorSpace = SRGBColorSpace
    el.appendChild(renderer.domElement)
    renderer.domElement.style.display = 'block'
    renderer.domElement.addEventListener('webglcontextlost', () => onError?.())

    const scene = new Scene()
    const camera = new PerspectiveCamera(40, 1, 0.1, 100)
    camera.position.set(3.9 * fit, 3.4 * fit, 5.3 * fit)
    const controls = new OrbitControls(camera, renderer.domElement)
    Object.assign(controls, { enableDamping: true, dampingFactor: 0.07, enableZoom: interactive, enablePan: false, minDistance: 3, maxDistance: 14, maxPolarAngle: Math.PI * 0.87 })

    const h = PLANE_W / aspect
    const loader = new TextureLoader()
    const disposables: { dispose: () => void }[] = []
    const planes = LAYERS.map((def) => {
      const g = new Group()
      const geo = new PlaneGeometry(PLANE_W, h)
      const mat = new MeshBasicMaterial({ transparent: true, side: DoubleSide, toneMapped: false, color: new Color('#e9edeb') })
      const tex: Texture = loader.load(urls[def.key], (t) => { t.colorSpace = SRGBColorSpace; mat.color.set('#ffffff'); mat.needsUpdate = true })
      tex.anisotropy = 8
      mat.map = tex
      const mesh = new Mesh(geo, mat)
      mesh.rotation.x = -Math.PI / 2
      mesh.userData.key = def.key
      const edges = new LineSegments(new EdgesGeometry(geo), new LineBasicMaterial({ color: def.colour }))
      edges.rotation.x = -Math.PI / 2
      edges.position.y = 0.002
      g.add(mesh, edges)
      scene.add(g)
      disposables.push(geo, mat, tex, edges.geometry, edges.material as LineBasicMaterial)
      return { def, g, mesh, mat }
    })

    const boxGroup = new Group()
    planes[1].g.add(boxGroup)
    const setBoxes = (bs: GeoBox[], bd?: number[]) => {
      boxGroup.children.slice().forEach((c) => { boxGroup.remove(c); (c as Mesh).geometry?.dispose() })
      if (!bd) return
      const [minx, miny, maxx, maxy] = bd
      bs.slice(0, 40).forEach((b, i) => {
        if (b.lon0 === null || b.lon1 === null || b.lat0 === null || b.lat1 === null) return
        const x0 = ((b.lon0 - minx) / (maxx - minx || 1) - 0.5) * PLANE_W
        const x1 = ((b.lon1 - minx) / (maxx - minx || 1) - 0.5) * PLANE_W
        const z0 = -((b.lat0 - miny) / (maxy - miny || 1) - 0.5) * h
        const z1 = -((b.lat1 - miny) / (maxy - miny || 1) - 0.5) * h
        const geo = new PlaneGeometry(Math.max(Math.abs(x1 - x0), 0.012), Math.max(Math.abs(z1 - z0), 0.012))
        const fill = new Mesh(geo, new MeshBasicMaterial({ color: '#c4342a', transparent: true, opacity: 0.3, depthWrite: false, side: DoubleSide }))
        const line = new LineSegments(new EdgesGeometry(geo), new LineBasicMaterial({ color: '#c4342a' }))
        for (const o of [fill, line]) { o.rotation.x = -Math.PI / 2; o.position.set((x0 + x1) / 2, 0.012 + i * 0.0012, (z0 + z1) / 2) }
        boxGroup.add(fill, line)
      })
    }
    api.current = { setBoxes }

    // focus: click a plate to isolate it
    let focus: LayerKey | null = null
    const ray = new Raycaster(), ptr = new Vector2()
    let downAt = 0
    const onDown = () => { downAt = performance.now(); idle = false }
    const onUp = (e: PointerEvent) => {
      if (performance.now() - downAt > 250) return
      const r = renderer.domElement.getBoundingClientRect()
      ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
      ray.setFromCamera(ptr, camera)
      const hit = ray.intersectObjects(planes.map((p) => p.mesh))[0]
      const k = (hit?.object.userData.key as LayerKey | undefined) ?? null
      focus = k && k !== focus ? k : null
      planes.forEach((p) => { p.mat.opacity = focus && focus !== p.def.key ? 0.14 : 1 })
    }
    renderer.domElement.addEventListener('pointerdown', onDown)
    renderer.domElement.addEventListener('pointerup', onUp)

    const resize = () => {
      const w = el.clientWidth, hh = el.clientHeight
      renderer.setSize(w, hh, false)
      renderer.domElement.style.width = '100%'
      renderer.domElement.style.height = '100%'
      camera.aspect = w / Math.max(hh, 1)
      camera.updateProjectionMatrix()
    }
    const ro = new ResizeObserver(resize)
    ro.observe(el)
    resize()

    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
    let idle = true, raf = 0, last = performance.now()
    const v = new Vector3()
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      for (const p of planes) {
        const target = p.def.y * sep.current * 1.35
        // frame-rate independent easing, same feel at 60 Hz and 144 Hz
        p.g.position.y += (target - p.g.position.y) * (1 - Math.exp(-9 * dt))
      }
      if (idle && !reduce) {
        const a = 0.07 * dt, x = camera.position.x, z = camera.position.z
        camera.position.x = x * Math.cos(a) - z * Math.sin(a)
        camera.position.z = x * Math.sin(a) + z * Math.cos(a)
      }
      controls.update()
      renderer.render(scene, camera)
      // project each plate's left edge to place its DOM label
      const w = el.clientWidth, hh = el.clientHeight
      planes.forEach((p, i) => {
        const lab = labels.current[i]
        if (!lab) return
        v.set(-PLANE_W / 2, p.g.position.y, 0).project(camera)
        // keep the label inside the canvas when the orbit swings the plate's edge out of view
        const x = Math.max(lab.offsetWidth + 14, ((v.x + 1) / 2) * w)
        lab.style.transform = `translate(${x}px, ${((1 - v.y) / 2) * hh}px) translate(calc(-100% - 10px), -50%)`
        lab.style.opacity = focus && focus !== p.def.key ? '0.4' : '1'
      })
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      controls.dispose()
      boxGroup.children.forEach((c) => (c as Mesh).geometry?.dispose())
      disposables.forEach((d) => d.dispose())
      renderer.dispose()
      renderer.domElement.remove()
      api.current = null
    }
    // the scene is rebuilt only when its imagery or geometry changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urls.optical, urls.fusion, urls.sar, aspect, interactive, fit])

  useEffect(() => { api.current?.setBoxes(boxes, bounds) }, [boxes, bounds, urls.optical])

  return (
    <div className="relative h-full w-full overflow-hidden" data-testid="stack-canvas">
      <div ref={host} className="absolute inset-0" />
      {LAYERS.map((l, i) => (
        <div key={l.key} ref={(d) => { labels.current[i] = d }} className="pointer-events-none absolute left-0 top-0 whitespace-nowrap border border-rule bg-surface px-2 py-1 text-right" style={{ borderRight: `3px solid ${l.colour}` }}>
          <b className="mono block text-[10.5px] tracking-[0.08em] text-ink">{l.label}</b>
          <span className="mono block text-[9.5px] text-ink-2">{subs[l.key]}</span>
        </div>
      ))}
    </div>
  )
}
