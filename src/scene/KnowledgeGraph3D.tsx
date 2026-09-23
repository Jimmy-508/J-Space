import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { KnowledgeData, KnowledgeNode } from '../types/knowledge'
import type { TrackedHand } from '../gesture/gestureTypes'
import { ImageContentViewer3D, type ImageViewerLoadState } from './ImageContentViewer'
import { createBrightStarfield, createGalaxyBand, createStarfield } from './Starfield'
import type { NebulaTheme } from './nebulaThemes'
import { SUMMON_NODE_ID } from '../system/systemNodes'
import { toVector3, type SummonStar } from '../summon/summonUtils'

type SelectionSource = 'touch' | 'mouse' | 'pointerGesture' | 'search'

type Props = {
  data: KnowledgeData
  selectedId?: string
  hoveredId?: string
  focusId?: string
  controlResetKey?: number
  gestureControl?: {
    activeGesture: 'none' | 'zoomIn' | 'zoomOut' | 'pan' | 'pointer' | 'rotate'
    zoomDelta: number
    panDelta: { x: number; y: number }
    pointerScreen?: { x: number; y: number }
    rotateDelta: { x: number; y: number }
  }
  gesturePointerBlocked?: boolean
  isGesturePointerOverUi?: (screenPoint: { x: number; y: number }) => HTMLElement | undefined
  viewerNode?: KnowledgeNode
  viewerResetKey?: number
  onViewerLoadStateChange?: (state: ImageViewerLoadState) => void
  onSelect: (node: KnowledgeNode, source: SelectionSource) => void
  onHover: (id?: string) => void
  onClearSelection: () => void
  immersive?: boolean
  nebulaTheme: NebulaTheme
  appMode?: 'universe' | 'transition-to-summon' | 'summon' | 'transition-to-universe'
  summonStage?: 'setup' | 'deploying' | 'drawing'
  summonStars?: SummonStar[]
  selectedSummonStarId?: string
  armedSummonStarId?: string
  holdingSummonStarId?: string
  summonBlackHoleOcclusions?: Array<{ point: { x: number; y: number }; scale: number }>
  resultReturnStarId?: string
  summonedResult?: number
  hands?: TrackedHand[]
  onSummonStarSelect?: (id: string) => void
  onSummonStarClearSelection?: () => void
  onSummonStarArm?: (id: string) => void
  onSummonStarHoldChange?: (id?: string) => void
  onSummonStarTrigger?: (id: string) => void
  onSummonResultTargetChange?: (point?: { x: number; y: number }) => void
}

const typeColors: Record<string, number> = {
  topic: 0x8fc7ff,
  resource: 0xb9e8d2,
  website: 0xf5d98b,
  project: 0xd7b3ff,
  file: 0xe7edf8,
}

const summonNodeColors = {
  core: 0xf2c96d,
  midGlow: 0xc99a3d,
  outerGlow: 0x8a6728,
}

const summonStarPalettes = [
  { core: 0x4f648f, glow: 0x9eb9e8, halo: 0xd5e7ff, particle: 0xf4fbff },
  { core: 0x3e817d, glow: 0x8fd2ca, halo: 0xc8efe9, particle: 0xe9fffb },
  { core: 0x5d5688, glow: 0xa99bd8, halo: 0xded7ff, particle: 0xf4efff },
  { core: 0xa47d3d, glow: 0xd6b15a, halo: 0xf3d695, particle: 0xfff3d2 },
  { core: 0x7a5a83, glow: 0xc69bce, halo: 0xead4f0, particle: 0xfff0ff },
  { core: 0x6a858f, glow: 0xb7dde8, halo: 0xedfdff, particle: 0xffffff },
]

const getNodeColor = (node?: KnowledgeNode) => {
  if (node?.id === SUMMON_NODE_ID) return summonNodeColors.core
  return typeColors[node?.type ?? 'topic'] ?? typeColors.topic
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
  !!node.url || (node.contentType === 'image' && !!node.imageUrl) || ['resource', 'website', 'project', 'file'].includes(node.type)
) && !isClusterNode(node)

export const blackHoleEffectFlags: {
  enableBlackHoleFade: boolean
  enableBlackHoleCurve: boolean
  enableBlackHoleParticles: boolean
  enableBlackHoleDistortion: boolean
  enableBlackHoleLensing: boolean
  enableBlackHoleShimmer: boolean
} = {
  enableBlackHoleFade: true,
  enableBlackHoleCurve: true,
  enableBlackHoleParticles: true,
  enableBlackHoleDistortion: true,
  enableBlackHoleLensing: true,
  enableBlackHoleShimmer: true,
}

const blackHoleEffectParams = {
  blackHoleInfluenceRadius: 7.8,
  blackHoleFadeStartRadius: 6.7,
  blackHoleFadeEndRadius: 0.85,
  blackHoleCurveStrength: 1.08,
  blackHoleParticleCount: 32,
  blackHoleParticleSpawnRadius: 6.4,
  blackHoleParticleSinkSpeed: 0.12,
  blackHoleParticleOrbitSpeed: 0.24,
  blackHoleParticleSize: 0.115,
  blackHoleParticleOpacity: 0.78,
  // Phase 3 is intentionally local: these tune the optical field, never the black-hole group.
  blackHoleDistortionRadius: 1.56,
  blackHoleDistortionOpacity: 0.28,
  blackHoleLensingOpacity: 0.27,
  blackHoleShimmerStrength: 0.072,
}

const isBlackHoleNode = (node: KnowledgeNode) => {
  if (node.id === SUMMON_NODE_ID) return false
  const metadata = [node.title, node.category, ...(node.tags ?? [])]
    .filter((value): value is string => !!value)
    .map((value) => value.toLowerCase())
  return metadata.some((value) => (
    value.includes('黑洞')
    || value.includes('black-hole')
    || value.includes('blackhole')
    || value.includes('singularity')
  ))
}

const getBlackHoleFade = (position: THREE.Vector3, center: THREE.Vector3) => {
  const distance = position.distanceTo(center)
  if (distance >= blackHoleEffectParams.blackHoleFadeStartRadius) return 1
  if (distance <= blackHoleEffectParams.blackHoleFadeEndRadius) return 0.06
  return THREE.MathUtils.smoothstep(
    distance,
    blackHoleEffectParams.blackHoleFadeEndRadius,
    blackHoleEffectParams.blackHoleFadeStartRadius,
  ) * 0.94 + 0.06
}

const createBlackHoleLinkCurve = (start: THREE.Vector3, end: THREE.Vector3, center?: THREE.Vector3) => {
  if (!center || !blackHoleEffectFlags.enableBlackHoleCurve) {
    return new THREE.CatmullRomCurve3([start, end])
  }
  const segment = new THREE.Line3(start, end)
  const closest = segment.closestPointToPoint(center, true, new THREE.Vector3())
  const distance = closest.distanceTo(center)
  const influence = THREE.MathUtils.clamp(
    (blackHoleEffectParams.blackHoleInfluenceRadius - distance) / blackHoleEffectParams.blackHoleInfluenceRadius,
    0,
    1,
  )
  if (influence <= 0) return new THREE.CatmullRomCurve3([start, end])

  const pull = center.clone().sub(closest)
  if (pull.lengthSq() < 0.0001) {
    pull.crossVectors(end.clone().sub(start), new THREE.Vector3(0, 1, 0))
    if (pull.lengthSq() < 0.0001) pull.set(1, 0, 0)
  }
  pull.normalize().multiplyScalar(blackHoleEffectParams.blackHoleCurveStrength * influence)
  return new THREE.QuadraticBezierCurve3(
    start,
    start.clone().lerp(end, 0.5).add(pull),
    end,
  )
}

const DWELL_SELECT_MS = 600
const DWELL_DESELECT_MS = 780
const DWELL_COOLDOWN_MS = 950
const DEFAULT_CAMERA_POSITION = new THREE.Vector3(0, 2, 34)
const DEFAULT_CAMERA_TARGET = new THREE.Vector3(0, 0, 0)
const DOUBLE_TAP_MS = 320
const DOUBLE_TAP_DISTANCE = 28
const VIEW_RESET_DURATION_MS = 520
const FOCUS_TRANSITION_DURATION_MS = 360
const SUMMON_FOCUS_TRANSITION_DURATION_MS = 460
const SUMMON_CHARGE_VISUAL_MS = 900
const SUMMON_SELECTED_FOCUS_MIN_DISTANCE = 4.6
const SUMMON_SELECTED_FOCUS_DISTANCE_EPSILON = 0.03
const UNIVERSE_FOCUSED_MIN_DISTANCE = 5.4
const UNIVERSE_FOCUSED_DISTANCE_EPSILON = 0.03

type CameraTransition = {
  startedAt: number
  duration: number
  fromPosition: THREE.Vector3
  toPosition: THREE.Vector3
  fromTarget: THREE.Vector3
  toTarget: THREE.Vector3
  fromRotation: THREE.Euler
  resetRotation: boolean
  blurMax?: number
  scaleMax?: number
}

const applyFocusMotionBlur = (mount: HTMLElement | null, progress: number, maxBlur = 0, maxScale = 1) => {
  if (!mount) return
  const motion = Math.sin(THREE.MathUtils.clamp(progress, 0, 1) * Math.PI)
  mount.style.setProperty('--scene-focus-blur', `${(motion * maxBlur).toFixed(2)}px`)
  mount.style.setProperty('--scene-focus-scale', (1 + (maxScale - 1) * motion).toFixed(4))
  mount.classList.toggle('is-focus-transitioning', motion > 0.001)
}

const clearFocusMotionBlur = (mount: HTMLElement | null) => {
  if (!mount) return
  mount.style.setProperty('--scene-focus-blur', '0px')
  mount.style.setProperty('--scene-focus-scale', '1')
  mount.classList.remove('is-focus-transitioning')
}

const applyContinuousFocusMotionBlur = (mount: HTMLElement | null, blur: number) => {
  if (!mount) return
  const clampedBlur = THREE.MathUtils.clamp(blur, 0, 4.8)
  mount.style.setProperty('--scene-focus-blur', `${clampedBlur.toFixed(2)}px`)
  mount.style.setProperty('--scene-focus-scale', '1')
  mount.classList.toggle('is-focus-transitioning', clampedBlur > 0.01)
}

type InitialView = {
  position: THREE.Vector3
  target: THREE.Vector3
  rotation: THREE.Euler
}

type BackgroundResetAnimation = {
  starfieldRotationY: number[]
  nebulaPositions: THREE.Vector3[]
  nebulaMaterialRotations: number[]
  atmospherePositions: THREE.Vector3[]
  atmosphereMaterialRotations: number[]
  flareMaterialRotations: number[]
  flareScales: THREE.Vector3[]
}

type UniverseSnapshot = {
  cameraPosition: THREE.Vector3
  cameraTarget: THREE.Vector3
  groupRotation: THREE.Euler
  starfieldRotationY: number[]
  nebulaPositions: THREE.Vector3[]
  nebulaMaterialRotations: number[]
  atmospherePositions: THREE.Vector3[]
  atmosphereMaterialRotations: number[]
  flareMaterialRotations: number[]
  flareScales: THREE.Vector3[]
}

const getTouchMetrics = (touches: React.TouchList) => {
  const a = touches.item(0)
  const b = touches.item(1)
  if (!a || !b) return { distance: 0, midpoint: new THREE.Vector2() }
  const distance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
  const midpoint = new THREE.Vector2((a.clientX + b.clientX) / 2, (a.clientY + b.clientY) / 2)
  return { distance, midpoint }
}

const panCameraView = (camera: THREE.PerspectiveCamera, target: THREE.Vector3, dx: number, dy: number, panScale: number) => {
  const right = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 0)
  const up = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 1)
  const offset = new THREE.Vector3()
    .addScaledVector(right, -dx * panScale)
    .addScaledVector(up, dy * panScale)
  target.add(offset)
  camera.position.add(offset)
}

type AccretionRibbonKind = 'back' | 'front' | 'upperLens' | 'lowerLens'

const createAccretionRibbonTexture = (kind: AccretionRibbonKind, seed: number) => {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 144
  const context = canvas.getContext('2d')!
  const width = canvas.width
  const height = canvas.height
  const gradient = context.createLinearGradient(0, 0, width, 0)
  gradient.addColorStop(0, 'rgba(255, 195, 113, 0)')
  gradient.addColorStop(0.14, 'rgba(255, 199, 119, 0.52)')
  gradient.addColorStop(0.48, 'rgba(255, 242, 214, 0.96)')
  gradient.addColorStop(0.76, 'rgba(255, 203, 126, 0.58)')
  gradient.addColorStop(1, 'rgba(255, 194, 112, 0)')

  const drawRibbon = (lineWidth: number, alpha: number, blur: number) => {
    context.save()
    context.globalAlpha = alpha
    context.strokeStyle = gradient
    context.lineCap = 'round'
    context.lineJoin = 'round'
    context.lineWidth = lineWidth
    context.shadowColor = 'rgba(255, 216, 158, 0.72)'
    context.shadowBlur = blur
    context.beginPath()
    if (kind === 'upperLens' || kind === 'lowerLens') {
      const sign = kind === 'upperLens' ? -1 : 1
      context.moveTo(width * 0.1, height * (0.56 + sign * 0.08))
      context.bezierCurveTo(
        width * 0.28,
        height * (0.18 + sign * 0.08),
        width * 0.7,
        height * (0.23 + sign * 0.06),
        width * 0.93,
        height * (0.54 + sign * 0.09),
      )
    } else {
      const bend = kind === 'back' ? -0.1 : 0.08
      context.moveTo(0, height * (0.54 + bend + Math.sin(seed) * 0.025))
      context.bezierCurveTo(
        width * 0.28,
        height * (0.38 + bend),
        width * 0.66,
        height * (0.62 - bend * 0.35),
        width,
        height * (0.47 + bend * 0.55),
      )
    }
    context.stroke()
    context.restore()
  }

  drawRibbon(kind === 'back' ? 42 : kind === 'front' ? 32 : 22, kind === 'back' ? 0.18 : kind === 'front' ? 0.25 : 0.17, 20)
  drawRibbon(kind === 'back' ? 20 : kind === 'front' ? 15 : 10, kind === 'back' ? 0.38 : kind === 'front' ? 0.55 : 0.4, 9)
  drawRibbon(kind === 'back' ? 5 : kind === 'front' ? 4 : 3, kind === 'back' ? 0.72 : 0.9, 3)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = THREE.RepeatWrapping
  texture.repeat.set(1.04, 1)
  return texture
}

const createAccretionRibbon = (kind: AccretionRibbonKind, phase: number, side = 1) => {
  const texture = createAccretionRibbonTexture(kind, phase)
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    opacity: kind === 'back' ? 0.38 : kind === 'front' ? 0.7 : kind === 'upperLens' ? 0.32 : 0.16,
    blending: THREE.AdditiveBlending,
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide,
  })
  const ribbon = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material)
  const dimensions = kind === 'back'
    ? [4.32, 0.52]
    : kind === 'front'
      ? [1.72 * side, 0.42]
      : kind === 'upperLens'
        ? [2.12, 0.68]
        : [1.58, 0.4]
  ribbon.scale.set(dimensions[0], dimensions[1], 1)
  if (kind === 'front') ribbon.position.set(side * 1.35, side * 0.015, 0.018)
  else if (kind === 'upperLens') ribbon.position.set(0.08, 0.55, 0.02)
  else if (kind === 'lowerLens') ribbon.position.set(-0.14, -0.46, 0.02)
  else ribbon.position.set(0, phase > 1 ? 0.055 : -0.035, 0.018)
  ribbon.userData = {
    role: 'blackHoleAccretionRibbon',
    kind,
    phase,
    baseOpacity: material.opacity,
    baseY: ribbon.position.y,
  }
  return ribbon
}

const updateAccretionRibbon = (ribbon: THREE.Mesh, time: number) => {
  const { kind, phase, baseOpacity, baseY } = ribbon.userData as {
    kind: AccretionRibbonKind
    phase: number
    baseOpacity: number
    baseY: number
  }
  const material = ribbon.material as THREE.MeshBasicMaterial
  const texture = material.map
  if (texture) texture.offset.x = (time * (kind === 'front' ? 0.018 : 0.011) + phase * 0.007) % 1
  const breathe = Math.sin(time * (kind === 'front' ? 0.32 : 0.2) + phase) * 0.035
  material.opacity = Math.max(0.08, baseOpacity + breathe)
  ribbon.position.y = baseY + Math.sin(time * 0.17 + phase) * (kind === 'front' ? 0.012 : 0.018)
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

const createSelectedCoronaTexture = () => {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const ctx = canvas.getContext('2d')
  if (!ctx) return new THREE.CanvasTexture(canvas)
  const image = ctx.createImageData(canvas.width, canvas.height)
  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      const nx = (x / (canvas.width - 1)) * 2 - 1
      const ny = (y / (canvas.height - 1)) * 2 - 1
      const angle = Math.atan2(ny, nx)
      const distance = Math.sqrt(nx * nx + ny * ny)
      const contour = 0.83 + Math.sin(angle * 5.0 + Math.sin(angle * 2.0) * 0.8) * 0.08 + Math.sin(angle * 9.0 - 0.7) * 0.035
      const coronaDistance = distance / contour
      const outerFalloff = THREE.MathUtils.clamp(1 - coronaDistance, 0, 1)
      const innerFalloff = THREE.MathUtils.clamp((coronaDistance - 0.25) / 0.34, 0, 1)
      const grain = 0.72 + Math.sin(nx * 13.2 + ny * 6.1) * 0.11 + Math.sin(nx * 4.1 - ny * 10.4) * 0.09
      const alpha = Math.round(Math.pow(outerFalloff, 0.72) * innerFalloff * grain * 155)
      const offset = (y * canvas.width + x) * 4
      image.data[offset] = 210
      image.data[offset + 1] = 228
      image.data[offset + 2] = 255
      image.data[offset + 3] = alpha
    }
  }
  ctx.putImageData(image, 0, 0)
  const texture = new THREE.CanvasTexture(canvas)
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter
  return texture
}

const createSelectedStarburstTexture = () => {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const ctx = canvas.getContext('2d')
  if (!ctx) return new THREE.CanvasTexture(canvas)
  ctx.translate(128, 128)
  const petalAngles = [-0.12, 0.83, 1.62, 2.48, 3.33, 4.18, 5.14]
  petalAngles.forEach((angle, index) => {
    const length = 68 + [6, -3, 10, 0, 8, -5, 4][index]
    const width = 22 + [3, 0, 4, -2, 3, 1, -1][index]
    ctx.save()
    ctx.rotate(angle)
    ctx.scale(length, width)
    const gradient = ctx.createRadialGradient(0, 0, 0.08, 0, 0, 1)
    gradient.addColorStop(0, 'rgba(255,255,255,0.16)')
    gradient.addColorStop(0.32, 'rgba(218,236,255,0.11)')
    gradient.addColorStop(0.72, 'rgba(196,221,255,0.035)')
    gradient.addColorStop(1, 'rgba(196,221,255,0)')
    ctx.fillStyle = gradient
    ctx.beginPath()
    ctx.ellipse(0, 0, 1, 0.34, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  })
  const texture = new THREE.CanvasTexture(canvas)
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter
  return texture
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

const createSummonCelestialTexture = (palette: (typeof summonStarPalettes)[number], seed: number) => {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 256
  const ctx = canvas.getContext('2d')
  if (!ctx) return new THREE.CanvasTexture(canvas)
  const core = new THREE.Color(palette.core)
  const glow = new THREE.Color(palette.glow)
  const halo = new THREE.Color(palette.halo)
  const toRgba = (color: THREE.Color, alpha: number) => `rgba(${Math.round(color.r * 255)}, ${Math.round(color.g * 255)}, ${Math.round(color.b * 255)}, ${alpha})`
  const body = ctx.createLinearGradient(0, 0, 0, 256)
  body.addColorStop(0, toRgba(core.clone().multiplyScalar(0.22), 1))
  body.addColorStop(0.2, toRgba(core.clone().multiplyScalar(0.62), 1))
  body.addColorStop(0.49, toRgba(core.clone().lerp(glow, 0.24), 1))
  body.addColorStop(0.78, toRgba(core.clone().multiplyScalar(0.48), 1))
  body.addColorStop(1, toRgba(core.clone().multiplyScalar(0.16), 1))
  ctx.fillStyle = body
  ctx.fillRect(0, 0, 512, 256)

  // A few broad atmospheric currents give a single smooth planet surface its depth.
  const phase = seed * Math.PI * 2
  ctx.globalCompositeOperation = 'screen'
  ctx.lineCap = 'round'
  for (let index = 0; index < 5; index += 1) {
    const y = 37 + index * 43 + Math.sin(phase + index * 1.73) * 13
    ctx.beginPath()
    ctx.moveTo(-28, y)
    ctx.bezierCurveTo(112, y - 12 - index * 1.5, 342, y + 15 + index * 1.4, 540, y - 5)
    ctx.strokeStyle = toRgba(index % 2 === 0 ? halo : glow, index === 2 ? 0.16 : 0.08)
    ctx.lineWidth = index === 2 ? 7 : 3.5
    ctx.stroke()
  }
  ctx.globalCompositeOperation = 'source-over'

  const terminator = ctx.createLinearGradient(0, 0, 512, 0)
  terminator.addColorStop(0, 'rgba(0, 0, 0, 0.42)')
  terminator.addColorStop(0.2, 'rgba(0, 0, 0, 0.08)')
  terminator.addColorStop(0.62, 'rgba(255, 255, 255, 0.05)')
  terminator.addColorStop(1, 'rgba(0, 0, 0, 0.5)')
  ctx.fillStyle = terminator
  ctx.fillRect(0, 0, 512, 256)
  const texture = new THREE.CanvasTexture(canvas)
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = THREE.RepeatWrapping
  return texture
}

const createSummonCelestialGeometry = (radius: number) => new THREE.SphereGeometry(radius, 64, 48)

const getScreenHit = (
  screenPoint: { x: number; y: number },
  meshes: Map<string, THREE.Mesh>,
  camera: THREE.PerspectiveCamera,
  renderer: THREE.WebGLRenderer,
) => {
  const best = { id: undefined as string | undefined, node: undefined as KnowledgeNode | undefined, distance: Infinity, world: new THREE.Vector3(), screenRadius: 0 }
  const viewportWidth = renderer.domElement.clientWidth
  const viewportHeight = renderer.domElement.clientHeight
  const projectionScale = renderer.domElement.height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5)))
  meshes.forEach((mesh, id) => {
    const world = new THREE.Vector3()
    mesh.getWorldPosition(world)
    const projected = world.clone().project(camera)
    if (projected.z < -1 || projected.z > 1) return
    const sx = (projected.x * 0.5 + 0.5) * viewportWidth
    const sy = (-projected.y * 0.5 + 0.5) * viewportHeight
    const node = mesh.userData.node as KnowledgeNode
    const radius = isClusterNode(node) ? 0.68 : isContentNode(node) ? 0.4 : 0.34
    const screenRadius = (radius / Math.max(1, camera.position.distanceTo(world))) * projectionScale
    const hitRadius = Math.max(24, screenRadius + 18)
    const distance = Math.hypot(screenPoint.x - sx, screenPoint.y - sy)
    if (distance <= hitRadius && distance < best.distance) {
      best.id = id
      best.node = node
      best.distance = distance
      best.world.copy(world)
      best.screenRadius = screenRadius
    }
  })
  return best.node ? best : undefined
}

const getScreenSummonHit = (
  screenPoint: { x: number; y: number },
  meshes: Map<string, THREE.Mesh>,
  camera: THREE.PerspectiveCamera,
  renderer: THREE.WebGLRenderer,
) => {
  const viewportWidth = renderer.domElement.clientWidth
  const viewportHeight = renderer.domElement.clientHeight
  const projectionScale = renderer.domElement.height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5)))
  let best: { id: string; distance: number } | undefined
  meshes.forEach((mesh, id) => {
    if (!mesh.visible) return
    const world = new THREE.Vector3()
    mesh.getWorldPosition(world)
    const projected = world.clone().project(camera)
    if (projected.z < -1 || projected.z > 1) return
    const sx = (projected.x * 0.5 + 0.5) * viewportWidth
    const sy = (-projected.y * 0.5 + 0.5) * viewportHeight
    const screenRadius = (0.52 / Math.max(1, camera.position.distanceTo(world))) * projectionScale
    const hitRadius = Math.max(28, screenRadius + 22)
    const distance = Math.hypot(screenPoint.x - sx, screenPoint.y - sy)
    if (distance <= hitRadius && (!best || distance < best.distance)) best = { id, distance }
  })
  return best?.id
}

const createSelectBurst = (position: THREE.Vector3, color: number, texture: THREE.Texture) => {
  const group = new THREE.Group()
  group.position.copy(position)
  group.userData.createdAt = performance.now() * 0.001
  ;[0, 1].forEach((index) => {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.72 + index * 0.22, 0.86 + index * 0.22, 72),
      makeHaloMaterial(color, 0.34 - index * 0.08),
    )
    ring.userData = { baseScale: 1 + index * 0.24, speed: 1.1 + index * 0.35 }
    group.add(ring)
  })
  const flare = new THREE.Sprite(new THREE.SpriteMaterial({
    map: texture,
    color,
    opacity: 0.46,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }))
  flare.scale.setScalar(2.35)
  flare.userData = { flare: true }
  group.add(flare)
  return group
}

const createDeselectBurst = (position: THREE.Vector3, color: number, texture: THREE.Texture) => {
  const group = createSelectBurst(position, color, texture)
  group.userData.reverse = true
  group.children.forEach((child, index) => {
    child.userData.baseScale = child instanceof THREE.Sprite ? 2.5 : 1.75 + index * 0.22
  })
  return group
}

const randomCometDelay = () => 8 + Math.random() * 17

const createComet = (texture: THREE.Texture) => {
  const group = new THREE.Group()
  const fromLeft = Math.random() > 0.5
  const startX = fromLeft ? -58 - Math.random() * 22 : 58 + Math.random() * 22
  const startY = 26 + Math.random() * 24
  const startZ = -42 - Math.random() * 60
  const direction = new THREE.Vector3(fromLeft ? 1 : -1, -0.42 - Math.random() * 0.3, 0.08 + Math.random() * 0.12).normalize()
  const speed = 12 + Math.random() * 8
  const tailLength = 10 + Math.random() * 6
  const points = Array.from({ length: 14 }, (_, index) => direction.clone().multiplyScalar(-tailLength * (index / 13)))
  const geometry = new THREE.BufferGeometry().setFromPoints(points)
  const colors = new Float32Array(points.length * 3)
  for (let i = 0; i < points.length; i += 1) {
    const strength = 1 - i / points.length
    colors[i * 3] = 0.58 * strength
    colors[i * 3 + 1] = 0.78 * strength
    colors[i * 3 + 2] = 1.18 * strength
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  const tail = new THREE.Line(geometry, new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.54,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
  }))
  const core = new THREE.Sprite(new THREE.SpriteMaterial({
    map: texture,
    color: 0xf1f8ff,
    opacity: 0.86,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
  }))
  core.scale.setScalar(1.3 + Math.random() * 0.6)
  group.add(tail)
  group.add(core)
  group.position.set(startX, startY, startZ)
  group.userData = {
    createdAt: performance.now() * 0.001,
    life: 2.5 + Math.random() * 0.9,
    direction,
    speed,
  }
  return group
}

const createWarpStreaks = () => {
  const count = 220
  const positions = new Float32Array(count * 2 * 3)
  const colors = new Float32Array(count * 2 * 3)
  const base = new Float32Array(count * 4)
  for (let i = 0; i < count; i += 1) {
    const angle = Math.random() * Math.PI * 2
    const radius = Math.sqrt(Math.random()) * 34
    const x = Math.cos(angle) * radius
    const y = Math.sin(angle) * radius * 0.58
    const z = -18 - Math.random() * 122
    const speed = 36 + Math.random() * 64
    base[i * 4] = x
    base[i * 4 + 1] = y
    base[i * 4 + 2] = z
    base[i * 4 + 3] = speed
    const warmth = Math.random()
    const r = 0.62 + warmth * 0.34
    const g = 0.78 + warmth * 0.22
    const b = 1.08 + warmth * 0.18
    colors.set([r, g, b, r * 0.35, g * 0.42, b * 0.55], i * 6)
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geometry.userData.base = base
  const material = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
  })
  const lines = new THREE.LineSegments(geometry, material)
  lines.visible = false
  lines.renderOrder = 12
  return lines
}

const disposeComet = (comet: THREE.Object3D) => {
  comet.traverse((child) => {
    if (child instanceof THREE.Line) {
      child.geometry.dispose()
      child.material.dispose()
    }
    if (child instanceof THREE.Sprite) {
      child.material.dispose()
    }
  })
}

const disposeObject = (object: THREE.Object3D) => {
  object.traverse((child) => {
    if (child instanceof THREE.Mesh || child instanceof THREE.Line) {
      child.geometry.dispose()
      const material = child.material
      if (Array.isArray(material)) material.forEach((item) => item.dispose())
      else material.dispose()
    }
    if (child instanceof THREE.Sprite) child.material.dispose()
  })
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
    if (node.id === SUMMON_NODE_ID) {
      positions.set(node.id, new THREE.Vector3(0, -6.4, 6.5))
      return
    }
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
  controlResetKey = 0,
  gestureControl,
  gesturePointerBlocked = false,
  isGesturePointerOverUi,
  viewerNode,
  viewerResetKey = 0,
  onViewerLoadStateChange,
  onSelect,
  onHover,
  onClearSelection,
  immersive = false,
  nebulaTheme,
  appMode = 'universe',
  summonStage = 'setup',
  summonStars = [],
  selectedSummonStarId,
  armedSummonStarId,
  holdingSummonStarId,
  summonBlackHoleOcclusions = [],
  resultReturnStarId,
  summonedResult,
  hands = [],
  onSummonStarSelect,
  onSummonStarClearSelection,
  onSummonStarArm,
  onSummonStarHoldChange,
  onSummonStarTrigger,
  onSummonResultTargetChange,
}: Props) {
  const mountRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const imageViewerRef = useRef<ImageContentViewer3D | null>(null)
  const nodeMeshesRef = useRef<Map<string, THREE.Mesh>>(new Map())
  const summonMeshesRef = useRef<Map<string, THREE.Mesh>>(new Map())
  const resolvedSummonMeshesRef = useRef<Map<string, THREE.Mesh>>(new Map())
  const summonEffectsRef = useRef<THREE.Object3D[]>([])
  const summonGroupRef = useRef<THREE.Group | null>(null)
  const summonBlackHoleCoreRef = useRef<THREE.Mesh[]>([])
  const summonBlackHoleDistortionRef = useRef<THREE.Mesh[]>([])
  const summonBlackHoleFlowRef = useRef<THREE.Group[]>([])
  const summonBlackHoleBackAccretionRef = useRef<THREE.Group[]>([])
  const summonBlackHoleFrontAccretionRef = useRef<THREE.Group[]>([])
  const summonBlackHoleParticlesRef = useRef<THREE.Points | null>(null)
  const lastSummonResultTargetRef = useRef<{ x: number; y: number } | undefined>(undefined)
  const linkObjectsRef = useRef<THREE.Object3D[]>([])
  const starfieldsRef = useRef<THREE.Points[]>([])
  const nebulaRef = useRef<THREE.Sprite[]>([])
  const atmosphereNebulaRef = useRef<THREE.Sprite[]>([])
  const backgroundFlaresRef = useRef<THREE.Sprite[]>([])
  const warpStreaksRef = useRef<THREE.LineSegments | null>(null)
  const warpTransitionRef = useRef({ active: false, startedAt: 0, direction: 1 })
  const selectedEffectsRef = useRef<THREE.Object3D[]>([])
  const contentMarkersRef = useRef<THREE.Object3D[]>([])
  const coreEffectsRef = useRef<THREE.Object3D[]>([])
  const labelSpritesRef = useRef<THREE.Sprite[]>([])
  const relatedHalosRef = useRef<THREE.Object3D[]>([])
  const dwellFeedbackRef = useRef<THREE.Mesh | null>(null)
  const selectBurstRef = useRef<THREE.Object3D[]>([])
  const dwellRef = useRef<{ nodeId?: string; since: number; triggeredAt: number; armed: boolean }>({ since: 0, triggeredAt: 0, armed: true })
  const raycasterRef = useRef(new THREE.Raycaster())
  const pointerRef = useRef(new THREE.Vector2(10, 10))
  const dragRef = useRef({
    active: false,
    dragging: false,
    pendingTap: false,
    pointerType: '',
    pointerDownTime: 0,
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
    rotX: 0,
    rotY: 0,
  })
  const mousePanRef = useRef({
    active: false,
    consumed: false,
    lastX: 0,
    lastY: 0,
  })
  const pointerSummonHoldRef = useRef({
    active: false,
    pointerId: -1,
    summonId: undefined as string | undefined,
    startedAt: 0,
    startX: 0,
    startY: 0,
    timeout: undefined as number | undefined,
  })
  const suppressContextMenuRef = useRef(false)
  const lastTapRef = useRef({
    time: 0,
    x: 0,
    y: 0,
    pointerType: '',
    blank: false,
    nodeId: undefined as string | undefined,
  })
  const touchRef = useRef({
    mode: 'none' as 'none' | 'rotate' | 'gesturePending' | 'pinchZoom' | 'twoFingerPan',
    startDistance: 0,
    startZoom: DEFAULT_CAMERA_POSITION.z,
    startMidpoint: new THREE.Vector2(),
    lastMidpoint: new THREE.Vector2(),
    startTarget: new THREE.Vector3(),
    startCameraPosition: new THREE.Vector3(),
    startViewerScale: 1,
  })
  const groupRef = useRef<THREE.Group | null>(null)
  const cameraTargetRef = useRef(new THREE.Vector3(0, 0, 0))
  const viewResetRef = useRef<CameraTransition | null>(null)
  const focusTransitionRef = useRef<CameraTransition | null>(null)
  const summonMotionBlurRef = useRef({
    current: 0,
    initialized: false,
    cameraPosition: new THREE.Vector3(),
    cameraTarget: new THREE.Vector3(),
    groupRotation: new THREE.Euler(),
  })
  const universeFocusMotionBlurRef = useRef({
    current: 0,
    initialized: false,
    cameraPosition: new THREE.Vector3(),
    cameraTarget: new THREE.Vector3(),
  })
  const initialViewRef = useRef<InitialView | null>(null)
  const universeSnapshotRef = useRef<UniverseSnapshot | null>(null)
  const backgroundResetRef = useRef<BackgroundResetAnimation | null>(null)
  const backgroundTimeOriginRef = useRef(0)
  const gesturePointerBlockedRef = useRef(gesturePointerBlocked)
  const isGesturePointerOverUiRef = useRef<Props['isGesturePointerOverUi']>(undefined)
  const selectedIdRef = useRef<string | undefined>(selectedId)
  const hoveredIdRef = useRef<string | undefined>(hoveredId)
  const focusIdRef = useRef<string | undefined>(focusId)
  const gestureControlRef = useRef<Props['gestureControl']>(undefined)
  const onViewerLoadStateChangeRef = useRef(onViewerLoadStateChange)
  const immersiveRef = useRef(immersive)
  const appModeRef = useRef(appMode)
  const summonStageRef = useRef(summonStage)
  const selectedSummonStarIdRef = useRef<string | undefined>(selectedSummonStarId)
  const selectedSummonRippleIdRef = useRef<string | undefined>(undefined)
  const armedSummonStarIdRef = useRef<string | undefined>(armedSummonStarId)
  const holdingSummonStarIdRef = useRef<string | undefined>(holdingSummonStarId)
  const summonBlackHoleOcclusionsRef = useRef(summonBlackHoleOcclusions)
  const resultReturnStarIdRef = useRef<string | undefined>(resultReturnStarId)
  const handsRef = useRef<TrackedHand[]>(hands)
  const summonCallbacksRef = useRef({ onSummonStarSelect, onSummonStarClearSelection, onSummonStarArm, onSummonStarHoldChange, onSummonStarTrigger, onSummonResultTargetChange })
  const summonArmLockRef = useRef({ armedAt: 0, triggeredAt: 0, holdStartedAt: 0, holdingId: undefined as string | undefined })
  const nebulaThemeRef = useRef(nebulaTheme)
  const cometsRef = useRef<THREE.Object3D[]>([])
  const nextCometAtRef = useRef(0)
  const layout = useMemo(() => makeLayout(data), [data])
  const softDiscTexture = useMemo(() => createSoftDiscTexture(), [])
  const selectedCoronaTexture = useMemo(() => createSelectedCoronaTexture(), [])
  const selectedStarburstTexture = useMemo(() => createSelectedStarburstTexture(), [])
  const starFlareTexture = useMemo(() => createStarFlareTexture(), [])
  const summonCelestialTextures = useMemo(
    () => summonStarPalettes.map((palette, index) => createSummonCelestialTexture(palette, 0.137 + index * 0.149)),
    [],
  )

  const setSelectedSummonFocusDistance = (camera: THREE.PerspectiveCamera, requestedDistance: number) => {
    const target = cameraTargetRef.current
    const currentDistance = camera.position.distanceTo(target)
    if (currentDistance <= SUMMON_SELECTED_FOCUS_MIN_DISTANCE + SUMMON_SELECTED_FOCUS_DISTANCE_EPSILON) return false

    const nextDistance = Math.max(SUMMON_SELECTED_FOCUS_MIN_DISTANCE, requestedDistance)
    if (nextDistance >= currentDistance) return false

    const direction = camera.position.clone().sub(target)
    if (direction.lengthSq() < 0.000001) direction.set(0, 0, 1)
    direction.normalize()
    camera.position.copy(target).addScaledVector(direction, nextDistance)
    return true
  }

  const moveSelectedSummonFocusCloser = (camera: THREE.PerspectiveCamera, distanceStep: number) => {
    if (distanceStep <= 0) return false
    return setSelectedSummonFocusDistance(camera, camera.position.distanceTo(cameraTargetRef.current) - distanceStep)
  }

  const setFocusedUniverseDistance = (camera: THREE.PerspectiveCamera, requestedDistance: number) => {
    const target = cameraTargetRef.current
    const currentDistance = camera.position.distanceTo(target)
    if (currentDistance <= UNIVERSE_FOCUSED_MIN_DISTANCE + UNIVERSE_FOCUSED_DISTANCE_EPSILON) return false

    const nextDistance = Math.max(UNIVERSE_FOCUSED_MIN_DISTANCE, requestedDistance)
    if (nextDistance >= currentDistance) return false

    const direction = camera.position.clone().sub(target)
    if (direction.lengthSq() < 0.000001) direction.set(0, 0, 1)
    direction.normalize()
    camera.position.copy(target).addScaledVector(direction, nextDistance)
    return true
  }

  const moveFocusedUniverseCloser = (camera: THREE.PerspectiveCamera, distanceStep: number) => {
    if (distanceStep <= 0) return false
    return setFocusedUniverseDistance(camera, camera.position.distanceTo(cameraTargetRef.current) - distanceStep)
  }

  useEffect(() => {
    selectedIdRef.current = selectedId
  }, [selectedId])

  useEffect(() => {
    hoveredIdRef.current = hoveredId
  }, [hoveredId])

  useEffect(() => {
    focusIdRef.current = focusId
  }, [focusId])

  useEffect(() => {
    if (!selectedSummonStarId) selectedSummonRippleIdRef.current = undefined
  }, [selectedSummonStarId])

  useEffect(() => {
    gestureControlRef.current = gestureControl
  }, [gestureControl])

  useEffect(() => {
    onViewerLoadStateChangeRef.current = onViewerLoadStateChange
  }, [onViewerLoadStateChange])

  useEffect(() => {
    nebulaThemeRef.current = nebulaTheme
    nebulaRef.current.forEach((sprite, index) => {
      const color = nebulaTheme.nebulaColors[index % nebulaTheme.nebulaColors.length]
      sprite.material.color.setHex(color).multiplyScalar(nebulaTheme.brightness)
      sprite.userData.themeOpacity = nebulaTheme.opacity
    })
    backgroundFlaresRef.current.forEach((sprite, index) => {
      const color = index % 5 === 0 ? nebulaTheme.flareColors[0] : nebulaTheme.flareColors[1]
      sprite.material.color.setHex(color).multiplyScalar(nebulaTheme.brightness)
      sprite.userData.themeOpacity = nebulaTheme.opacity
    })
    atmosphereNebulaRef.current.forEach((sprite, index) => {
      const color = nebulaTheme.atmosphereColors[index % nebulaTheme.atmosphereColors.length]
      sprite.material.color.setHex(color).multiplyScalar(nebulaTheme.brightness)
      sprite.userData.themeOpacity = nebulaTheme.opacity * nebulaTheme.atmosphereOpacity
    })
  }, [nebulaTheme])

  useEffect(() => {
    gesturePointerBlockedRef.current = gesturePointerBlocked
  }, [gesturePointerBlocked])

  useEffect(() => {
    isGesturePointerOverUiRef.current = isGesturePointerOverUi
  }, [isGesturePointerOverUi])

  useEffect(() => {
    immersiveRef.current = immersive
    if (immersive) {
      nextCometAtRef.current = performance.now() * 0.001 + 1.4 + Math.random() * 3
    } else {
      nextCometAtRef.current = 0
    }
  }, [immersive])

  const restoreUniverseSnapshot = () => {
    const snapshot = universeSnapshotRef.current
    const camera = cameraRef.current
    const group = groupRef.current
    if (!snapshot || !camera || !group) return
    focusTransitionRef.current = null
    viewResetRef.current = null
    backgroundResetRef.current = null
    clearFocusMotionBlur(mountRef.current)
    camera.position.copy(snapshot.cameraPosition)
    cameraTargetRef.current.copy(snapshot.cameraTarget)
    group.rotation.copy(snapshot.groupRotation)
    starfieldsRef.current.forEach((field, index) => {
      field.rotation.y = snapshot.starfieldRotationY[index] ?? field.rotation.y
    })
    nebulaRef.current.forEach((sprite, index) => {
      sprite.position.copy(snapshot.nebulaPositions[index] ?? sprite.position)
      sprite.material.rotation = snapshot.nebulaMaterialRotations[index] ?? sprite.material.rotation
    })
    atmosphereNebulaRef.current.forEach((sprite, index) => {
      sprite.position.copy(snapshot.atmospherePositions[index] ?? sprite.position)
      sprite.material.rotation = snapshot.atmosphereMaterialRotations[index] ?? sprite.material.rotation
    })
    backgroundFlaresRef.current.forEach((sprite, index) => {
      sprite.material.rotation = snapshot.flareMaterialRotations[index] ?? sprite.material.rotation
      sprite.scale.copy(snapshot.flareScales[index] ?? sprite.scale)
    })
  }

  useLayoutEffect(() => {
    const previousMode = appModeRef.current
    if (appMode === 'transition-to-summon' && previousMode === 'universe') {
      const camera = cameraRef.current
      const group = groupRef.current
      if (camera && group) {
        universeSnapshotRef.current = {
          cameraPosition: camera.position.clone(),
          cameraTarget: cameraTargetRef.current.clone(),
          groupRotation: group.rotation.clone(),
          starfieldRotationY: starfieldsRef.current.map((field) => field.rotation.y),
          nebulaPositions: nebulaRef.current.map((sprite) => sprite.position.clone()),
          nebulaMaterialRotations: nebulaRef.current.map((sprite) => sprite.material.rotation),
          atmospherePositions: atmosphereNebulaRef.current.map((sprite) => sprite.position.clone()),
          atmosphereMaterialRotations: atmosphereNebulaRef.current.map((sprite) => sprite.material.rotation),
          flareMaterialRotations: backgroundFlaresRef.current.map((sprite) => sprite.material.rotation),
          flareScales: backgroundFlaresRef.current.map((sprite) => sprite.scale.clone()),
        }
      }
    } else if (appMode === 'transition-to-universe' && previousMode === 'summon') {
      restoreUniverseSnapshot()
    } else if (appMode === 'universe' && previousMode === 'transition-to-universe') {
      restoreUniverseSnapshot()
    }
    appModeRef.current = appMode
    summonStageRef.current = summonStage
    selectedSummonStarIdRef.current = selectedSummonStarId
    armedSummonStarIdRef.current = armedSummonStarId
    holdingSummonStarIdRef.current = holdingSummonStarId
    summonBlackHoleOcclusionsRef.current = summonBlackHoleOcclusions
    resultReturnStarIdRef.current = resultReturnStarId
    handsRef.current = hands
    summonCallbacksRef.current = { onSummonStarSelect, onSummonStarClearSelection, onSummonStarArm, onSummonStarHoldChange, onSummonStarTrigger, onSummonResultTargetChange }
  }, [appMode, summonStage, selectedSummonStarId, armedSummonStarId, holdingSummonStarId, summonBlackHoleOcclusions, resultReturnStarId, hands, onSummonStarSelect, onSummonStarClearSelection, onSummonStarArm, onSummonStarHoldChange, onSummonStarTrigger, onSummonResultTargetChange])

  useEffect(() => {
    dragRef.current.active = false
    dragRef.current.dragging = false
    dragRef.current.pendingTap = false
    dragRef.current.pointerType = ''
    mousePanRef.current.active = false
    mousePanRef.current.consumed = false
    suppressContextMenuRef.current = false
    touchRef.current.mode = 'none'
    touchRef.current.startDistance = 0
    touchRef.current.lastMidpoint.set(0, 0)
    touchRef.current.startMidpoint.set(0, 0)
    dwellRef.current = { since: 0, triggeredAt: dwellRef.current.triggeredAt, armed: true }
    if (dwellFeedbackRef.current) dwellFeedbackRef.current.visible = false
    if (mountRef.current) mountRef.current.dataset.activeTouches = '0'
    onHover(undefined)
  }, [controlResetKey, onHover])

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return
    const scene = new THREE.Scene()
    scene.fog = new THREE.FogExp2(0x030713, 0.018)
    const camera = new THREE.PerspectiveCamera(55, mount.clientWidth / mount.clientHeight, 0.1, 500)
    camera.position.copy(DEFAULT_CAMERA_POSITION)
    scene.add(camera)
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' })
    renderer.setClearColor(0x030713, 0)
    const syncRendererSize = () => {
      const width = mount.clientWidth
      const height = mount.clientHeight
      if (width <= 0 || height <= 0) return

      camera.aspect = width / height
      camera.updateProjectionMatrix()
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6))
      renderer.setSize(width, height, false)
      imageViewerRef.current?.resize()
    }
    mount.appendChild(renderer.domElement)
    syncRendererSize()
    scene.add(new THREE.AmbientLight(0x9fb8ff, 0.72))
    const light = new THREE.PointLight(0xcddcff, 1.7, 90)
    light.position.set(8, 10, 18)
    scene.add(light)
    const pointScale = mount.clientWidth < 760 ? 1.35 : 1.08
    const deepDust = createStarfield({ count: 6200, radiusMin: 118, radiusMax: 285, size: 0.9 * pointScale, opacity: 0.58, drift: 0.000025, twinkle: 0.3, occasional: 0.045, banded: true, screenSized: true })
    const galaxyBand = createGalaxyBand({ count: 9200, width: 32, length: 178, depth: 150, size: 1.45 * pointScale, opacity: 0.9, drift: -0.000035 })
    const farStars = createStarfield({ count: 3400, radiusMin: 82, radiusMax: 215, size: 1.16 * pointScale, opacity: 0.72, drift: 0.00007, twinkle: 0.48, occasional: 0.12, banded: true, glow: true, screenSized: true })
    const visibleStars = createBrightStarfield({ count: 3200, radiusMin: 68, radiusMax: 190, size: 2.25 * pointScale, opacity: 0.88, drift: 0.000095 })
    const midStars = createStarfield({ count: 1700, radiusMin: 42, radiusMax: 122, size: 1.68 * pointScale, opacity: 0.76, drift: -0.00013, twinkle: 0.38, occasional: 0.1, banded: true, glow: true, screenSized: true })
    const brightStars = createBrightStarfield({ count: 560, radiusMin: 50, radiusMax: 168, size: 4.2 * pointScale, opacity: 0.95, drift: -0.000055, bright: true })
    const nearDust = createStarfield({ count: 520, radiusMin: 24, radiusMax: 68, size: 1.24 * pointScale, opacity: 0.32, drift: 0.0002, twinkle: 0.18, occasional: 0.035, glow: true, screenSized: true })
    starfieldsRef.current = [deepDust, galaxyBand, farStars, visibleStars, midStars, brightStars, nearDust]
    starfieldsRef.current.forEach((field) => {
      field.userData.initialRotationY = field.rotation.y
      field.userData.baseSize = (field.material as THREE.PointsMaterial).size
      field.renderOrder = 0
      scene.add(field)
    })
    const warpStreaks = createWarpStreaks()
    warpStreaks.renderOrder = 0
    scene.add(warpStreaks)
    warpStreaksRef.current = warpStreaks
    const nebulaLayer = [
      { color: 0x27456f, opacity: 0.16, position: [-30, 12, -72], scale: [60, 32, 1] },
      { color: 0x3b527d, opacity: 0.12, position: [34, -8, -84], scale: [54, 28, 1] },
      { color: 0x2f4068, opacity: 0.105, position: [-4, -24, -96], scale: [72, 36, 1] },
      { color: 0x496082, opacity: 0.088, position: [4, 28, -118], scale: [84, 40, 1] },
      { color: 0x516f96, opacity: 0.14, position: [-18, -2, -132], scale: [152, 32, 1] },
      { color: 0x345d87, opacity: 0.115, position: [22, 10, -150], scale: [168, 28, 1] },
      { color: 0x5a4f86, opacity: 0.068, position: [-44, -18, -156], scale: [64, 32, 1] },
      { color: 0x2d6d8d, opacity: 0.06, position: [48, 24, -172], scale: [76, 34, 1] },
    ].map((item, index) => {
      const theme = nebulaThemeRef.current
      const themeColor = theme.nebulaColors[index % theme.nebulaColors.length]
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: softDiscTexture,
        color: new THREE.Color(themeColor).multiplyScalar(theme.brightness),
        opacity: item.opacity,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
      }))
      sprite.position.set(item.position[0], item.position[1], item.position[2])
      sprite.scale.set(item.scale[0], item.scale[1], item.scale[2])
      sprite.userData = {
        baseOpacity: item.opacity,
        themeOpacity: theme.opacity,
        drift: index % 2 === 0 ? 0.00018 : -0.00014,
        phase: index * 1.8,
        initialPosition: sprite.position.clone(),
        initialMaterialRotation: sprite.material.rotation,
      }
      sprite.renderOrder = 0
      scene.add(sprite)
      return sprite
    })
    nebulaRef.current = nebulaLayer
    const atmosphereLayer = [
      { opacity: 0.07, position: [-12, 6, -104], scale: [178, 86, 1], drift: 0.00006, phase: 0.4 },
      { opacity: 0.056, position: [30, -14, -138], scale: [148, 72, 1], drift: -0.00005, phase: 2.2 },
      { opacity: 0.046, position: [-46, 18, -166], scale: [132, 64, 1], drift: 0.00004, phase: 4.1 },
    ].map((item, index) => {
      const theme = nebulaThemeRef.current
      const themeColor = theme.atmosphereColors[index % theme.atmosphereColors.length]
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: softDiscTexture,
        color: new THREE.Color(themeColor).multiplyScalar(theme.brightness),
        opacity: item.opacity,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
      }))
      sprite.position.set(item.position[0], item.position[1], item.position[2])
      sprite.scale.set(item.scale[0], item.scale[1], item.scale[2])
      sprite.userData = {
        baseOpacity: item.opacity,
        themeOpacity: theme.opacity * theme.atmosphereOpacity,
        drift: item.drift,
        phase: item.phase,
        initialPosition: sprite.position.clone(),
        initialMaterialRotation: sprite.material.rotation,
      }
      sprite.renderOrder = 0
      scene.add(sprite)
      return sprite
    })
    atmosphereNebulaRef.current = atmosphereLayer
    const distantFlares = Array.from({ length: mount.clientWidth < 760 ? 18 : 24 }, (_, index) => {
      const theme = nebulaThemeRef.current
      const flareColor = index % 5 === 0 ? theme.flareColors[0] : theme.flareColors[1]
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: starFlareTexture,
        color: new THREE.Color(flareColor).multiplyScalar(theme.brightness),
        opacity: 0.16 + Math.random() * 0.16,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
      }))
      const radius = 58 + Math.random() * 118
      const theta = Math.random() * Math.PI * 2
      const phi = Math.PI * (0.32 + Math.random() * 0.38)
      sprite.position.set(
        radius * Math.sin(phi) * Math.cos(theta),
        radius * Math.sin(phi) * Math.sin(theta),
        -70 - Math.random() * 142,
      )
      const scale = (1.2 + Math.random() * 1.5) * (mount.clientWidth < 760 ? 1.16 : 1)
      sprite.scale.setScalar(scale)
      sprite.userData = {
        baseScale: scale,
        baseOpacity: 0.12 + Math.random() * 0.16,
        opacityRange: 0.08 + Math.random() * 0.12,
        themeOpacity: theme.opacity,
        speed: 0.24 + Math.random() * 0.72,
        phase: Math.random() * Math.PI * 2,
        initialMaterialRotation: sprite.material.rotation,
        initialScale: sprite.scale.clone(),
      }
      sprite.renderOrder = 0
      scene.add(sprite)
      return sprite
    })
    backgroundFlaresRef.current = distantFlares
    const group = new THREE.Group()
    scene.add(group)
    const summonScene = new THREE.Scene()
    summonScene.fog = scene.fog
    const summonGroup = new THREE.Group()
    summonGroup.visible = false
    summonScene.add(new THREE.AmbientLight(0x9fb8ff, 0.72))
    const summonLight = new THREE.PointLight(0xcddcff, 1.7, 90)
    summonLight.position.set(8, 10, 18)
    summonScene.add(summonLight)
    summonScene.add(summonGroup)
    const blackHoleBackScene = new THREE.Scene()
    const blackHoleScene = new THREE.Scene()
    const blackHoleForegroundScene = new THREE.Scene()
    const summonBlackHoleDistortionGroup = new THREE.Group()
    summonBlackHoleDistortionGroup.renderOrder = 8
    blackHoleBackScene.add(summonBlackHoleDistortionGroup)
    const summonBlackHoleBackAccretionGroup = new THREE.Group()
    summonBlackHoleBackAccretionGroup.renderOrder = 9
    blackHoleBackScene.add(summonBlackHoleBackAccretionGroup)
    const summonBlackHoleCoreGroup = new THREE.Group()
    summonBlackHoleCoreGroup.renderOrder = 10
    blackHoleScene.add(summonBlackHoleCoreGroup)
    const summonBlackHoleFlowGroup = new THREE.Group()
    summonBlackHoleFlowGroup.renderOrder = 11
    blackHoleForegroundScene.add(summonBlackHoleFlowGroup)
    const summonBlackHoleFrontAccretionGroup = new THREE.Group()
    summonBlackHoleFrontAccretionGroup.renderOrder = 12
    blackHoleForegroundScene.add(summonBlackHoleFrontAccretionGroup)
    const dwellFeedback = new THREE.Mesh(
      new THREE.RingGeometry(0.8, 0.92, 72),
      makeHaloMaterial(0xffdf8a, 0),
    )
    dwellFeedback.visible = false
    dwellFeedback.renderOrder = 30
    scene.add(dwellFeedback)
    dwellFeedbackRef.current = dwellFeedback
    sceneRef.current = scene
    cameraRef.current = camera
    rendererRef.current = renderer
    groupRef.current = group
    summonGroupRef.current = summonGroup
    initialViewRef.current = {
      position: camera.position.clone(),
      target: cameraTargetRef.current.clone(),
      rotation: group.rotation.clone(),
    }
    backgroundTimeOriginRef.current = performance.now() * 0.001

    const labelWorld = new THREE.Vector3()
    const labelCameraDirection = new THREE.Vector3()
    const labelParentInverseQuaternion = new THREE.Quaternion()
    let frame = 0
    let lastFrameMs = performance.now()
    const animate = () => {
      frame = requestAnimationFrame(animate)
      const nowMs = performance.now()
      const deltaTimeMs = nowMs - lastFrameMs
      lastFrameMs = nowMs
      const time = nowMs * 0.001
      let transitionOwnsBlur = false
      const backgroundTime = time - backgroundTimeOriginRef.current
      const activeGesture = gestureControlRef.current
      const viewer = imageViewerRef.current
      const viewerActive = !!viewer?.ready
      const blackHoleOcclusions = summonBlackHoleOcclusionsRef.current
      while (summonBlackHoleDistortionRef.current.length < blackHoleOcclusions.length) {
        const distortionMaterial = new THREE.ShaderMaterial({
          uniforms: {
            time: { value: 0 },
            opacity: { value: blackHoleEffectParams.blackHoleDistortionOpacity },
            lensingOpacity: { value: blackHoleEffectParams.blackHoleLensingOpacity },
            distortionEnabled: { value: blackHoleEffectFlags.enableBlackHoleDistortion ? 1 : 0 },
            lensingEnabled: { value: blackHoleEffectFlags.enableBlackHoleLensing ? 1 : 0 },
            shimmerEnabled: { value: blackHoleEffectFlags.enableBlackHoleShimmer ? 1 : 0 },
            shimmerStrength: { value: blackHoleEffectParams.blackHoleShimmerStrength },
          },
          vertexShader: `
            varying vec2 vUv;
            void main() {
              vUv = uv;
              gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
          `,
          fragmentShader: `
            uniform float time;
            uniform float opacity;
            uniform float lensingOpacity;
            uniform float distortionEnabled;
            uniform float lensingEnabled;
            uniform float shimmerEnabled;
            uniform float shimmerStrength;
            varying vec2 vUv;
            void main() {
              vec2 p = vUv * 2.0 - 1.0;
              float radius = length(p);
              float angle = atan(p.y, p.x);
              float inner = smoothstep(0.12, 0.34, radius);
              float outer = 1.0 - smoothstep(0.76, 1.0, radius);
              float ripple = 0.5 + 0.5 * sin(angle * 4.0 - radius * 13.0 + time * 0.58);
              float shear = 0.5 + 0.5 * sin(angle * 6.0 + radius * 17.0 - time * 0.41);
              float field = inner * outer * (0.76 + shear * 0.24);
              float caustic = exp(-pow((radius - 0.53) * 9.5, 2.0)) * (0.50 + ripple * 0.50);
              float shimmer = (
                sin(angle * 7.0 + radius * 11.0 - time * 0.82)
                + sin(angle * 3.0 - radius * 19.0 + time * 0.47) * 0.56
              ) * shimmerStrength * shimmerEnabled;
              float alpha = distortionEnabled * field * (0.70 + ripple * 0.34 + shimmer) * opacity;
              alpha += lensingEnabled * caustic * lensingOpacity;
              vec3 distortionColor = mix(vec3(0.20, 0.34, 0.64), vec3(0.94, 0.73, 0.38), caustic);
              gl_FragColor = vec4(distortionColor, clamp(alpha, 0.0, 0.48));
            }
          `,
          transparent: true,
          depthTest: false,
          depthWrite: false,
          blending: THREE.NormalBlending,
        })
        const distortion = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), distortionMaterial)
        distortion.renderOrder = 8
        distortion.userData = { role: 'summonBlackHoleDistortion' }
        summonBlackHoleDistortionGroup.add(distortion)
        summonBlackHoleDistortionRef.current.push(distortion)
      }
      while (summonBlackHoleCoreRef.current.length < blackHoleOcclusions.length) {
        const core = new THREE.Mesh(
          new THREE.CircleGeometry(1, 128),
          new THREE.MeshBasicMaterial({
            color: 0x000000,
            opacity: 1,
            transparent: false,
            blending: THREE.NormalBlending,
            depthTest: false,
            depthWrite: false,
            fog: false,
          }),
        )
        core.renderOrder = 10
        summonBlackHoleCoreGroup.add(core)
        summonBlackHoleCoreRef.current.push(core)
      }
      while (summonBlackHoleBackAccretionRef.current.length < blackHoleOcclusions.length) {
        const backAccretion = new THREE.Group()
        backAccretion.renderOrder = 9
        ;[0.42, 1.84].forEach((phase) => {
          const ribbon = createAccretionRibbon('back', phase)
          ribbon.renderOrder = 9
          backAccretion.add(ribbon)
        })
        summonBlackHoleBackAccretionGroup.add(backAccretion)
        summonBlackHoleBackAccretionRef.current.push(backAccretion)
      }
      while (summonBlackHoleFrontAccretionRef.current.length < blackHoleOcclusions.length) {
        const frontAccretion = new THREE.Group()
        frontAccretion.renderOrder = 12
        ;[-1, 1].forEach((side, index) => {
          const ribbon = createAccretionRibbon('front', 0.72 + index * 0.88, side)
          ribbon.renderOrder = 12
          frontAccretion.add(ribbon)
        })
        ;['upperLens', 'lowerLens'].forEach((kind, index) => {
          const ribbon = createAccretionRibbon(kind as AccretionRibbonKind, 1.26 + index * 1.14)
          ribbon.renderOrder = 12
          frontAccretion.add(ribbon)
        })
        summonBlackHoleFrontAccretionGroup.add(frontAccretion)
        summonBlackHoleFrontAccretionRef.current.push(frontAccretion)
      }
      while (summonBlackHoleFlowRef.current.length < blackHoleOcclusions.length) {
        const flow = new THREE.Group()
        flow.renderOrder = 11
        Array.from({ length: 22 }, (_, index) => {
          const radius = 1.015 + (index % 7) * 0.024
          const vertical = radius
          const drift = (index - 10.5) * 0.0025
          const points = Array.from({ length: 129 }, (_, pointIndex) => {
            const angle = (pointIndex / 128) * Math.PI * 2
            const lensing = 1 + Math.sin(angle * 2 + index * 0.72) * 0.012
            return new THREE.Vector3(Math.cos(angle) * radius * lensing, Math.sin(angle) * vertical + drift * Math.sin(angle * 3), 0)
          })
          const colors = [0xfff1cc, 0xffc46d, 0xbde7ff, 0xffdfaa, 0xffcf87]
          const material = new THREE.LineBasicMaterial({
            color: colors[index % colors.length],
            transparent: true,
            opacity: index % 5 === 2 ? 0.33 : 0.56,
            blending: THREE.AdditiveBlending,
            depthTest: false,
            depthWrite: false,
          })
          const thread = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points), material)
          thread.renderOrder = 11
          thread.userData = { role: 'blackHoleThread', baseOpacity: material.opacity, offset: index * 0.42, speed: 0.014 + (index % 5) * 0.002 }
          flow.add(thread)

          // A long, moving highlight rides each continuous thread. It makes the light itself
          // travel around the horizon without turning the entire black hole into a spinner.
          const tier = radius < 1.065 ? 0 : radius < 1.115 ? 1 : 2
          const pointCount = 28
          const currentGeometry = new THREE.BufferGeometry()
          currentGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pointCount * 3), 3))
          const currentMaterial = new THREE.LineBasicMaterial({
            color: colors[index % colors.length],
            transparent: true,
            opacity: [0.62, 0.5, 0.38][tier],
            blending: THREE.AdditiveBlending,
            depthTest: false,
            depthWrite: false,
          })
          const current = new THREE.Line(currentGeometry, currentMaterial)
          current.renderOrder = 11
          current.userData = {
            role: 'blackHoleCurrent',
            radius,
            drift,
            lensPhase: index * 0.72,
            phase: index * 0.42 + (index % 3) * 0.7,
            arcLength: [1.16, 1.42, 1.7][tier],
            flowSpeed: [0.14, 0.098, 0.063][tier],
            baseOpacity: [0.62, 0.5, 0.38][tier],
            breathePhase: index * 0.58,
          }
          flow.add(current)
        })
        if (blackHoleEffectFlags.enableBlackHoleParticles && !summonBlackHoleParticlesRef.current) {
          const count = blackHoleEffectParams.blackHoleParticleCount
          const positions = new Float32Array(count * 3)
          const colors = new Float32Array(count * 3)
          const particleData = new Float32Array(count * 3)
          for (let index = 0; index < count; index += 1) {
            const phase = (index / count) * Math.PI * 2 + Math.sin(index * 1.73) * 0.38
            const seed = (index * 0.61803398875) % 1
            particleData.set([phase, seed, index % 2 === 0 ? 0.12 : -0.08], index * 3)
            colors.set(index % 3 === 0 ? [1, 0.84, 0.6] : [0.94, 0.78, 0.54], index * 3)
          }
          const geometry = new THREE.BufferGeometry()
          geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
          geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
          const material = new THREE.PointsMaterial({
            size: blackHoleEffectParams.blackHoleParticleSize,
            vertexColors: true,
            transparent: true,
            opacity: blackHoleEffectParams.blackHoleParticleOpacity,
            blending: THREE.AdditiveBlending,
            depthTest: false,
            depthWrite: false,
            sizeAttenuation: true,
          })
          const particles = new THREE.Points(geometry, material)
          particles.renderOrder = 12
          particles.userData = { role: 'summonBlackHoleParticles', particleData }
          flow.add(particles)
          summonBlackHoleParticlesRef.current = particles
        }
        summonBlackHoleFlowGroup.add(flow)
        summonBlackHoleFlowRef.current.push(flow)
      }
      const blackHolePortraitScale = renderer.domElement.clientHeight > renderer.domElement.clientWidth ? 0.8 : 1
      summonBlackHoleDistortionRef.current.forEach((distortion, index) => {
        const occlusion = blackHoleOcclusions[index]
        distortion.visible = !!occlusion
        if (!occlusion) return
        const distance = 24
        const ndc = new THREE.Vector3(
          (occlusion.point.x / Math.max(1, renderer.domElement.clientWidth)) * 2 - 1,
          -(occlusion.point.y / Math.max(1, renderer.domElement.clientHeight)) * 2 + 1,
          0.1,
        )
        ndc.unproject(camera)
        const direction = ndc.sub(camera.position).normalize()
        distortion.position.copy(camera.position).addScaledVector(direction, distance)
        distortion.quaternion.copy(camera.quaternion)
        const worldRadius = (82 * occlusion.scale / Math.max(1, renderer.domElement.clientHeight)) * 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5)) * distance * blackHolePortraitScale
        distortion.scale.setScalar(worldRadius * blackHoleEffectParams.blackHoleDistortionRadius)
        const material = distortion.material as THREE.ShaderMaterial
        material.uniforms.time.value = time
        material.uniforms.distortionEnabled.value = blackHoleEffectFlags.enableBlackHoleDistortion ? 1 : 0
        material.uniforms.lensingEnabled.value = blackHoleEffectFlags.enableBlackHoleLensing ? 1 : 0
        material.uniforms.shimmerEnabled.value = blackHoleEffectFlags.enableBlackHoleShimmer ? 1 : 0
      })
      summonBlackHoleCoreRef.current.forEach((core, index) => {
        const occlusion = blackHoleOcclusions[index]
        core.visible = !!occlusion
        if (!occlusion) return
        const distance = 24
        const ndc = new THREE.Vector3(
          (occlusion.point.x / Math.max(1, renderer.domElement.clientWidth)) * 2 - 1,
          -(occlusion.point.y / Math.max(1, renderer.domElement.clientHeight)) * 2 + 1,
          0.1,
        )
        ndc.unproject(camera)
        const direction = ndc.sub(camera.position).normalize()
        core.position.copy(camera.position).addScaledVector(direction, distance)
        core.quaternion.copy(camera.quaternion)
        const worldRadius = (82 * occlusion.scale / Math.max(1, renderer.domElement.clientHeight)) * 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5)) * distance * blackHolePortraitScale
        core.scale.setScalar(worldRadius)
      })
      const positionAccretionLayer = (layers: THREE.Group[], updateStreams: boolean) => {
        layers.forEach((layer, index) => {
          const occlusion = blackHoleOcclusions[index]
          layer.visible = !!occlusion
          if (!occlusion) return
          const distance = 24
          const ndc = new THREE.Vector3(
            (occlusion.point.x / Math.max(1, renderer.domElement.clientWidth)) * 2 - 1,
            -(occlusion.point.y / Math.max(1, renderer.domElement.clientHeight)) * 2 + 1,
            0.1,
          )
          ndc.unproject(camera)
          const direction = ndc.sub(camera.position).normalize()
          layer.position.copy(camera.position).addScaledVector(direction, distance)
          layer.quaternion.copy(camera.quaternion)
          const worldRadius = (82 * occlusion.scale / Math.max(1, renderer.domElement.clientHeight)) * 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5)) * distance * blackHolePortraitScale
          layer.scale.setScalar(worldRadius)
          if (updateStreams) {
            layer.children.forEach((ribbon) => updateAccretionRibbon(ribbon as THREE.Mesh, time))
          }
        })
      }
      positionAccretionLayer(summonBlackHoleBackAccretionRef.current, true)
      positionAccretionLayer(summonBlackHoleFrontAccretionRef.current, true)
      summonBlackHoleFlowRef.current.forEach((flow, index) => {
        const occlusion = blackHoleOcclusions[index]
        flow.visible = !!occlusion
        if (!occlusion) return
        const distance = 24
        const ndc = new THREE.Vector3(
          (occlusion.point.x / Math.max(1, renderer.domElement.clientWidth)) * 2 - 1,
          -(occlusion.point.y / Math.max(1, renderer.domElement.clientHeight)) * 2 + 1,
          0.1,
        )
        ndc.unproject(camera)
        const direction = ndc.sub(camera.position).normalize()
        flow.position.copy(camera.position).addScaledVector(direction, distance)
        flow.quaternion.copy(camera.quaternion)
        const worldRadius = (82 * occlusion.scale / Math.max(1, renderer.domElement.clientHeight)) * 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5)) * distance * blackHolePortraitScale
        flow.scale.setScalar(worldRadius)
        flow.rotateZ(time * 0.004)
        flow.children.forEach((thread) => {
          if (thread instanceof THREE.Points && thread.userData.role === 'summonBlackHoleParticles') {
            const positions = thread.geometry.getAttribute('position') as THREE.BufferAttribute
            const particleData = thread.userData.particleData as Float32Array
            const spawnRadius = blackHoleEffectParams.blackHoleParticleSpawnRadius * 0.278
            for (let particleIndex = 0; particleIndex < positions.count; particleIndex += 1) {
              const phase = particleData[particleIndex * 3]
              const seed = particleData[particleIndex * 3 + 1]
              const depth = particleData[particleIndex * 3 + 2]
              const progress = (time * (blackHoleEffectParams.blackHoleParticleSinkSpeed + seed * 0.026) + seed) % 1
              const radius = spawnRadius - progress * (spawnRadius - 0.14)
              const angle = phase + time * blackHoleEffectParams.blackHoleParticleOrbitSpeed * (0.8 + seed * 0.5)
              positions.setXYZ(
                particleIndex,
                Math.cos(angle) * radius,
                Math.sin(angle) * radius * (0.68 + seed * 0.12),
                depth * (1 - progress * 0.8),
              )
            }
            positions.needsUpdate = true
            thread.visible = true
            return
          }
          if (!(thread instanceof THREE.Line)) return
          const material = (thread as THREE.Line).material as THREE.LineBasicMaterial
          if (thread.userData.role === 'blackHoleCurrent') {
            const position = (thread as THREE.Line).geometry.getAttribute('position') as THREE.BufferAttribute
            const progressSpeed = thread.userData.flowSpeed ?? 0.08
            const phase = thread.userData.phase ?? 0
            const advance = time * progressSpeed * (1 + Math.sin(time * 0.11 + phase) * 0.07) + phase
            const arcLength = thread.userData.arcLength ?? 1.4
            const radius = thread.userData.radius ?? 1.08
            const drift = thread.userData.drift ?? 0
            const lensPhase = thread.userData.lensPhase ?? 0
            for (let pointIndex = 0; pointIndex < position.count; pointIndex += 1) {
              const portion = pointIndex / Math.max(1, position.count - 1) - 0.5
              const angle = advance + portion * arcLength
              const lensing = 1 + Math.sin(angle * 2 + lensPhase) * 0.012
              position.setXYZ(
                pointIndex,
                Math.cos(angle) * radius * lensing,
                Math.sin(angle) * radius + drift * Math.sin(angle * 3),
                0.004,
              )
            }
            position.needsUpdate = true
            material.opacity = Math.max(0.18, (thread.userData.baseOpacity ?? 0.42) + Math.sin(time * 0.2 + (thread.userData.breathePhase ?? 0)) * 0.032)
            return
          }
          material.opacity = Math.max(0.22, (thread.userData.baseOpacity ?? 0.5) + Math.sin(time * 0.2 + (thread.userData.offset ?? 0)) * 0.032)
          thread.rotation.z = Math.sin(time * (thread.userData.speed ?? 0.014) * 0.32 + (thread.userData.offset ?? 0)) * 0.008
        })
      })
      const summonActive = appModeRef.current === 'summon'
      const summonStage = summonStageRef.current
      const summonDeploying = summonActive && summonStage === 'deploying'
      const transitionActive = appModeRef.current === 'transition-to-summon' || appModeRef.current === 'transition-to-universe'
      const summonGroup = summonGroupRef.current
      group.visible = !summonActive
      if (summonGroup) summonGroup.visible = summonActive && summonStage !== 'setup'
      viewer?.update(nowMs)
      if (!viewerActive && focusTransitionRef.current && activeGesture && ['zoomIn', 'zoomOut', 'pan', 'rotate'].includes(activeGesture.activeGesture) && !(summonActive && activeGesture.activeGesture === 'zoomOut')) {
        focusTransitionRef.current = null
        clearFocusMotionBlur(mount)
      }
      const viewReset = viewResetRef.current
      const resettingBackground = !!viewReset && !!backgroundResetRef.current
      if (viewerActive) {
        if (activeGesture?.activeGesture === 'rotate') {
          viewer.rotateByRadians(
            THREE.MathUtils.clamp(activeGesture.rotateDelta.x * -4.2, -0.045, 0.045),
            THREE.MathUtils.clamp(activeGesture.rotateDelta.y * 3.2, -0.035, 0.035),
          )
        } else if (activeGesture && (activeGesture.activeGesture === 'zoomIn' || activeGesture.activeGesture === 'zoomOut')) {
          const zoomStep = THREE.MathUtils.clamp(activeGesture.zoomDelta * 34, -0.65, 0.65)
          viewer.zoomByGestureStep(zoomStep, deltaTimeMs)
        } else if (activeGesture?.activeGesture === 'pan') {
          viewer.panByGesturePixels(
            THREE.MathUtils.clamp(activeGesture.panDelta.x, -0.036, 0.036) * -760,
            THREE.MathUtils.clamp(activeGesture.panDelta.y, -0.036, 0.036) * 760,
            mount.clientWidth,
            mount.clientHeight,
          )
        }
      } else if (viewReset) {
        const progress = THREE.MathUtils.clamp((nowMs - viewReset.startedAt) / viewReset.duration, 0, 1)
        const eased = 1 - (1 - progress) ** 3
        camera.position.lerpVectors(viewReset.fromPosition, viewReset.toPosition, eased)
        cameraTargetRef.current.lerpVectors(viewReset.fromTarget, viewReset.toTarget, eased)
        if (viewReset.blurMax) {
          transitionOwnsBlur = true
          applyFocusMotionBlur(mount, progress, viewReset.blurMax, viewReset.scaleMax)
        }
        if (viewReset.resetRotation) {
          const resettingSummon = appModeRef.current === 'summon'
          const initialRotation = resettingSummon ? new THREE.Euler() : initialViewRef.current?.rotation ?? new THREE.Euler()
          const resetGroup = resettingSummon ? summonGroupRef.current : group
          resetGroup?.rotation.set(
            THREE.MathUtils.lerp(viewReset.fromRotation.x, initialRotation.x, eased),
            THREE.MathUtils.lerp(viewReset.fromRotation.y, initialRotation.y, eased),
            THREE.MathUtils.lerp(viewReset.fromRotation.z, initialRotation.z, eased),
          )
        }
        const backgroundReset = backgroundResetRef.current
        if (backgroundReset) {
          starfieldsRef.current.forEach((field, index) => {
            field.rotation.y = THREE.MathUtils.lerp(
              backgroundReset.starfieldRotationY[index] ?? field.rotation.y,
              field.userData.initialRotationY ?? 0,
              eased,
            )
          })
          nebulaRef.current.forEach((sprite, index) => {
            const initialPosition = sprite.userData.initialPosition as THREE.Vector3
            sprite.position.lerpVectors(backgroundReset.nebulaPositions[index] ?? sprite.position, initialPosition, eased)
            sprite.material.rotation = THREE.MathUtils.lerp(
              backgroundReset.nebulaMaterialRotations[index] ?? sprite.material.rotation,
              sprite.userData.initialMaterialRotation ?? 0,
              eased,
            )
          })
          atmosphereNebulaRef.current.forEach((sprite, index) => {
            const initialPosition = sprite.userData.initialPosition as THREE.Vector3
            sprite.position.lerpVectors(backgroundReset.atmospherePositions[index] ?? sprite.position, initialPosition, eased)
            sprite.material.rotation = THREE.MathUtils.lerp(
              backgroundReset.atmosphereMaterialRotations[index] ?? sprite.material.rotation,
              sprite.userData.initialMaterialRotation ?? 0,
              eased,
            )
          })
          backgroundFlaresRef.current.forEach((sprite, index) => {
            sprite.material.rotation = THREE.MathUtils.lerp(
              backgroundReset.flareMaterialRotations[index] ?? sprite.material.rotation,
              sprite.userData.initialMaterialRotation ?? 0,
              eased,
            )
            sprite.scale.lerpVectors(
              backgroundReset.flareScales[index] ?? sprite.scale,
              sprite.userData.initialScale as THREE.Vector3,
              eased,
            )
          })
        }
        if (progress >= 1) {
          viewResetRef.current = null
          backgroundResetRef.current = null
          backgroundTimeOriginRef.current = time
          clearFocusMotionBlur(mount)
        }
      } else if (focusTransitionRef.current) {
        const transition = focusTransitionRef.current
        const progress = THREE.MathUtils.clamp((nowMs - transition.startedAt) / transition.duration, 0, 1)
        const eased = progress < 0.5
          ? 4 * progress ** 3
          : 1 - (-2 * progress + 2) ** 3 / 2
        camera.position.lerpVectors(transition.fromPosition, transition.toPosition, eased)
        cameraTargetRef.current.lerpVectors(transition.fromTarget, transition.toTarget, eased)
        if (transition.blurMax) {
          transitionOwnsBlur = true
          applyFocusMotionBlur(mount, progress, transition.blurMax, transition.scaleMax)
        }
        if (progress >= 1) {
          focusTransitionRef.current = null
          clearFocusMotionBlur(mount)
        }
      } else if (!transitionActive && !summonDeploying) {
        const controlGroup = summonActive && summonGroup ? summonGroup : group
        controlGroup.rotation.y += 0.00085
        if (activeGesture?.activeGesture === 'rotate') {
          controlGroup.rotation.y += THREE.MathUtils.clamp(activeGesture.rotateDelta.x * -4.2, -0.045, 0.045)
          controlGroup.rotation.x += THREE.MathUtils.clamp(activeGesture.rotateDelta.y * 3.2, -0.035, 0.035)
        } else if (activeGesture && (activeGesture.activeGesture === 'zoomIn' || activeGesture.activeGesture === 'zoomOut')) {
          const zoomStep = THREE.MathUtils.clamp(activeGesture.zoomDelta * 34, -0.65, 0.65)
          if (summonActive && selectedSummonStarIdRef.current) {
            if (activeGesture.activeGesture === 'zoomOut' && zoomStep < -0.08) {
              startSummonZoomOutTransition()
            } else if (activeGesture.activeGesture === 'zoomIn' && zoomStep > 0.08) {
              moveSelectedSummonFocusCloser(camera, zoomStep)
            }
          } else if (appModeRef.current === 'universe' && focusIdRef.current) {
            if (activeGesture.activeGesture === 'zoomOut' && zoomStep < -0.08) {
              startUniverseZoomOutTransition()
            } else if (activeGesture.activeGesture === 'zoomIn' && zoomStep > 0.08) {
              moveFocusedUniverseCloser(camera, zoomStep)
            }
          } else {
            camera.position.z = THREE.MathUtils.clamp(camera.position.z - zoomStep, 11, 70)
          }
        } else if (activeGesture?.activeGesture === 'pan') {
          const targetDistance = camera.position.distanceTo(cameraTargetRef.current)
          panCameraView(
            camera,
            cameraTargetRef.current,
            THREE.MathUtils.clamp(activeGesture.panDelta.x, -0.036, 0.036) * -760,
            THREE.MathUtils.clamp(activeGesture.panDelta.y, -0.036, 0.036) * 760,
            targetDistance * 0.0017,
          )
        }
      }
      camera.lookAt(cameraTargetRef.current)
      camera.updateMatrixWorld()
      const summonMotionBlur = summonMotionBlurRef.current
      const selectedSummonCameraMotion = summonActive && !!selectedSummonStarIdRef.current && !viewerActive
      if (!selectedSummonCameraMotion) {
        const ownedBlur = summonMotionBlur.initialized || summonMotionBlur.current > 0.01
        summonMotionBlur.current = 0
        summonMotionBlur.initialized = false
        if (ownedBlur) clearFocusMotionBlur(mount)
      } else {
        const activeControlGroup = summonGroupRef.current
        if (!summonMotionBlur.initialized) {
          summonMotionBlur.initialized = true
          summonMotionBlur.cameraPosition.copy(camera.position)
          summonMotionBlur.cameraTarget.copy(cameraTargetRef.current)
          summonMotionBlur.groupRotation.copy(activeControlGroup?.rotation ?? new THREE.Euler())
        } else {
          const cameraDistance = camera.position.distanceTo(summonMotionBlur.cameraPosition)
          const targetDistance = cameraTargetRef.current.distanceTo(summonMotionBlur.cameraTarget)
          const groupRotationDistance = activeControlGroup
            ? Math.abs(activeControlGroup.rotation.x - summonMotionBlur.groupRotation.x) +
              Math.abs(activeControlGroup.rotation.y - summonMotionBlur.groupRotation.y) +
              Math.abs(activeControlGroup.rotation.z - summonMotionBlur.groupRotation.z)
            : 0
          const manualGroupMotion = activeGesture?.activeGesture === 'rotate' ||
            (dragRef.current.active && dragRef.current.dragging) ||
            touchRef.current.mode === 'rotate'
          const movementStrength = cameraDistance * 1.6 + targetDistance * 1.2 + (manualGroupMotion ? groupRotationDistance * 24 : 0)
          const transitionControlsBlur = !!focusTransitionRef.current || !!viewResetRef.current
          if (!transitionControlsBlur) {
            const targetBlur = THREE.MathUtils.clamp(movementStrength, 0, 4.8)
            const smoothing = 1 - Math.exp(-(targetBlur > summonMotionBlur.current ? 16 : 11) * Math.max(0.001, deltaTimeMs / 1000))
            summonMotionBlur.current += (targetBlur - summonMotionBlur.current) * smoothing
            if (summonMotionBlur.current > 0.01) applyContinuousFocusMotionBlur(mount, summonMotionBlur.current)
            else clearFocusMotionBlur(mount)
          }
          summonMotionBlur.cameraPosition.copy(camera.position)
          summonMotionBlur.cameraTarget.copy(cameraTargetRef.current)
          if (activeControlGroup) summonMotionBlur.groupRotation.copy(activeControlGroup.rotation)
        }
      }
      const universeFocusMotionBlur = universeFocusMotionBlurRef.current
      const focusedUniverseCameraMotion = appModeRef.current === 'universe' && !!focusIdRef.current && !viewerActive
      if (!focusedUniverseCameraMotion) {
        const ownedBlur = universeFocusMotionBlur.initialized || universeFocusMotionBlur.current > 0.01
        universeFocusMotionBlur.current = 0
        universeFocusMotionBlur.initialized = false
        if (ownedBlur) clearFocusMotionBlur(mount)
      } else if (!universeFocusMotionBlur.initialized) {
        universeFocusMotionBlur.initialized = true
        universeFocusMotionBlur.cameraPosition.copy(camera.position)
        universeFocusMotionBlur.cameraTarget.copy(cameraTargetRef.current)
      } else {
        const cameraDistance = camera.position.distanceTo(universeFocusMotionBlur.cameraPosition)
        const targetDistance = cameraTargetRef.current.distanceTo(universeFocusMotionBlur.cameraTarget)
        if (transitionOwnsBlur) {
          universeFocusMotionBlur.current = 0
        } else {
          const movementStrength = cameraDistance * 1.8 + targetDistance * 1.25
          const targetBlur = THREE.MathUtils.clamp(movementStrength, 0, 4.8)
          const smoothing = 1 - Math.exp(-(targetBlur > universeFocusMotionBlur.current ? 16 : 11) * Math.max(0.001, deltaTimeMs / 1000))
          universeFocusMotionBlur.current += (targetBlur - universeFocusMotionBlur.current) * smoothing
          if (universeFocusMotionBlur.current > 0.01) applyContinuousFocusMotionBlur(mount, universeFocusMotionBlur.current)
          else clearFocusMotionBlur(mount)
        }
        universeFocusMotionBlur.cameraPosition.copy(camera.position)
        universeFocusMotionBlur.cameraTarget.copy(cameraTargetRef.current)
      }
      const warp = warpTransitionRef.current
      const transitionDuration = appModeRef.current === 'transition-to-universe' ? 820 : 920
      if (transitionActive && !warp.active) {
        warp.active = true
        warp.startedAt = nowMs
        warp.direction = appModeRef.current === 'transition-to-universe' ? -1 : 1
        mount.classList.remove('is-warp-transitioning')
        void mount.offsetWidth
        mount.classList.add('is-warp-transitioning')
      } else if (!transitionActive && warp.active) {
        warp.active = false
        mount.classList.remove('is-warp-transitioning')
      }
      const warpProgress = warp.active ? THREE.MathUtils.clamp((nowMs - warp.startedAt) / transitionDuration, 0, 1) : 0
      const warpPeak = warp.active ? Math.sin(warpProgress * Math.PI) : 0
      const warpStreaks = warpStreaksRef.current
      if (warpStreaks) {
        warpStreaks.visible = warpPeak > 0.02
        warpStreaks.position.copy(camera.position)
        warpStreaks.quaternion.copy(camera.quaternion)
        const material = warpStreaks.material as THREE.LineBasicMaterial
        material.opacity = 0.72 * warpPeak
        const geometry = warpStreaks.geometry
        const positions = geometry.getAttribute('position') as THREE.BufferAttribute
        const values = positions.array as Float32Array
        const base = geometry.userData.base as Float32Array
        for (let i = 0; i < base.length / 4; i += 1) {
          const baseX = base[i * 4]
          const baseY = base[i * 4 + 1]
          const baseDepth = -base[i * 4 + 2]
          const speed = base[i * 4 + 3]
          const depth = 18 + ((baseDepth + (nowMs - warp.startedAt) * 0.001 * speed) % 128)
          const z = -depth
          const stretch = 5 + warpPeak * (26 + speed * 0.08)
          const spread = 1 + warpPeak * 0.42
          const pull = 1 - warpPeak * 0.48
          const direction = warp.direction
          values[i * 6] = baseX * spread
          values[i * 6 + 1] = baseY * spread
          values[i * 6 + 2] = z
          values[i * 6 + 3] = baseX * pull
          values[i * 6 + 4] = baseY * pull
          values[i * 6 + 5] = z - stretch * direction
        }
        positions.needsUpdate = true
      }
      const pointerOverUi = !!activeGesture?.pointerScreen && !!isGesturePointerOverUiRef.current?.(activeGesture.pointerScreen)
      if (summonActive && summonStage === 'drawing' && !viewerActive && activeGesture?.activeGesture === 'pointer' && activeGesture.pointerScreen && !gesturePointerBlockedRef.current && !pointerOverUi) {
        const hitId = getScreenSummonHit(activeGesture.pointerScreen, summonMeshesRef.current, camera, renderer)
        if (hitId) {
          const mesh = summonMeshesRef.current.get(hitId)
          const world = new THREE.Vector3()
          mesh?.getWorldPosition(world)
          if (dwellRef.current.nodeId !== hitId) {
            dwellRef.current = { nodeId: hitId, since: performance.now(), triggeredAt: dwellRef.current.triggeredAt, armed: true }
            onHover(undefined)
          }
          const dwellMs = performance.now() - dwellRef.current.since
          const isSelected = hitId === selectedSummonStarIdRef.current
          const dwellDuration = isSelected ? DWELL_DESELECT_MS : DWELL_SELECT_MS
          const progress = dwellRef.current.armed ? THREE.MathUtils.clamp(dwellMs / dwellDuration, 0, 1) : 0
          const feedback = dwellFeedbackRef.current
          if (feedback) {
            const material = feedback.material as THREE.MeshBasicMaterial
            feedback.visible = dwellRef.current.armed
            feedback.position.copy(world)
            feedback.quaternion.copy(camera.quaternion)
            feedback.scale.setScalar(0.92 + progress * 0.62)
            material.color.setHex(isSelected ? 0xffd48a : 0xbfeeff)
            material.opacity = 0.2 + progress * 0.42
          }
          const nowMs = performance.now()
          if (progress >= 1 && dwellRef.current.armed && nowMs - dwellRef.current.triggeredAt > DWELL_COOLDOWN_MS) {
            dwellRef.current.triggeredAt = nowMs
            dwellRef.current.armed = false
            summonCallbacksRef.current.onSummonStarSelect?.(hitId)
          }
        } else {
          dwellRef.current = { since: 0, triggeredAt: dwellRef.current.triggeredAt, armed: true }
          if (dwellFeedbackRef.current) dwellFeedbackRef.current.visible = false
        }
      } else if (!viewerActive && !summonActive && activeGesture?.activeGesture === 'pointer' && activeGesture.pointerScreen && !gesturePointerBlockedRef.current && !pointerOverUi) {
        const hit = getScreenHit(activeGesture.pointerScreen, nodeMeshesRef.current, camera, renderer)
        if (hit?.id) {
          if (dwellRef.current.nodeId !== hit.id) {
            dwellRef.current = { nodeId: hit.id, since: performance.now(), triggeredAt: dwellRef.current.triggeredAt, armed: true }
            onHover(hit.id)
          }
          const dwellMs = performance.now() - dwellRef.current.since
          const isSelected = hit.id === selectedIdRef.current
          const dwellDuration = isSelected ? DWELL_DESELECT_MS : DWELL_SELECT_MS
          const progress = dwellRef.current.armed ? THREE.MathUtils.clamp(dwellMs / dwellDuration, 0, 1) : 0
          const nodeColor = getNodeColor(hit.node)
          const feedback = dwellFeedbackRef.current
          if (feedback) {
            const material = feedback.material as THREE.MeshBasicMaterial
            feedback.visible = dwellRef.current.armed
            feedback.position.copy(hit.world)
            feedback.quaternion.copy(camera.quaternion)
            feedback.scale.setScalar(0.86 + progress * 0.52)
            material.color.setHex(nodeColor)
            material.opacity = 0.16 + progress * 0.38
          }
          const nowMs = performance.now()
          if (progress >= 1 && hit.node && dwellRef.current.armed && nowMs - dwellRef.current.triggeredAt > DWELL_COOLDOWN_MS) {
            dwellRef.current.triggeredAt = nowMs
            dwellRef.current.armed = false
            const burst = isSelected
              ? createDeselectBurst(hit.world, nodeColor, starFlareTexture)
              : createSelectBurst(hit.world, nodeColor, starFlareTexture)
            scene.add(burst)
            selectBurstRef.current.push(burst)
            if (isSelected) {
              onClearSelection()
              onHover(undefined)
            } else {
              onSelect(hit.node, 'pointerGesture')
              onHover(hit.id)
            }
          }
        } else {
          if (dwellRef.current.nodeId) onHover(undefined)
          dwellRef.current = { since: 0, triggeredAt: dwellRef.current.triggeredAt, armed: true }
          lastTapRef.current = { time: 0, x: 0, y: 0, pointerType: '', blank: false, nodeId: undefined }
          if (dwellFeedbackRef.current) dwellFeedbackRef.current.visible = false
        }
      } else {
        if (dwellRef.current.nodeId) onHover(undefined)
        dwellRef.current = { since: 0, triggeredAt: dwellRef.current.triggeredAt, armed: true }
        if (dwellFeedbackRef.current) dwellFeedbackRef.current.visible = false
      }
      if (summonActive && summonStage === 'drawing') {
        const selectedSummonId = selectedSummonStarIdRef.current
        const armedSummonId = armedSummonStarIdRef.current
        if (selectedSummonId && !armedSummonId) {
          const openPalmOnSelected = handsRef.current.some((hand) => {
            if (hand.gesture !== 'open') return false
            const point = { x: hand.palmCenter.x * renderer.domElement.clientWidth, y: hand.palmCenter.y * renderer.domElement.clientHeight }
            return getScreenSummonHit(point, summonMeshesRef.current, camera, renderer) === selectedSummonId
          })
          if (openPalmOnSelected && time - summonArmLockRef.current.armedAt > 0.75) {
            summonArmLockRef.current.armedAt = time
            summonCallbacksRef.current.onSummonStarArm?.(selectedSummonId)
          }
        }
        if (armedSummonId) {
          const fistActive = handsRef.current.some((hand) => hand.gesture === 'fist' || hand.gesture === 'fistWithIndex')
          if (fistActive) {
            if (summonArmLockRef.current.holdingId !== armedSummonId) {
              summonArmLockRef.current.holdingId = armedSummonId
              summonArmLockRef.current.holdStartedAt = time
              summonCallbacksRef.current.onSummonStarHoldChange?.(armedSummonId)
            }
          } else if (summonArmLockRef.current.holdingId) {
            const releasedId = summonArmLockRef.current.holdingId
            if (time - summonArmLockRef.current.triggeredAt > 0.35) {
              summonArmLockRef.current.triggeredAt = time
              summonCallbacksRef.current.onSummonStarTrigger?.(releasedId)
            }
            summonArmLockRef.current.holdingId = undefined
            summonArmLockRef.current.holdStartedAt = 0
            summonCallbacksRef.current.onSummonStarHoldChange?.(undefined)
          }
        } else if (summonArmLockRef.current.holdingId) {
          summonArmLockRef.current.holdingId = undefined
          summonArmLockRef.current.holdStartedAt = 0
          summonCallbacksRef.current.onSummonStarHoldChange?.(undefined)
        }
      }
      camera.lookAt(cameraTargetRef.current)
      const backgroundDim = viewerActive ? 0.32 : 1
      starfieldsRef.current.forEach((field) => {
        if (!resettingBackground) field.rotation.y += field.userData.drift * (viewerActive ? 0.18 : 1)
        const material = field.material as THREE.PointsMaterial
        material.size = (field.userData.baseSize ?? material.size) * (1 + warpPeak * 1.35)
        material.opacity = (field.userData.baseOpacity ?? material.opacity) * (1 + warpPeak * 0.2)
        const colorAttribute = field.geometry.getAttribute('color') as THREE.BufferAttribute
        const colors = colorAttribute.array as Float32Array
        const baseColors = field.geometry.userData.baseColors as Float32Array
        const phases = field.geometry.userData.phases as Float32Array
        const speeds = field.geometry.userData.speeds as Float32Array
        const twinkleAmounts = field.geometry.userData.twinkleAmounts as Float32Array
        for (let i = 0; i < phases.length; i += 1) {
          const pulse = 1 + Math.sin(backgroundTime * speeds[i] + phases[i]) * twinkleAmounts[i]
          colors[i * 3] = baseColors[i * 3] * pulse * backgroundDim
          colors[i * 3 + 1] = baseColors[i * 3 + 1] * pulse * backgroundDim
          colors[i * 3 + 2] = baseColors[i * 3 + 2] * pulse * backgroundDim
        }
        colorAttribute.needsUpdate = true
      })
      nebulaRef.current.forEach((sprite, index) => {
        sprite.material.opacity = (sprite.userData.baseOpacity + Math.sin(backgroundTime * 0.18 + sprite.userData.phase) * 0.018) * backgroundDim * (sprite.userData.themeOpacity ?? 1)
        if (!resettingBackground) {
          sprite.material.rotation += sprite.userData.drift
          sprite.position.x += Math.sin(backgroundTime * 0.08 + index) * 0.0012
        }
      })
      atmosphereNebulaRef.current.forEach((sprite, index) => {
        sprite.material.opacity = (sprite.userData.baseOpacity + Math.sin(backgroundTime * 0.11 + sprite.userData.phase) * 0.009) * backgroundDim * (sprite.userData.themeOpacity ?? 1)
        if (!resettingBackground) {
          sprite.material.rotation += sprite.userData.drift
          sprite.position.y += Math.sin(backgroundTime * 0.045 + index * 1.7) * 0.0007
        }
      })
      backgroundFlaresRef.current.forEach((sprite, index) => {
        const material = sprite.material as THREE.SpriteMaterial
        const shimmer = Math.sin(backgroundTime * sprite.userData.speed + sprite.userData.phase) * 0.5 + 0.5
        const rarePulse = Math.max(0, Math.sin(backgroundTime * 0.34 + index * 2.1)) ** 7
        material.opacity = (sprite.userData.baseOpacity + shimmer * sprite.userData.opacityRange + rarePulse * 0.18) * backgroundDim * (sprite.userData.themeOpacity ?? 1)
        if (!resettingBackground) {
          material.rotation += index % 2 === 0 ? 0.00045 : -0.00032
          sprite.scale.setScalar((sprite.userData.baseScale ?? sprite.scale.x) * (1 + rarePulse * 0.18))
        }
      })
      if (immersiveRef.current && !viewerActive) {
        if (time >= nextCometAtRef.current && cometsRef.current.length < 1) {
          const comet = createComet(starFlareTexture)
          scene.add(comet)
          cometsRef.current.push(comet)
          nextCometAtRef.current = time + randomCometDelay()
        }
      } else if (cometsRef.current.length) {
        cometsRef.current.forEach((comet) => {
          scene.remove(comet)
          disposeComet(comet)
        })
        cometsRef.current = []
      }
      cometsRef.current = cometsRef.current.filter((comet) => {
        const age = time - (comet.userData.createdAt ?? time)
        const life = comet.userData.life ?? 3
        const direction = comet.userData.direction as THREE.Vector3
        comet.position.addScaledVector(direction, comet.userData.speed * 0.016)
        comet.children.forEach((child) => {
          if (child instanceof THREE.Line) {
            ;(child.material as THREE.LineBasicMaterial).opacity = 0.54 * Math.max(0, 1 - age / life)
          }
          if (child instanceof THREE.Sprite) {
            const material = child.material as THREE.SpriteMaterial
            const pulse = Math.sin(time * 4.2) * 0.5 + 0.5
            material.opacity = (0.62 + pulse * 0.24) * Math.max(0, 1 - age / life)
          }
        })
        if (age > life) {
          scene.remove(comet)
          disposeComet(comet)
          return false
        }
        return true
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
            const blackHoleFade = object.userData.blackHoleCenter && blackHoleEffectFlags.enableBlackHoleFade
              ? getBlackHoleFade(dot.position, object.userData.blackHoleCenter as THREE.Vector3)
              : 1
            dotMaterial.opacity = ((dotIndex === 0 ? 0.34 : 0.18) + Math.sin(time * 2.05 + index + dotIndex) * 0.06) * blackHoleFade
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
        const nodeId = object.userData.nodeId as string | undefined
        const nodeMesh = nodeId ? nodeMeshesRef.current.get(nodeId) : undefined
        if (nodeMesh) object.position.copy(nodeMesh.position)
        const material = (object as THREE.Mesh).material as THREE.MeshBasicMaterial
        const baseScale = object.userData.baseScale ?? 1
        const pulse = Math.sin(time * (object.userData.speed ?? 1) + index * 1.4) * 0.5 + 0.5
        object.scale.setScalar(baseScale + pulse * (object.userData.scaleRange ?? 0.3))
        material.opacity = (object.userData.baseOpacity ?? 0.22) * (1 - pulse * (object.userData.fade ?? 0.45))
        if (object.userData.faceCamera) object.quaternion.copy(camera.quaternion)
      })
      selectBurstRef.current = selectBurstRef.current.filter((burst) => {
        const age = time - (burst.userData.createdAt ?? time)
        burst.children.forEach((child, index) => {
          const reverse = burst.userData.reverse === true
          if (child instanceof THREE.Mesh) {
            child.quaternion.copy(camera.quaternion)
            child.scale.setScalar(reverse
              ? Math.max(0.12, (child.userData.baseScale ?? 1.7) - age * (1.8 + index * 0.35))
              : (child.userData.baseScale ?? 1) + age * (1.4 + index * 0.4))
            const material = child.material as THREE.MeshBasicMaterial
            material.opacity = Math.max(0, 0.42 * (1 - age / 0.82))
          } else if (child instanceof THREE.Sprite) {
            child.quaternion.copy(camera.quaternion)
            child.scale.setScalar(reverse
              ? Math.max(0.18, (child.userData.baseScale ?? 2.5) - age * 3.1)
              : 2.35 + age * 1.45)
            const material = child.material as THREE.SpriteMaterial
            material.opacity = Math.max(0, 0.46 * (1 - age / 0.55))
          }
        })
        if (age > 0.86) {
          scene.remove(burst)
          return false
        }
        return true
      })
      coreEffectsRef.current.forEach((object, index) => {
        const nodeId = object.userData.nodeId as string | undefined
        const nodeMesh = nodeId ? nodeMeshesRef.current.get(nodeId) : undefined
        if (nodeMesh) object.position.copy(nodeMesh.position)
        const distanceBoost = object.userData.distanceAware
          ? THREE.MathUtils.clamp((camera.position.distanceTo(object.position) - 24) / 46, 0, 0.18)
          : 0
        if (object.userData.orbit) {
          object.rotation.z += object.userData.speed ?? 0.004
          object.rotation.x += (object.userData.tiltDrift ?? 0.0006)
          return
        }
        const material = (object as THREE.Mesh | THREE.Sprite).material as THREE.MeshBasicMaterial | THREE.SpriteMaterial
        const breath = Math.sin(time * (object.userData.speed ?? 0.48) + index * 0.8) * 0.5 + 0.5
        material.opacity = (object.userData.baseOpacity ?? 0.1) + distanceBoost + breath * (object.userData.opacityRange ?? 0.04)
        if (object.userData.spin) object.rotation.z += object.userData.spin
        if (object.userData.faceCamera) object.quaternion.copy(camera.quaternion)
      })
      contentMarkersRef.current.forEach((object, index) => {
        const nodeId = object.userData.nodeId as string | undefined
        const nodeMesh = nodeId ? nodeMeshesRef.current.get(nodeId) : undefined
        if (nodeMesh) object.position.copy(nodeMesh.position)
        const material = (object as THREE.Mesh | THREE.Sprite).material as THREE.MeshBasicMaterial | THREE.SpriteMaterial
        const breath = Math.sin(time * 0.72 + index * 0.6) * 0.5 + 0.5
        object.scale.setScalar((object.userData.baseScale ?? 1) + breath * (object.userData.scaleRange ?? 0.05))
        material.opacity = (object.userData.baseOpacity ?? 0.18) + breath * (object.userData.opacityRange ?? 0.05)
        if (object.userData.faceCamera) object.quaternion.copy(camera.quaternion)
      })
      relatedHalosRef.current.forEach((object, index) => {
        const nodeId = object.userData.nodeId as string | undefined
        const nodeMesh = nodeId ? nodeMeshesRef.current.get(nodeId) : undefined
        if (nodeMesh) object.position.copy(nodeMesh.position)
        const material = (object as THREE.Mesh).material as THREE.MeshBasicMaterial
        material.opacity = 0.12 + Math.sin(time * 1.05 + index) * 0.04
      })
      group.getWorldQuaternion(labelParentInverseQuaternion).invert()
      labelSpritesRef.current.forEach((label) => {
        const nodeMesh = label.userData.nodeMesh as THREE.Mesh
        nodeMesh.getWorldPosition(labelWorld)
        const distance = camera.position.distanceTo(labelWorld)
        const screenRadius = ((label.userData.nodeRadius ?? 0.36) / Math.max(1, distance)) * (renderer.domElement.height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5))))
        const nodeId = label.userData.nodeId as string | undefined
        const selected = selectedIdRef.current === nodeId
        const hovered = hoveredIdRef.current === nodeId
        const focused = focusIdRef.current === nodeId
        const priority = selected || hovered || focused
        const visible = priority || ((label.userData.isCluster ?? false) && screenRadius > 6.5) || screenRadius > 16
        label.visible = visible
        if (visible) {
          const material = label.material as THREE.SpriteMaterial
          const depth = THREE.MathUtils.clamp((distance - 10) / 54, 0, 1)
          const baseOpacity = label.userData.isCluster
            ? THREE.MathUtils.lerp(0.78, 0.52, depth)
            : THREE.MathUtils.lerp(0.76, 0.42, depth)
          const depthScale = THREE.MathUtils.lerp(1.04, 0.88, depth)
          const depthOrder = Math.round(THREE.MathUtils.lerp(20, 14, depth))
          const priorityOpacity = selected ? 0.94 : hovered ? 0.92 : 0.9
          const priorityBoost = selected ? 1.2 : hovered || focused ? 1.14 : 1
          const clusterBoost = priority ? 1 : label.userData.isCluster ? 1.08 : 1

          material.opacity = priority ? priorityOpacity : baseOpacity
          label.renderOrder = priority ? 23 : depthOrder
          labelCameraDirection.copy(camera.position).sub(labelWorld).normalize().applyQuaternion(labelParentInverseQuaternion)
          label.position.copy(nodeMesh.position).addScaledVector(
            labelCameraDirection,
            (label.userData.nodeRadius ?? 0.36) * nodeMesh.scale.x + 0.035,
          )
          label.scale.set(
            (label.userData.baseWidth ?? 1) * depthScale * clusterBoost * priorityBoost,
            (label.userData.baseHeight ?? 0.5) * depthScale * clusterBoost * priorityBoost,
            1,
          )
        }
      })
      nodeMeshesRef.current.forEach((mesh) => {
        const node = mesh.userData.node as KnowledgeNode
        if (!isClusterNode(node)) return
        const material = mesh.material as THREE.MeshStandardMaterial
        const world = new THREE.Vector3()
        mesh.getWorldPosition(world)
        const distance = camera.position.distanceTo(world)
        const farBoost = THREE.MathUtils.clamp((distance - 22) / 48, 0, 0.62)
        const selected = selectedIdRef.current === node.id
        material.emissiveIntensity = Math.max(material.emissiveIntensity, (selected ? 1.75 : 0.86) + farBoost + Math.sin(time * 0.55) * 0.06)
      })
      summonEffectsRef.current.forEach((object) => {
        const phase = object.userData.phase ?? 0
        const holding = object.userData.holding === true
        const resolved = object.userData.resolved === true
        const clearing = object.userData.clearing === true
        const clearingProgress = clearing ? THREE.MathUtils.clamp((time - (object.userData.clearingAt ?? time)) / 0.72, 0, 1) : 0
        const objectId = object.userData.id as string | undefined
        // A revealed star stays in the scene so the result numeral can return to the same physical object.
        object.visible = true
        const pointerHoldStartedAt = pointerSummonHoldRef.current.active && pointerSummonHoldRef.current.summonId === objectId
          ? pointerSummonHoldRef.current.startedAt
          : 0
        const gestureHoldStartedAt = summonArmLockRef.current.holdingId === objectId ? summonArmLockRef.current.holdStartedAt : 0
        const holdStartedAt = pointerHoldStartedAt || gestureHoldStartedAt
        const holdProgress = holding && holdStartedAt ? THREE.MathUtils.clamp((time - holdStartedAt) / (SUMMON_CHARGE_VISUAL_MS / 1000), 0, 1) : 0
        if (object.userData.deploying) {
          const progress = THREE.MathUtils.clamp((time - (object.userData.createdAt ?? time)) / 1.08, 0, 1)
          const eased = 1 - (1 - progress) ** 3
          const start = object.userData.startPosition as THREE.Vector3
          const target = object.userData.targetPosition as THREE.Vector3
          object.position.lerpVectors(start, target, eased)
          object.scale.setScalar(0.58 + eased * 0.48 + Math.sin(progress * Math.PI) * 0.18)
        } else if (holding) {
          object.scale.setScalar(1 - holdProgress * 0.2 + Math.sin(time * (18 + holdProgress * 18) + phase) * (0.018 + holdProgress * 0.018))
        } else if (resolved) {
          object.scale.setScalar(0.94 + Math.sin(time * 0.9 + phase) * 0.012)
        } else if (clearing) {
          object.scale.setScalar(1 + Math.sin(clearingProgress * Math.PI) * 0.18 - clearingProgress * 0.62)
        }
        object.children.forEach((child) => {
          if (child instanceof THREE.Mesh) {
            child.quaternion.copy(camera.quaternion)
            if (child.userData.role === 'resolvedRing') child.scale.setScalar(1 + Math.sin(time * 0.8 + phase) * 0.03)
            if (child.userData.role === 'shockwave') {
              const delay = child.userData.delay ?? 0
              const age = child.userData.createdAt ? Math.max(0, (nowMs - child.userData.createdAt) / 1000 - delay) : 0
              child.scale.setScalar(0.45 + age * 2.5)
            }
            const material = child.material as THREE.MeshBasicMaterial | THREE.MeshStandardMaterial
            if ('opacity' in material && child.userData.role === 'shockwave') {
              const delay = child.userData.delay ?? 0
              const age = child.userData.createdAt ? Math.max(0, (nowMs - child.userData.createdAt) / 1000 - delay) : 0
              material.opacity = age <= 0 ? 0 : Math.max(0, (0.56 + Math.sin(time * 1.5 + phase) * 0.08) * (1 - age / 1.12))
            }
            if ('emissiveIntensity' in material && child.userData.role === 'core' && holding) {
              material.emissiveIntensity = 2.2 + holdProgress * 2.2 + Math.sin(time * 18 + phase) * 0.35
              child.scale.setScalar(1 - holdProgress * 0.3)
            }
            if (child.userData.role === 'celestialShell') {
              child.rotation.x += (child.userData.speed ?? 0.002) * 0.7
              child.rotation.y += child.userData.speed ?? 0.002
            }
            if (clearing && 'opacity' in material) material.opacity *= Math.max(0, 1 - clearingProgress)
          }
          if (child instanceof THREE.Line && child.userData.role === 'deployTrail') {
            const progress = object.userData.deploying
              ? THREE.MathUtils.clamp((time - (object.userData.createdAt ?? time)) / 1.08, 0, 1)
              : 1
            ;(child.material as THREE.LineBasicMaterial).opacity = 0.56 * Math.max(0, 1 - progress)
          }
          if (child instanceof THREE.Line && (child.userData.role === 'burstStreak' || child.userData.role === 'burstRay')) {
            const age = child.userData.createdAt ? Math.max(0, (nowMs - child.userData.createdAt) / 1000) : 0
            const base = child.userData.role === 'burstRay' ? 0.86 : 0.68
            const duration = child.userData.role === 'burstRay' ? 0.5 : 0.72
            ;(child.material as THREE.LineBasicMaterial).opacity = Math.max(0, base * (1 - age / duration))
          }
          if (child instanceof THREE.Line && child.userData.role === 'surfaceBand') {
            const material = child.material as THREE.LineBasicMaterial
            material.opacity = (child.userData.baseOpacity ?? 0.18) + Math.sin(time * 0.85 + phase + (child.userData.offset ?? 0)) * 0.045
          }
          if (child instanceof THREE.Line && child.userData.role === 'holdTendril') {
            const material = child.material as THREE.LineBasicMaterial
            material.opacity = holding ? 0.16 + holdProgress * 0.44 + Math.sin(time * (9 + holdProgress * 10) + phase + (child.userData.offset ?? 0)) * 0.08 : 0
            child.rotation.z += (child.userData.speed ?? 0.01) * (1 + holdProgress * 3)
          }
          if (child.userData.role === 'holdParticles') {
            child.rotation.z += child.userData.speed ?? 0.012
          }
          if (child instanceof THREE.Sprite) {
            child.quaternion.copy(camera.quaternion)
            const material = child.material as THREE.SpriteMaterial
            if (child.userData.role === 'summonSelectedCorona') {
              const baseScaleX = child.userData.baseScaleX ?? child.scale.x
              const baseScaleY = child.userData.baseScaleY ?? child.scale.y
              const baseOpacity = child.userData.baseOpacity ?? 0.44
              const breathe = Math.sin(time * 0.42 + phase) * 0.035
              child.scale.set(baseScaleX * (1 + breathe), baseScaleY * (1 - breathe * 0.55), 1)
              material.rotation = (child.userData.rotationOffset ?? 0) + time * (child.userData.rotationSpeed ?? 0.014)
              material.opacity = Math.max(baseOpacity * 0.82, baseOpacity + Math.sin(time * 0.42 + phase) * 0.028)
            } else if (child.userData.role === 'summonSelectedStarburst') {
              const baseScaleX = child.userData.baseScaleX ?? child.scale.x
              const baseScaleY = child.userData.baseScaleY ?? child.scale.y
              const baseOpacity = child.userData.baseOpacity ?? 0.32
              const breathe = Math.sin(time * 0.5 + phase) * 0.045
              child.scale.set(baseScaleX * (1 + breathe), baseScaleY * (1 + breathe * 0.82), 1)
              material.rotation = (child.userData.rotationOffset ?? 0) + time * 0.009
              material.opacity = Math.max(baseOpacity * 0.82, baseOpacity + Math.sin(time * 0.5 + phase) * 0.032)
            } else if (child.userData.role === 'summonSelectedDust') {
              const duration = child.userData.duration ?? 7
              const cycle = ((time + (child.userData.offset ?? 0)) % duration) / duration
              const angle = (child.userData.angle ?? 0) + Math.sin(time * (child.userData.speed ?? 0.14) + (child.userData.offset ?? 0)) * 0.46 + cycle * 0.32
              const radius = THREE.MathUtils.lerp(child.userData.outerRadius ?? 1.9, child.userData.innerRadius ?? 1.2, cycle)
              child.position.set(
                Math.cos(angle) * radius + Math.sin(time * 0.31 + (child.userData.offset ?? 0)) * 0.08,
                Math.sin(angle) * radius * (child.userData.ellipse ?? 0.82),
                (child.userData.depth ?? 0.42) + Math.sin(time * 0.28 + (child.userData.offset ?? 0)) * 0.12,
              )
              child.scale.setScalar((child.userData.baseScale ?? 0.04) * (0.8 + Math.sin(cycle * Math.PI) * 0.3))
              const baseOpacity = child.userData.baseOpacity ?? 0.18
              material.opacity = Math.max(0.03, baseOpacity * Math.sin(cycle * Math.PI))
            } else if (child.userData.role === 'summonSelectionRipple') {
              const age = child.userData.createdAt ? Math.max(0, time - child.userData.createdAt) : 1
              const progress = THREE.MathUtils.clamp(age / (child.userData.duration ?? 0.62), 0, 1)
              const eased = 1 - (1 - progress) ** 2
              const baseScale = child.userData.baseScale ?? 1
              child.scale.setScalar(baseScale * (0.7 + eased * 1.15))
              material.opacity = Math.max(0, (child.userData.baseOpacity ?? 0.38) * (1 - progress) ** 2)
              child.visible = progress < 1
            } else if (child.userData.role === 'result') {
              const age = child.userData.createdAt ? Math.max(0, (nowMs - child.userData.createdAt) / 1000) : 0
              child.position.y = 0.26 + Math.sin(time * 0.9 + phase) * 0.08
              const labelPulse = 1 + Math.sin(Math.min(1, age) * Math.PI) * 0.18
              child.scale.set((child.userData.baseWidth ?? 3.1) * labelPulse, (child.userData.baseHeight ?? 1.55) * labelPulse, 1)
              material.opacity = Math.max(0, (age < 1.55 ? 0.9 : 0.9 * (1 - (age - 1.55) / 0.85)) + Math.sin(time * 1.4 + phase) * 0.04)
            } else if (child.userData.role === 'resolvedLabel') {
              const age = child.userData.createdAt ? Math.max(0, (nowMs - child.userData.createdAt) / 1000) : 9
              const intro = THREE.MathUtils.clamp((age - 2.1) / 0.35, 0, 1)
              child.scale.set(child.userData.baseWidth ?? 0.92, child.userData.baseHeight ?? 0.46, 1)
              material.opacity = 0.76 * intro
            } else if (child.userData.role === 'holdingParticle') {
              child.position.multiplyScalar(0.985)
              material.opacity = 0.26 + Math.sin(time * 14 + phase) * 0.08
            } else if (child.userData.role === 'holdParticle') {
              const speed = child.userData.speed ?? 1.2
              const squeeze = child.userData.squeeze ?? 0.78
              const angle = (child.userData.angle ?? 0) + time * speed * (1 + holdProgress * 3.4)
              const radius = Math.max(0.06, (child.userData.radius ?? 1) * (1 - holdProgress * squeeze))
              const wobble = Math.sin(time * (5.5 + speed) + (child.userData.offset ?? phase)) * (0.1 + holdProgress * 0.08)
              child.position.set(Math.cos(angle) * (radius + wobble), Math.sin(angle * 0.92) * radius * (child.userData.ellipse ?? 0.82), 0.08 + holdProgress * 0.08)
              material.opacity = 0.5 + holdProgress * 0.46 + Math.sin(time * 10 + phase) * 0.08
              child.scale.setScalar((child.userData.baseScale ?? 0.12) * (1 + holdProgress * 0.72) * (1 + Math.sin(time * 8 + phase) * 0.18))
            } else if (child.userData.role === 'holdGleam') {
              const angle = (child.userData.angle ?? 0) + time * (child.userData.speed ?? 1.5)
              const radius = (child.userData.radius ?? 1) * (1 - holdProgress * 0.62)
              child.position.set(Math.cos(angle) * radius, Math.sin(angle) * radius * 0.72, 0.16)
              child.scale.setScalar((child.userData.baseScale ?? 0.32) * (0.8 + holdProgress * 1.1) * (1 + Math.sin(time * 14 + phase) * 0.22))
              material.opacity = 0.16 + holdProgress * 0.72 + Math.sin(time * 12 + phase) * 0.08
            } else if (child.userData.role === 'burstFlash') {
              const age = child.userData.createdAt ? Math.max(0, (nowMs - child.userData.createdAt) / 1000) : 0
              child.scale.setScalar(1.4 + age * 6.2)
              material.opacity = Math.max(0, 0.96 * (1 - age / 0.42))
            } else if (child.userData.role === 'burstSpark') {
              const age = child.userData.createdAt ? Math.max(0, (nowMs - child.userData.createdAt) / 1000) : 0
              const angle = child.userData.angle ?? 0
              const travel = age * (child.userData.speed ?? 1.8)
              const baseX = child.userData.baseX ?? child.position.x
              const baseY = child.userData.baseY ?? child.position.y
              child.position.set(baseX + Math.cos(angle) * travel, baseY + Math.sin(angle) * travel, 0.08)
              material.opacity = Math.max(0, 0.62 * (1 - age / 0.78))
            } else if (child.userData.role === 'corona') {
              const baseScale = child.userData.baseScale ?? child.scale.x
              const baseOpacity = child.userData.baseOpacity ?? 0.18
              child.scale.setScalar(baseScale * (1 + Math.sin(time * 1.2 + phase) * 0.04))
              material.opacity = Math.max(0.06, holding ? 0.34 + holdProgress * 0.38 : baseOpacity + Math.sin(time * 1.1 + phase) * 0.035)
            } else if (child.userData.role === 'rimHaze' || child.userData.role === 'dustHaze' || child.userData.role === 'iceShard') {
              const baseOpacity = child.userData.baseOpacity ?? 0.11
              material.opacity = Math.max(0.04, baseOpacity + Math.sin(time * 1.4 + phase) * 0.015)
            } else if (child.userData.role === 'coreGlow' || child.userData.role === 'celestialAura' || child.userData.role === 'localHalo' || child.userData.role === 'atmosphere') {
              const baseOpacity = child.userData.baseOpacity ?? 0.16
              const baseScaleX = child.userData.baseScaleX ?? child.userData.baseScale ?? child.scale.x
              const baseScaleY = child.userData.baseScaleY ?? child.userData.baseScale ?? child.scale.y
              const breath = 1 + Math.sin(time * (child.userData.speed ?? 0.42) + phase) * (holding ? 0.1 : 0.025)
              child.scale.set(baseScaleX * breath * (holding ? 1 - holdProgress * 0.18 : 1), baseScaleY * breath * (holding ? 1 - holdProgress * 0.18 : 1), 1)
              material.opacity = Math.max(0.04, baseOpacity + (holding ? holdProgress * 0.22 : 0) + Math.sin(time * 0.52 + phase) * 0.018)
            } else if (child.userData.role === 'celestialMote') {
              const speed = child.userData.speed ?? 0.4
              const angle = (child.userData.angle ?? 0) + time * speed * (holding ? 2.2 : 1)
              const radius = (child.userData.radius ?? 1) * (holding ? 1 - holdProgress * 0.34 : 1)
              child.position.set(Math.cos(angle) * radius, Math.sin(angle) * radius * (child.userData.ellipse ?? 0.8), 0.36)
              child.scale.setScalar((child.userData.baseScale ?? 0.1) * (1 + Math.sin(time * 3.4 + phase) * 0.22))
              const baseOpacity = child.userData.baseOpacity ?? 0.18
              material.opacity = holding ? 0.42 + holdProgress * 0.46 : baseOpacity + Math.sin(time * 0.48 + phase) * 0.025
            } else if (child.userData.role === 'surfaceGlow') {
              const baseOpacity = child.userData.baseOpacity ?? 0.08
              child.position.x = (child.userData.baseX ?? child.position.x) + Math.sin(time * 0.72 + phase) * 0.035
              child.position.y = (child.userData.baseY ?? child.position.y) + Math.cos(time * 0.58 + phase) * 0.028
              material.opacity = Math.max(0.02, baseOpacity + (holding ? holdProgress * 0.2 : 0) + Math.sin(time * 2.2 + phase) * 0.028)
            } else if (child.userData.role === 'surfaceShade') {
              material.opacity = child.userData.baseOpacity ?? 0.1
            } else {
              material.opacity = Math.max(material.opacity, 0.16 + Math.sin(time * 1.6 + phase) * 0.05)
            }
            if (clearing) material.opacity *= Math.max(0, 1 - clearingProgress)
          }
          if (child instanceof THREE.Mesh && child.userData.role === 'core' && !holding) {
            const material = child.material as THREE.MeshStandardMaterial
            material.emissiveIntensity = (child.userData.baseEmissiveIntensity ?? 0.2) + Math.sin(time * 0.52 + phase) * 0.04
          }
        })
      })
      const returnStarId = resultReturnStarIdRef.current
      if (returnStarId) {
        const mesh = resolvedSummonMeshesRef.current.get(returnStarId) ?? summonMeshesRef.current.get(returnStarId)
        if (mesh) {
          mesh.updateWorldMatrix(true, false)
          camera.updateMatrixWorld()
          const world = new THREE.Vector3()
          mesh.getWorldPosition(world)
          const projected = world.clone().project(camera)
          const canvasRect = renderer.domElement.getBoundingClientRect()
          const x = canvasRect.left + (projected.x * 0.5 + 0.5) * canvasRect.width
          const y = canvasRect.top + (-projected.y * 0.5 + 0.5) * canvasRect.height
          const previousTarget = lastSummonResultTargetRef.current
          if (!previousTarget || Math.abs(previousTarget.x - x) > 0.35 || Math.abs(previousTarget.y - y) > 0.35) {
            lastSummonResultTargetRef.current = { x, y }
            summonCallbacksRef.current.onSummonResultTargetChange?.({ x, y })
          }
        }
      } else {
        lastSummonResultTargetRef.current = undefined
        summonCallbacksRef.current.onSummonResultTargetChange?.(undefined)
      }
      renderer.autoClear = true
      renderer.render(scene, camera)
      if (summonActive && summonStage !== 'setup') {
        renderer.autoClear = false
        renderer.clearDepth()
        renderer.render(blackHoleBackScene, camera)
        renderer.clearDepth()
        renderer.render(blackHoleScene, camera)
        renderer.clearDepth()
        renderer.render(blackHoleForegroundScene, camera)
        renderer.clearDepth()
        renderer.render(summonScene, camera)
        renderer.autoClear = true
      }
    }
    animate()

    let settleFrame: number | undefined
    const settleTimeouts: number[] = []
    const clearSizeSettle = () => {
      if (settleFrame !== undefined) {
        cancelAnimationFrame(settleFrame)
        settleFrame = undefined
      }
      settleTimeouts.splice(0).forEach((timeout) => window.clearTimeout(timeout))
    }
    const scheduleRendererSizeSync = () => {
      syncRendererSize()
      clearSizeSettle()
      settleFrame = requestAnimationFrame(() => {
        settleFrame = undefined
        syncRendererSize()
      })
      settleTimeouts.push(
        window.setTimeout(syncRendererSize, 120),
        window.setTimeout(syncRendererSize, 260),
      )
    }
    const resizeObserver = new ResizeObserver(syncRendererSize)
    const visualViewport = window.visualViewport
    resizeObserver.observe(mount)
    window.addEventListener('resize', scheduleRendererSizeSync)
    window.addEventListener('orientationchange', scheduleRendererSizeSync)
    visualViewport?.addEventListener('resize', scheduleRendererSizeSync)
    visualViewport?.addEventListener('scroll', scheduleRendererSizeSync)
    return () => {
      cancelAnimationFrame(frame)
      clearSizeSettle()
      resizeObserver.disconnect()
      window.removeEventListener('resize', scheduleRendererSizeSync)
      window.removeEventListener('orientationchange', scheduleRendererSizeSync)
      visualViewport?.removeEventListener('resize', scheduleRendererSizeSync)
      visualViewport?.removeEventListener('scroll', scheduleRendererSizeSync)
      clearFocusMotionBlur(mount)
      imageViewerRef.current?.dispose()
      imageViewerRef.current = null
      summonBlackHoleCoreRef.current.forEach((core) => {
        core.geometry.dispose()
        ;(core.material as THREE.Material).dispose()
      })
      summonBlackHoleCoreRef.current = []
      summonBlackHoleDistortionRef.current.forEach((distortion) => {
        distortion.geometry.dispose()
        ;(distortion.material as THREE.Material).dispose()
      })
      summonBlackHoleDistortionRef.current = []
      ;[summonBlackHoleBackAccretionRef.current, summonBlackHoleFrontAccretionRef.current].forEach((layers) => {
        layers.forEach((layer) => {
          layer.traverse((object) => {
            if (object instanceof THREE.Mesh) {
              object.geometry.dispose()
              const material = object.material as THREE.MeshBasicMaterial
              material.map?.dispose()
              material.dispose()
            }
          })
        })
      })
      summonBlackHoleBackAccretionRef.current = []
      summonBlackHoleFrontAccretionRef.current = []
      summonBlackHoleFlowRef.current.forEach((flow) => {
        flow.traverse((object) => {
          if (object instanceof THREE.Line) {
            object.geometry.dispose()
            ;(object.material as THREE.Material).dispose()
          }
          if (object instanceof THREE.Points) {
            object.geometry.dispose()
            ;(object.material as THREE.Material).dispose()
          }
        })
      })
      summonBlackHoleFlowRef.current = []
      summonBlackHoleParticlesRef.current = null
      renderer.dispose()
      cometsRef.current.forEach(disposeComet)
      if (warpStreaksRef.current) {
        warpStreaksRef.current.geometry.dispose()
        ;(warpStreaksRef.current.material as THREE.Material).dispose()
        warpStreaksRef.current = null
      }
      mount.removeChild(renderer.domElement)
    }
  }, [])

  useEffect(() => {
    const camera = cameraRef.current
    imageViewerRef.current?.dispose()
    imageViewerRef.current = null
    const mount = mountRef.current
    if (!viewerNode || viewerNode.contentType !== 'image' || !viewerNode.imageUrl || !camera || !mount) {
      onViewerLoadStateChangeRef.current?.('idle')
      return
    }

    const viewer = new ImageContentViewer3D(camera, mount)
    imageViewerRef.current = viewer
    focusTransitionRef.current = null
    viewResetRef.current = null
    clearFocusMotionBlur(mountRef.current)
    onViewerLoadStateChangeRef.current?.('loading')
    let current = true
    viewer.load(viewerNode.imageUrl)
      .then(() => {
        if (current) onViewerLoadStateChangeRef.current?.('ready')
      })
      .catch((error: unknown) => {
        console.error('Image viewer texture load failed:', error)
        if (!current) return
        viewer.dispose()
        if (imageViewerRef.current === viewer) imageViewerRef.current = null
        onViewerLoadStateChangeRef.current?.('error')
      })

    return () => {
      current = false
      viewer.dispose()
      if (imageViewerRef.current === viewer) imageViewerRef.current = null
    }
  }, [viewerNode?.id, viewerNode?.imageUrl])

  useEffect(() => {
    if (viewerResetKey > 0) imageViewerRef.current?.reset()
  }, [viewerResetKey])

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
    const blackHoleNode = data.nodes.find(isBlackHoleNode)
    const blackHoleCenter = blackHoleNode ? layout.get(blackHoleNode.id) : undefined
    const relatedIds = getRelatedIds(data, selectedId)
    data.links.forEach((link) => {
      const source = layout.get(link.source)
      const target = layout.get(link.target)
      if (!source || !target) return
      const related = selectedId && (link.source === selectedId || link.target === selectedId)
      if (!related) return
      const start = link.source === selectedId ? source : target
      const end = link.source === selectedId ? target : source
      const curve = createBlackHoleLinkCurve(start, end, blackHoleCenter)
      const points = curve.getPoints(34)
      const geometry = new THREE.BufferGeometry().setFromPoints(points)
      if (blackHoleCenter && blackHoleEffectFlags.enableBlackHoleFade) {
        const colors = new Float32Array(points.length * 3)
        const lineColor = new THREE.Color(0xaed2ff)
        points.forEach((point, index) => {
          const fade = getBlackHoleFade(point, blackHoleCenter)
          colors.set([lineColor.r * fade, lineColor.g * fade, lineColor.b * fade], index * 3)
        })
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
      }
      const materialLine = new THREE.LineBasicMaterial({
        color: 0xaed2ff,
        vertexColors: !!(blackHoleCenter && blackHoleEffectFlags.enableBlackHoleFade),
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
        blackHoleCenter,
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
        blackHoleCenter,
        energyDots: dots,
        energyOffset: Math.random() * 0.16,
      }
      linkObjectsRef.current.push(carrier)
      group.add(carrier)
    })
    data.nodes.forEach((node) => {
      const isCluster = isClusterNode(node)
      const isSummonNode = node.id === SUMMON_NODE_ID
      const hasContent = isContentNode(node)
      const nodeRadius = isSummonNode ? 0.52 : isCluster ? 0.68 : hasContent ? 0.4 : 0.34
      const nodeColor = isSummonNode ? summonNodeColors.core : typeColors[node.type]
      const geometry = new THREE.SphereGeometry(nodeRadius, isCluster || hasContent ? 48 : 36, isCluster || hasContent ? 32 : 24)
      const material = new THREE.MeshStandardMaterial({
        color: nodeColor,
        emissive: isSummonNode ? summonNodeColors.midGlow : nodeColor,
        emissiveIntensity: isSummonNode ? 0.92 : isCluster ? 0.68 : hasContent ? 0.42 : 0.26,
        roughness: hasContent ? 0.38 : 0.5,
        transparent: false,
        opacity: 1,
        depthTest: true,
        depthWrite: true,
      })
      const mesh = new THREE.Mesh(geometry, material)
      mesh.position.copy(layout.get(node.id) ?? new THREE.Vector3())
      mesh.userData = {
        node,
        basePosition: mesh.position.clone(),
        baseVisualScale: 1,
      }
      group.add(mesh)
      nodeMeshesRef.current.set(node.id, mesh)
      if (hasContent || isSummonNode) {
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(nodeRadius + 0.12, nodeRadius + 0.17, 48),
          makeHaloMaterial(isSummonNode ? summonNodeColors.outerGlow : typeColors[node.type], isSummonNode ? 0.38 : selectedId ? 0.16 : 0.2),
        )
        ring.position.copy(mesh.position)
        ring.userData = { nodeId: node.id, markerKind: 'content-ring', baseOpacity: selectedId ? 0.09 : 0.14, opacityRange: 0.055, baseScale: 1, scaleRange: 0.035, faceCamera: true }
        contentMarkersRef.current.push(ring)
        group.add(ring)
        const flare = new THREE.Sprite(new THREE.SpriteMaterial({
          map: starFlareTexture,
          color: isSummonNode ? summonNodeColors.midGlow : typeColors[node.type],
          opacity: isSummonNode ? selectedId ? 0.16 : 0.22 : selectedId ? 0.12 : 0.16,
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }))
        flare.position.copy(mesh.position)
        flare.scale.setScalar(1.02)
        flare.userData = { nodeId: node.id, markerKind: 'content-flare', baseOpacity: selectedId ? 0.07 : 0.09, opacityRange: 0.04, baseScale: 0.96, scaleRange: 0.08, faceCamera: true }
        contentMarkersRef.current.push(flare)
        group.add(flare)
        if (isSummonNode) {
          const sealedGlow = new THREE.Mesh(
            new THREE.SphereGeometry(1.22, 26, 16),
            makeHaloMaterial(summonNodeColors.midGlow, 0.12),
          )
          sealedGlow.position.copy(mesh.position)
          sealedGlow.userData = { nodeId: node.id, baseOpacity: 0.095, opacityRange: 0.045, speed: 0.38, distanceAware: true }
          coreEffectsRef.current.push(sealedGlow)
          group.add(sealedGlow)
          ;[
            { radius: 0.84, width: 0.024, rotation: [0.95, 0.26, 0.32], speed: 0.0014, opacity: 0.28 },
            { radius: 1.03, width: 0.018, rotation: [1.2, -0.42, 0.78], speed: -0.001, opacity: 0.17 },
          ].forEach((ringConfig) => {
            const sealRing = new THREE.Mesh(
              new THREE.RingGeometry(ringConfig.radius, ringConfig.radius + ringConfig.width, 88),
              makeHaloMaterial(summonNodeColors.core, ringConfig.opacity),
            )
            sealRing.position.copy(mesh.position)
            sealRing.rotation.set(ringConfig.rotation[0], ringConfig.rotation[1], ringConfig.rotation[2])
            sealRing.userData = { nodeId: node.id, baseOpacity: ringConfig.opacity * 0.5, opacityRange: ringConfig.opacity * 0.2, speed: 0.32, spin: ringConfig.speed }
            coreEffectsRef.current.push(sealRing)
            group.add(sealRing)
          })
          const sealOrbit = new THREE.Object3D()
          sealOrbit.position.copy(mesh.position)
          sealOrbit.rotation.set(0.82, -0.28, 0.2)
          sealOrbit.userData = { nodeId: node.id, orbit: true, speed: 0.0024, tiltDrift: 0.00012 }
          Array.from({ length: 5 }).forEach((_, dotIndex) => {
            const dot = new THREE.Mesh(
              new THREE.SphereGeometry(0.026 + (dotIndex % 2) * 0.008, 8, 6),
              new THREE.MeshBasicMaterial({
                color: dotIndex % 2 === 0 ? summonNodeColors.core : summonNodeColors.midGlow,
                transparent: true,
                opacity: 0.48,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
              }),
            )
            const angle = (dotIndex / 5) * Math.PI * 2
            dot.position.set(Math.cos(angle) * 1.12, Math.sin(angle) * 1.12, 0)
            sealOrbit.add(dot)
          })
          coreEffectsRef.current.push(sealOrbit)
          group.add(sealOrbit)
        }
      } else if (isCluster) {
        const clusterGlow = new THREE.Mesh(new THREE.SphereGeometry(1.04, 22, 14), makeHaloMaterial(typeColors[node.type], 0.08))
        clusterGlow.position.copy(mesh.position)
        clusterGlow.userData = { nodeId: node.id, markerKind: 'cluster-glow', baseOpacity: 0.045, opacityRange: 0.025, baseScale: 1, scaleRange: 0.04 }
        contentMarkersRef.current.push(clusterGlow)
        group.add(clusterGlow)
        const innerGlow = new THREE.Mesh(new THREE.SphereGeometry(1.16, 24, 14), makeHaloMaterial(typeColors[node.type], 0.1))
        innerGlow.position.copy(mesh.position)
        innerGlow.userData = { nodeId: node.id, baseOpacity: 0.08, opacityRange: 0.045, speed: 0.42, distanceAware: true }
        coreEffectsRef.current.push(innerGlow)
        group.add(innerGlow)
        const outerGlow = new THREE.Mesh(new THREE.SphereGeometry(1.72, 24, 14), makeHaloMaterial(typeColors[node.type], 0.045))
        outerGlow.position.copy(mesh.position)
        outerGlow.userData = { nodeId: node.id, baseOpacity: 0.035, opacityRange: 0.025, speed: 0.28, distanceAware: true }
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
          coreRing.userData = { nodeId: node.id, baseOpacity: ringConfig.opacity * 0.48, opacityRange: ringConfig.opacity * 0.24, speed: 0.36, spin: ringConfig.speed }
          coreEffectsRef.current.push(coreRing)
          group.add(coreRing)
        })
        const orbit = new THREE.Object3D()
        orbit.position.copy(mesh.position)
        orbit.rotation.set(0.9, 0.18, 0.2)
        orbit.userData = { nodeId: node.id, orbit: true, speed: 0.0032, tiltDrift: 0.00015 }
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
        coreFlare.userData = { nodeId: node.id, baseOpacity: 0.075, opacityRange: 0.03, speed: 0.33, faceCamera: true, distanceAware: true }
        coreEffectsRef.current.push(coreFlare)
        group.add(coreFlare)
      }
      if (selectedId && node.id === selectedId) {
        const color = getNodeColor(node)
        const halo = new THREE.Mesh(new THREE.SphereGeometry(isCluster ? 1.42 : 1.02, 28, 18), makeHaloMaterial(color, 0.24))
        halo.position.copy(mesh.position)
        halo.userData = { nodeId: node.id, baseOpacity: 0.26, baseScale: 1, scaleRange: 0.2, speed: 0.75, fade: 0.25 }
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
        wakeFlare.userData = { nodeId: node.id, baseOpacity: 0.24, baseScale: isCluster ? 2.2 : 1.62, scaleRange: 0.32, speed: 0.62, fade: 0.42, faceCamera: true }
        selectedEffectsRef.current.push(wakeFlare)
        group.add(wakeFlare)
        ;[0, 1].forEach((ringIndex) => {
          const ring = new THREE.Mesh(
            new THREE.RingGeometry(isCluster ? 1.02 : 0.76, isCluster ? 1.13 : 0.88, 64),
            makeHaloMaterial(color, ringIndex === 0 ? 0.3 : 0.2),
          )
          ring.position.copy(mesh.position)
          ring.userData = {
            nodeId: node.id,
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
        relatedHalo.userData = { nodeId: node.id }
        relatedHalosRef.current.push(relatedHalo)
        group.add(relatedHalo)
      }
      const label = new THREE.Sprite(new THREE.SpriteMaterial({
        map: createNodeLabelTexture(node.title),
        transparent: true,
        opacity: 0,
        depthTest: true,
        depthWrite: false,
      }))
      label.position.copy(mesh.position)
      label.renderOrder = 20
      const labelWidth = nodeRadius * (isCluster ? 2.55 : 2.22)
      const labelHeight = nodeRadius * (isCluster ? 1.26 : 1.08)
      label.scale.set(labelWidth, labelHeight, 1)
      label.visible = false
      label.userData = {
        nodeId: node.id,
        nodeRadius,
        isCluster,
        baseWidth: labelWidth,
        baseHeight: labelHeight,
        nodeMesh: mesh,
        anchorPosition: mesh.position.clone(),
      }
      labelSpritesRef.current.push(label)
      group.add(label)
    })
  }, [data, layout, selectedId])

  useEffect(() => {
    const group = summonGroupRef.current
    if (!group) return
    group.clear()
    summonMeshesRef.current.clear()
    resolvedSummonMeshesRef.current.clear()
    summonEffectsRef.current.forEach(disposeObject)
    summonEffectsRef.current = []
    if (appMode === 'universe' || summonStage === 'setup') {
      group.visible = false
      return
    }
    group.visible = true
    const deploying = summonStage === 'deploying'
    const createdAt = performance.now() * 0.001
    summonStars.forEach((star) => {
      const root = new THREE.Group()
      const targetPosition = toVector3(star.position)
      const startPosition = new THREE.Vector3(targetPosition.x * 0.12, targetPosition.y * 0.12, -9)
      root.position.copy(deploying ? startPosition : targetPosition)
      const visualSeed = star.visualSeed ?? 0.5
      const paletteIndex = Math.floor(visualSeed * summonStarPalettes.length) % summonStarPalettes.length
      const palette = summonStarPalettes[paletteIndex]
      const phase = visualSeed * Math.PI * 12.8
      const sizeTier = Math.floor(visualSeed * 17) % 3
      const size = [0.44, 0.62, 0.82][sizeTier] + (visualSeed - 0.5) * 0.05
      const isSelected = star.id === selectedSummonStarId
      const armed = star.id === armedSummonStarId || star.status === 'armed'
      const holding = star.id === holdingSummonStarId
      const resolved = star.status === 'resolved'
      const clearing = star.status === 'clearing'
      const resolvedAge = star.resolvedAt ? Math.max(0, (performance.now() - star.resolvedAt) / 1000) : 99
      const clearingAge = star.clearingAt ? Math.max(0, (performance.now() - star.clearingAt) / 1000) : 0
      const inactive = resolved || clearing
      root.userData = { id: star.id, number: star.number, phase, startPosition, targetPosition, createdAt, deploying, holding, resolved, resolvedAge, clearing, clearingAt: star.clearingAt ? star.clearingAt / 1000 : undefined, clearingAge }
      const coreColor = inactive ? 0x7f7f88 : holding ? 0xfff1bf : armed ? 0xffe0a3 : palette.core
      const glowColor = inactive ? 0xc0b59c : holding ? 0xffd48a : armed ? 0xffba5d : palette.glow
      const haloColor = inactive ? 0xd8ceb3 : holding ? 0xffe9bc : armed ? 0xffd48a : palette.halo
      const surfaceTexture = summonCelestialTextures[paletteIndex]
      const coreEmissiveIntensity = inactive ? 0.22 : holding ? 0.88 : armed ? 1.18 : isSelected ? 0.96 : 0.52
      const coreMaterial = new THREE.MeshPhysicalMaterial({
        map: surfaceTexture,
        color: inactive ? coreColor : 0xffffff,
        emissive: glowColor,
        emissiveIntensity: coreEmissiveIntensity,
        roughness: 0.12,
        metalness: 0.02,
        clearcoat: 1,
        clearcoatRoughness: 0.055,
        transmission: 0.23,
        thickness: 0.82,
        ior: 1.36,
        attenuationColor: new THREE.Color(haloColor),
        attenuationDistance: 1.45,
        iridescence: 0.17,
        iridescenceIOR: 1.3,
        transparent: false,
        opacity: 1,
      })
      const rimColor = new THREE.Color(haloColor)
      coreMaterial.onBeforeCompile = (shader) => {
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <normal_fragment_maps>',
          `#include <normal_fragment_maps>
          // This keeps the planet's day side, terminator, and glancing highlight readable in every camera angle.
          float summonLight = dot(normalize(normal), normalize(vec3(-0.46, 0.58, 0.72)));
          float summonDay = smoothstep(-0.62, 0.74, summonLight);
          diffuseColor.rgb *= mix(vec3(0.26, 0.28, 0.35), vec3(1.1, 1.08, 1.04), summonDay);
          float summonSpecular = pow(max(summonLight, 0.0), 25.0);
          diffuseColor.rgb += vec3(${rimColor.r.toFixed(4)}, ${rimColor.g.toFixed(4)}, ${rimColor.b.toFixed(4)}) * summonSpecular * 0.38;`,
        )
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
          float summonRim = pow(1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0), 4.15);
          float summonTranslucency = pow(1.0 - abs(summonLight), 2.4);
          totalEmissiveRadiance += vec3(${rimColor.r.toFixed(4)}, ${rimColor.g.toFixed(4)}, ${rimColor.b.toFixed(4)}) * (summonRim * 0.36 + summonTranslucency * 0.045);`,
        )
      }
      const core = new THREE.Mesh(
        createSummonCelestialGeometry(size),
        coreMaterial,
      )
      core.userData = { summonId: star.id, role: 'core', baseEmissiveIntensity: coreEmissiveIntensity }
      core.scale.setScalar(1)
      core.rotation.set(phase * 0.11, phase * 0.17, phase * 0.06)
      root.add(core)
      const aura = new THREE.Sprite(new THREE.SpriteMaterial({
        map: softDiscTexture,
        color: haloColor,
        opacity: inactive ? 0.1 : holding ? 0.46 : armed ? 0.38 : 0.24,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }))
      const auraScale = size * (inactive ? 1.9 : holding ? 3.4 : armed ? 3.15 : 2.32)
      aura.scale.setScalar(auraScale)
      aura.userData = { role: 'celestialAura', baseScale: auraScale, baseOpacity: inactive ? 0.1 : holding ? 0.46 : armed ? 0.38 : 0.24 }
      root.add(aura)
      if (isSelected) {
        const glassRim = new THREE.Mesh(
          new THREE.SphereGeometry(size * 1.06, 24, 16),
          new THREE.MeshBasicMaterial({
            color: haloColor,
            opacity: 0.22,
            transparent: true,
            blending: THREE.AdditiveBlending,
            side: THREE.BackSide,
            depthTest: false,
            depthWrite: false,
          }),
        )
        glassRim.userData = { role: 'summonSelectedRim', baseOpacity: 0.22 }
        root.add(glassRim)

        const energyCorona = new THREE.Sprite(new THREE.SpriteMaterial({
          map: selectedCoronaTexture,
          color: haloColor,
          opacity: 0.59,
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthTest: false,
          depthWrite: false,
        }))
        const energyCoronaScaleX = size * 5.18
        const energyCoronaScaleY = size * 4.82
        energyCorona.scale.set(energyCoronaScaleX, energyCoronaScaleY, 1)
        energyCorona.userData = {
          role: 'summonSelectedCorona',
          baseScaleX: energyCoronaScaleX,
          baseScaleY: energyCoronaScaleY,
          baseOpacity: 0.59,
          rotationOffset: phase * 0.08,
          rotationSpeed: 0.014,
        }
        root.add(energyCorona)

        const starburst = new THREE.Sprite(new THREE.SpriteMaterial({
          map: selectedStarburstTexture,
          color: palette.particle,
          opacity: 0.45,
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthTest: false,
          depthWrite: false,
        }))
        const starburstScaleX = size * 4.35
        const starburstScaleY = size * 4.08
        starburst.scale.set(starburstScaleX, starburstScaleY, 1)
        starburst.userData = {
          role: 'summonSelectedStarburst',
          baseScaleX: starburstScaleX,
          baseScaleY: starburstScaleY,
          baseOpacity: 0.45,
          rotationOffset: phase * 0.12,
        }
        root.add(starburst)

        Array.from({ length: 11 }).forEach((_, dustIndex) => {
          const dust = new THREE.Sprite(new THREE.SpriteMaterial({
            map: softDiscTexture,
            color: dustIndex % 3 === 0 ? palette.particle : haloColor,
            opacity: 0.22 + (dustIndex % 2) * 0.04,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthTest: false,
            depthWrite: false,
          }))
          const angle = phase * 0.17 + dustIndex * 1.83 + Math.sin(dustIndex * 1.9) * 0.32
          const baseScale = size * (0.057 + (dustIndex % 3) * 0.015)
          const outerRadius = size * (2.05 + (dustIndex % 4) * 0.18)
          const innerRadius = size * (1.16 + (dustIndex % 3) * 0.12)
          dust.position.set(Math.cos(angle) * outerRadius, Math.sin(angle) * outerRadius * (0.82 + (dustIndex % 2) * 0.08), 0.42)
          dust.scale.setScalar(baseScale)
          dust.userData = {
            role: 'summonSelectedDust',
            angle,
            ellipse: 0.78 + (dustIndex % 2) * 0.08,
            outerRadius,
            innerRadius,
            depth: dustIndex % 2 === 0 ? 0.5 : -0.2,
            baseScale,
            baseOpacity: 0.22 + (dustIndex % 2) * 0.04,
            speed: 0.12 + (dustIndex % 3) * 0.035,
            duration: 5.6 + (dustIndex % 4) * 0.65,
            offset: dustIndex * 0.79,
          }
          root.add(dust)
        })

        if (selectedSummonRippleIdRef.current !== star.id) {
          selectedSummonRippleIdRef.current = star.id
          const ripple = new THREE.Sprite(new THREE.SpriteMaterial({
            map: selectedCoronaTexture,
            color: haloColor,
            opacity: 0.48,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthTest: false,
            depthWrite: false,
          }))
          const rippleScale = size * 2.1
          ripple.scale.setScalar(rippleScale)
          ripple.userData = {
            role: 'summonSelectionRipple',
            baseScale: rippleScale,
            baseOpacity: 0.48,
            duration: 0.62,
            createdAt: performance.now() * 0.001,
          }
          root.add(ripple)
        }
      }
      const moteCount = inactive ? 2 : holding ? 12 : armed ? 10 : 3
      const moteOpacity = inactive ? 0.18 : holding ? 0.78 : armed ? 0.64 : 0.32
      Array.from({ length: moteCount }).forEach((_, moteIndex) => {
        const mote = new THREE.Sprite(new THREE.SpriteMaterial({
          map: softDiscTexture,
          color: moteIndex % 3 === 0 ? palette.particle : haloColor,
          opacity: moteOpacity,
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }))
        const angle = phase + moteIndex * 2.399 + Math.sin(moteIndex * 1.7) * 0.28
        const radius = size * (1.45 + (moteIndex % 3) * 0.23)
        mote.position.set(Math.cos(angle) * radius, Math.sin(angle) * radius * (0.72 + (moteIndex % 2) * 0.12), size * 0.34)
        mote.scale.setScalar(size * (0.12 + (moteIndex % 3) * 0.045))
        mote.userData = { role: 'celestialMote', angle, radius, baseScale: mote.scale.x, baseOpacity: moteOpacity, speed: 0.32 + (moteIndex % 4) * 0.09, ellipse: 0.72 + (moteIndex % 2) * 0.12 }
        root.add(mote)
      })
      if (inactive) {
        const ringRadius = size + 0.18
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(ringRadius, ringRadius + 0.025, 64),
          makeHaloMaterial(haloColor, 0.16),
        )
        ring.userData = {
          role: 'resolvedRing',
          baseOpacity: 0.16,
        }
        ring.rotation.z = phase
        root.add(ring)
      }
      if (inactive || armed || holding) {
        const flare = new THREE.Sprite(new THREE.SpriteMaterial({
          map: softDiscTexture,
          color: haloColor,
          opacity: inactive ? 0.12 : holding ? 0.78 : 0.68,
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }))
        flare.scale.setScalar((inactive ? 1.15 : holding ? 2.35 : 2.5) + visualSeed * 0.18)
        flare.userData = {
          role: 'coreGlow',
          baseOpacity: inactive ? 0.12 : holding ? 0.78 : 0.68,
          baseScaleX: (inactive ? 1.15 : holding ? 2.35 : 2.5) + visualSeed * 0.18,
          baseScaleY: (inactive ? 1.15 : holding ? 2.35 : 2.5) + visualSeed * 0.18,
          speed: 0.84,
        }
        root.add(flare)
      }
      if (holding) {
        const companion = new THREE.Sprite(new THREE.SpriteMaterial({
          map: softDiscTexture,
          color: palette.particle,
          opacity: 0.24,
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }))
        companion.position.set(Math.sin(phase) * 0.58, Math.cos(phase * 1.7) * 0.42, 0)
        companion.scale.setScalar(0.42)
        companion.userData = { role: 'holdingParticle' }
        root.add(companion)
      }
      if (holding) {
        const holdOrbit = new THREE.Object3D()
        holdOrbit.userData = { role: 'holdParticles', speed: 0.022 }
        Array.from({ length: 24 }).forEach((_, particleIndex) => {
          const particle = new THREE.Sprite(new THREE.SpriteMaterial({
            map: softDiscTexture,
            color: particleIndex % 3 === 0 ? 0xfff3ce : palette.particle,
            opacity: 0.66,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          }))
          const angle = phase + particleIndex * 2.399 + Math.sin(particleIndex * 1.7) * 0.32
          const radius = size + 0.8 + (particleIndex % 6) * 0.13
          const baseScale = 0.115 + (particleIndex % 5) * 0.018
          particle.position.set(Math.cos(angle) * radius, Math.sin(angle) * radius * (0.68 + (particleIndex % 4) * 0.08), 0.04)
          particle.scale.setScalar(baseScale)
          particle.userData = {
            role: 'holdParticle',
            angle,
            radius,
            baseScale,
            speed: 1.15 + (particleIndex % 7) * 0.18,
            squeeze: 0.74 + (particleIndex % 5) * 0.035,
            ellipse: 0.68 + (particleIndex % 4) * 0.08,
            offset: phase + particleIndex * 0.61,
          }
          holdOrbit.add(particle)
        })
        root.add(holdOrbit)
        Array.from({ length: 7 }).forEach((_, gleamIndex) => {
          const gleam = new THREE.Sprite(new THREE.SpriteMaterial({
            map: starFlareTexture,
            color: gleamIndex % 2 === 0 ? 0xfff0bd : 0xcfeeff,
            opacity: 0.26,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          }))
          const angle = phase + gleamIndex * 0.91
          const radius = size + 0.62 + (gleamIndex % 3) * 0.16
          gleam.position.set(Math.cos(angle) * radius, Math.sin(angle) * radius * 0.72, 0.16)
          gleam.scale.setScalar(0.28 + (gleamIndex % 3) * 0.07)
          gleam.userData = {
            role: 'holdGleam',
            angle,
            radius,
            baseScale: 0.28 + (gleamIndex % 3) * 0.07,
            speed: 1.4 + gleamIndex * 0.12,
          }
          root.add(gleam)
        })
        Array.from({ length: 8 }).forEach((_, tendrilIndex) => {
          const angle = phase + tendrilIndex * 0.785 + Math.sin(tendrilIndex) * 0.18
          const outer = size + 1.25 + (tendrilIndex % 3) * 0.18
          const inner = size * 0.28
          const tendrilGeometry = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(Math.cos(angle) * outer, Math.sin(angle) * outer * 0.76, 0.03),
            new THREE.Vector3(Math.cos(angle + 0.22) * (outer * 0.55), Math.sin(angle + 0.22) * (outer * 0.42), 0.06),
            new THREE.Vector3(Math.cos(angle + 0.5) * inner, Math.sin(angle + 0.5) * inner, 0.1),
          ])
          const tendril = new THREE.Line(tendrilGeometry, new THREE.LineBasicMaterial({
            color: tendrilIndex % 2 === 0 ? 0xffe7b0 : palette.particle,
            transparent: true,
            opacity: 0.28,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          }))
          tendril.userData = { role: 'holdTendril', speed: 0.006 + tendrilIndex * 0.0015, offset: tendrilIndex * 0.73 }
          root.add(tendril)
        })
      }
      if (inactive) {
        const emberRing = new THREE.Mesh(
          new THREE.RingGeometry(size + 0.32, size + 0.345, 48),
          makeHaloMaterial(0xd6c49d, 0.12),
        )
        emberRing.userData = { role: 'resolvedRing' }
        emberRing.rotation.z = -phase * 0.4
        root.add(emberRing)
        if (resolved && resolvedAge < 0.82) {
          ;[0, 0.12].forEach((delay, waveIndex) => {
            const shockwave = new THREE.Mesh(
              new THREE.RingGeometry(0.58 + waveIndex * 0.18, 0.82 + waveIndex * 0.24, 88),
              makeHaloMaterial(waveIndex === 0 ? 0xffdc92 : 0x9be8ff, waveIndex === 0 ? 0.64 : 0.38),
            )
            shockwave.userData = { role: 'shockwave', createdAt: star.resolvedAt, delay }
            root.add(shockwave)
          })
          Array.from({ length: 16 }).forEach((_, burstIndex) => {
            const angle = phase + burstIndex * 2.399 + Math.sin(burstIndex * 1.3) * 0.18
            const distance = size * (0.95 + (burstIndex % 7) * 0.16)
            const spark = new THREE.Sprite(new THREE.SpriteMaterial({
              map: softDiscTexture,
              color: burstIndex % 4 === 0 ? 0xffe2aa : palette.particle,
              opacity: 0.7,
              transparent: true,
              blending: THREE.AdditiveBlending,
              depthWrite: false,
            }))
            const baseX = Math.cos(angle) * distance
            const baseY = Math.sin(angle) * distance
            spark.position.set(baseX, baseY, 0.08)
            spark.scale.setScalar(0.13 + (burstIndex % 6) * 0.026)
            spark.userData = { role: 'burstSpark', createdAt: star.resolvedAt, angle, speed: 2.1 + (burstIndex % 7) * 0.28, baseX, baseY }
            root.add(spark)
            if (burstIndex % 4 === 0) {
              const streakGeometry = new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(Math.cos(angle) * distance * 0.72, Math.sin(angle) * distance * 0.72, 0.06),
                new THREE.Vector3(Math.cos(angle) * distance * 1.72, Math.sin(angle) * distance * 1.72, 0.06),
              ])
              const streak = new THREE.Line(streakGeometry, new THREE.LineBasicMaterial({
                color: burstIndex % 4 === 0 ? 0xffe2aa : palette.particle,
                transparent: true,
                opacity: 0.42,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
              }))
              streak.userData = { role: 'burstStreak', createdAt: star.resolvedAt }
              root.add(streak)
            }
          })
        }
        const label = new THREE.Sprite(new THREE.SpriteMaterial({
          map: createNodeLabelTexture(String(star.number)),
          transparent: true,
          opacity: clearing ? 0.44 : resolvedAge < 1.45 ? 0 : 0.74,
          depthWrite: false,
          depthTest: false,
        }))
        const labelWidth = Math.max(0.78, size * 1.56)
        const labelHeight = Math.max(0.39, size * 0.78)
        label.position.set(0, 0, size + 0.04)
        label.scale.set(labelWidth, labelHeight, 1)
        label.userData = { role: 'resolvedLabel', createdAt: star.resolvedAt, baseWidth: labelWidth, baseHeight: labelHeight }
        root.add(label)
      }
      if (deploying) {
        const direction = targetPosition.clone().sub(startPosition).normalize()
        const trailGeometry = new THREE.BufferGeometry().setFromPoints([
          direction.clone().multiplyScalar(-0.18),
          direction.clone().multiplyScalar(-2.5 - visualSeed * 1.7),
        ])
        const trail = new THREE.Line(trailGeometry, new THREE.LineBasicMaterial({
          color: haloColor,
          transparent: true,
          opacity: 0.46,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }))
        trail.userData = { role: 'deployTrail' }
        root.add(trail)
      }
      root.renderOrder = 20
      root.traverse((child) => {
        if (!(child instanceof THREE.Mesh || child instanceof THREE.Sprite || child instanceof THREE.Line)) return
        child.renderOrder = child.userData.role === 'core'
          ? 20
          : child.userData.role === 'resolvedLabel'
            ? 32
            : child.userData.role === 'summonSelectedRim'
              ? 31
              : child.userData.role === 'summonSelectedCorona'
                ? 32
                : child.userData.role === 'summonSelectedStarburst'
                  ? 33
                  : child.userData.role === 'summonSelectedDust'
                    ? 34
                    : child.userData.role === 'summonSelectionRipple'
                      ? 35
                      : 30
      })
      group.add(root)
      summonEffectsRef.current.push(root)
      if (inactive) resolvedSummonMeshesRef.current.set(star.id, core)
      else summonMeshesRef.current.set(star.id, core)
    })
  }, [appMode, summonStage, summonStars, selectedSummonStarId, armedSummonStarId, holdingSummonStarId, softDiscTexture, selectedCoronaTexture, selectedStarburstTexture, starFlareTexture, summonCelestialTextures])

  useEffect(() => {
    if (appMode !== 'summon' || summonStage !== 'drawing' || !selectedSummonStarId) return
    const mesh = summonMeshesRef.current.get(selectedSummonStarId)
    const camera = cameraRef.current
    const mount = mountRef.current
    if (!mesh || !camera || !mount) return
    const world = new THREE.Vector3()
    mesh.getWorldPosition(world)
    const travelDistance = cameraTargetRef.current.distanceTo(world)
    viewResetRef.current = null
    focusTransitionRef.current = {
      startedAt: performance.now(),
      duration: SUMMON_FOCUS_TRANSITION_DURATION_MS,
      fromPosition: camera.position.clone(),
      toPosition: new THREE.Vector3(world.x, world.y + 0.62, world.z + 5.8),
      fromTarget: cameraTargetRef.current.clone(),
      toTarget: world,
      fromRotation: summonGroupRef.current?.rotation.clone() ?? new THREE.Euler(),
      resetRotation: false,
      blurMax: THREE.MathUtils.clamp(1.8 + travelDistance * 0.18, 2.4, 4.8),
      scaleMax: THREE.MathUtils.clamp(1.01 + travelDistance * 0.0008, 1.01, 1.026),
    }
  }, [appMode, summonStage, selectedSummonStarId])

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
      const isSummonNode = node.id === SUMMON_NODE_ID
      const hasContent = isContentNode(node)
      const isCluster = isClusterNode(node)
      const active = id === selectedId || id === hoveredId || id === focusId
      mat.opacity = 1
      mat.emissiveIntensity = isSummonNode
        ? active ? 1.9 : related.has(id) ? 1.1 : 0.92
        : active ? 1.55 : related.has(id) ? (hasContent ? 0.72 : 0.56) : selectedId ? 0.05 : (hasContent ? 0.5 : isCluster ? 0.68 : 0.28)
      const baseVisualScale = active ? 1.62 : related.has(id) ? (hasContent ? 1.25 : 1.16) : 1
      mesh.userData.baseVisualScale = baseVisualScale
      mesh.scale.setScalar(baseVisualScale)
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
    if (viewerNode) return
    const mesh = focusId ? nodeMeshesRef.current.get(focusId) : undefined
    const camera = cameraRef.current
    const mount = mountRef.current
    if (!mesh || !camera || !mount) return
    const world = new THREE.Vector3()
    mesh.getWorldPosition(world)
    const node = mesh.userData.node as KnowledgeNode
    const nodeRadius = node.id === SUMMON_NODE_ID ? 0.52 : isClusterNode(node) ? 0.68 : isContentNode(node) ? 0.4 : 0.34
    const focusDistance = THREE.MathUtils.clamp(6.25 + (nodeRadius - 0.4) * 2.2, 6.1, 6.9)
    const focusDirection = camera.position.clone().sub(world)
    if (focusDirection.lengthSq() < 0.000001) focusDirection.set(0, 0.12, 1)
    focusDirection.y += 0.12
    focusDirection.normalize()
    const travelDistance = cameraTargetRef.current.distanceTo(world)
    viewResetRef.current = null
    focusTransitionRef.current = {
      startedAt: performance.now(),
      duration: FOCUS_TRANSITION_DURATION_MS,
      fromPosition: camera.position.clone(),
      toPosition: world.clone().addScaledVector(focusDirection, focusDistance),
      fromTarget: cameraTargetRef.current.clone(),
      toTarget: world,
      fromRotation: groupRef.current?.rotation.clone() ?? new THREE.Euler(),
      resetRotation: false,
      blurMax: THREE.MathUtils.clamp(1.2 + travelDistance * 0.16, 1.8, 4.6),
      scaleMax: THREE.MathUtils.clamp(1.004 + travelDistance * 0.00045, 1.004, 1.014),
    }
  }, [focusId, viewerNode])

  const updatePointer = (event: React.PointerEvent) => {
    const rect = event.currentTarget.getBoundingClientRect()
    pointerRef.current.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -(((event.clientY - rect.top) / rect.height) * 2 - 1))
  }

  const cancelPointerSummonHold = () => {
    const hold = pointerSummonHoldRef.current
    if (hold.timeout !== undefined) {
      window.clearTimeout(hold.timeout)
    }
    if (hold.active) summonCallbacksRef.current.onSummonStarHoldChange?.(undefined)
    pointerSummonHoldRef.current = {
      active: false,
      pointerId: -1,
      summonId: undefined,
      startedAt: 0,
      startX: 0,
      startY: 0,
      timeout: undefined,
    }
  }

  const getPointerHitNode = () => {
    const camera = cameraRef.current
    if (!camera) return undefined
    raycasterRef.current.setFromCamera(pointerRef.current, camera)
    return raycasterRef.current.intersectObjects([...nodeMeshesRef.current.values()])[0]
  }

  const getPointerHitSummonStar = () => {
    const camera = cameraRef.current
    if (!camera) return undefined
    raycasterRef.current.setFromCamera(pointerRef.current, camera)
    return raycasterRef.current.intersectObjects([...summonMeshesRef.current.values()])[0]
  }

  const getPointerHitResolvedSummonStar = () => {
    const camera = cameraRef.current
    if (!camera) return undefined
    raycasterRef.current.setFromCamera(pointerRef.current, camera)
    return raycasterRef.current.intersectObjects([...resolvedSummonMeshesRef.current.values()])[0]
  }

  const startSummonZoomOutTransition = () => {
    const camera = cameraRef.current
    const summonGroup = summonGroupRef.current
    if (!camera || !summonGroup || focusTransitionRef.current || viewResetRef.current) return
    const travelDistance = cameraTargetRef.current.distanceTo(DEFAULT_CAMERA_TARGET) + camera.position.distanceTo(DEFAULT_CAMERA_POSITION)
    focusTransitionRef.current = {
      startedAt: performance.now(),
      duration: VIEW_RESET_DURATION_MS,
      fromPosition: camera.position.clone(),
      toPosition: DEFAULT_CAMERA_POSITION.clone(),
      fromTarget: cameraTargetRef.current.clone(),
      toTarget: DEFAULT_CAMERA_TARGET.clone(),
      fromRotation: summonGroup.rotation.clone(),
      resetRotation: false,
      blurMax: THREE.MathUtils.clamp(1.8 + travelDistance * 0.12, 2.4, 4.8),
      scaleMax: THREE.MathUtils.clamp(1.008 + travelDistance * 0.0005, 1.008, 1.026),
    }
  }

  const startUniverseZoomOutTransition = () => {
    const camera = cameraRef.current
    const group = groupRef.current
    const initialView = initialViewRef.current
    if (!camera || !group || !initialView || focusTransitionRef.current || viewResetRef.current) return
    const travelDistance = cameraTargetRef.current.distanceTo(initialView.target) + camera.position.distanceTo(initialView.position)
    focusTransitionRef.current = {
      startedAt: performance.now(),
      duration: VIEW_RESET_DURATION_MS,
      fromPosition: camera.position.clone(),
      toPosition: initialView.position.clone(),
      fromTarget: cameraTargetRef.current.clone(),
      toTarget: initialView.target.clone(),
      fromRotation: group.rotation.clone(),
      resetRotation: false,
      blurMax: THREE.MathUtils.clamp(1.8 + travelDistance * 0.12, 2.4, 4.8),
      scaleMax: THREE.MathUtils.clamp(1.008 + travelDistance * 0.0005, 1.008, 1.026),
    }
  }

  const resetView = () => {
    if (imageViewerRef.current?.ready) {
      imageViewerRef.current.reset()
      return
    }
    if (appModeRef.current === 'summon') {
      const camera = cameraRef.current
      const summonGroup = summonGroupRef.current
      if (!camera || !summonGroup) return
      focusTransitionRef.current = null
      viewResetRef.current = {
        startedAt: performance.now(),
        duration: VIEW_RESET_DURATION_MS,
        fromPosition: camera.position.clone(),
        toPosition: DEFAULT_CAMERA_POSITION.clone(),
        fromTarget: cameraTargetRef.current.clone(),
        toTarget: DEFAULT_CAMERA_TARGET.clone(),
        fromRotation: summonGroup.rotation.clone(),
        resetRotation: true,
        blurMax: THREE.MathUtils.clamp(1.8 + camera.position.distanceTo(DEFAULT_CAMERA_POSITION) * 0.12, 2.4, 4.8),
        scaleMax: THREE.MathUtils.clamp(1.008 + camera.position.distanceTo(DEFAULT_CAMERA_POSITION) * 0.0005, 1.008, 1.026),
      }
      touchRef.current.mode = 'none'
      dragRef.current.active = false
      dragRef.current.dragging = false
      dragRef.current.pendingTap = false
      return
    }
    const camera = cameraRef.current
    const group = groupRef.current
    const initialView = initialViewRef.current
    if (!camera || !group || !initialView) return
    focusTransitionRef.current = null
    clearFocusMotionBlur(mountRef.current)
    viewResetRef.current = {
      startedAt: performance.now(),
      duration: VIEW_RESET_DURATION_MS,
      fromPosition: camera.position.clone(),
      toPosition: initialView.position.clone(),
      fromTarget: cameraTargetRef.current.clone(),
      toTarget: initialView.target.clone(),
      fromRotation: group.rotation.clone(),
      resetRotation: true,
    }
    backgroundResetRef.current = {
      starfieldRotationY: starfieldsRef.current.map((field) => field.rotation.y),
      nebulaPositions: nebulaRef.current.map((sprite) => sprite.position.clone()),
      nebulaMaterialRotations: nebulaRef.current.map((sprite) => sprite.material.rotation),
      atmospherePositions: atmosphereNebulaRef.current.map((sprite) => sprite.position.clone()),
      atmosphereMaterialRotations: atmosphereNebulaRef.current.map((sprite) => sprite.material.rotation),
      flareMaterialRotations: backgroundFlaresRef.current.map((sprite) => sprite.material.rotation),
      flareScales: backgroundFlaresRef.current.map((sprite) => sprite.scale.clone()),
    }
    cometsRef.current.forEach((comet) => {
      sceneRef.current?.remove(comet)
      disposeComet(comet)
    })
    cometsRef.current = []
    nextCometAtRef.current = immersiveRef.current ? performance.now() * 0.001 + randomCometDelay() : 0
    selectBurstRef.current.forEach((burst) => sceneRef.current?.remove(burst))
    selectBurstRef.current = []
    dwellRef.current = { since: 0, triggeredAt: dwellRef.current.triggeredAt, armed: true }
    if (dwellFeedbackRef.current) dwellFeedbackRef.current.visible = false
    touchRef.current.mode = 'none'
    touchRef.current.startDistance = 0
    touchRef.current.startZoom = initialView.position.z
    touchRef.current.startMidpoint.set(0, 0)
    touchRef.current.lastMidpoint.set(0, 0)
    touchRef.current.startTarget.copy(initialView.target)
    touchRef.current.startCameraPosition.copy(initialView.position)
    dragRef.current.active = false
    dragRef.current.dragging = false
    dragRef.current.pendingTap = false
  }

  useEffect(() => {
    if (controlResetKey > 0) resetView()
  }, [controlResetKey])

  const cancelViewReset = () => {
    imageViewerRef.current?.cancelReset()
    viewResetRef.current = null
    backgroundResetRef.current = null
    focusTransitionRef.current = null
    clearFocusMotionBlur(mountRef.current)
  }

  const hoverAtPointer = () => {
    if (imageViewerRef.current?.ready) {
      onHover(undefined)
      return
    }
    const camera = cameraRef.current
    if (!camera) return
    raycasterRef.current.setFromCamera(pointerRef.current, camera)
    const hit = raycasterRef.current.intersectObjects([...nodeMeshesRef.current.values()])[0]
    onHover(hit ? (hit.object.userData.node as KnowledgeNode).id : undefined)
  }

  const beginMousePan = (clientX: number, clientY: number) => {
    cancelViewReset()
    mousePanRef.current.active = true
    mousePanRef.current.consumed = true
    mousePanRef.current.lastX = clientX
    mousePanRef.current.lastY = clientY
    suppressContextMenuRef.current = true
    dragRef.current.active = false
    dragRef.current.dragging = false
    dragRef.current.pendingTap = false
    lastTapRef.current = { time: 0, x: 0, y: 0, pointerType: '', blank: false, nodeId: undefined }
  }

  const endMousePan = (buttons: number) => {
    mousePanRef.current.active = false
    mousePanRef.current.consumed = buttons !== 0
    dragRef.current.active = false
    dragRef.current.dragging = false
    dragRef.current.pendingTap = false
    if (buttons === 0) {
      window.setTimeout(() => {
        suppressContextMenuRef.current = false
      }, 0)
    }
  }

  return (
    <div
      className="graph-canvas"
      ref={mountRef}
      onPointerMove={(event) => {
        if (appModeRef.current === 'transition-to-summon' || appModeRef.current === 'transition-to-universe' || summonStageRef.current === 'deploying') return
        updatePointer(event)
        if (pointerSummonHoldRef.current.active && pointerSummonHoldRef.current.pointerId === event.pointerId) {
          const moved = Math.hypot(event.clientX - pointerSummonHoldRef.current.startX, event.clientY - pointerSummonHoldRef.current.startY)
          if (moved > 12) cancelPointerSummonHold()
        }
        if (event.pointerType === 'mouse') {
          const isMousePanChord = (event.buttons & 3) === 3
          if (isMousePanChord) {
            if (!mousePanRef.current.active) {
              beginMousePan(event.clientX, event.clientY)
            } else if (cameraRef.current) {
              const dx = event.clientX - mousePanRef.current.lastX
              const dy = event.clientY - mousePanRef.current.lastY
              const viewer = imageViewerRef.current
              if (viewer?.ready) {
                viewer.panByPixels(dx, dy, event.currentTarget.clientWidth, event.currentTarget.clientHeight)
              } else {
                const targetDistance = cameraRef.current.position.distanceTo(cameraTargetRef.current)
                panCameraView(cameraRef.current, cameraTargetRef.current, dx, dy, targetDistance * 0.00175)
              }
              mousePanRef.current.lastX = event.clientX
              mousePanRef.current.lastY = event.clientY
            }
            return
          }
          if (mousePanRef.current.consumed) {
            endMousePan(event.buttons)
            return
          }
        }
        if (event.pointerType === 'touch' && event.currentTarget.hasPointerCapture(event.pointerId)) {
          const activeTouches = Number(event.currentTarget.dataset.activeTouches ?? '0')
          if (activeTouches > 1) {
            dragRef.current.pendingTap = false
            return
          }
        }
        if (dragRef.current.active) {
          const dx = event.clientX - dragRef.current.startX
          const dy = event.clientY - dragRef.current.startY
          const distance = Math.hypot(dx, dy)
          if (!dragRef.current.dragging && distance >= 14) {
            dragRef.current.dragging = true
            dragRef.current.pendingTap = false
          }
          const dragGroup = appModeRef.current === 'summon' ? summonGroupRef.current : groupRef.current
          if (dragRef.current.dragging && dragGroup) {
            const viewer = imageViewerRef.current
            if (viewer?.ready) {
              viewer.rotateBy(event.clientX - dragRef.current.lastX, event.clientY - dragRef.current.lastY)
              dragRef.current.lastX = event.clientX
              dragRef.current.lastY = event.clientY
            } else {
              dragGroup.rotation.y = dragRef.current.rotY + dx * 0.006
              dragGroup.rotation.x = dragRef.current.rotX + dy * 0.004
            }
          }
        } else hoverAtPointer()
      }}
      onPointerDown={(event) => {
        if (appModeRef.current === 'transition-to-summon' || appModeRef.current === 'transition-to-universe' || summonStageRef.current === 'deploying') return
        if (event.pointerType === 'mouse' && (event.buttons & 3) === 3) {
          event.preventDefault()
          beginMousePan(event.clientX, event.clientY)
          return
        }
        if (event.pointerType === 'mouse' && mousePanRef.current.consumed) return
        cancelViewReset()
        event.currentTarget.setPointerCapture(event.pointerId)
        const activeTouches = Number(event.currentTarget.dataset.activeTouches ?? '0') + 1
        event.currentTarget.dataset.activeTouches = String(activeTouches)
        const dragGroup = appModeRef.current === 'summon' ? summonGroupRef.current : groupRef.current
        dragRef.current = {
          active: true,
          dragging: false,
          pendingTap: activeTouches === 1,
          pointerType: event.pointerType,
          pointerDownTime: performance.now(),
          startX: event.clientX,
          startY: event.clientY,
          lastX: event.clientX,
          lastY: event.clientY,
          rotX: dragGroup?.rotation.x ?? 0,
          rotY: dragGroup?.rotation.y ?? 0,
        }
        if (appModeRef.current === 'summon' && summonStageRef.current === 'drawing') {
          updatePointer(event)
          const hitSummon = getPointerHitSummonStar()
          const summonId = hitSummon?.object.userData.summonId as string | undefined
          const selectedSummonId = selectedSummonStarIdRef.current
          if (summonId && summonId === selectedSummonId) {
            cancelPointerSummonHold()
            pointerSummonHoldRef.current = {
              active: true,
              pointerId: event.pointerId,
              summonId,
              startedAt: performance.now() * 0.001,
              startX: event.clientX,
              startY: event.clientY,
              timeout: undefined,
            }
            summonCallbacksRef.current.onSummonStarArm?.(summonId)
            summonCallbacksRef.current.onSummonStarHoldChange?.(summonId)
          }
        }
      }}
      onPointerUp={(event) => {
        if (appModeRef.current === 'transition-to-summon' || appModeRef.current === 'transition-to-universe' || summonStageRef.current === 'deploying') return
        if (event.pointerType === 'mouse' && mousePanRef.current.consumed) {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId)
          }
          if (mountRef.current) mountRef.current.dataset.activeTouches = '0'
          endMousePan(event.buttons)
          return
        }
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId)
        }
        if (pointerSummonHoldRef.current.pointerId === event.pointerId) {
          const hold = pointerSummonHoldRef.current
          const releasedId = hold.active ? hold.summonId : undefined
          cancelPointerSummonHold()
          if (releasedId) {
            const beforeRelease = Number(mountRef.current?.dataset.activeTouches ?? '1')
            const activeTouches = Math.max(0, beforeRelease - 1)
            if (mountRef.current) mountRef.current.dataset.activeTouches = String(activeTouches)
            dragRef.current.pendingTap = false
            summonCallbacksRef.current.onSummonStarTrigger?.(releasedId)
            dragRef.current.active = false
            dragRef.current.dragging = false
            dragRef.current.pointerType = ''
            lastTapRef.current = { time: 0, x: 0, y: 0, pointerType: '', blank: false, nodeId: undefined }
            return
          }
        }
        const beforeRelease = Number(mountRef.current?.dataset.activeTouches ?? '1')
        const activeTouches = Math.max(0, beforeRelease - 1)
        if (mountRef.current) mountRef.current.dataset.activeTouches = String(activeTouches)
        const dx = event.clientX - dragRef.current.startX
        const dy = event.clientY - dragRef.current.startY
        const distance = Math.hypot(dx, dy)
        const elapsed = performance.now() - dragRef.current.pointerDownTime
        const touchTap = dragRef.current.pointerType === 'touch' && elapsed <= 300
        const pointerTap = dragRef.current.pointerType !== 'touch'
        if (dragRef.current.pendingTap && !dragRef.current.dragging && beforeRelease <= 1 && distance < 14 && (touchTap || pointerTap)) {
          updatePointer(event)
          if (appModeRef.current === 'summon' && summonStageRef.current === 'drawing') {
            const hitSummon = getPointerHitSummonStar()
            const hitResolvedSummon = getPointerHitResolvedSummonStar()
            const summonId = hitSummon?.object.userData.summonId as string | undefined
            const now = performance.now()
            if (summonId) {
              summonCallbacksRef.current.onSummonStarSelect?.(summonId)
              lastTapRef.current = {
                time: now,
                x: event.clientX,
                y: event.clientY,
                pointerType: dragRef.current.pointerType,
                blank: false,
                nodeId: summonId,
              }
            } else if (hitResolvedSummon) {
              lastTapRef.current = {
                time: now,
                x: event.clientX,
                y: event.clientY,
                pointerType: dragRef.current.pointerType,
                blank: false,
                nodeId: hitResolvedSummon.object.userData.summonId as string | undefined,
              }
            } else {
              if (selectedSummonStarIdRef.current) {
                summonCallbacksRef.current.onSummonStarClearSelection?.()
              }
              const previousTap = lastTapRef.current
              const doubleBlankTap = previousTap.blank &&
                previousTap.pointerType === dragRef.current.pointerType &&
                now - previousTap.time <= DOUBLE_TAP_MS &&
                Math.hypot(event.clientX - previousTap.x, event.clientY - previousTap.y) <= DOUBLE_TAP_DISTANCE
              if (doubleBlankTap) {
                resetView()
                lastTapRef.current = { time: 0, x: 0, y: 0, pointerType: '', blank: false, nodeId: undefined }
              } else {
                lastTapRef.current = {
                  time: now,
                  x: event.clientX,
                  y: event.clientY,
                  pointerType: dragRef.current.pointerType,
                  blank: true,
                  nodeId: undefined,
                }
              }
            }
            dragRef.current.active = false
            dragRef.current.dragging = false
            dragRef.current.pendingTap = false
            return
          }
          const viewerActive = !!imageViewerRef.current?.ready
          const hit = viewerActive ? undefined : getPointerHitNode()
          const now = performance.now()
          const blankTap = !hit
          const hitNode = hit?.object.userData.node as KnowledgeNode | undefined
          const previousTap = lastTapRef.current
          const doubleBlankTap = blankTap &&
            previousTap.blank &&
            previousTap.pointerType === dragRef.current.pointerType &&
            now - previousTap.time <= DOUBLE_TAP_MS &&
            Math.hypot(event.clientX - previousTap.x, event.clientY - previousTap.y) <= DOUBLE_TAP_DISTANCE
          const repeatedNodeTap = !!hitNode &&
            previousTap.nodeId === hitNode.id &&
            previousTap.pointerType === dragRef.current.pointerType &&
            now - previousTap.time <= DOUBLE_TAP_MS &&
            Math.hypot(event.clientX - previousTap.x, event.clientY - previousTap.y) <= DOUBLE_TAP_DISTANCE
          if (doubleBlankTap) {
            resetView()
            onHover(undefined)
            lastTapRef.current = { time: 0, x: 0, y: 0, pointerType: '', blank: false, nodeId: undefined }
          } else {
            if (viewerActive) {
              onHover(undefined)
            } else if (hitNode) {
              if (!repeatedNodeTap || hitNode.id === SUMMON_NODE_ID) onSelect(hitNode, dragRef.current.pointerType === 'touch' ? 'touch' : 'mouse')
              onHover(hitNode.id)
            } else {
              onHover(undefined)
              onClearSelection()
            }
            lastTapRef.current = {
              time: now,
              x: event.clientX,
              y: event.clientY,
              pointerType: dragRef.current.pointerType,
              blank: blankTap,
              nodeId: hitNode?.id,
            }
          }
        }
        dragRef.current.active = false
        dragRef.current.dragging = false
        dragRef.current.pendingTap = false
      }}
      onPointerCancel={(event) => {
        if (pointerSummonHoldRef.current.pointerId === event.pointerId) cancelPointerSummonHold()
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId)
        }
        if (mountRef.current) mountRef.current.dataset.activeTouches = '0'
        dragRef.current.active = false
        dragRef.current.dragging = false
        dragRef.current.pendingTap = false
        mousePanRef.current.active = false
        mousePanRef.current.consumed = false
        suppressContextMenuRef.current = false
        touchRef.current.mode = 'none'
        lastTapRef.current = { time: 0, x: 0, y: 0, pointerType: '', blank: false, nodeId: undefined }
      }}
      onMouseDown={(event) => {
        if ((event.buttons & 3) === 3) {
          event.preventDefault()
          beginMousePan(event.clientX, event.clientY)
        }
      }}
      onMouseUp={(event) => {
        if (mousePanRef.current.consumed && (event.buttons & 3) !== 3) {
          endMousePan(event.buttons)
        }
      }}
      onContextMenu={(event) => {
        if (mousePanRef.current.active || mousePanRef.current.consumed || suppressContextMenuRef.current) {
          event.preventDefault()
          suppressContextMenuRef.current = false
        }
      }}
      onTouchStart={(event) => {
        if (appModeRef.current === 'transition-to-summon' || appModeRef.current === 'transition-to-universe' || summonStageRef.current === 'deploying') return
        cancelViewReset()
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
            startViewerScale: imageViewerRef.current?.scale ?? 1,
          }
          dragRef.current.pendingTap = false
          dragRef.current.dragging = false
        } else if (event.touches.length === 1) {
          touchRef.current.mode = 'rotate'
          touchRef.current.lastMidpoint.set(event.touches[0].clientX, event.touches[0].clientY)
        }
      }}
      onTouchMove={(event) => {
        if (appModeRef.current === 'transition-to-summon' || appModeRef.current === 'transition-to-universe' || summonStageRef.current === 'deploying') return
        if (event.touches.length === 1 && touchRef.current.mode === 'rotate' && appModeRef.current === 'summon' && summonGroupRef.current) {
          event.preventDefault()
          const touch = event.touches[0]
          const dx = touch.clientX - touchRef.current.lastMidpoint.x
          const dy = touch.clientY - touchRef.current.lastMidpoint.y
          summonGroupRef.current.rotation.y += dx * 0.006
          summonGroupRef.current.rotation.x += dy * 0.004
          touchRef.current.lastMidpoint.set(touch.clientX, touch.clientY)
          return
        }
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
            const viewer = imageViewerRef.current
            if (viewer?.ready) {
              viewer.setScale(touchRef.current.startViewerScale * (distance / Math.max(1, touchRef.current.startDistance)))
            } else {
              const scale = touchRef.current.startDistance / Math.max(1, distance)
              if (appModeRef.current === 'summon' && selectedSummonStarIdRef.current && scale > 1.04) {
                startSummonZoomOutTransition()
              } else if (appModeRef.current === 'summon' && selectedSummonStarIdRef.current && scale < 1) {
                const startFocusDistance = touchRef.current.startCameraPosition.distanceTo(touchRef.current.startTarget)
                setSelectedSummonFocusDistance(camera, startFocusDistance * scale)
              } else if (appModeRef.current === 'universe' && focusIdRef.current && scale > 1.04) {
                startUniverseZoomOutTransition()
              } else if (appModeRef.current === 'universe' && focusIdRef.current && scale < 1) {
                const startFocusDistance = touchRef.current.startCameraPosition.distanceTo(touchRef.current.startTarget)
                setFocusedUniverseDistance(camera, startFocusDistance * scale)
              } else {
                camera.position.z = Math.max(11, Math.min(70, touchRef.current.startZoom * scale))
              }
            }
          } else if (touchRef.current.mode === 'twoFingerPan') {
            const viewer = imageViewerRef.current
            if (viewer?.ready) {
              viewer.panByPixels(
                midpoint.x - touchRef.current.lastMidpoint.x,
                midpoint.y - touchRef.current.lastMidpoint.y,
                event.currentTarget.clientWidth,
                event.currentTarget.clientHeight,
              )
            } else {
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
          }
          touchRef.current.lastMidpoint.copy(midpoint)
          dragRef.current.pendingTap = false
          dragRef.current.dragging = false
        }
      }}
      onTouchEnd={(event) => {
        if (event.touches.length < 2) touchRef.current.mode = 'none'
      }}
      onWheel={(event) => {
        if (appModeRef.current === 'transition-to-summon' || appModeRef.current === 'transition-to-universe' || summonStageRef.current === 'deploying') return
        if (!cameraRef.current) return
        cancelViewReset()
        const viewer = imageViewerRef.current
        if (viewer?.ready) {
          viewer.zoomBy(Math.exp(-event.deltaY * 0.0015))
        } else {
          if (appModeRef.current === 'summon' && selectedSummonStarIdRef.current && event.deltaY > 0) {
            startSummonZoomOutTransition()
          } else if (appModeRef.current === 'summon' && selectedSummonStarIdRef.current && event.deltaY < 0) {
            moveSelectedSummonFocusCloser(cameraRef.current, -event.deltaY * 0.025)
          } else if (appModeRef.current === 'universe' && focusIdRef.current && event.deltaY > 0) {
            startUniverseZoomOutTransition()
          } else if (appModeRef.current === 'universe' && focusIdRef.current && event.deltaY < 0) {
            moveFocusedUniverseCloser(cameraRef.current, -event.deltaY * 0.025)
          } else {
            cameraRef.current.position.z = Math.max(11, Math.min(70, cameraRef.current.position.z + event.deltaY * 0.025))
          }
        }
      }}
    />
  )
}
