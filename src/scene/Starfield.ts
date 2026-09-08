import * as THREE from 'three'

export const createStarfield = (count: number) => {
  const geometry = new THREE.BufferGeometry()
  const positions = new Float32Array(count * 3)
  const colors = new Float32Array(count * 3)
  for (let i = 0; i < count; i += 1) {
    const radius = 65 + Math.random() * 85
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
    size: 0.09,
    vertexColors: true,
    transparent: true,
    opacity: 0.68,
    depthWrite: false,
  })
  return new THREE.Points(geometry, material)
}
