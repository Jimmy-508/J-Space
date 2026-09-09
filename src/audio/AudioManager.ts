type AudioContextConstructor = typeof AudioContext

type AudioWindow = Window & typeof globalThis & {
  webkitAudioContext?: AudioContextConstructor
}

export class AudioManager {
  private context?: AudioContext
  private selectBuffer?: AudioBuffer
  private gain?: GainNode
  private fallbackAudio?: HTMLAudioElement
  private decodePromise?: Promise<void>

  init(selectSoundUrl: string) {
    this.fallbackAudio = new Audio(selectSoundUrl)
    this.fallbackAudio.preload = 'auto'
    this.fallbackAudio.volume = 0.58
    this.fallbackAudio.load()

    if (typeof window === 'undefined') return

    const AudioContextCtor = window.AudioContext ?? (window as AudioWindow).webkitAudioContext
    if (!AudioContextCtor) return

    this.context = new AudioContextCtor()
    this.gain = this.context.createGain()
    this.gain.gain.value = 0.58
    this.gain.connect(this.context.destination)

    this.decodePromise = fetch(selectSoundUrl)
      .then((response) => response.arrayBuffer())
      .then((buffer) => this.context?.decodeAudioData(buffer))
      .then((decoded) => {
        this.selectBuffer = decoded
      })
      .catch((error: unknown) => {
        console.debug('Select sound decode failed; HTML audio fallback remains available.', error)
      })
  }

  unlock() {
    if (this.context?.state === 'suspended') {
      this.context.resume().catch((error: unknown) => {
        console.debug('Audio context unlock was blocked or interrupted.', error)
      })
    }
  }

  playSelect() {
    const context = this.context
    const gain = this.gain
    if (context && gain && this.selectBuffer && context.state === 'running') {
      const source = context.createBufferSource()
      source.buffer = this.selectBuffer
      source.connect(gain)
      source.start(0)
      return
    }

    const fallbackAudio = this.fallbackAudio
    if (!fallbackAudio) return
    fallbackAudio.currentTime = 0
    fallbackAudio.play().catch((error: unknown) => {
      console.debug('Select sound playback was blocked or interrupted.', error)
    })
  }

  dispose() {
    this.fallbackAudio?.pause()
    this.fallbackAudio = undefined
    this.selectBuffer = undefined
    this.gain?.disconnect()
    this.gain = undefined
    this.decodePromise = undefined
    this.context?.close().catch(() => undefined)
    this.context = undefined
  }
}
