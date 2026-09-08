export type GestureName = 'none' | 'fist' | 'fistWithIndex' | 'open'

export type HandRole = 'zoom' | 'rotation' | 'unassigned'

export type NormalizedPoint = {
  x: number
  y: number
}

export type TrackedHand = {
  id: string
  handedness: string
  gesture: GestureName
  pointer: NormalizedPoint
  landmarks: NormalizedPoint[]
  palmCenter: NormalizedPoint
  palmSize: number
  palmFacing: boolean
  palmSide: number
}

export type GestureStatus = {
  enabled: boolean
  cameraStatus: 'idle' | 'requesting' | 'ready' | 'error'
  handsDetected: number
  activeGesture: 'none' | 'zoomIn' | 'zoomOut' | 'pan' | 'pointer' | 'rotate'
  zoomHands?: string[]
  panHands?: string[]
  pointerHand?: string
  pointerPoint?: NormalizedPoint
  rotationHand?: string
  zoomDelta: number
  panDelta: NormalizedPoint
  rotateDelta: NormalizedPoint
  message?: string
}
