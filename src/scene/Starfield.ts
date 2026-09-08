import * as THREE from 'three'

type StarfieldOptions = {
  count: number
  radiusMin: number
  radiusMax: number
  size: number
  opacity: number
  drift: number
  twinkle: number
  occasional: number
  banded?: boolean
  glow?: boolean
  screenSized?: boolean
}

type GalaxyBandOptions = {
  count: number
  width: number
  length: number
  depth: number
  size: number
  opacity: number
  drift: number
  glow?: boolean
  screenSized?: boolean
}

type BrightStarfieldOptions = {
  count: number
  radiusMin: number
  radiusMax: number
  size: number
  opacity: number
  drift: number
  bright?: boolean
  screenSized?: boolean
}

let starGlowTexture: THREE.CanvasTexture | undefined

const getStarGlowTexture = () => {
  if (starGlowTexture) return starGlowTexture
  const canvas = document.createElement('canvas')
  canvas.width = 96
  canvas.height = 96
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    starGlowTexture = new THREE.CanvasTexture(canvas)
    return starGlowTexture
  }
  const gradient = ctx.createRadialGradient(48, 48, 0, 48, 48, 48)
  gradient.addColorStop(0, 'rgba(255,255,255,1)')
  gradient.addColorStop(0.16, 'rgba(226,240,255,0.92)')
  gradient.addColorStop(0.42, 'rgba(159,196,255,0.36)')
  gradient.addColorStop(1, 'rgba(159,196,255,0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, 96, 96)
  starGlowTexture = new THREE.CanvasTexture(canvas)
  starGlowTexture.minFilter = THREE.LinearFilter
  return starGlowTexture
}

const gaussian = () => {
  const u = Math.max(0.0001, Math.random())
  const v = Math.max(0.0001, Math.random())
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

export const createStarfield = ({ count, radiusMin, radiusMax, size, opacity, drift, twinkle, occasional, banded = false, glow = false, screenSized = false }: StarfieldOptions) => {
  const geometry = new THREE.BufferGeometry()
  const positions = new Float32Array(count * 3)
  const colors = new Float32Array(count * 3)
  const baseColors = new Float32Array(count * 3)
  const phases = new Float32Array(count)
  const speeds = new Float32Array(count)
  const twinkleAmounts = new Float32Array(count)
  const clusterCenters = Array.from({ length: 5 }, (_, index) => ({
    theta: (index / 5) * Math.PI * 2 + Math.random() * 0.9,
    phi: Math.PI * (0.42 + Math.random() * 0.18),
    spread: 0.18 + Math.random() * 0.22,
  }))
  for (let i = 0; i < count; i += 1) {
    const radius = radiusMin + Math.random() * (radiusMax - radiusMin)
    let theta = Math.random() * Math.PI * 2
    let phi = Math.acos(2 * Math.random() - 1)
    if (banded) {
      if (Math.random() < 0.72) {
        theta = Math.random() * Math.PI * 2
        phi = Math.PI * 0.5 + (Math.random() - 0.5) * 0.26 + Math.sin(theta * 1.7) * 0.105
      } else {
        const cluster = clusterCenters[Math.floor(Math.random() * clusterCenters.length)]
        theta = cluster.theta + (Math.random() - 0.5) * cluster.spread
        phi = cluster.phi + (Math.random() - 0.5) * cluster.spread * 0.64
      }
    }
    positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta)
    positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta)
    positions[i * 3 + 2] = radius * Math.cos(phi)
    const warmth = Math.random() * 0.18
    const depth = radiusMax > 120 ? 0.9 + Math.random() * 0.42 : 1.05 + Math.random() * 0.32
    const highlight = Math.random() < occasional ? 1.55 + Math.random() * 0.9 : 1
    baseColors[i * 3] = (0.64 + warmth) * highlight * depth
    baseColors[i * 3 + 1] = (0.78 + warmth) * highlight * depth
    baseColors[i * 3 + 2] = 1.12 * highlight * depth
    colors[i * 3] = baseColors[i * 3]
    colors[i * 3 + 1] = baseColors[i * 3 + 1]
    colors[i * 3 + 2] = baseColors[i * 3 + 2]
    phases[i] = Math.random() * Math.PI * 2
    speeds[i] = 0.12 + Math.random() * 0.36
    twinkleAmounts[i] = twinkle * (0.28 + Math.random() * 0.72)
  }
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geometry.userData.baseColors = baseColors
  geometry.userData.phases = phases
  geometry.userData.speeds = speeds
  geometry.userData.twinkleAmounts = twinkleAmounts
  const material = new THREE.PointsMaterial({
    map: glow ? getStarGlowTexture() : undefined,
    size,
    vertexColors: true,
    transparent: true,
    opacity,
    depthWrite: false,
    sizeAttenuation: !screenSized,
    blending: glow ? THREE.AdditiveBlending : THREE.NormalBlending,
    fog: false,
  })
  const field = new THREE.Points(geometry, material)
  field.userData.drift = drift
  field.userData.baseOpacity = opacity
  field.userData.phase = Math.random() * Math.PI * 2
  return field
}

export const createBrightStarfield = ({ count, radiusMin, radiusMax, size, opacity, drift, bright = false, screenSized = true }: BrightStarfieldOptions) => {
  const geometry = new THREE.BufferGeometry()
  const positions = new Float32Array(count * 3)
  const colors = new Float32Array(count * 3)
  const baseColors = new Float32Array(count * 3)
  const phases = new Float32Array(count)
  const speeds = new Float32Array(count)
  const twinkleAmounts = new Float32Array(count)
  const brightCenters = Array.from({ length: 6 }, (_, index) => ({
    theta: (index / 6) * Math.PI * 2 + Math.random() * 0.55,
    phi: Math.PI * (0.36 + Math.random() * 0.3),
    spread: 0.16 + Math.random() * 0.2,
  }))

  for (let i = 0; i < count; i += 1) {
    const radius = radiusMin + Math.random() * (radiusMax - radiusMin)
    let theta = Math.random() * Math.PI * 2
    let phi = Math.acos(2 * Math.random() - 1)
    if (Math.random() < 0.46) {
      const cluster = brightCenters[Math.floor(Math.random() * brightCenters.length)]
      theta = cluster.theta + gaussian() * cluster.spread
      phi = cluster.phi + gaussian() * cluster.spread * 0.62
    } else if (Math.random() < 0.58) {
      theta = Math.random() * Math.PI * 2
      phi = Math.PI * 0.5 + gaussian() * 0.16 + Math.sin(theta * 1.5) * 0.08
    }
    positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta)
    positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta)
    positions[i * 3 + 2] = radius * Math.cos(phi)

    const pulseStar = bright ? Math.random() < 0.22 : Math.random() < 0.08
    const warmth = Math.random() * 0.12
    const base = bright ? 1.45 + Math.random() * 0.75 : 1.04 + Math.random() * 0.56
    const highlight = pulseStar ? 1.65 + Math.random() * 0.95 : 1
    baseColors[i * 3] = (0.86 + warmth) * base * highlight
    baseColors[i * 3 + 1] = (0.94 + warmth) * base * highlight
    baseColors[i * 3 + 2] = 1.18 * base * highlight
    colors[i * 3] = baseColors[i * 3]
    colors[i * 3 + 1] = baseColors[i * 3 + 1]
    colors[i * 3 + 2] = baseColors[i * 3 + 2]
    phases[i] = Math.random() * Math.PI * 2
    speeds[i] = bright ? 0.16 + Math.random() * 0.7 : 0.12 + Math.random() * 0.5
    twinkleAmounts[i] = bright
      ? (pulseStar ? 0.58 + Math.random() * 0.34 : 0.28 + Math.random() * 0.24)
      : (pulseStar ? 0.36 + Math.random() * 0.28 : 0.18 + Math.random() * 0.2)
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geometry.userData.baseColors = baseColors
  geometry.userData.phases = phases
  geometry.userData.speeds = speeds
  geometry.userData.twinkleAmounts = twinkleAmounts
  const material = new THREE.PointsMaterial({
    map: getStarGlowTexture(),
    size,
    vertexColors: true,
    transparent: true,
    opacity,
    depthWrite: false,
    sizeAttenuation: !screenSized,
    blending: THREE.AdditiveBlending,
    fog: false,
  })
  const field = new THREE.Points(geometry, material)
  field.userData.drift = drift
  field.userData.baseOpacity = opacity
  field.userData.phase = Math.random() * Math.PI * 2
  return field
}

export const createGalaxyBand = ({ count, width, length, depth, size, opacity, drift, glow = true, screenSized = true }: GalaxyBandOptions) => {
  const geometry = new THREE.BufferGeometry()
  const positions = new Float32Array(count * 3)
  const colors = new Float32Array(count * 3)
  const baseColors = new Float32Array(count * 3)
  const phases = new Float32Array(count)
  const speeds = new Float32Array(count)
  const twinkleAmounts = new Float32Array(count)
  const tilt = -0.44
  const cos = Math.cos(tilt)
  const sin = Math.sin(tilt)

  for (let i = 0; i < count; i += 1) {
    const t = (Math.random() * 2 - 1) * length
    const bandFalloff = 1 - Math.min(1, Math.abs(t) / length)
    const localWidth = width * (0.28 + bandFalloff * 0.72)
    const cross = gaussian() * localWidth
    const curve = Math.sin(t * 0.018) * 10 + Math.sin(t * 0.041) * 3.6
    const x = t
    const y = curve + cross
    const z = -depth - Math.random() * 82 + gaussian() * 10
    positions[i * 3] = x * cos - y * sin
    positions[i * 3 + 1] = x * sin + y * cos
    positions[i * 3 + 2] = z

    const coreDensity = Math.max(0, 1 - Math.abs(cross) / Math.max(1, localWidth * 2.5))
    const highlight = Math.random() < 0.12 ? 1.7 + Math.random() * 1.05 : 1
    const cool = 0.88 + coreDensity * 0.54
    baseColors[i * 3] = 0.6 * cool * highlight
    baseColors[i * 3 + 1] = 0.78 * cool * highlight
    baseColors[i * 3 + 2] = 1.18 * cool * highlight
    colors[i * 3] = baseColors[i * 3]
    colors[i * 3 + 1] = baseColors[i * 3 + 1]
    colors[i * 3 + 2] = baseColors[i * 3 + 2]
    phases[i] = Math.random() * Math.PI * 2
    speeds[i] = 0.14 + Math.random() * 0.56
    twinkleAmounts[i] = 0.2 + coreDensity * 0.22 + Math.random() * 0.12
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geometry.userData.baseColors = baseColors
  geometry.userData.phases = phases
  geometry.userData.speeds = speeds
  geometry.userData.twinkleAmounts = twinkleAmounts
  const material = new THREE.PointsMaterial({
    map: glow ? getStarGlowTexture() : undefined,
    size,
    vertexColors: true,
    transparent: true,
    opacity,
    depthWrite: false,
    sizeAttenuation: !screenSized,
    blending: glow ? THREE.AdditiveBlending : THREE.NormalBlending,
    fog: false,
  })
  const field = new THREE.Points(geometry, material)
  field.userData.drift = drift
  field.userData.baseOpacity = opacity
  field.userData.phase = Math.random() * Math.PI * 2
  return field
}
