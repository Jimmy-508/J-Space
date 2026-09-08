import type { GestureStatus, TrackedHand } from './gestureTypes'

const FIST_HOLD_MS = 260
const COOLDOWN_MS = 900
const LOST_GRACE_MS = 450

export class GestureStateMachine {
  private fistSince = new Map<string, number>()
  private lastSeen = new Map<string, number>()
  private lastTrigger = 0
  private summonHand?: string
  private pointerHand?: string
  private radialMenuOpen = false

  update(hands: TrackedHand[], now: number, enabled: boolean, cameraStatus: GestureStatus['cameraStatus']): GestureStatus {
    const visibleIds = new Set(hands.map((hand) => hand.id))
    hands.forEach((hand) => this.lastSeen.set(hand.id, now))

    for (const [id, seenAt] of this.lastSeen) {
      if (!visibleIds.has(id) && now - seenAt > LOST_GRACE_MS) {
        this.fistSince.delete(id)
        if (this.summonHand === id) this.summonHand = undefined
        if (this.pointerHand === id) this.pointerHand = undefined
      }
    }

    hands.forEach((hand) => {
      if (hand.gesture === 'fist') {
        if (!this.fistSince.has(hand.id)) this.fistSince.set(hand.id, now)
      } else {
        this.fistSince.delete(hand.id)
      }
    })

    const fistHand = hands.find((hand) => {
      const since = this.fistSince.get(hand.id)
      return since !== undefined && now - since >= FIST_HOLD_MS
    })

    if (fistHand && now - this.lastTrigger > COOLDOWN_MS) {
      this.summonHand = fistHand.id
      this.radialMenuOpen = true
      this.lastTrigger = now
    }

    const pointer = hands.find((hand) => hand.id !== this.summonHand && hand.gesture === 'index') ??
      hands.find((hand) => hand.gesture === 'index')
    this.pointerHand = pointer?.id

    return {
      enabled,
      cameraStatus,
      handsDetected: hands.length,
      activeGesture: fistHand?.gesture ?? pointer?.gesture ?? 'none',
      summonHand: this.summonHand,
      pointerHand: this.pointerHand,
      pointer: pointer?.pointer,
      radialMenuOpen: this.radialMenuOpen,
    }
  }

  closeRadialMenu() {
    this.radialMenuOpen = false
  }
}
