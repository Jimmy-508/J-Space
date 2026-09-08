import * as THREE from 'three'

type StarfieldOptions = {
  count: number
  radiusMin: number
  radiusMax: number
  size: number
  opacity: number
  drift: number
}

export const createStarfield = ({ count, radiusMin, radiusMax, size, opacity, drift }: StarfieldOptions) => {
  const geometry = new THREE.BufferGeometry()
  const positions = new Float32Array(count * 3)
  const colors = new Float32Array(count * 3)
  for (let i = 0; i < count; i += 1) {
    const radius = radiusMin + Math.random() * (radiusMax - radiusMin)
    const theta = Math.random() * Math.PI * 2
    const phi = Math.acos(2 * Math.random() - 1)
    positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta)
    positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta)
    positions[i * 3 + 2] = radius * Math.cos(phi)
    const warmth = Math.random() * 0.18
    colors[i * 3] = 0.55 + warmth
    colors[i * 3 + 1] = 0.68 + warmth
    colors[i * 3 + 2] = 0.9
  }
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
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
