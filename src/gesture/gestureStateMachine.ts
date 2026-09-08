import type { GestureStatus, NormalizedPoint, TrackedHand } from './gestureTypes'

const HOLD_MS = 240
const LOST_GRACE_MS = 420
const COOLDOWN_MS = 180
const DEAD_ZONE = 0.006
const SMOOTHING = 0.28

const distance = (a: NormalizedPoint, b: NormalizedPoint) => Math.hypot(a.x - b.x, a.y - b.y)

const emptyStatus = (
  enabled: boolean,
  cameraStatus: GestureStatus['cameraStatus'],
  handsDetected: number,
  message?: string,
): GestureStatus => ({
  enabled,
  cameraStatus,
  handsDetected,
  activeGesture: 'none',
  zoomDelta: 0,
  rotateDelta: { x: 0, y: 0 },
  message,
})

export class GestureStateMachine {
  private openSince = new Map<string, number>()
  private fistSince = new Map<string, number>()
  private lastSeen = new Map<string, number>()
  private mode: GestureStatus['activeGesture'] = 'none'
  private modeSince = 0
  private lastDistance?: number
  private smoothedZoom = 0
  private rotationHand?: string
  private lastRotationPoint?: NormalizedPoint
  private smoothedRotation: NormalizedPoint = { x: 0, y: 0 }

  update(hands: TrackedHand[], now: number, enabled: boolean, cameraStatus: GestureStatus['cameraStatus']): GestureStatus {
    if (!enabled || cameraStatus !== 'ready') {
      this.reset()
      return emptyStatus(enabled, cameraStatus, hands.length)
    }

    const visibleIds = new Set(hands.map((hand) => hand.id))
    hands.forEach((hand) => this.lastSeen.set(hand.id, now))

    for (const [id, seenAt] of this.lastSeen) {
      if (!visibleIds.has(id) && now - seenAt > LOST_GRACE_MS) {
        this.openSince.delete(id)
        this.fistSince.delete(id)
        if (this.rotationHand === id) this.clearRotation()
      }
    }

    hands.forEach((hand) => {
      if (hand.gesture === 'open' && hand.palmFacing) {
        if (!this.openSince.has(hand.id)) this.openSince.set(hand.id, now)
      } else {
        this.openSince.delete(hand.id)
      }
      if (hand.gesture === 'fist') {
        if (!this.fistSince.has(hand.id)) this.fistSince.set(hand.id, now)
      } else {
        this.fistSince.delete(hand.id)
        if (this.rotationHand === hand.id) this.clearRotation()
      }
    })

    const stableOpenHands = hands
      .filter((hand) => {
        const since = this.openSince.get(hand.id)
        return since !== undefined && now - since >= HOLD_MS
      })
      .sort((a, b) => a.palmCenter.x - b.palmCenter.x)

    if (stableOpenHands.length >= 2) {
      const pair = [stableOpenHands[0], stableOpenHands[stableOpenHands.length - 1]]
      const currentDistance = distance(pair[0].palmCenter, pair[1].palmCenter)
      const previousDistance = this.lastDistance ?? currentDistance
      const distanceDelta = currentDistance - previousDistance
      const towardEachOther = Math.sign(pair[0].palmSide) !== Math.sign(pair[1].palmSide)
      const zoomInReady = distanceDelta > DEAD_ZONE
      const zoomOutReady = distanceDelta < -DEAD_ZONE && towardEachOther

      this.lastDistance = currentDistance
      this.clearRotation()

      if ((zoomInReady || zoomOutReady) && (this.mode === 'none' || now - this.modeSince > COOLDOWN_MS || this.mode === 'zoomIn' || this.mode === 'zoomOut')) {
        this.mode = zoomInReady ? 'zoomIn' : 'zoomOut'
        if (this.modeSince === 0) this.modeSince = now
      }

      if (this.mode === 'zoomIn' || this.mode === 'zoomOut') {
        const targetZoom = Math.abs(distanceDelta) < DEAD_ZONE ? 0 : distanceDelta
        this.smoothedZoom += (targetZoom - this.smoothedZoom) * SMOOTHING
        if (Math.abs(this.smoothedZoom) < 0.0015) this.smoothedZoom = 0
        return {
          enabled,
          cameraStatus,
          handsDetected: hands.length,
          activeGesture: this.smoothedZoom > 0 ? 'zoomIn' : this.smoothedZoom < 0 ? 'zoomOut' : 'none',
          zoomHands: pair.map((hand) => hand.id),
          zoomDelta: this.smoothedZoom,
          rotateDelta: { x: 0, y: 0 },
        }
      }
    } else {
      this.lastDistance = undefined
      this.smoothedZoom = 0
      if (this.mode === 'zoomIn' || this.mode === 'zoomOut') this.mode = 'none'
    }

    const stableFist = hands.find((hand) => {
      const since = this.fistSince.get(hand.id)
      return since !== undefined && now - since >= HOLD_MS
    })

    if (stableFist) {
      if (!this.rotationHand) {
        this.rotationHand = stableFist.id
        this.lastRotationPoint = stableFist.palmCenter
        this.mode = 'rotate'
        this.modeSince = now
      }
      const activeHand = hands.find((hand) => hand.id === this.rotationHand && hand.gesture === 'fist')
      if (activeHand && this.lastRotationPoint) {
        const raw = {
          x: activeHand.palmCenter.x - this.lastRotationPoint.x,
          y: activeHand.palmCenter.y - this.lastRotationPoint.y,
        }
        this.lastRotationPoint = activeHand.palmCenter
        this.smoothedRotation = {
          x: this.smoothedRotation.x + (raw.x - this.smoothedRotation.x) * SMOOTHING,
          y: this.smoothedRotation.y + (raw.y - this.smoothedRotation.y) * SMOOTHING,
        }
        if (Math.abs(this.smoothedRotation.x) < 0.0012) this.smoothedRotation.x = 0
        if (Math.abs(this.smoothedRotation.y) < 0.0012) this.smoothedRotation.y = 0
        return {
          enabled,
          cameraStatus,
          handsDetected: hands.length,
          activeGesture: 'rotate',
          rotationHand: this.rotationHand,
          zoomDelta: 0,
          rotateDelta: this.smoothedRotation,
        }
      }
    }

    this.mode = 'none'
    this.modeSince = 0
    return emptyStatus(enabled, cameraStatus, hands.length)
  }

  private clearRotation() {
    this.rotationHand = undefined
    this.lastRotationPoint = undefined
    this.smoothedRotation = { x: 0, y: 0 }
  }

  private reset() {
    this.openSince.clear()
    this.fistSince.clear()
    this.lastSeen.clear()
    this.mode = 'none'
    this.modeSince = 0
    this.lastDistance = undefined
    this.smoothedZoom = 0
    this.clearRotation()
  }
}
