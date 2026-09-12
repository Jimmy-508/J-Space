import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision'
import { clampPoint } from './coordinateTransform'
import { detectGesture, getPalmCenter, getPalmSide, getPalmSize, getPointerPoint, isPalmFacingCamera } from './gestureDetector'
import type { TrackedHand } from './gestureTypes'

const MIN_HAND_CONFIDENCE = 0.58
const REQUIRED_LANDMARKS = 21

export class HandTrackingSession {
  private landmarker?: HandLandmarker
  private stream?: MediaStream
  private video?: HTMLVideoElement
  private running = false

  async start(video: HTMLVideoElement, onHands: (hands: TrackedHand[]) => void) {
    this.video = video
    const vision = await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/wasm')
    this.landmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
        delegate: 'GPU',
      },
      runningMode: 'VIDEO',
      numHands: 2,
    })
    this.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false })
    video.srcObject = this.stream
    await video.play()
    this.running = true

    const tick = () => {
      if (!this.running || !this.landmarker || !this.video) return
      const result = this.landmarker.detectForVideo(this.video, performance.now())
      const handsBySide = new Map<string, TrackedHand>()
      ;(result.landmarks ?? []).forEach((landmarks, index) => {
        const category = result.handednesses?.[index]?.[0]
        const handedness = category?.categoryName ?? `hand-${index}`
        const trackingConfidence = category?.score ?? 1
        if (landmarks.length < REQUIRED_LANDMARKS || trackingConfidence < MIN_HAND_CONFIDENCE) return
        const hand = {
          id: handedness,
          handedness,
          trackingConfidence,
          gesture: detectGesture(landmarks),
          pointer: clampPoint(getPointerPoint(landmarks)),
          landmarks: landmarks.map((point) => clampPoint({ x: point.x, y: point.y })),
          palmCenter: clampPoint(getPalmCenter(landmarks)),
          palmSize: getPalmSize(landmarks),
          palmFacing: isPalmFacingCamera(landmarks),
          palmSide: getPalmSide(landmarks),
        } satisfies TrackedHand
        const current = handsBySide.get(handedness)
        if (!current || (current.trackingConfidence ?? 0) < trackingConfidence) {
          handsBySide.set(handedness, hand)
        }
      })
      const hands = [...handsBySide.values()]
      onHands(hands)
      requestAnimationFrame(tick)
    }
    tick()
  }

  stop() {
    this.running = false
    this.stream?.getTracks().forEach((track) => track.stop())
    this.stream = undefined
    if (this.video) this.video.srcObject = null
    this.landmarker?.close()
    this.landmarker = undefined
  }
}
