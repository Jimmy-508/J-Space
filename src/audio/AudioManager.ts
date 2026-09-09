type AudioContextConstructor = typeof AudioContext

type AudioWindow = Window & typeof globalThis & {
  webkitAudioContext?: AudioContextConstructor
}

export class AudioManager {
  private context?: AudioContext
  private selectBuffer?: AudioBuffer
  private gain?: GainNode
  private fallbackAudio?: HTMLAudioElement
  private musicAudio?: HTMLAudioElement
  private musicObjectUrl?: string
  private decodePromise?: Promise<void>
  private sfxVolume = 0.58
  private musicVolume = 0

  init(selectSoundUrl: string) {
    this.fallbackAudio = new Audio(selectSoundUrl)
    this.fallbackAudio.preload = 'auto'
    this.fallbackAudio.volume = this.sfxVolume
    this.fallbackAudio.load()

    if (typeof window === 'undefined') return

    const AudioContextCtor = window.AudioContext ?? (window as AudioWindow).webkitAudioContext
    if (!AudioContextCtor) return

    this.context = new AudioContextCtor()
    this.gain = this.context.createGain()
    this.gain.gain.value = this.sfxVolume
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
    this.playBackgroundMusic()
  }

  playSelect() {
    if (this.sfxVolume <= 0) return
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
    fallbackAudio.volume = this.sfxVolume
    fallbackAudio.play().catch((error: unknown) => {
      console.debug('Select sound playback was blocked or interrupted.', error)
    })
  }

  setSfxVolume(volume: number) {
    this.sfxVolume = Math.max(0, Math.min(1, volume))
    if (this.gain) this.gain.gain.value = this.sfxVolume
    if (this.fallbackAudio) this.fallbackAudio.volume = this.sfxVolume
  }

  setMusicVolume(volume: number) {
    this.musicVolume = Math.max(0, Math.min(1, volume))
    if (this.musicAudio) {
      this.musicAudio.volume = this.musicVolume
      if (this.musicVolume <= 0) this.musicAudio.pause()
      else this.playBackgroundMusic()
    }
  }

  setBackgroundMusic(blob?: Blob) {
    if (this.musicAudio) {
      this.musicAudio.pause()
      this.musicAudio.src = ''
    }
    if (this.musicObjectUrl) URL.revokeObjectURL(this.musicObjectUrl)
    this.musicAudio = undefined
    this.musicObjectUrl = undefined
    if (!blob) return

    const objectUrl = URL.createObjectURL(blob)
    const audio = new Audio(objectUrl)
    audio.loop = true
    audio.preload = 'auto'
    audio.volume = this.musicVolume
    audio.load()
    this.musicObjectUrl = objectUrl
    this.musicAudio = audio
    if (this.musicVolume > 0) this.playBackgroundMusic()
  }

  private playBackgroundMusic() {
    if (!this.musicAudio || this.musicVolume <= 0) return
    this.musicAudio.play().catch((error: unknown) => {
      console.debug('Background music playback is waiting for user activation.', error)
    })
  }

  dispose() {
    this.fallbackAudio?.pause()
    this.fallbackAudio = undefined
    this.musicAudio?.pause()
    this.musicAudio = undefined
    if (this.musicObjectUrl) URL.revokeObjectURL(this.musicObjectUrl)
    this.musicObjectUrl = undefined
    this.selectBuffer = undefined
    this.gain?.disconnect()
    this.gain = undefined
    this.decodePromise = undefined
    this.context?.close().catch(() => undefined)
    this.context = undefined
  }
}
