type AudioContextConstructor = typeof AudioContext

type AudioWindow = Window & typeof globalThis & {
  webkitAudioContext?: AudioContextConstructor
}

export class AudioManager {
  private context?: AudioContext
  private buffers = new Map<string, AudioBuffer>()
  private activeSources = new Map<string, AudioBufferSourceNode[]>()
  private gain?: GainNode
  private fallbackAudios = new Map<string, HTMLAudioElement>()
  private musicAudio?: HTMLAudioElement
  private musicObjectUrl?: string
  private decodePromises: Promise<void>[] = []
  private sfxVolume = 0.58
  private musicVolume = 0

  init(selectSoundUrl: string, effectUrls: Record<string, string> = {}) {
    if (typeof window === 'undefined') return

    const AudioContextCtor = window.AudioContext ?? (window as AudioWindow).webkitAudioContext
    const urls = { select: selectSoundUrl, ...effectUrls }
    Object.entries(urls).forEach(([key, url]) => {
      const audio = new Audio(url)
      audio.preload = 'auto'
      audio.volume = this.sfxVolume
      audio.load()
      this.fallbackAudios.set(key, audio)
    })

    if (!AudioContextCtor) return

    this.context = new AudioContextCtor()
    this.gain = this.context.createGain()
    this.gain.gain.value = this.sfxVolume
    this.gain.connect(this.context.destination)

    this.decodePromises = Object.entries(urls).map(([key, url]) =>
      fetch(url)
        .then((response) => response.arrayBuffer())
        .then((buffer) => this.context?.decodeAudioData(buffer))
        .then((decoded) => {
          if (decoded) this.buffers.set(key, decoded)
        })
        .catch((error: unknown) => {
          console.debug(`${key} sound decode failed; HTML audio fallback remains available.`, error)
        }),
    )
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
    this.playEffect('select')
  }

  playSummonCharge() {
    this.stopEffect('summonCharge')
    this.playEffect('summonCharge')
  }

  playSummonShatter() {
    this.stopEffect('summonCharge')
    this.playEffect('summonShatter')
  }

  private playEffect(key: string) {
    if (this.sfxVolume <= 0) return
    const context = this.context
    const gain = this.gain
    const buffer = this.buffers.get(key)
    if (context && gain && buffer && context.state === 'running') {
      const source = context.createBufferSource()
      source.buffer = buffer
      source.connect(gain)
      const sources = this.activeSources.get(key) ?? []
      sources.push(source)
      this.activeSources.set(key, sources)
      source.onended = () => {
        this.activeSources.set(key, (this.activeSources.get(key) ?? []).filter((item) => item !== source))
      }
      source.start(0)
      return
    }

    const fallbackAudio = this.fallbackAudios.get(key)
    if (!fallbackAudio) return
    fallbackAudio.currentTime = 0
    fallbackAudio.volume = this.sfxVolume
    fallbackAudio.play().catch((error: unknown) => {
      console.debug(`${key} sound playback was blocked or interrupted.`, error)
    })
  }

  private stopEffect(key: string) {
    ;(this.activeSources.get(key) ?? []).forEach((source) => {
      try {
        source.stop()
      } catch {
        // The source may have already ended naturally.
      }
    })
    this.activeSources.delete(key)
    const fallbackAudio = this.fallbackAudios.get(key)
    if (fallbackAudio) {
      fallbackAudio.pause()
      fallbackAudio.currentTime = 0
    }
  }

  setSfxVolume(volume: number) {
    this.sfxVolume = Math.max(0, Math.min(1, volume))
    if (this.gain) this.gain.gain.value = this.sfxVolume
    this.fallbackAudios.forEach((audio) => {
      audio.volume = this.sfxVolume
    })
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
    this.fallbackAudios.forEach((audio) => audio.pause())
    this.fallbackAudios.clear()
    this.activeSources.forEach((sources) => {
      sources.forEach((source) => {
        try {
          source.stop()
        } catch {
          // Ignore already-stopped sources during teardown.
        }
      })
    })
    this.activeSources.clear()
    this.musicAudio?.pause()
    this.musicAudio = undefined
    if (this.musicObjectUrl) URL.revokeObjectURL(this.musicObjectUrl)
    this.musicObjectUrl = undefined
    this.buffers.clear()
    this.gain?.disconnect()
    this.gain = undefined
    this.decodePromises = []
    this.context?.close().catch(() => undefined)
    this.context = undefined
  }
}
