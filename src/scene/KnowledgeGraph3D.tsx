import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { KnowledgeData, KnowledgeNode } from '../types/knowledge'
import { createStarfield } from './Starfield'

type Props = {
  data: KnowledgeData
  selectedId?: string
  hoveredId?: string
  focusId?: string
  onSelect: (node: KnowledgeNode) => void
  onHover: (id?: string) => void
  onClearSelection: () => void
}

const typeColors: Record<string, number> = {
  topic: 0x8fc7ff,
  resource: 0xb9e8d2,
  website: 0xf5d98b,
  project: 0xd7b3ff,
  file: 0xe7edf8,
}

const clusterPositions: Record<string, THREE.Vector3> = {
  '核心群集': new THREE.Vector3(0, 0, 0),
  '資訊科技': new THREE.Vector3(-12, 4, 0),
  '教檢': new THREE.Vector3(10, 4, -3),
  '教學資源': new THREE.Vector3(-5, -8, 4),
  '我的作品': new THREE.Vector3(11, -6, 3),
}

const makeHaloMaterial = (color: number, opacity: number) => new THREE.MeshBasicMaterial({
  color,
  transparent: true,
  opacity,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
})

const getRelatedIds = (data: KnowledgeData, selectedId?: string) => {
  const related = new Set<string>()
  if (!selectedId) return related
  related.add(selectedId)
  data.links.forEach((link) => {
    if (link.source === selectedId) related.add(link.target)
    if (link.target === selectedId) related.add(link.source)
  })
  return related
}

const makeLayout = (data: KnowledgeData) => {
  const positions = new Map<string, THREE.Vector3>()
  const grouped = new Map<string, KnowledgeNode[]>()
  data.nodes.forEach((node) => {
    const group = node.category ?? '核心群集'
    grouped.set(group, [...(grouped.get(group) ?? []), node])
  })
  data.nodes.forEach((node, index) => {
    if (node.tags?.includes('cluster')) {
      const angle = index * 1.35
      positions.set(node.id, new THREE.Vector3(Math.cos(angle) * 5, Math.sin(angle) * 2.2, Math.sin(angle) * 5))
      return
    }
    const group = node.category ?? '核心群集'
    const siblings = grouped.get(group) ?? []
    const siblingIndex = siblings.findIndex((item) => item.id === node.id)
    const center = clusterPositions[group] ?? new THREE.Vector3()
    const angle = (siblingIndex / Math.max(1, siblings.length)) * Math.PI * 2
    const radius = 2.4 + (siblingIndex % 3) * 1.25
    positions.set(node.id, new THREE.Vector3(
      center.x + Math.cos(angle) * radius,
      center.y + Math.sin(angle * 1.7) * 1.6,
      center.z + Math.sin(angle) * radius,
    ))
  })
  return positions
}

export default function KnowledgeGraph3D({
  data,
  selectedId,
  hoveredId,
  focusId,
  onSelect,
  onHover,
  onClearSelection,
}: Props) {
  const mountRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const nodeMeshesRef = useRef<Map<string, THREE.Mesh>>(new Map())
  const linkObjectsRef = useRef<THREE.Object3D[]>([])
  const starfieldsRef = useRef<THREE.Points[]>([])
  const selectedEffectsRef = useRef<THREE.Object3D[]>([])
  const relatedHalosRef = useRef<THREE.Object3D[]>([])
  const raycasterRef = useRef(new THREE.Raycaster())
  const pointerRef = useRef(new THREE.Vector2(10, 10))
  const dragRef = useRef({ active: false, moved: false, x: 0, y: 0, rotX: 0, rotY: 0 })
  const touchRef = useRef({ pinching: false, startDistance: 0, startZoom: 34 })
  const groupRef = useRef<THREE.Group | null>(null)
  const layout = useMemo(() => makeLayout(data), [data])

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return
    const scene = new THREE.Scene()
    scene.fog = new THREE.FogExp2(0x030713, 0.016)
    const camera = new THREE.PerspectiveCamera(55, mount.clientWidth / mount.clientHeight, 0.1, 500)
    camera.position.set(0, 2, 34)
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' })
    renderer.setClearColor(0x030713)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6))
    renderer.setSize(mount.clientWidth, mount.clientHeight)
    mount.appendChild(renderer.domElement)
    scene.add(new THREE.AmbientLight(0x9fb8ff, 0.72))
    const light = new THREE.PointLight(0xcddcff, 1.7, 90)
    light.position.set(8, 10, 18)
    scene.add(light)
    const farStars = createStarfield({ count: 760, radiusMin: 72, radiusMax: 160, size: 0.065, opacity: 0.5, drift: 0.00008, twinkle: 0.26, occasional: 0.035 })
    const midStars = createStarfield({ count: 420, radiusMin: 42, radiusMax: 92, size: 0.105, opacity: 0.62, drift: -0.00013, twinkle: 0.14, occasional: 0.018 })
    const nearDust = createStarfield({ count: 150, radiusMin: 24, radiusMax: 58, size: 0.055, opacity: 0.2, drift: 0.0002, twinkle: 0.06, occasional: 0.004 })
    starfieldsRef.current = [farStars, midStars, nearDust]
    starfieldsRef.current.forEach((field) => scene.add(field))
    const group = new THREE.Group()
    scene.add(group)
    sceneRef.current = scene
    cameraRef.current = camera
    rendererRef.current = renderer
    groupRef.current = group

    let frame = 0
    const animate = () => {
      frame = requestAnimationFrame(animate)
      const time = performance.now() * 0.001
      group.rotation.y += 0.00085
      starfieldsRef.current.forEach((field) => {
        field.rotation.y += field.userData.drift
        const colorAttribute = field.geometry.getAttribute('color') as THREE.BufferAttribute
        const colors = colorAttribute.array as Float32Array
        const baseColors = field.geometry.userData.baseColors as Float32Array
        const phases = field.geometry.userData.phases as Float32Array
        const speeds = field.geometry.userData.speeds as Float32Array
        const twinkleAmounts = field.geometry.userData.twinkleAmounts as Float32Array
        for (let i = 0; i < phases.length; i += 1) {
          const pulse = 1 + Math.sin(time * speeds[i] + phases[i]) * twinkleAmounts[i]
          colors[i * 3] = baseColors[i * 3] * pulse
          colors[i * 3 + 1] = baseColors[i * 3 + 1] * pulse
          colors[i * 3 + 2] = baseColors[i * 3 + 2] * pulse
        }
        colorAttribute.needsUpdate = true
      })
      linkObjectsRef.current.forEach((object, index) => {
        const age = Math.max(0, time - (object.userData.createdAt ?? time))
        const intro = Math.min(1, age / 0.75)
        if (object.userData.drawRange && object instanceof THREE.Line) {
          object.geometry.setDrawRange(0, Math.max(2, Math.floor(object.userData.pointCount * intro)))
        }
        if (object.userData.curve && object.userData.energyDot) {
          const dot = object.userData.energyDot as THREE.Mesh
          const offset = object.userData.energyOffset as number
          const travel = Math.max(0, (age - 0.18) * 0.28 + offset) % 1
          dot.position.copy((object.userData.curve as THREE.CatmullRomCurve3).getPointAt(travel))
          const dotMaterial = dot.material as THREE.MeshBasicMaterial
          dotMaterial.opacity = 0.18 + Math.sin(time * 2.2 + index) * 0.05
          dot.visible = intro > 0.35
        }
        if (object instanceof THREE.Line || object instanceof THREE.Mesh) {
          const material = object.material as THREE.Material & { opacity: number }
          const baseOpacity = object.userData.baseOpacity ?? 0.28
          material.opacity = (baseOpacity + Math.sin(time * 1.25 + index * 0.7) * 0.055) * intro
        }
      })
      selectedEffectsRef.current.forEach((object, index) => {
        const material = (object as THREE.Mesh).material as THREE.MeshBasicMaterial
        const baseScale = object.userData.baseScale ?? 1
        const pulse = Math.sin(time * (object.userData.speed ?? 1) + index * 1.4) * 0.5 + 0.5
        object.scale.setScalar(baseScale + pulse * (object.userData.scaleRange ?? 0.3))
        material.opacity = (object.userData.baseOpacity ?? 0.22) * (1 - pulse * (object.userData.fade ?? 0.45))
        if (object.userData.faceCamera) object.quaternion.copy(camera.quaternion)
      })
      relatedHalosRef.current.forEach((object, index) => {
        const material = (object as THREE.Mesh).material as THREE.MeshBasicMaterial
        material.opacity = 0.08 + Math.sin(time * 1.05 + index) * 0.025
      })
      renderer.render(scene, camera)
    }
    animate()

    const resize = () => {
      camera.aspect = mount.clientWidth / mount.clientHeight
      camera.updateProjectionMatrix()
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6))
      renderer.setSize(mount.clientWidth, mount.clientHeight)
    }
    window.addEventListener('resize', resize)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', resize)
      renderer.dispose()
      mount.removeChild(renderer.domElement)
    }
  }, [])

  useEffect(() => {
    const group = groupRef.current
    if (!group) return
    group.clear()
    nodeMeshesRef.current.clear()
    linkObjectsRef.current = []
    selectedEffectsRef.current = []
    relatedHalosRef.current = []
    const relatedIds = getRelatedIds(data, selectedId)
    data.links.forEach((link) => {
      const source = layout.get(link.source)
      const target = layout.get(link.target)
      if (!source || !target) return
      const related = selectedId && (link.source === selectedId || link.target === selectedId)
      if (!related) return
      const start = link.source === selectedId ? source : target
      const end = link.source === selectedId ? target : source
      const curve = new THREE.CatmullRomCurve3([start, end])
      const points = curve.getPoints(34)
      const geometry = new THREE.BufferGeometry().setFromPoints(points)
      const materialLine = new THREE.LineBasicMaterial({
        color: 0xaed2ff,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
      const line = new THREE.Line(geometry, materialLine)
      line.geometry.setDrawRange(0, 2)
      line.userData = {
        baseOpacity: 0.34,
        createdAt: performance.now() * 0.001,
        drawRange: true,
        pointCount: points.length,
      }
      linkObjectsRef.current.push(line)
      group.add(line)
      const glow = new THREE.Mesh(
        new THREE.TubeGeometry(curve, 18, 0.025, 8, false),
        new THREE.MeshBasicMaterial({
          color: 0x9ec8ff,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      )
      glow.userData = {
        baseOpacity: 0.16,
        createdAt: line.userData.createdAt,
      }
      linkObjectsRef.current.push(glow)
      group.add(glow)
      const dot = new THREE.Mesh(
        new THREE.SphereGeometry(0.07, 10, 8),
        new THREE.MeshBasicMaterial({
          color: 0xe4f0ff,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      )
      dot.visible = false
      const carrier = new THREE.Object3D()
      carrier.userData = {
        baseOpacity: 0,
        createdAt: line.userData.createdAt,
        curve,
        energyDot: dot,
        energyOffset: Math.random() * 0.16,
      }
      linkObjectsRef.current.push(carrier)
      group.add(dot)
      group.add(carrier)
    })
    data.nodes.forEach((node) => {
      const isCluster = node.tags?.includes('cluster')
      const geometry = new THREE.SphereGeometry(isCluster ? 0.58 : 0.36, 20, 14)
      const material = new THREE.MeshStandardMaterial({
        color: typeColors[node.type],
        emissive: typeColors[node.type],
        emissiveIntensity: isCluster ? 0.55 : 0.3,
        roughness: 0.5,
        transparent: true,
      })
      const mesh = new THREE.Mesh(geometry, material)
      mesh.position.copy(layout.get(node.id) ?? new THREE.Vector3())
      mesh.userData.node = node
      group.add(mesh)
      nodeMeshesRef.current.set(node.id, mesh)
      if (selectedId && node.id === selectedId) {
        const color = typeColors[node.type]
        const halo = new THREE.Mesh(new THREE.SphereGeometry(isCluster ? 1.15 : 0.82, 24, 16), makeHaloMaterial(color, 0.17))
        halo.position.copy(mesh.position)
        halo.userData = { baseOpacity: 0.18, baseScale: 1, scaleRange: 0.16, speed: 0.85, fade: 0.25 }
        selectedEffectsRef.current.push(halo)
        group.add(halo)
        ;[0, 1].forEach((ringIndex) => {
          const ring = new THREE.Mesh(
            new THREE.RingGeometry(isCluster ? 0.92 : 0.66, isCluster ? 1 : 0.74, 48),
            makeHaloMaterial(color, ringIndex === 0 ? 0.22 : 0.14),
          )
          ring.position.copy(mesh.position)
          ring.userData = {
            baseOpacity: ringIndex === 0 ? 0.18 : 0.12,
            baseScale: 1.05 + ringIndex * 0.34,
            scaleRange: 0.55,
            speed: 0.55 + ringIndex * 0.18,
            fade: 0.92,
            faceCamera: true,
          }
          selectedEffectsRef.current.push(ring)
          group.add(ring)
        })
      } else if (selectedId && relatedIds.has(node.id)) {
        const relatedHalo = new THREE.Mesh(new THREE.SphereGeometry(isCluster ? 0.78 : 0.5, 16, 10), makeHaloMaterial(typeColors[node.type], 0.08))
        relatedHalo.position.copy(mesh.position)
        relatedHalosRef.current.push(relatedHalo)
        group.add(relatedHalo)
      }
    })
  }, [data, layout, selectedId])

  useEffect(() => {
    const related = new Set<string>()
    if (selectedId) {
      related.add(selectedId)
      data.links.forEach((link) => {
        if (link.source === selectedId) related.add(link.target)
        if (link.target === selectedId) related.add(link.source)
      })
    }
    nodeMeshesRef.current.forEach((mesh, id) => {
      const mat = mesh.material as THREE.MeshStandardMaterial
      const active = id === selectedId || id === hoveredId || id === focusId
      const relatedActive = !selectedId || related.has(id)
      mat.opacity = selectedId ? (relatedActive ? 1 : 0.16) : 0.9
      mat.emissiveIntensity = active ? 1.18 : relatedActive ? 0.46 : 0.05
      mesh.scale.setScalar(active ? 1.45 : related.has(id) ? 1.16 : 1)
    })
  }, [selectedId, hoveredId, focusId, data.links])

  useEffect(() => {
    const mesh = focusId ? nodeMeshesRef.current.get(focusId) : undefined
    const camera = cameraRef.current
    if (!mesh || !camera) return
    const world = new THREE.Vector3()
    mesh.getWorldPosition(world)
    camera.position.lerp(new THREE.Vector3(world.x, world.y + 2, world.z + 18), 0.35)
    camera.lookAt(world)
  }, [focusId])

  const updatePointer = (event: React.PointerEvent) => {
    const rect = event.currentTarget.getBoundingClientRect()
    pointerRef.current.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -(((event.clientY - rect.top) / rect.height) * 2 - 1))
  }

  const pick = () => {
    const camera = cameraRef.current
    if (!camera) return
    raycasterRef.current.setFromCamera(pointerRef.current, camera)
    const hit = raycasterRef.current.intersectObjects([...nodeMeshesRef.current.values()])[0]
    if (hit) {
      const node = hit.object.userData.node as KnowledgeNode
      onSelect(node)
      onHover(node.id)
      return
    }
    onHover(undefined)
    onClearSelection()
  }

  const hoverAtPointer = () => {
    const camera = cameraRef.current
    if (!camera) return
    raycasterRef.current.setFromCamera(pointerRef.current, camera)
    const hit = raycasterRef.current.intersectObjects([...nodeMeshesRef.current.values()])[0]
    onHover(hit ? (hit.object.userData.node as KnowledgeNode).id : undefined)
  }

  return (
    <div
      className="graph-canvas"
      ref={mountRef}
      onPointerMove={(event) => {
        updatePointer(event)
        if (event.pointerType === 'touch' && event.currentTarget.hasPointerCapture(event.pointerId)) {
          const activeTouches = Number(event.currentTarget.dataset.activeTouches ?? '0')
          if (activeTouches > 1) return
        }
        if (dragRef.current.active) {
          const dx = event.clientX - dragRef.current.x
          const dy = event.clientY - dragRef.current.y
          if (Math.abs(dx) + Math.abs(dy) > 5) dragRef.current.moved = true
          if (groupRef.current) {
            groupRef.current.rotation.y = dragRef.current.rotY + dx * 0.006
            groupRef.current.rotation.x = dragRef.current.rotX + dy * 0.004
          }
        } else hoverAtPointer()
      }}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId)
        const activeTouches = Number(event.currentTarget.dataset.activeTouches ?? '0') + 1
        event.currentTarget.dataset.activeTouches = String(activeTouches)
        dragRef.current = {
          active: true,
          moved: false,
          x: event.clientX,
          y: event.clientY,
          rotX: groupRef.current?.rotation.x ?? 0,
          rotY: groupRef.current?.rotation.y ?? 0,
        }
      }}
      onPointerUp={(event) => {
        const beforeRelease = Number(mountRef.current?.dataset.activeTouches ?? '1')
        const activeTouches = Math.max(0, beforeRelease - 1)
        if (mountRef.current) mountRef.current.dataset.activeTouches = String(activeTouches)
        if (!dragRef.current.moved && beforeRelease <= 1) pick()
        dragRef.current.active = false
      }}
      onPointerCancel={() => {
        if (mountRef.current) mountRef.current.dataset.activeTouches = '0'
        dragRef.current.active = false
      }}
      onTouchStart={(event) => {
        if (event.touches.length === 2 && cameraRef.current) {
          const [a, b] = Array.from(event.touches)
          touchRef.current = {
            pinching: true,
            startDistance: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
            startZoom: cameraRef.current.position.z,
          }
        }
      }}
      onTouchMove={(event) => {
        if (event.touches.length === 2 && touchRef.current.pinching && cameraRef.current) {
          const [a, b] = Array.from(event.touches)
          const distance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
          const scale = touchRef.current.startDistance / Math.max(1, distance)
          cameraRef.current.position.z = Math.max(11, Math.min(70, touchRef.current.startZoom * scale))
          dragRef.current.moved = true
        }
      }}
      onTouchEnd={(event) => {
        if (event.touches.length < 2) touchRef.current.pinching = false
      }}
      onWheel={(event) => {
        if (!cameraRef.current) return
        cameraRef.current.position.z = Math.max(11, Math.min(70, cameraRef.current.position.z + event.deltaY * 0.025))
      }}
    />
  )
}
