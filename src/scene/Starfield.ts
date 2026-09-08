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
}

type GalaxyBandOptions = {
  count: number
  width: number
  length: number
  depth: number
  size: number
  opacity: number
  drift: number
}

const gaussian = () => {
  const u = Math.max(0.0001, Math.random())
  const v = Math.max(0.0001, Math.random())
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

export const createStarfield = ({ count, radiusMin, radiusMax, size, opacity, drift, twinkle, occasional, banded = false }: StarfieldOptions) => {
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
    const depth = radiusMax > 120 ? 0.78 + Math.random() * 0.32 : 0.9 + Math.random() * 0.22
    const highlight = Math.random() < occasional ? 1.25 + Math.random() * 0.55 : 1
    baseColors[i * 3] = (0.5 + warmth) * highlight * depth
    baseColors[i * 3 + 1] = (0.66 + warmth) * highlight * depth
    baseColors[i * 3 + 2] = 0.96 * highlight * depth
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
    size,
    vertexColors: true,
    transparent: true,
    opacity,
    depthWrite: false,
  })
  const field = new THREE.Points(geometry, material)
  field.userData.drift = drift
  field.userData.baseOpacity = opacity
  field.userData.phase = Math.random() * Math.PI * 2
  return field
}

export const createGalaxyBand = ({ count, width, length, depth, size, opacity, drift }: GalaxyBandOptions) => {
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
    const highlight = Math.random() < 0.075 ? 1.45 + Math.random() * 0.7 : 1
    const cool = 0.72 + coreDensity * 0.32
    baseColors[i * 3] = 0.48 * cool * highlight
    baseColors[i * 3 + 1] = 0.64 * cool * highlight
    baseColors[i * 3 + 2] = 0.98 * cool * highlight
    colors[i * 3] = baseColors[i * 3]
    colors[i * 3 + 1] = baseColors[i * 3 + 1]
    colors[i * 3 + 2] = baseColors[i * 3 + 2]
    phases[i] = Math.random() * Math.PI * 2
    speeds[i] = 0.1 + Math.random() * 0.42
    twinkleAmounts[i] = 0.12 + coreDensity * 0.16 + Math.random() * 0.08
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geometry.userData.baseColors = baseColors
  geometry.userData.phases = phases
  geometry.userData.speeds = speeds
  geometry.userData.twinkleAmounts = twinkleAmounts
  const material = new THREE.PointsMaterial({
    size,
    vertexColors: true,
    transparent: true,
    opacity,
    depthWrite: false,
  })
  const field = new THREE.Points(geometry, material)
  field.userData.drift = drift
  field.userData.baseOpacity = opacity
  field.userData.phase = Math.random() * Math.PI * 2
  return field
}
