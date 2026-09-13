import * as THREE from 'three'

export type SummonStar = {
  id: string
  number: number
  position: [number, number, number]
  visualSeed: number
  resolvedAt?: number
  status: 'available' | 'selected' | 'armed' | 'resolved'
}

export const parseExcludedNumbers = (input: string, maxNumber: number) => {
  const excluded = new Set<number>()
  input.split(',').forEach((part) => {
    const token = part.trim()
    if (!token) return
    const range = token.match(/^(\d+)\s*-\s*(\d+)$/)
    if (range) {
      const a = Number(range[1])
      const b = Number(range[2])
      if (!Number.isFinite(a) || !Number.isFinite(b)) return
      const start = Math.max(1, Math.min(a, b))
      const end = Math.min(maxNumber, Math.max(a, b))
      for (let value = start; value <= end; value += 1) excluded.add(value)
      return
    }
    const value = Number(token)
    if (Number.isInteger(value) && value >= 1 && value <= maxNumber) excluded.add(value)
  })
  return excluded
}

export const createSummonStars = (maxNumber: number, excludedInput: string): SummonStar[] => {
  const max = Math.max(1, Math.min(99, Math.round(maxNumber)))
  const excluded = parseExcludedNumbers(excludedInput, max)
  const candidates = Array.from({ length: max }, (_, index) => index + 1)
    .filter((value) => !excluded.has(value))
  const goldenAngle = Math.PI * (3 - Math.sqrt(5))
  return candidates.map((number, index) => {
    const radius = 4.2 + Math.sqrt(index) * 1.24
    const angle = index * goldenAngle
    const z = ((index % 9) - 4) * 0.92
    return {
      id: `summon:${number}`,
      number,
      visualSeed: Math.random(),
      position: [
        Math.cos(angle) * radius,
        Math.sin(angle) * radius * 0.72,
        z,
      ],
      status: 'available',
    }
  })
}

export const toVector3 = (position: [number, number, number]) =>
  new THREE.Vector3(position[0], position[1], position[2])
