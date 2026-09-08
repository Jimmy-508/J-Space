import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision'
import { clampPoint } from './coordinateTransform'
import { detectGesture, getPointerPoint } from './gestureDetector'
import type { TrackedHand } from './gestureTypes'

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
      const hands: TrackedHand[] = (result.landmarks ?? []).map((landmarks, index) => {
        const handedness = result.handednesses?.[index]?.[0]?.categoryName ?? `hand-${index}`
        return {
          id: handedness,
          handedness,
          gesture: detectGesture(landmarks),
          pointer: clampPoint(getPointerPoint(landmarks)),
        }
      })
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
