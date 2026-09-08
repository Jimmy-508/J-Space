import type { GestureName, NormalizedPoint } from './gestureTypes'

type Landmark = { x: number; y: number; z?: number }

const distance = (a: Landmark, b: Landmark) => Math.hypot(a.x - b.x, a.y - b.y)

const fingerExtended = (landmarks: Landmark[], tip: number, pip: number, wrist: number) =>
  distance(landmarks[tip], landmarks[wrist]) > distance(landmarks[pip], landmarks[wrist]) * 1.12

export const detectGesture = (landmarks: Landmark[]): GestureName => {
  if (landmarks.length < 21) return 'none'
  const wrist = 0
  const index = fingerExtended(landmarks, 8, 6, wrist)
  const middle = fingerExtended(landmarks, 12, 10, wrist)
  const ring = fingerExtended(landmarks, 16, 14, wrist)
  const pinky = fingerExtended(landmarks, 20, 18, wrist)
  const foldedCount = [index, middle, ring, pinky].filter((extended) => !extended).length
  if (foldedCount >= 4) return 'fist'
  if (index && !middle && !ring && !pinky) return 'index'
  return 'none'
}

export const getPointerPoint = (landmarks: Landmark[]): NormalizedPoint => ({
  x: landmarks[8]?.x ?? 0.5,
  y: landmarks[8]?.y ?? 0.5,
})
