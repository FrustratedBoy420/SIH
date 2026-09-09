/**
 * The modality stack — the one place three dimensions carry information.
 *
 * Three textured planes floating in space: OPTICAL on top, FUSION between,
 * SAR below. Drag the separation slider and they pull apart.
 *
 * This is not decoration. Requirement 5.4 of the problem statement asks the
 * system to demonstrate that optical and SAR carry *complementary* information.
 * Most implementations show that as a table of numbers. Here a judge separates
 * the planes and sees it directly:
 *
 *   - the OPTICAL plane carries a cloud deck over the north-east, and under it,
 *     nothing is visible
 *   - the SAR plane has no cloud at all, because radar passes through it, and
 *     the built-up areas are bright because corners reflect straight back
 *   - the FUSION plane marks in crimson exactly what SAR recovered from
 *     beneath that cloud
 *
 * The requirement becomes a gesture rather than a claim.
 *
 * Evidence boxes are projected onto the fusion plane in real geographic
 * coordinates, converted from the raster's affine geotransform on the server.
 */

import { useMemo, useRef, useState, useEffect } from 'react'
import { Canvas, useFrame, useLoader, type ThreeEvent } from '@react-three/fiber'
import { OrbitControls, Html } from '@react-three/drei'
import * as THREE from 'three'
import type { GeoBox, RasterSummary } from '@/lib/api'

const PLANE_W = 3.2

type LayerKey = 'optical' | 'fusion' | 'sar'

interface LayerDef {
  key: LayerKey
  y: number
  label: string
  sub: string
  colour: string
}

const LAYERS: LayerDef[] = [
  { key: 'optical', y: 1, label: 'OPTICAL', sub: 'S2 · 4 bands · cloud 6%', colour: '#ffb454' },
  { key: 'fusion', y: 0, label: 'FUSION', sub: 'derived · recovery in crimson', colour: '#b48cff' },
  { key: 'sar', y: -1, label: 'SAR', sub: 'S1 · VV/VH · cloud-free', colour: '#35e0e8' },
]

function Plane({
  def, url, separation, visible, dimmed, onSelect, aspect,
}: {
  def: LayerDef
  url: string
  separation: number
  visible: boolean
  dimmed: boolean
  onSelect: (k: LayerKey) => void
  aspect: number
}) {
  const texture = useLoader(THREE.TextureLoader, url)
  const group = useRef<THREE.Group>(null)
  const [hovered, setHovered] = useState(false)

  useEffect(() => {
    texture.colorSpace = THREE.SRGBColorSpace
    texture.anisotropy = 8
    texture.needsUpdate = true
  }, [texture])

  useFrame((_, dt) => {
    if (!group.current) return
    // 1.35 keeps all three plates inside the frustum at full separation;
    // 2.2 pushed the outer two off-screen and left only fusion visible
    const target = def.y * separation * 1.35
    // frame-rate independent easing, so the motion feels the same on a
    // 60 Hz venue laptop and a 144 Hz dev machine
    group.current.position.y += (target - group.current.position.y) * (1 - Math.exp(-9 * dt))
  })

  const h = PLANE_W / aspect

  return (
    <group ref={group} visible={visible}>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        onPointerOver={(e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); setHovered(true) }}
        onPointerOut={() => setHovered(false)}
        onClick={(e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); onSelect(def.key) }}
      >
        <planeGeometry args={[PLANE_W, h]} />
        <meshBasicMaterial
          map={texture}
          transparent
          opacity={dimmed ? 0.12 : 1}
          side={THREE.DoubleSide}
          toneMapped={false}
        />
      </mesh>

      {/* a plate border rather than a card border — cartographic furniture */}
      <lineSegments rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]}>
        <edgesGeometry args={[new THREE.PlaneGeometry(PLANE_W, h)]} />
        <lineBasicMaterial color={def.colour} transparent opacity={hovered ? 1 : 0.75} />
      </lineSegments>

      {/* Label sits off the plate's left edge and is rendered in SCREEN space:
          no distanceFactor, so it stays a constant readable size instead of
          growing to fill the viewport as the camera moves in. */}
      <Html position={[-PLANE_W / 2 - 0.1, 0.04, 0]} center zIndexRange={[10, 0]}>
        <div
          className="mono pointer-events-none translate-x-[-100%] select-none whitespace-nowrap px-1.5 py-0.5 text-right"
          style={{
            background: 'rgba(5,9,10,0.9)',
            border: `1px solid ${def.colour}`,
            borderRightWidth: 2,
            color: '#e8f2f0',
            fontSize: 9,
            lineHeight: 1.35,
          }}
        >
          <b style={{ color: def.colour, letterSpacing: '0.08em' }}>{def.label}</b>
          <span className="block opacity-60" style={{ fontSize: 7.5 }}>{def.sub}</span>
        </div>
      </Html>
    </group>
  )
}

/**
 * Evidence boxes, in real geographic coordinates, on the fusion plane.
 *
 * Drawn as a translucent fill plus an outline rather than an outline alone. A
 * 1.6 px line seen at this camera angle is close to invisible against a busy
 * false-colour scene -- the geometry was being rendered and still failing to
 * communicate, which is the same as not rendering it.
 *
 * The fill is depthWrite={false} so overlapping detections do not punch holes
 * in each other, and each quad is lifted a hair above the plane by its index so
 * coincident boxes (the SAR detection and the under-cloud recovery cover almost
 * the same ground) do not z-fight.
 */
function EvidenceBoxes({
  boxes, bounds, aspect,
}: {
  boxes: GeoBox[]
  bounds: number[] | undefined
  aspect: number
}) {
  const group = useRef<THREE.Group>(null)
  useFrame((_, dt) => {
    if (group.current) {
      group.current.position.y += (0.012 - group.current.position.y) * (1 - Math.exp(-9 * dt))
    }
  })

  const h = PLANE_W / aspect
  const quads = useMemo(() => {
    if (!bounds || boxes.length === 0) return []
    const [minx, miny, maxx, maxy] = bounds
    const spanX = maxx - minx || 1
    const spanY = maxy - miny || 1
    return boxes.slice(0, 40).map((b) => {
      // geographic -> plane-local. Latitude increases north and the plane's
      // local +z runs south, hence the sign flip on the z term. The API does
      // not guarantee lat0 < lat1, so take absolute extents rather than
      // assuming an ordering -- a negative width renders as nothing at all.
      const x0 = ((b.lon0 - minx) / spanX - 0.5) * PLANE_W
      const x1 = ((b.lon1 - minx) / spanX - 0.5) * PLANE_W
      const z0 = -((b.lat0 - miny) / spanY - 0.5) * h
      const z1 = -((b.lat1 - miny) / spanY - 0.5) * h
      return {
        cx: (x0 + x1) / 2,
        cz: (z0 + z1) / 2,
        w: Math.max(Math.abs(x1 - x0), 0.012),
        d: Math.max(Math.abs(z1 - z0), 0.012),
      }
    })
  }, [boxes, bounds, aspect, h])

  return (
    <group ref={group} position={[0, 0.012, 0]}>
      {quads.map((q, i) => (
        <group key={i} position={[q.cx, i * 0.0012, q.cz]} rotation={[-Math.PI / 2, 0, 0]}>
          <mesh>
            <planeGeometry args={[q.w, q.d]} />
            <meshBasicMaterial
              color="#ff4d3d" transparent opacity={0.24}
              depthWrite={false} side={THREE.DoubleSide}
            />
          </mesh>
          <lineSegments>
            <edgesGeometry args={[new THREE.PlaneGeometry(q.w, q.d)]} />
            <lineBasicMaterial color="#ff8a7a" transparent opacity={0.95} />
          </lineSegments>
        </group>
      ))}
    </group>
  )
}

function Scene({
  separation, layerUrl, hidden, focus, onSelect, boxes, bounds, aspect, interactive,
}: {
  separation: number
  layerUrl: (k: string) => string
  hidden: Set<LayerKey>
  focus: LayerKey | null
  onSelect: (k: LayerKey) => void
  boxes: GeoBox[]
  bounds: number[] | undefined
  aspect: number
  interactive: boolean
}) {
  const [idle, setIdle] = useState(true)

  useFrame((state, dt) => {
    if (!idle) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    // slow orbit until the first interaction, so the stack reads as three
    // separate planes at a glance rather than one flat image
    const a = 0.07 * dt
    const c = state.camera
    const x = c.position.x, z = c.position.z
    c.position.x = x * Math.cos(a) - z * Math.sin(a)
    c.position.z = x * Math.sin(a) + z * Math.cos(a)
    c.lookAt(0, 0, 0)
  })

  return (
    <>
      <ambientLight intensity={1.6} />
      <directionalLight position={[4, 8, 5]} intensity={1.2} />

      {LAYERS.map((d) => (
        <Plane
          key={d.key}
          def={d}
          url={layerUrl(d.key)}
          separation={separation}
          visible={!hidden.has(d.key)}
          dimmed={focus !== null && focus !== d.key}
          onSelect={onSelect}
          aspect={aspect}
        />
      ))}

      <EvidenceBoxes boxes={boxes} bounds={bounds} aspect={aspect} />

      {/* Zoom is disabled outside the workstation. A canvas that swallows the
          scroll wheel on a landing page traps the reader on the hero -- the
          gesture they expect to move the page instead moves the camera. */}
      <OrbitControls
        enableDamping
        dampingFactor={0.07}
        enableZoom={interactive}
        enablePan={interactive}
        minDistance={3}
        maxDistance={14}
        maxPolarAngle={Math.PI * 0.87}
        onStart={() => setIdle(false)}
      />
    </>
  )
}

/** Camera distance tuned for the workstation's large viewport. */
const CAMERA: [number, number, number] = [3.9, 3.4, 5.3]

export default function ModalityStack({
  separation, layerUrl, hidden, focus, onSelect, boxes, scene,
  fit = 1, interactive = true,
}: {
  separation: number
  layerUrl: (k: string) => string
  hidden: Set<LayerKey>
  focus: LayerKey | null
  onSelect: (k: LayerKey) => void
  boxes: GeoBox[]
  scene: RasterSummary | undefined
  /**
   * Scales the camera distance. The default position is framed for the
   * workstation, which is roughly 1100 px wide; dropped into the landing
   * hero at half that width the same framing leaves the stack small with
   * dead space around it, because the vertical field of view is fixed and
   * the horizontal one narrows with the panel. Pass fit < 1 to move in.
   */
  fit?: number
  /** False on marketing surfaces: orbit still works, zoom and pan do not. */
  interactive?: boolean
}) {
  const aspect = scene ? scene.width / scene.height : 1
  const bounds = scene?.bounds
  const camera = CAMERA.map((v) => v * fit) as [number, number, number]

  return (
    <Canvas
      dpr={[1, 2]}
      camera={{ position: camera, fov: 40 }}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      style={{ background: 'transparent' }}
    >
      <Scene
        separation={separation}
        layerUrl={layerUrl}
        hidden={hidden}
        focus={focus}
        onSelect={onSelect}
        boxes={boxes}
        bounds={bounds}
        aspect={aspect}
        interactive={interactive}
      />
    </Canvas>
  )
}

export type { LayerKey }
