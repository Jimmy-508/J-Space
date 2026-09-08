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
  const thumb = distance(landmarks[4], landmarks[17]) > distance(landmarks[2], landmarks[17]) * 1.06
  const foldedCount = [index, middle, ring, pinky].filter((extended) => !extended).length
  if (foldedCount >= 4) return 'fist'
  if ([thumb, index, middle, ring, pinky].filter(Boolean).length >= 4) return 'open'
  return 'none'
}

export const getPointerPoint = (landmarks: Landmark[]): NormalizedPoint => ({
  x: landmarks[9]?.x ?? landmarks[0]?.x ?? 0.5,
  y: landmarks[9]?.y ?? landmarks[0]?.y ?? 0.5,
})

export const getPalmCenter = (landmarks: Landmark[]): NormalizedPoint => {
  const ids = [0, 5, 9, 13, 17]
  const total = ids.reduce((sum, id) => ({
    x: sum.x + (landmarks[id]?.x ?? 0.5),
    y: sum.y + (landmarks[id]?.y ?? 0.5),
  }), { x: 0, y: 0 })
  return { x: total.x / ids.length, y: total.y / ids.length }
}

export const getPalmSize = (landmarks: Landmark[]) => {
  if (landmarks.length < 18) return 0.08
  return Math.max(0.035, distance(landmarks[5], landmarks[17]))
}

export const isPalmFacingCamera = (landmarks: Landmark[]) => {
  if (landmarks.length < 18) return false
  const palmWidth = distance(landmarks[5], landmarks[17])
  const palmHeight = distance(landmarks[0], landmarks[9])
  const zSpread = Math.abs((landmarks[9].z ?? 0) - (landmarks[0].z ?? 0))
  return palmWidth > 0.045 && palmHeight > 0.055 && zSpread < 0.12
}

export const getPalmSide = (landmarks: Landmark[]) => {
  if (landmarks.length < 18) return 0
  return Math.sign(landmarks[5].x - landmarks[17].x)
}
