import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { KnowledgeData, KnowledgeNode } from '../types/knowledge'
import { createStarfield } from './Starfield'

type Props = {
  data: KnowledgeData
  selectedId?: string
  hoveredId?: string
  focusId?: string
  performanceMode: boolean
  pointer?: { x: number; y: number }
  onSelect: (node: KnowledgeNode) => void
  onHover: (id?: string) => void
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
  performanceMode,
  pointer,
  onSelect,
  onHover,
}: Props) {
  const mountRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const nodeMeshesRef = useRef<Map<string, THREE.Mesh>>(new Map())
  const raycasterRef = useRef(new THREE.Raycaster())
  const pointerRef = useRef(new THREE.Vector2(10, 10))
  const dragRef = useRef({ active: false, moved: false, x: 0, y: 0, rotX: 0, rotY: 0 })
  const groupRef = useRef<THREE.Group | null>(null)
  const layout = useMemo(() => makeLayout(data), [data])

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return
    const scene = new THREE.Scene()
    scene.fog = new THREE.FogExp2(0x050914, 0.018)
    const camera = new THREE.PerspectiveCamera(55, mount.clientWidth / mount.clientHeight, 0.1, 500)
    camera.position.set(0, 2, 34)
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' })
    renderer.setClearColor(0x050914)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, performanceMode ? 1.25 : 1.75))
    renderer.setSize(mount.clientWidth, mount.clientHeight)
    mount.appendChild(renderer.domElement)
    scene.add(new THREE.AmbientLight(0x9fb8ff, 0.8))
    const light = new THREE.PointLight(0xcddcff, 1.7, 90)
    light.position.set(8, 10, 18)
    scene.add(light)
    scene.add(createStarfield(performanceMode ? 450 : 900))
    const group = new THREE.Group()
    scene.add(group)
    sceneRef.current = scene
    cameraRef.current = camera
    rendererRef.current = renderer
    groupRef.current = group

    let frame = 0
    const animate = () => {
      frame = requestAnimationFrame(animate)
      group.rotation.y += performanceMode ? 0.0006 : 0.0012
      renderer.render(scene, camera)
    }
    animate()

    const resize = () => {
      camera.aspect = mount.clientWidth / mount.clientHeight
      camera.updateProjectionMatrix()
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, performanceMode ? 1.25 : 1.75))
      renderer.setSize(mount.clientWidth, mount.clientHeight)
    }
    window.addEventListener('resize', resize)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', resize)
      renderer.dispose()
      mount.removeChild(renderer.domElement)
    }
  }, [performanceMode])

  useEffect(() => {
    const group = groupRef.current
    if (!group) return
    group.clear()
    nodeMeshesRef.current.clear()
    const materialLine = new THREE.LineBasicMaterial({ color: 0x7f9dcc, transparent: true, opacity: 0.28 })
    data.links.forEach((link) => {
      const source = layout.get(link.source)
      const target = layout.get(link.target)
      if (!source || !target) return
      const geometry = new THREE.BufferGeometry().setFromPoints([source, target])
      group.add(new THREE.Line(geometry, materialLine.clone()))
    })
    data.nodes.forEach((node) => {
      const isCluster = node.tags?.includes('cluster')
      const geometry = new THREE.SphereGeometry(isCluster ? 0.58 : 0.36, performanceMode ? 12 : 20, performanceMode ? 8 : 14)
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
    })
  }, [data, layout, performanceMode])

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
      mat.opacity = selectedId ? (relatedActive ? 1 : 0.22) : 0.86
      mat.emissiveIntensity = active ? 1.05 : relatedActive ? 0.42 : 0.08
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

  useEffect(() => {
    if (!pointer) return
    const mount = mountRef.current
    const camera = cameraRef.current
    const group = groupRef.current
    if (!mount || !camera || !group) return
    pointerRef.current.set(pointer.x * 2 - 1, -(pointer.y * 2 - 1))
    raycasterRef.current.setFromCamera(pointerRef.current, camera)
    const hit = raycasterRef.current.intersectObjects([...nodeMeshesRef.current.values()])[0]
    onHover(hit ? (hit.object.userData.node as KnowledgeNode).id : undefined)
  }, [pointer, onHover])

  const updatePointer = (event: React.PointerEvent) => {
    const rect = event.currentTarget.getBoundingClientRect()
    pointerRef.current.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -(((event.clientY - rect.top) / rect.height) * 2 - 1))
  }

  const pick = () => {
    const camera = cameraRef.current
    if (!camera) return
    raycasterRef.current.setFromCamera(pointerRef.current, camera)
    const hit = raycasterRef.current.intersectObjects([...nodeMeshesRef.current.values()])[0]
    if (hit) onSelect(hit.object.userData.node as KnowledgeNode)
    onHover(hit ? (hit.object.userData.node as KnowledgeNode).id : undefined)
  }

  return (
    <div
      className="graph-canvas"
      ref={mountRef}
      onPointerMove={(event) => {
        updatePointer(event)
        if (dragRef.current.active) {
          const dx = event.clientX - dragRef.current.x
          const dy = event.clientY - dragRef.current.y
          if (Math.abs(dx) + Math.abs(dy) > 5) dragRef.current.moved = true
          if (groupRef.current) {
            groupRef.current.rotation.y = dragRef.current.rotY + dx * 0.006
            groupRef.current.rotation.x = dragRef.current.rotX + dy * 0.004
          }
        } else {
          pick()
        }
      }}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId)
        dragRef.current = {
          active: true,
          moved: false,
          x: event.clientX,
          y: event.clientY,
          rotX: groupRef.current?.rotation.x ?? 0,
          rotY: groupRef.current?.rotation.y ?? 0,
        }
      }}
      onPointerUp={() => {
        if (!dragRef.current.moved) pick()
        dragRef.current.active = false
      }}
      onWheel={(event) => {
        if (!cameraRef.current) return
        cameraRef.current.position.z = Math.max(11, Math.min(70, cameraRef.current.position.z + event.deltaY * 0.025))
      }}
    />
  )
}
