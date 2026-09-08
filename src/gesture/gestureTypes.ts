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
  activeGesture: 'none' | 'zoomIn' | 'zoomOut' | 'pan' | 'rotate'
  zoomHands?: string[]
  panHands?: string[]
  rotationHand?: string
  zoomDelta: number
  panDelta: NormalizedPoint
  rotateDelta: NormalizedPoint
  message?: string
}
