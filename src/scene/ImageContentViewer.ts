import * as THREE from 'three'

type ResetTransition = {
  startedAt: number
  duration: number
  fromPosition: THREE.Vector3
  fromQuaternion: THREE.Quaternion
  fromScale: THREE.Vector3
}

export type ImageViewerLoadState = 'idle' | 'loading' | 'ready' | 'error'

const VIEWER_DISTANCE = 10
const RESET_DURATION_MS = 460
const GESTURE_ZOOM_MAX_CAMERA_STEP = 0.65
const GESTURE_ZOOM_SCALE_STEP = 0.0075

export class ImageContentViewer3D {
  readonly content = new THREE.Group()

  private readonly camera: THREE.PerspectiveCamera
  private readonly mount: HTMLElement
  private readonly layer: HTMLDivElement
  private readonly transform: HTMLDivElement
  private readonly image: HTMLImageElement
  private resetTransition?: ResetTransition
  private entranceStartedAt = performance.now()
  private disposed = false
  private imageAspect = 1
  private entranceComplete = false
  private loaded = false
  private panelWidth = 1
  private panelHeight = 1
  private revealFrame?: number

  get ready() {
    return this.loaded
  }

  get scale() {
    return this.content.scale.x
  }

  constructor(camera: THREE.PerspectiveCamera, mount: HTMLElement) {
    this.camera = camera
    this.mount = mount
    this.content.position.set(0, 0, -VIEWER_DISTANCE)
    this.content.scale.setScalar(0.08)

    this.layer = document.createElement('div')
    this.layer.className = 'image-viewer-dom-layer'
    this.layer.hidden = true
    this.layer.style.visibility = 'hidden'
    this.transform = document.createElement('div')
    this.transform.className = 'image-viewer-transform'
    this.image = document.createElement('img')
    this.image.className = 'image-viewer-image'
    this.image.alt = ''
    this.image.draggable = false
    this.transform.append(this.image)
    this.layer.append(this.transform)
    document.body.append(this.layer)
    this.resize()
  }

  async load(imageUrl: string): Promise<void> {
    this.cancelReveal()
    this.loaded = false
    this.layer.hidden = true
    this.layer.style.visibility = 'hidden'
    await new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        this.image.onload = null
        this.image.onerror = null
      }
      this.image.onload = () => {
        cleanup()
        resolve()
      }
      this.image.onerror = () => {
        cleanup()
        reject(new Error('Image viewer source failed to load'))
      }
      this.image.src = imageUrl
      if (this.image.complete && this.image.naturalWidth > 0) {
        cleanup()
        resolve()
      }
    })
    if (this.disposed) return

    this.imageAspect = Math.max(0.05, this.image.naturalWidth / Math.max(1, this.image.naturalHeight))
    this.loaded = true
    this.entranceStartedAt = performance.now()
    this.entranceComplete = false
    this.layer.hidden = false
    this.resize()
    this.syncDom(this.entranceStartedAt)
    this.revealFrame = requestAnimationFrame(() => {
      this.revealFrame = requestAnimationFrame(() => {
        this.revealFrame = undefined
        if (!this.disposed && this.loaded) this.layer.style.visibility = 'visible'
      })
    })
  }

  resize() {
    const visibleHeight = 2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov * 0.5)) * VIEWER_DISTANCE
    const visibleWidth = visibleHeight * this.camera.aspect
    const maxWidth = visibleWidth * (this.camera.aspect < 0.8 ? 0.86 : 0.74)
    const maxHeight = visibleHeight * (this.camera.aspect < 0.8 ? 0.6 : 0.72)
    this.panelWidth = Math.min(maxWidth, maxHeight * this.imageAspect)
    this.panelHeight = this.panelWidth / this.imageAspect
    this.syncDom(performance.now())
  }

  rotateBy(dx: number, dy: number) {
    this.rotateByRadians(dx * 0.006, dy * -0.004)
  }

  rotateByRadians(yaw: number, pitch: number) {
    this.cancelReset()
    this.entranceComplete = true
    this.content.rotation.y += yaw
    this.content.rotation.x += pitch
  }

  panByPixels(dx: number, dy: number, viewportWidth: number, viewportHeight: number) {
    this.cancelReset()
    this.entranceComplete = true
    const visibleHeight = 2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov * 0.5)) * VIEWER_DISTANCE
    const visibleWidth = visibleHeight * this.camera.aspect
    this.content.position.x += dx * (visibleWidth / Math.max(1, viewportWidth))
    this.content.position.y -= dy * (visibleHeight / Math.max(1, viewportHeight))
  }

  panByGesturePixels(dx: number, dy: number, viewportWidth: number, viewportHeight: number) {
    this.panByPixels(dx * 2.6, dy * 2.6, viewportWidth, viewportHeight)
  }

  zoomBy(factor: number) {
    this.cancelReset()
    this.entranceComplete = true
    const next = THREE.MathUtils.clamp(this.content.scale.x * factor, 0.38, 6.0)
    this.content.scale.setScalar(next)
  }

  zoomByGestureStep(cameraZoomStep: number, deltaTimeMs: number) {
    this.cancelReset()
    this.entranceComplete = true
    const frameScale = THREE.MathUtils.clamp(deltaTimeMs / (1000 / 60), 0.5, 1.5)
    const normalizedStep = THREE.MathUtils.clamp(cameraZoomStep / GESTURE_ZOOM_MAX_CAMERA_STEP, -1, 1)
    const next = THREE.MathUtils.clamp(
      this.content.scale.x + normalizedStep * GESTURE_ZOOM_SCALE_STEP * frameScale,
      0.38,
      6.0,
    )
    this.content.scale.setScalar(next)
  }

  setScale(scale: number) {
    this.cancelReset()
    this.entranceComplete = true
    this.content.scale.setScalar(THREE.MathUtils.clamp(scale, 0.38, 6.0))
  }

  reset() {
    this.entranceComplete = true
    this.resetTransition = {
      startedAt: performance.now(),
      duration: RESET_DURATION_MS,
      fromPosition: this.content.position.clone(),
      fromQuaternion: this.content.quaternion.clone(),
      fromScale: this.content.scale.clone(),
    }
  }

  cancelReset() {
    this.resetTransition = undefined
  }

  update(nowMs: number) {
    if (this.resetTransition) {
      const progress = THREE.MathUtils.clamp((nowMs - this.resetTransition.startedAt) / this.resetTransition.duration, 0, 1)
      const eased = 1 - (1 - progress) ** 3
      this.content.position.lerpVectors(this.resetTransition.fromPosition, new THREE.Vector3(0, 0, -VIEWER_DISTANCE), eased)
      this.content.quaternion.slerpQuaternions(this.resetTransition.fromQuaternion, new THREE.Quaternion(), eased)
      this.content.scale.lerpVectors(this.resetTransition.fromScale, new THREE.Vector3(1, 1, 1), eased)
      if (progress >= 1) this.resetTransition = undefined
    } else if (!this.entranceComplete && this.loaded && this.content.scale.x < 0.999) {
      const progress = THREE.MathUtils.clamp((nowMs - this.entranceStartedAt) / 420, 0, 1)
      const eased = 1 - (1 - progress) ** 3
      this.content.scale.setScalar(Math.max(this.content.scale.x, 0.08 + eased * 0.92))
      if (progress >= 1) this.entranceComplete = true
    }
    this.syncDom(nowMs)
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    this.cancelReveal()
    this.image.onload = null
    this.image.onerror = null
    this.layer.remove()
    this.image.removeAttribute('src')
  }

  private cancelReveal() {
    if (this.revealFrame === undefined) return
    cancelAnimationFrame(this.revealFrame)
    this.revealFrame = undefined
  }

  private syncDom(nowMs: number) {
    if (!this.loaded || this.disposed) return
    const visibleHeight = 2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov * 0.5)) * VIEWER_DISTANCE
    const visibleWidth = visibleHeight * this.camera.aspect
    const viewportWidth = Math.max(1, this.mount.clientWidth)
    const viewportHeight = Math.max(1, this.mount.clientHeight)
    const width = (this.panelWidth / visibleWidth) * viewportWidth
    const height = (this.panelHeight / visibleHeight) * viewportHeight
    const translateX = (this.content.position.x / visibleWidth) * viewportWidth
    const translateY = (-this.content.position.y / visibleHeight) * viewportHeight
    const focalLength = viewportHeight / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov * 0.5)))
    const rotation = this.content.rotation

    this.transform.style.width = `${width}px`
    this.transform.style.height = `${height}px`
    this.transform.style.transform = `perspective(${focalLength}px) translate3d(${translateX}px, ${translateY}px, 0) rotateX(${rotation.x}rad) rotateY(${rotation.y}rad) scale(${this.content.scale.x})`
  }
}
