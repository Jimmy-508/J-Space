import type { GestureStatus, NormalizedPoint, TrackedHand } from './gestureTypes'

const HOLD_MS = 260
const LOST_GRACE_MS = 420
const DEAD_ZONE = 0.007
const HAND_MOTION_THRESHOLD = 0.0038
const SMOOTHING = 0.3

type ZoomSession = 'none' | 'zoomIn' | 'zoomOut'
type ZoomPose = 'none' | 'palmsForward' | 'palmsFacing'

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
  private zoomPose: ZoomPose = 'none'
  private zoomPoseSince = 0
  private zoomSession: ZoomSession = 'none'
  private lastDistance?: number
  private lastPalmCenters = new Map<string, NormalizedPoint>()
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
        this.lastPalmCenters.delete(id)
        if (this.rotationHand === id) this.clearRotation()
      }
    }

    hands.forEach((hand) => {
      if (hand.gesture === 'open') {
        if (!this.openSince.has(hand.id)) this.openSince.set(hand.id, now)
      } else {
        this.openSince.delete(hand.id)
        this.lastPalmCenters.delete(hand.id)
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
      const zoomStatus = this.updateZoom(stableOpenHands, now, enabled, cameraStatus, hands.length)
      if (zoomStatus.activeGesture === 'zoomIn' || zoomStatus.activeGesture === 'zoomOut') {
        this.clearRotation()
        return zoomStatus
      }
    } else {
      this.clearZoom()
    }

    const stableFist = hands.find((hand) => {
      const since = this.fistSince.get(hand.id)
      return since !== undefined && now - since >= HOLD_MS
    })

    if (stableFist) {
      if (!this.rotationHand) {
        this.rotationHand = stableFist.id
        this.lastRotationPoint = stableFist.palmCenter
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

    return emptyStatus(enabled, cameraStatus, hands.length)
  }

  private updateZoom(
    stableOpenHands: TrackedHand[],
    now: number,
    enabled: boolean,
    cameraStatus: GestureStatus['cameraStatus'],
    handsDetected: number,
  ): GestureStatus {
    const pair = [stableOpenHands[0], stableOpenHands[stableOpenHands.length - 1]]
    const pose = this.getZoomPose(pair)

    if (pose === 'none') {
      this.clearZoom()
      return emptyStatus(enabled, cameraStatus, handsDetected)
    }

    if (pose !== this.zoomPose) {
      this.resetZoomForPose(pose, now, pair)
      return this.zoomIdleStatus(enabled, cameraStatus, handsDetected, pair)
    }

    const currentDistance = distance(pair[0].palmCenter, pair[1].palmCenter)
    const previousDistance = this.lastDistance ?? currentDistance
    const distanceDelta = currentDistance - previousDistance
    const leftPrevious = this.lastPalmCenters.get(pair[0].id) ?? pair[0].palmCenter
    const rightPrevious = this.lastPalmCenters.get(pair[1].id) ?? pair[1].palmCenter
    const leftDeltaX = pair[0].palmCenter.x - leftPrevious.x
    const rightDeltaX = pair[1].palmCenter.x - rightPrevious.x

    this.lastDistance = currentDistance
    this.lastPalmCenters.set(pair[0].id, pair[0].palmCenter)
    this.lastPalmCenters.set(pair[1].id, pair[1].palmCenter)

    if (now - this.zoomPoseSince < HOLD_MS) {
      this.resetZoomMomentum(currentDistance)
      return this.zoomIdleStatus(enabled, cameraStatus, handsDetected, pair)
    }

    if (this.zoomSession === 'none') {
      if (pose === 'palmsForward' && this.isSeparating(distanceDelta, leftDeltaX, rightDeltaX)) {
        this.zoomSession = 'zoomIn'
      } else if (pose === 'palmsFacing' && this.isApproaching(distanceDelta, leftDeltaX, rightDeltaX)) {
        this.zoomSession = 'zoomOut'
      } else {
        this.resetZoomMomentum(currentDistance)
        return this.zoomIdleStatus(enabled, cameraStatus, handsDetected, pair)
      }
    }

    if (this.zoomSession === 'zoomIn') {
      if (pose !== 'palmsForward' || !this.isSeparating(distanceDelta, leftDeltaX, rightDeltaX)) {
        this.clearZoomSession(currentDistance)
        return this.zoomIdleStatus(enabled, cameraStatus, handsDetected, pair)
      }
      this.smoothedZoom += (Math.max(0, distanceDelta) - this.smoothedZoom) * SMOOTHING
      return this.zoomActiveStatus(enabled, cameraStatus, handsDetected, pair, 'zoomIn', Math.max(0, this.smoothedZoom))
    }

    if (this.zoomSession === 'zoomOut') {
      if (pose !== 'palmsFacing' || !this.isApproaching(distanceDelta, leftDeltaX, rightDeltaX)) {
        this.clearZoomSession(currentDistance)
        return this.zoomIdleStatus(enabled, cameraStatus, handsDetected, pair)
      }
      this.smoothedZoom += (Math.min(0, distanceDelta) - this.smoothedZoom) * SMOOTHING
      return this.zoomActiveStatus(enabled, cameraStatus, handsDetected, pair, 'zoomOut', Math.min(0, this.smoothedZoom))
    }

    return this.zoomIdleStatus(enabled, cameraStatus, handsDetected, pair)
  }

  private getZoomPose(pair: TrackedHand[]): ZoomPose {
    const palmsForward = pair.every((hand) => hand.palmFacing)
    if (palmsForward) return 'palmsForward'
    const palmsFacing = Math.sign(pair[0].palmSide) !== Math.sign(pair[1].palmSide)
    return palmsFacing ? 'palmsFacing' : 'none'
  }

  private isSeparating(distanceDelta: number, leftDeltaX: number, rightDeltaX: number) {
    return distanceDelta > DEAD_ZONE && leftDeltaX < -HAND_MOTION_THRESHOLD && rightDeltaX > HAND_MOTION_THRESHOLD
  }

  private isApproaching(distanceDelta: number, leftDeltaX: number, rightDeltaX: number) {
    return distanceDelta < -DEAD_ZONE && leftDeltaX > HAND_MOTION_THRESHOLD && rightDeltaX < -HAND_MOTION_THRESHOLD
  }

  private zoomActiveStatus(
    enabled: boolean,
    cameraStatus: GestureStatus['cameraStatus'],
    handsDetected: number,
    pair: TrackedHand[],
    activeGesture: 'zoomIn' | 'zoomOut',
    zoomDelta: number,
  ): GestureStatus {
    return {
      enabled,
      cameraStatus,
      handsDetected,
      activeGesture,
      zoomHands: pair.map((hand) => hand.id),
      zoomDelta,
      rotateDelta: { x: 0, y: 0 },
    }
  }

  private zoomIdleStatus(
    enabled: boolean,
    cameraStatus: GestureStatus['cameraStatus'],
    handsDetected: number,
    pair: TrackedHand[],
  ): GestureStatus {
    return {
      enabled,
      cameraStatus,
      handsDetected,
      activeGesture: 'none',
      zoomHands: pair.map((hand) => hand.id),
      zoomDelta: 0,
      rotateDelta: { x: 0, y: 0 },
    }
  }

  private resetZoomForPose(pose: ZoomPose, now: number, pair: TrackedHand[]) {
    this.zoomPose = pose
    this.zoomPoseSince = now
    this.zoomSession = 'none'
    this.smoothedZoom = 0
    this.lastDistance = distance(pair[0].palmCenter, pair[1].palmCenter)
    this.lastPalmCenters.clear()
    this.lastPalmCenters.set(pair[0].id, pair[0].palmCenter)
    this.lastPalmCenters.set(pair[1].id, pair[1].palmCenter)
  }

  private resetZoomMomentum(currentDistance: number) {
    this.smoothedZoom = 0
    this.lastDistance = currentDistance
  }

  private clearZoomSession(currentDistance: number) {
    this.zoomSession = 'none'
    this.resetZoomMomentum(currentDistance)
  }

  private clearZoom() {
    this.zoomPose = 'none'
    this.zoomPoseSince = 0
    this.zoomSession = 'none'
    this.lastDistance = undefined
    this.lastPalmCenters.clear()
    this.smoothedZoom = 0
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
    this.clearZoom()
    this.clearRotation()
  }
}
