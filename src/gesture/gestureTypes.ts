export type GestureName = 'none' | 'fist' | 'open'

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
  activeGesture: 'none' | 'zoomIn' | 'zoomOut' | 'rotate'
  zoomHands?: string[]
  rotationHand?: string
  zoomDelta: number
  rotateDelta: NormalizedPoint
  message?: string
}
