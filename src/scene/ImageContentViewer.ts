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

export class ImageContentViewer3D {
  readonly root = new THREE.Group()
  readonly content = new THREE.Group()

  private readonly camera: THREE.PerspectiveCamera
  private readonly backdrop: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>
  private texture?: THREE.Texture
  private panelObjects: THREE.Object3D[] = []
  private resetTransition?: ResetTransition
  private entranceStartedAt = performance.now()
  private disposed = false
  private imageAspect = 1
  private glowMaterial?: THREE.MeshBasicMaterial
  private entranceComplete = false

  get ready() {
    return this.panelObjects.length > 0
  }

  get scale() {
    return this.content.scale.x
  }

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera
    this.root.renderOrder = 80
    this.content.position.set(0, 0, -VIEWER_DISTANCE)
    this.content.scale.setScalar(0.08)
    this.root.add(this.content)

    this.backdrop = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        color: 0x01040b,
        transparent: true,
        opacity: 0.58,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      }),
    )
    this.backdrop.position.z = -VIEWER_DISTANCE - 1.4
    this.backdrop.renderOrder = 80
    this.root.add(this.backdrop)
    this.camera.add(this.root)
    this.resize()
  }

  async load(imageUrl: string): Promise<void> {
    const loader = new THREE.TextureLoader()
    loader.setCrossOrigin('anonymous')
    const texture = await loader.loadAsync(imageUrl)
    if (this.disposed) {
      texture.dispose()
      return
    }

    const image = texture.image as { naturalWidth?: number; naturalHeight?: number; width?: number; height?: number }
    const width = image.naturalWidth ?? image.width ?? 1
    const height = image.naturalHeight ?? image.height ?? 1
    this.imageAspect = Math.max(0.05, width / Math.max(1, height))
    texture.colorSpace = THREE.SRGBColorSpace
    texture.anisotropy = 2
    const maxEdge = Math.max(width, height)
    texture.generateMipmaps = maxEdge <= 2560
    texture.minFilter = texture.generateMipmaps ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter
    texture.magFilter = THREE.LinearFilter
    texture.needsUpdate = true
    this.texture = texture
    this.buildPanel()
    this.resize()
    this.entranceStartedAt = performance.now()
    this.entranceComplete = false
  }

  private buildPanel() {
    if (!this.texture) return
    this.disposePanel()

    const frontMaterial = new THREE.MeshBasicMaterial({
      map: this.texture,
      transparent: true,
      opacity: 0,
      side: THREE.FrontSide,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    })
    const front = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), frontMaterial)
    front.position.z = 0.025
    front.renderOrder = 102

    const back = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        color: 0x071426,
        transparent: true,
        opacity: 0.94,
        side: THREE.FrontSide,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      }),
    )
    back.position.z = -0.025
    back.rotation.y = Math.PI
    back.renderOrder = 101

    this.glowMaterial = new THREE.MeshBasicMaterial({
      color: 0x9fcfff,
      transparent: true,
      opacity: 0.2,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    })
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.glowMaterial)
    glow.position.z = -0.035
    glow.renderOrder = 100

    this.panelObjects = [glow, back, front]
    this.panelObjects.forEach((object) => this.content.add(object))
  }

  resize() {
    const visibleHeight = 2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov * 0.5)) * VIEWER_DISTANCE
    const visibleWidth = visibleHeight * this.camera.aspect
    const maxWidth = visibleWidth * (this.camera.aspect < 0.8 ? 0.86 : 0.74)
    const maxHeight = visibleHeight * (this.camera.aspect < 0.8 ? 0.6 : 0.72)
    const panelWidth = Math.min(maxWidth, maxHeight * this.imageAspect)
    const panelHeight = panelWidth / this.imageAspect

    this.panelObjects.forEach((object, index) => {
      if (!(object instanceof THREE.Mesh)) return
      object.scale.set(
        panelWidth + (index === 0 ? 0.14 : 0),
        panelHeight + (index === 0 ? 0.14 : 0),
        1,
      )
    })
    const backdropHeight = 2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov * 0.5)) * (VIEWER_DISTANCE + 1.4)
    this.backdrop.scale.set(backdropHeight * this.camera.aspect * 1.04, backdropHeight * 1.04, 1)
  }

  rotateBy(dx: number, dy: number) {
    this.cancelReset()
    this.entranceComplete = true
    this.content.rotation.y += dx * 0.006
    this.content.rotation.x += dy * 0.004
  }

  panByPixels(dx: number, dy: number, viewportWidth: number, viewportHeight: number) {
    this.cancelReset()
    this.entranceComplete = true
    const visibleHeight = 2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov * 0.5)) * VIEWER_DISTANCE
    const visibleWidth = visibleHeight * this.camera.aspect
    this.content.position.x += dx * (visibleWidth / Math.max(1, viewportWidth))
    this.content.position.y -= dy * (visibleHeight / Math.max(1, viewportHeight))
  }

  zoomBy(factor: number) {
    this.cancelReset()
    this.entranceComplete = true
    const next = THREE.MathUtils.clamp(this.content.scale.x * factor, 0.38, 4.2)
    this.content.scale.setScalar(next)
  }

  setScale(scale: number) {
    this.cancelReset()
    this.entranceComplete = true
    this.content.scale.setScalar(THREE.MathUtils.clamp(scale, 0.38, 4.2))
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
    } else if (!this.entranceComplete && this.panelObjects.length && this.content.scale.x < 0.999) {
      const progress = THREE.MathUtils.clamp((nowMs - this.entranceStartedAt) / 420, 0, 1)
      const eased = 1 - (1 - progress) ** 3
      this.content.scale.setScalar(Math.max(this.content.scale.x, 0.08 + eased * 0.92))
      if (progress >= 1) this.entranceComplete = true
    }

    const front = this.panelObjects[2]
    if (front instanceof THREE.Mesh) {
      const material = front.material as THREE.MeshBasicMaterial
      material.opacity = Math.min(1, Math.max(0, (nowMs - this.entranceStartedAt) / 260))
    }
    if (this.glowMaterial) {
      this.glowMaterial.opacity = 0.16 + (Math.sin(nowMs * 0.0014) * 0.5 + 0.5) * 0.08
    }
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    this.camera.remove(this.root)
    this.disposePanel()
    this.texture?.dispose()
    this.texture = undefined
    this.backdrop.geometry.dispose()
    this.backdrop.material.dispose()
    this.root.clear()
  }

  private disposePanel() {
    this.panelObjects.forEach((object) => {
      this.content.remove(object)
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose()
        const materials = Array.isArray(object.material) ? object.material : [object.material]
        materials.forEach((material) => material.dispose())
      }
    })
    this.panelObjects = []
    this.glowMaterial = undefined
  }
}
