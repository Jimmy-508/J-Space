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

const isClusterNode = (node: KnowledgeNode) => node.tags?.includes('cluster') ?? false

const isContentNode = (node: KnowledgeNode) => (
  !!node.url || ['resource', 'website', 'project', 'file'].includes(node.type)
) && !isClusterNode(node)

const getTouchMetrics = (touches: React.TouchList) => {
  const a = touches.item(0)
  const b = touches.item(1)
  if (!a || !b) return { distance: 0, midpoint: new THREE.Vector2() }
  const distance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
  const midpoint = new THREE.Vector2((a.clientX + b.clientX) / 2, (a.clientY + b.clientY) / 2)
  return { distance, midpoint }
}

const createSoftDiscTexture = () => {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 128
  const ctx = canvas.getContext('2d')
  if (!ctx) return new THREE.CanvasTexture(canvas)
  const gradient = ctx.createRadialGradient(64, 64, 4, 64, 64, 64)
  gradient.addColorStop(0, 'rgba(255,255,255,0.86)')
  gradient.addColorStop(0.22, 'rgba(190,218,255,0.38)')
  gradient.addColorStop(1, 'rgba(190,218,255,0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, 128, 128)
  return new THREE.CanvasTexture(canvas)
}

const createNodeLabelTexture = (title: string) => {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 128
  const ctx = canvas.getContext('2d')
  if (!ctx) return new THREE.CanvasTexture(canvas)
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.font = '700 34px "Noto Sans TC", "Microsoft JhengHei", sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.lineWidth = 5
  ctx.strokeStyle = 'rgba(3, 8, 19, 0.78)'
  ctx.fillStyle = 'rgba(242, 248, 255, 0.92)'
  const maxWidth = 214
  let text = title
  while (ctx.measureText(text).width > maxWidth && text.length > 2) {
    text = `${text.slice(0, -2)}…`
  }
  ctx.strokeText(text, 128, 64)
  ctx.fillText(text, 128, 64)
  const texture = new THREE.CanvasTexture(canvas)
  texture.minFilter = THREE.LinearFilter
  return texture
}

const createStarFlareTexture = () => {
  const canvas = document.createElement('canvas')
  canvas.width = 160
  canvas.height = 160
  const ctx = canvas.getContext('2d')
  if (!ctx) return new THREE.CanvasTexture(canvas)
  const gradient = ctx.createRadialGradient(80, 80, 2, 80, 80, 70)
  gradient.addColorStop(0, 'rgba(255,255,255,0.95)')
  gradient.addColorStop(0.16, 'rgba(205,226,255,0.42)')
  gradient.addColorStop(1, 'rgba(205,226,255,0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, 160, 160)
  const line = ctx.createLinearGradient(0, 80, 160, 80)
  line.addColorStop(0, 'rgba(210,230,255,0)')
  line.addColorStop(0.5, 'rgba(235,246,255,0.42)')
  line.addColorStop(1, 'rgba(210,230,255,0)')
  ctx.fillStyle = line
  ctx.fillRect(8, 78.5, 144, 3)
  const vertical = ctx.createLinearGradient(80, 0, 80, 160)
  vertical.addColorStop(0, 'rgba(210,230,255,0)')
  vertical.addColorStop(0.5, 'rgba(235,246,255,0.3)')
  vertical.addColorStop(1, 'rgba(210,230,255,0)')
  ctx.fillStyle = vertical
  ctx.fillRect(78.5, 18, 3, 124)
  return new THREE.CanvasTexture(canvas)
}

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
  const nebulaRef = useRef<THREE.Sprite[]>([])
  const selectedEffectsRef = useRef<THREE.Object3D[]>([])
  const contentMarkersRef = useRef<THREE.Object3D[]>([])
  const coreEffectsRef = useRef<THREE.Object3D[]>([])
  const labelSpritesRef = useRef<THREE.Sprite[]>([])
  const relatedHalosRef = useRef<THREE.Object3D[]>([])
  const raycasterRef = useRef(new THREE.Raycaster())
  const pointerRef = useRef(new THREE.Vector2(10, 10))
  const dragRef = useRef({ active: false, moved: false, x: 0, y: 0, rotX: 0, rotY: 0 })
  const touchRef = useRef({
    mode: 'none' as 'none' | 'rotate' | 'gesturePending' | 'pinchZoom' | 'twoFingerPan',
    startDistance: 0,
    startZoom: 34,
    startMidpoint: new THREE.Vector2(),
    lastMidpoint: new THREE.Vector2(),
    startTarget: new THREE.Vector3(),
    startCameraPosition: new THREE.Vector3(),
  })
  const groupRef = useRef<THREE.Group | null>(null)
  const cameraTargetRef = useRef(new THREE.Vector3(0, 0, 0))
  const selectedIdRef = useRef<string | undefined>(selectedId)
  const layout = useMemo(() => makeLayout(data), [data])
  const softDiscTexture = useMemo(() => createSoftDiscTexture(), [])
  const starFlareTexture = useMemo(() => createStarFlareTexture(), [])

  useEffect(() => {
    selectedIdRef.current = selectedId
  }, [selectedId])

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return
    const scene = new THREE.Scene()
    scene.fog = new THREE.FogExp2(0x030713, 0.018)
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
    const farStars = createStarfield({ count: 1100, radiusMin: 82, radiusMax: 190, size: 0.052, opacity: 0.56, drift: 0.00008, twinkle: 0.3, occasional: 0.04 })
    const midStars = createStarfield({ count: 520, radiusMin: 42, radiusMax: 102, size: 0.092, opacity: 0.6, drift: -0.00013, twinkle: 0.16, occasional: 0.022 })
    const nearDust = createStarfield({ count: 190, radiusMin: 24, radiusMax: 62, size: 0.052, opacity: 0.22, drift: 0.0002, twinkle: 0.06, occasional: 0.006 })
    starfieldsRef.current = [farStars, midStars, nearDust]
    starfieldsRef.current.forEach((field) => scene.add(field))
    const nebulaLayer = [
      { color: 0x27456f, opacity: 0.09, position: [-30, 12, -72], scale: [52, 28, 1] },
      { color: 0x3b527d, opacity: 0.065, position: [34, -8, -84], scale: [46, 24, 1] },
      { color: 0x2f4068, opacity: 0.055, position: [-4, -24, -96], scale: [62, 30, 1] },
      { color: 0x496082, opacity: 0.045, position: [4, 28, -118], scale: [70, 34, 1] },
    ].map((item, index) => {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: softDiscTexture,
        color: item.color,
        opacity: item.opacity,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }))
      sprite.position.set(item.position[0], item.position[1], item.position[2])
      sprite.scale.set(item.scale[0], item.scale[1], item.scale[2])
      sprite.userData = { baseOpacity: item.opacity, drift: index % 2 === 0 ? 0.00018 : -0.00014, phase: index * 1.8 }
      scene.add(sprite)
      return sprite
    })
    nebulaRef.current = nebulaLayer
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
      camera.lookAt(cameraTargetRef.current)
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
      nebulaRef.current.forEach((sprite, index) => {
        sprite.material.opacity = sprite.userData.baseOpacity + Math.sin(time * 0.18 + sprite.userData.phase) * 0.018
        sprite.material.rotation += sprite.userData.drift
        sprite.position.x += Math.sin(time * 0.08 + index) * 0.0012
      })
      linkObjectsRef.current.forEach((object, index) => {
        const age = Math.max(0, time - (object.userData.createdAt ?? time))
        const intro = Math.min(1, age / 0.75)
        if (object.userData.drawRange && object instanceof THREE.Line) {
          object.geometry.setDrawRange(0, Math.max(2, Math.floor(object.userData.pointCount * intro)))
        }
        if (object.userData.curve && object.userData.energyDots) {
          const dots = object.userData.energyDots as THREE.Mesh[]
          const offset = object.userData.energyOffset as number
          dots.forEach((dot, dotIndex) => {
            const travel = Math.max(0, (age - 0.16) * (0.34 + dotIndex * 0.05) + offset + dotIndex * 0.38) % 1
            dot.position.copy((object.userData.curve as THREE.CatmullRomCurve3).getPointAt(travel))
            const dotMaterial = dot.material as THREE.MeshBasicMaterial
            dotMaterial.opacity = (dotIndex === 0 ? 0.34 : 0.18) + Math.sin(time * 2.05 + index + dotIndex) * 0.06
            dot.visible = intro > 0.3
          })
        }
        if (object instanceof THREE.Line || object instanceof THREE.Mesh) {
          const material = object.material as THREE.Material & { opacity: number }
          const baseOpacity = object.userData.baseOpacity ?? 0.28
          material.opacity = (baseOpacity + Math.sin(time * 1.12 + index * 0.7) * 0.075) * intro
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
      coreEffectsRef.current.forEach((object, index) => {
        if (object.userData.orbit) {
          object.rotation.z += object.userData.speed ?? 0.004
          object.rotation.x += (object.userData.tiltDrift ?? 0.0006)
          return
        }
        const material = (object as THREE.Mesh | THREE.Sprite).material as THREE.MeshBasicMaterial | THREE.SpriteMaterial
        const breath = Math.sin(time * (object.userData.speed ?? 0.48) + index * 0.8) * 0.5 + 0.5
        material.opacity = (object.userData.baseOpacity ?? 0.1) + breath * (object.userData.opacityRange ?? 0.04)
        if (object.userData.spin) object.rotation.z += object.userData.spin
        if (object.userData.faceCamera) object.quaternion.copy(camera.quaternion)
      })
      contentMarkersRef.current.forEach((object, index) => {
        const material = (object as THREE.Mesh | THREE.Sprite).material as THREE.MeshBasicMaterial | THREE.SpriteMaterial
        const breath = Math.sin(time * 0.72 + index * 0.6) * 0.5 + 0.5
        object.scale.setScalar((object.userData.baseScale ?? 1) + breath * (object.userData.scaleRange ?? 0.05))
        material.opacity = (object.userData.baseOpacity ?? 0.18) + breath * (object.userData.opacityRange ?? 0.05)
        if (object.userData.faceCamera) object.quaternion.copy(camera.quaternion)
      })
      relatedHalosRef.current.forEach((object, index) => {
        const material = (object as THREE.Mesh).material as THREE.MeshBasicMaterial
        material.opacity = 0.12 + Math.sin(time * 1.05 + index) * 0.04
      })
      labelSpritesRef.current.forEach((label) => {
        const world = new THREE.Vector3()
        label.getWorldPosition(world)
        const distance = camera.position.distanceTo(world)
        const screenRadius = ((label.userData.nodeRadius ?? 0.36) / Math.max(1, distance)) * (renderer.domElement.height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5))))
        const selected = selectedIdRef.current === label.userData.nodeId
        const visible = selected || ((label.userData.isCluster ?? false) && screenRadius > 6.5) || screenRadius > 16
        label.visible = visible
        if (visible) {
          const material = label.material as THREE.SpriteMaterial
          material.opacity = selected ? 0.92 : label.userData.isCluster ? 0.78 : 0.66
          const boost = selected ? 1.2 : label.userData.isCluster ? 1.08 : 1
          label.scale.set((label.userData.baseWidth ?? 1) * boost, (label.userData.baseHeight ?? 0.5) * boost, 1)
        }
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
    contentMarkersRef.current = []
    coreEffectsRef.current = []
    labelSpritesRef.current = []
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
        baseOpacity: 0.48,
        createdAt: performance.now() * 0.001,
        drawRange: true,
        pointCount: points.length,
      }
      linkObjectsRef.current.push(line)
      group.add(line)
      const glow = new THREE.Mesh(
        new THREE.TubeGeometry(curve, 22, 0.034, 8, false),
        new THREE.MeshBasicMaterial({
          color: 0x9ec8ff,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      )
      glow.userData = {
        baseOpacity: 0.22,
        createdAt: line.userData.createdAt,
      }
      linkObjectsRef.current.push(glow)
      group.add(glow)
      const dots = [0.09, 0.052].map((radius, dotIndex) => {
        const dot = new THREE.Mesh(
          new THREE.SphereGeometry(radius, 10, 8),
          new THREE.MeshBasicMaterial({
            color: dotIndex === 0 ? 0xf2f8ff : 0xbad8ff,
            transparent: true,
            opacity: 0,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          }),
        )
        dot.visible = false
        group.add(dot)
        return dot
      })
      const carrier = new THREE.Object3D()
      carrier.userData = {
        baseOpacity: 0,
        createdAt: line.userData.createdAt,
        curve,
        energyDots: dots,
        energyOffset: Math.random() * 0.16,
      }
      linkObjectsRef.current.push(carrier)
      group.add(carrier)
    })
    data.nodes.forEach((node) => {
      const isCluster = isClusterNode(node)
      const hasContent = isContentNode(node)
      const nodeRadius = isCluster ? 0.68 : hasContent ? 0.4 : 0.34
      const geometry = new THREE.SphereGeometry(nodeRadius, isCluster || hasContent ? 24 : 18, isCluster || hasContent ? 16 : 12)
      const material = new THREE.MeshStandardMaterial({
        color: typeColors[node.type],
        emissive: typeColors[node.type],
        emissiveIntensity: isCluster ? 0.68 : hasContent ? 0.42 : 0.26,
        roughness: hasContent ? 0.38 : 0.5,
        transparent: true,
      })
      const mesh = new THREE.Mesh(geometry, material)
      mesh.position.copy(layout.get(node.id) ?? new THREE.Vector3())
      mesh.userData.node = node
      group.add(mesh)
      nodeMeshesRef.current.set(node.id, mesh)
      if (hasContent) {
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(nodeRadius + 0.12, nodeRadius + 0.17, 48),
          makeHaloMaterial(typeColors[node.type], selectedId ? 0.16 : 0.2),
        )
        ring.position.copy(mesh.position)
        ring.userData = { nodeId: node.id, markerKind: 'content-ring', baseOpacity: selectedId ? 0.09 : 0.14, opacityRange: 0.055, baseScale: 1, scaleRange: 0.035, faceCamera: true }
        contentMarkersRef.current.push(ring)
        group.add(ring)
        const flare = new THREE.Sprite(new THREE.SpriteMaterial({
          map: starFlareTexture,
          color: typeColors[node.type],
          opacity: selectedId ? 0.12 : 0.16,
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }))
        flare.position.copy(mesh.position)
        flare.scale.setScalar(1.02)
        flare.userData = { nodeId: node.id, markerKind: 'content-flare', baseOpacity: selectedId ? 0.07 : 0.09, opacityRange: 0.04, baseScale: 0.96, scaleRange: 0.08, faceCamera: true }
        contentMarkersRef.current.push(flare)
        group.add(flare)
      } else if (isCluster) {
        const clusterGlow = new THREE.Mesh(new THREE.SphereGeometry(1.04, 22, 14), makeHaloMaterial(typeColors[node.type], 0.08))
        clusterGlow.position.copy(mesh.position)
        clusterGlow.userData = { nodeId: node.id, markerKind: 'cluster-glow', baseOpacity: 0.045, opacityRange: 0.025, baseScale: 1, scaleRange: 0.04 }
        contentMarkersRef.current.push(clusterGlow)
        group.add(clusterGlow)
        const innerGlow = new THREE.Mesh(new THREE.SphereGeometry(1.16, 24, 14), makeHaloMaterial(typeColors[node.type], 0.1))
        innerGlow.position.copy(mesh.position)
        innerGlow.userData = { baseOpacity: 0.08, opacityRange: 0.045, speed: 0.42 }
        coreEffectsRef.current.push(innerGlow)
        group.add(innerGlow)
        const outerGlow = new THREE.Mesh(new THREE.SphereGeometry(1.72, 24, 14), makeHaloMaterial(typeColors[node.type], 0.045))
        outerGlow.position.copy(mesh.position)
        outerGlow.userData = { baseOpacity: 0.035, opacityRange: 0.025, speed: 0.28 }
        coreEffectsRef.current.push(outerGlow)
        group.add(outerGlow)
        ;[
          { radius: 0.92, width: 0.035, rotation: [0.85, 0.2, 0.1], speed: 0.0018, opacity: 0.22 },
          { radius: 1.18, width: 0.022, rotation: [1.15, -0.5, 0.45], speed: -0.0012, opacity: 0.14 },
        ].forEach((ringConfig) => {
          const coreRing = new THREE.Mesh(
            new THREE.RingGeometry(ringConfig.radius, ringConfig.radius + ringConfig.width, 80),
            makeHaloMaterial(typeColors[node.type], ringConfig.opacity),
          )
          coreRing.position.copy(mesh.position)
          coreRing.rotation.set(ringConfig.rotation[0], ringConfig.rotation[1], ringConfig.rotation[2])
          coreRing.userData = { baseOpacity: ringConfig.opacity * 0.48, opacityRange: ringConfig.opacity * 0.24, speed: 0.36, spin: ringConfig.speed }
          coreEffectsRef.current.push(coreRing)
          group.add(coreRing)
        })
        const orbit = new THREE.Object3D()
        orbit.position.copy(mesh.position)
        orbit.rotation.set(0.9, 0.18, 0.2)
        orbit.userData = { orbit: true, speed: 0.0032, tiltDrift: 0.00015 }
        Array.from({ length: 4 }).forEach((_, dotIndex) => {
          const dot = new THREE.Mesh(
            new THREE.SphereGeometry(0.035, 8, 6),
            new THREE.MeshBasicMaterial({
              color: typeColors[node.type],
              transparent: true,
              opacity: 0.42,
              blending: THREE.AdditiveBlending,
              depthWrite: false,
            }),
          )
          const angle = (dotIndex / 4) * Math.PI * 2
          dot.position.set(Math.cos(angle) * 1.24, Math.sin(angle) * 1.24, 0)
          orbit.add(dot)
        })
        coreEffectsRef.current.push(orbit)
        group.add(orbit)
        const coreFlare = new THREE.Sprite(new THREE.SpriteMaterial({
          map: starFlareTexture,
          color: typeColors[node.type],
          opacity: 0.1,
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }))
        coreFlare.position.copy(mesh.position)
        coreFlare.scale.setScalar(1.56)
        coreFlare.userData = { baseOpacity: 0.075, opacityRange: 0.03, speed: 0.33, faceCamera: true }
        coreEffectsRef.current.push(coreFlare)
        group.add(coreFlare)
      }
      if (selectedId && node.id === selectedId) {
        const color = typeColors[node.type]
        const halo = new THREE.Mesh(new THREE.SphereGeometry(isCluster ? 1.42 : 1.02, 28, 18), makeHaloMaterial(color, 0.24))
        halo.position.copy(mesh.position)
        halo.userData = { baseOpacity: 0.26, baseScale: 1, scaleRange: 0.2, speed: 0.75, fade: 0.25 }
        selectedEffectsRef.current.push(halo)
        group.add(halo)
        const wakeFlare = new THREE.Sprite(new THREE.SpriteMaterial({
          map: starFlareTexture,
          color,
          opacity: 0.28,
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }))
        wakeFlare.position.copy(mesh.position)
        wakeFlare.scale.setScalar(isCluster ? 2.4 : 1.78)
        wakeFlare.userData = { baseOpacity: 0.24, baseScale: isCluster ? 2.2 : 1.62, scaleRange: 0.32, speed: 0.62, fade: 0.42, faceCamera: true }
        selectedEffectsRef.current.push(wakeFlare)
        group.add(wakeFlare)
        ;[0, 1].forEach((ringIndex) => {
          const ring = new THREE.Mesh(
            new THREE.RingGeometry(isCluster ? 1.02 : 0.76, isCluster ? 1.13 : 0.88, 64),
            makeHaloMaterial(color, ringIndex === 0 ? 0.3 : 0.2),
          )
          ring.position.copy(mesh.position)
          ring.userData = {
            baseOpacity: ringIndex === 0 ? 0.26 : 0.18,
            baseScale: 1.05 + ringIndex * 0.34,
            scaleRange: 0.72,
            speed: 0.5 + ringIndex * 0.14,
            fade: 0.92,
            faceCamera: true,
          }
          selectedEffectsRef.current.push(ring)
          group.add(ring)
        })
      } else if (selectedId && relatedIds.has(node.id)) {
        const relatedHalo = new THREE.Mesh(new THREE.SphereGeometry(isCluster ? 0.96 : hasContent ? 0.72 : 0.56, 18, 12), makeHaloMaterial(typeColors[node.type], 0.14))
        relatedHalo.position.copy(mesh.position)
        relatedHalosRef.current.push(relatedHalo)
        group.add(relatedHalo)
      }
      const label = new THREE.Sprite(new THREE.SpriteMaterial({
        map: createNodeLabelTexture(node.title),
        transparent: true,
        opacity: 0,
        depthTest: false,
        depthWrite: false,
      }))
      label.position.copy(mesh.position)
      label.renderOrder = 20
      const labelWidth = nodeRadius * (isCluster ? 2.55 : 2.22)
      const labelHeight = nodeRadius * (isCluster ? 1.26 : 1.08)
      label.scale.set(labelWidth, labelHeight, 1)
      label.visible = false
      label.userData = { nodeId: node.id, nodeRadius, isCluster, baseWidth: labelWidth, baseHeight: labelHeight }
      labelSpritesRef.current.push(label)
      group.add(label)
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
      const node = mesh.userData.node as KnowledgeNode
      const hasContent = isContentNode(node)
      const isCluster = isClusterNode(node)
      const active = id === selectedId || id === hoveredId || id === focusId
      const relatedActive = !selectedId || related.has(id)
      mat.opacity = selectedId ? (relatedActive ? 1 : 0.14) : (hasContent || isCluster ? 0.96 : 0.82)
      mat.emissiveIntensity = active ? 1.55 : related.has(id) ? (hasContent ? 0.72 : 0.56) : selectedId ? 0.05 : (hasContent ? 0.5 : isCluster ? 0.68 : 0.28)
      mesh.scale.setScalar(active ? 1.62 : related.has(id) ? (hasContent ? 1.25 : 1.16) : 1)
    })
    contentMarkersRef.current.forEach((object) => {
      const nodeId = object.userData.nodeId as string | undefined
      if (!nodeId) return
      const active = nodeId === selectedId || nodeId === hoveredId || nodeId === focusId
      const relatedActive = !selectedId || related.has(nodeId)
      const isClusterMarker = object.userData.markerKind === 'cluster-glow'
      const base = active ? 0.22 : related.has(nodeId) ? 0.16 : selectedId ? 0.025 : isClusterMarker ? 0.045 : 0.12
      object.userData.baseOpacity = base
      object.userData.opacityRange = active ? 0.08 : relatedActive ? 0.045 : 0.014
    })
  }, [selectedId, hoveredId, focusId, data.links])

  useEffect(() => {
    const mesh = focusId ? nodeMeshesRef.current.get(focusId) : undefined
    const camera = cameraRef.current
    if (!mesh || !camera) return
    const world = new THREE.Vector3()
    mesh.getWorldPosition(world)
    cameraTargetRef.current.lerp(world, 0.55)
    camera.position.lerp(new THREE.Vector3(world.x, world.y + 2, world.z + 18), 0.35)
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
          const { distance, midpoint } = getTouchMetrics(event.touches)
          touchRef.current = {
            mode: 'gesturePending',
            startDistance: distance,
            startZoom: cameraRef.current.position.z,
            startMidpoint: midpoint.clone(),
            lastMidpoint: midpoint.clone(),
            startTarget: cameraTargetRef.current.clone(),
            startCameraPosition: cameraRef.current.position.clone(),
          }
          dragRef.current.moved = true
        } else if (event.touches.length === 1) {
          touchRef.current.mode = 'rotate'
        }
      }}
      onTouchMove={(event) => {
        if (event.touches.length === 2 && cameraRef.current) {
          event.preventDefault()
          const camera = cameraRef.current
          const { distance, midpoint } = getTouchMetrics(event.touches)
          const distanceDelta = Math.abs(distance - touchRef.current.startDistance)
          const midpointDelta = midpoint.distanceTo(touchRef.current.startMidpoint)
          if (touchRef.current.mode === 'gesturePending') {
            if (distanceDelta > 9) touchRef.current.mode = 'pinchZoom'
            else if (midpointDelta > 7) touchRef.current.mode = 'twoFingerPan'
          }
          if (touchRef.current.mode === 'pinchZoom') {
            const scale = touchRef.current.startDistance / Math.max(1, distance)
            camera.position.z = Math.max(11, Math.min(70, touchRef.current.startZoom * scale))
          } else if (touchRef.current.mode === 'twoFingerPan') {
            const dx = midpoint.x - touchRef.current.startMidpoint.x
            const dy = midpoint.y - touchRef.current.startMidpoint.y
            const targetDistance = camera.position.distanceTo(cameraTargetRef.current)
            const panScale = targetDistance * 0.00175
            const right = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 0)
            const up = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 1)
            const offset = new THREE.Vector3()
              .addScaledVector(right, -dx * panScale)
              .addScaledVector(up, dy * panScale)
            cameraTargetRef.current.copy(touchRef.current.startTarget).add(offset)
            camera.position.copy(touchRef.current.startCameraPosition).add(offset)
          }
          touchRef.current.lastMidpoint.copy(midpoint)
          dragRef.current.moved = true
        }
      }}
      onTouchEnd={(event) => {
        if (event.touches.length < 2) touchRef.current.mode = 'none'
      }}
      onWheel={(event) => {
        if (!cameraRef.current) return
        cameraRef.current.position.z = Math.max(11, Math.min(70, cameraRef.current.position.z + event.deltaY * 0.025))
      }}
    />
  )
}
