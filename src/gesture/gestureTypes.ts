export type GestureName = 'none' | 'fist' | 'index'

export type HandRole = 'summon' | 'pointer' | 'unassigned'

export type NormalizedPoint = {
  x: number
  y: number
}

export type TrackedHand = {
  id: string
  handedness: string
  gesture: GestureName
  pointer: NormalizedPoint
}

export type GestureStatus = {
  enabled: boolean
  cameraStatus: 'idle' | 'requesting' | 'ready' | 'error'
  handsDetected: number
  activeGesture: GestureName
  summonHand?: string
  pointerHand?: string
  pointer?: NormalizedPoint
  radialMenuOpen: boolean
  message?: string
}
