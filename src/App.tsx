import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from 'react'
import { AudioManager } from './audio/AudioManager'
import { clearBackgroundMusic, loadBackgroundMusic, saveBackgroundMusic } from './audio/audioStorage'
import NodeForm from './components/NodeForm'
import RelationForm from './components/RelationForm'
import { normalizedToCoverViewport } from './gesture/coordinateTransform'
import { GestureStateMachine } from './gesture/gestureStateMachine'
import { HandTrackingSession } from './gesture/handTracking'
import { firestoreKnowledgeRepository } from './repository/firestoreKnowledgeRepository'
import { knowledgeRepository } from './repository/knowledgeRepository'
import KnowledgeGraph3D from './scene/KnowledgeGraph3D'
import type { ImageViewerLoadState } from './scene/ImageContentViewer'
import NodeHUD from './scene/NodeHUD'
import type { KnowledgeData, KnowledgeLink, KnowledgeNode } from './types/knowledge'
import { openExternalLink } from './utils/navigation'
import type { GestureStatus, TrackedHand } from './gesture/gestureTypes'
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth'
import { auth } from './firebase'

const emptyGestureStatus = (enabled = false): GestureStatus => ({
  enabled,
  cameraStatus: enabled ? 'requesting' : 'idle',
  handsDetected: 0,
  activeGesture: 'none',
  zoomDelta: 0,
  panDelta: { x: 0, y: 0 },
  rotateDelta: { x: 0, y: 0 },
})

const handConnections = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [0, 9], [9, 10], [10, 11], [11, 12],
  [0, 13], [13, 14], [14, 15], [15, 16],
  [0, 17], [17, 18], [18, 19], [19, 20],
  [5, 9], [9, 13], [13, 17],
]

type ScreenPoint = { x: number; y: number }

const distance2d = (a: ScreenPoint, b: ScreenPoint) => Math.hypot(a.x - b.x, a.y - b.y)

const createStarPoints = (center: ScreenPoint, outerRadius: number, innerRadius: number) =>
  Array.from({ length: 16 }, (_, index) => {
    const angle = -Math.PI / 2 + (index / 16) * Math.PI * 2
    const radius = index % 2 === 0 ? outerRadius : innerRadius
    return `${center.x + Math.cos(angle) * radius},${center.y + Math.sin(angle) * radius}`
  }).join(' ')

type SelectionSource = 'touch' | 'mouse' | 'pointerGesture' | 'search' | 'relation' | undefined
const SELECT_SOUND_URL = `${import.meta.env.BASE_URL}audio/03_select_confirm.wav`
const SETTINGS_KEY = 'j-space-settings'
const ADMIN_UID = 'x5fcAreao0OaxqWp56p1gAf17hf2'
const GESTURE_UI_DWELL_MS = 720
const GESTURE_UI_COOLDOWN_MS = 1000

type AppSettings = {
  musicVolume: number
  sfxVolume: number
  backgroundMusicName?: string
  hasBackgroundMusic?: boolean
  musicVolumeTouched?: boolean
}

const loadSettings = (): AppSettings => {
  if (typeof localStorage === 'undefined') return { musicVolume: 0, sfxVolume: 80 }
  try {
    const saved = localStorage.getItem(SETTINGS_KEY)
    if (!saved) return { musicVolume: 0, sfxVolume: 80 }
    const parsed = JSON.parse(saved) as Partial<AppSettings>
    return {
      musicVolume: parsed.musicVolume ?? 0,
      sfxVolume: parsed.sfxVolume ?? 80,
      backgroundMusicName: parsed.backgroundMusicName,
      hasBackgroundMusic: parsed.hasBackgroundMusic ?? !!parsed.backgroundMusicName,
      musicVolumeTouched: parsed.musicVolumeTouched ?? false,
    }
  } catch {
    return { musicVolume: 0, sfxVolume: 80 }
  }
}

const createKnowledgeNode = (node: Omit<KnowledgeNode, 'id' | 'createdAt' | 'updatedAt'>): KnowledgeNode => {
  const timestamp = new Date().toISOString()
  return {
    ...node,
    id: crypto.randomUUID(),
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

const updateKnowledgeNode = (
  node: KnowledgeNode,
  patch: Partial<Omit<KnowledgeNode, 'id' | 'createdAt'>>,
): KnowledgeNode => ({
  ...node,
  ...patch,
  updatedAt: new Date().toISOString(),
})

const createKnowledgeLink = (link: Omit<KnowledgeLink, 'id'>): KnowledgeLink => ({
  ...link,
  id: crypto.randomUUID(),
})

const getFirebaseErrorText = (error: unknown, fallback: string) => {
  if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string') {
    return error.code
  }
  if (error instanceof Error) return error.message
  return fallback
}

function HandEnergyOverlay({
  hands,
  status,
  videoSize,
  viewportSize,
  uiDwellActive,
  uiDwellProgress,
}: {
  hands: TrackedHand[]
  status: GestureStatus
  videoSize: { width: number; height: number }
  viewportSize: { width: number; height: number }
  uiDwellActive: boolean
  uiDwellProgress: number
}) {
  const cursorTrailsRef = useRef(new Map<string, ScreenPoint[]>())
  if (!status.enabled || status.cameraStatus !== 'ready') {
    cursorTrailsRef.current.clear()
    return null
  }
  const activeIds = new Set([...(status.zoomHands ?? []), ...(status.panHands ?? []), status.pointerHand, status.rotationHand].filter(Boolean) as string[])
  const pointerIds = new Set(status.pointerHand ? [status.pointerHand] : [])
  for (const id of cursorTrailsRef.current.keys()) {
    if (!pointerIds.has(id)) cursorTrailsRef.current.delete(id)
  }
  const pointerCursors = status.activeGesture === 'pointer' && status.pointerHand && status.pointerPoint ? [{
    id: status.pointerHand,
    pointerPoint: status.pointerPoint,
  }].map(({ id, pointerPoint }) => {
    const fingertip = normalizedToCoverViewport(pointerPoint, videoSize, viewportSize, true)
    const trail = cursorTrailsRef.current.get(id) ?? []
    const latest = trail[0]
    if (!latest || distance2d(latest, fingertip) > 1.15) {
      trail.unshift(fingertip)
    } else {
      trail[0] = fingertip
      if (trail.length > 1) trail.pop()
    }
    trail.length = Math.min(trail.length, 10)
    cursorTrailsRef.current.set(id, trail)
    return { id, point: fingertip, trail: [...trail] }
  }) : []
  return (
    <svg
      className="hand-energy-layer"
      viewBox={`0 0 ${viewportSize.width} ${viewportSize.height}`}
      aria-hidden="true"
    >
      {hands.map((hand) => {
        const active = activeIds.has(hand.id)
        const points = hand.landmarks.map((point) => normalizedToCoverViewport(point, videoSize, viewportSize, true))
        return (
          <g key={hand.id} className={`hand-energy ${active ? 'active' : ''} ${hand.gesture}`}>
            {handConnections.map(([from, to]) => points[from] && points[to] ? (
              <line
                key={`${from}-${to}`}
                x1={points[from].x}
                y1={points[from].y}
                x2={points[to].x}
                y2={points[to].y}
              />
            ) : null)}
            {points.map((point, index) => (
              <circle key={index} cx={point.x} cy={point.y} r={active ? 4.4 : 3.1} />
            ))}
          </g>
        )
      })}
      {pointerCursors.map((cursor) => (
        <g key={`cursor-${cursor.id}`} className="star-cursor">
          {cursor.trail.slice(1).map((point, index) => (
            <circle
              key={index}
              className="star-cursor-trail"
              cx={point.x}
              cy={point.y}
              r={Math.max(1.4, 7.2 - index * 0.58)}
              opacity={Math.max(0, 0.48 - index * 0.048)}
            />
          ))}
          <circle className="star-cursor-outer-halo" cx={cursor.point.x} cy={cursor.point.y} r="30" />
          <circle className="star-cursor-halo" cx={cursor.point.x} cy={cursor.point.y} r="22" />
          <polygon className="star-cursor-flare" points={createStarPoints(cursor.point, 24, 2.7)} />
          <polygon className="star-cursor-core" points={createStarPoints(cursor.point, 16.5, 5.6)} />
          <circle className="star-cursor-center" cx={cursor.point.x} cy={cursor.point.y} r="4.6" />
          {uiDwellActive ? (
            <circle
              className="star-cursor-dwell"
              cx={cursor.point.x}
              cy={cursor.point.y}
              r="34"
              pathLength="1"
              strokeDasharray={`${uiDwellProgress} 1`}
            />
          ) : null}
          <circle className="star-cursor-sparkle sparkle-a" cx={cursor.point.x + 16} cy={cursor.point.y - 13} r="2" />
          <circle className="star-cursor-sparkle sparkle-b" cx={cursor.point.x - 14} cy={cursor.point.y + 11} r="1.7" />
          <circle className="star-cursor-sparkle sparkle-c" cx={cursor.point.x + 6} cy={cursor.point.y + 18} r="1.35" />
        </g>
      ))}
    </svg>
  )
}

export default function App() {
  const [data, setData] = useState<KnowledgeData>(() => knowledgeRepository.load())
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings())
  const [selectedId, setSelectedId] = useState<string>()
  const [, setSelectionSource] = useState<SelectionSource>()
  const [hoveredId, setHoveredId] = useState<string>()
  const [focusId, setFocusId] = useState<string>()
  const [viewerNodeId, setViewerNodeId] = useState<string>()
  const [viewerResetKey, setViewerResetKey] = useState(0)
  const [viewerLoadState, setViewerLoadState] = useState<ImageViewerLoadState>('idle')
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<KnowledgeNode | 'new'>()
  const [relationOpen, setRelationOpen] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [adminLoginOpen, setAdminLoginOpen] = useState(false)
  const [adminEmail, setAdminEmail] = useState('')
  const [adminPassword, setAdminPassword] = useState('')
  const [adminLoginError, setAdminLoginError] = useState('')
  const [adminLoggingIn, setAdminLoggingIn] = useState(false)
  const [firestoreUploading, setFirestoreUploading] = useState(false)
  const [firestoreUploadMessage, setFirestoreUploadMessage] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [gestureEnabled, setGestureEnabled] = useState(false)
  const [hands, setHands] = useState<TrackedHand[]>([])
  const [gestureStatus, setGestureStatus] = useState<GestureStatus>(() => emptyGestureStatus())
  const [immersive, setImmersive] = useState(false)
  const [controlResetKey, setControlResetKey] = useState(0)
  const [videoSize, setVideoSize] = useState({ width: 640, height: 480 })
  const [viewportSize, setViewportSize] = useState(() => ({
    width: typeof window === 'undefined' ? 390 : window.visualViewport?.width ?? window.innerWidth,
    height: typeof window === 'undefined' ? 844 : window.visualViewport?.height ?? window.innerHeight,
  }))
  const [gestureUiDwell, setGestureUiDwell] = useState({ active: false, progress: 0 })
  const musicInputRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const adminPressTimerRef = useRef<number | undefined>(undefined)
  const trackingRef = useRef<HandTrackingSession | undefined>(undefined)
  const gestureMachineRef = useRef(new GestureStateMachine())
  const idleTimerRef = useRef<number | undefined>(undefined)
  const selectedIdRef = useRef<string | undefined>(undefined)
  const viewerNodeIdRef = useRef<string | undefined>(undefined)
  const audioManagerRef = useRef<AudioManager | undefined>(undefined)
  const gestureUiDwellRef = useRef<{
    element?: HTMLElement
    since: number
    triggered: boolean
    cooldownUntil: number
  }>({ since: 0, triggered: false, cooldownUntil: 0 })
  const selected = data.nodes.find((node) => node.id === selectedId)
  const viewerNodeCandidate = data.nodes.find((node) => node.id === viewerNodeId)
  const viewerNode = viewerNodeCandidate?.contentType === 'image' && viewerNodeCandidate.imageUrl
    ? viewerNodeCandidate
    : undefined
  const results = useMemo(() => query.trim() ? data.nodes.filter((node) =>
    [node.title, node.category, node.description, ...(node.tags ?? [])].join(' ').toLowerCase().includes(query.toLowerCase()),
  ).slice(0, 8) : [], [data.nodes, query])
  const gesturePointerScreen = gestureStatus.activeGesture === 'pointer' && gestureStatus.pointerPoint
    ? normalizedToCoverViewport(gestureStatus.pointerPoint, videoSize, viewportSize, true)
    : undefined

  const persist = (next: KnowledgeData) => setData(next)
  const cacheFallbackData = useCallback((next: KnowledgeData) => {
    try {
      knowledgeRepository.save(next)
    } catch (error: unknown) {
      console.debug('Local fallback cache failed.', error)
    }
  }, [])
  const saveNodeToFirestore = useCallback(async (node: KnowledgeNode, fallbackData: KnowledgeData) => {
    try {
      await firestoreKnowledgeRepository.saveNode(node)
      cacheFallbackData(fallbackData)
      return true
    } catch (error: unknown) {
      console.error('Firestore save node failed:', error)
      alert(`Firestore 儲存失敗：${getFirebaseErrorText(error, '節點儲存失敗')}`)
      return false
    }
  }, [cacheFallbackData])
  const deleteNodeFromFirestore = useCallback(async (nodeId: string, fallbackData: KnowledgeData) => {
    try {
      await firestoreKnowledgeRepository.deleteNode(nodeId)
      cacheFallbackData(fallbackData)
      return true
    } catch (error: unknown) {
      console.error('Firestore delete node failed:', error)
      alert(`Firestore 儲存失敗：${getFirebaseErrorText(error, '節點刪除失敗')}`)
      return false
    }
  }, [cacheFallbackData])
  const saveConnectionToFirestore = useCallback(async (connection: KnowledgeLink, fallbackData: KnowledgeData) => {
    try {
      await firestoreKnowledgeRepository.saveConnection(connection)
      cacheFallbackData(fallbackData)
      return true
    } catch (error: unknown) {
      console.error('Firestore save connection failed:', error)
      alert(`Firestore 儲存失敗：${getFirebaseErrorText(error, '關聯儲存失敗')}`)
      return false
    }
  }, [cacheFallbackData])
  const deleteConnectionFromFirestore = useCallback(async (connectionId: string, fallbackData: KnowledgeData) => {
    try {
      await firestoreKnowledgeRepository.deleteConnection(connectionId)
      cacheFallbackData(fallbackData)
      return true
    } catch (error: unknown) {
      console.error('Firestore delete connection failed:', error)
      alert(`Firestore 儲存失敗：${getFirebaseErrorText(error, '關聯刪除失敗')}`)
      return false
    }
  }, [cacheFallbackData])
  const clearSelection = useCallback(() => {
    setSelectedId(undefined)
    setFocusId(undefined)
    setHoveredId(undefined)
    setSelectionSource(undefined)
    setViewerNodeId(undefined)
    setViewerLoadState('idle')
  }, [])
  const selectNode = useCallback((node: KnowledgeNode, source: Exclude<SelectionSource, undefined>) => {
    if (selectedIdRef.current !== node.id) {
      audioManagerRef.current?.playSelect()
    }
    setSelectedId(node.id)
    setFocusId(node.id)
    setSelectionSource(source)
    setViewerNodeId(node.contentType === 'image' && !!node.imageUrl ? node.id : undefined)
  }, [])
  const clearGestureUiDwell = useCallback(() => {
    gestureUiDwellRef.current.element?.classList.remove('gesture-dwell-hover')
    gestureUiDwellRef.current = { since: 0, triggered: false, cooldownUntil: 0 }
    setGestureUiDwell((current) => current.active || current.progress
      ? { active: false, progress: 0 }
      : current)
  }, [])
  const resetIdle = useCallback(() => {
    setImmersive(false)
    if (idleTimerRef.current) window.clearTimeout(idleTimerRef.current)
    idleTimerRef.current = window.setTimeout(() => setImmersive(true), 10000)
  }, [])
  const registerUserActivity = useCallback(() => {
    resetIdle()
    audioManagerRef.current?.unlock()
  }, [resetIdle])
  const playGestureUiClick = useCallback((target: HTMLElement) => {
    if (target.dataset.gestureClickSound === 'handled') return
    audioManagerRef.current?.playSelect()
  }, [])
  const getGestureUiTarget = useCallback((point: ScreenPoint) => {
    const hit = document.elementFromPoint(point.x, point.y)
    const target = hit?.closest<HTMLElement>('[data-gesture-clickable="true"]')
    if (!target) return undefined
    if (target instanceof HTMLButtonElement && target.disabled) return undefined
    if (target.closest('[aria-hidden="true"]')) return undefined
    return target
  }, [])
  const restoreDefaultSettings = useCallback(() => {
    clearBackgroundMusic().catch((error: unknown) => {
      console.debug('Background music reset failed.', error)
    })
    audioManagerRef.current?.setBackgroundMusic(undefined)
    setSettings({
      musicVolume: 0,
      sfxVolume: 80,
      hasBackgroundMusic: false,
      musicVolumeTouched: false,
    })
  }, [])

  const closeAdminLogin = useCallback(() => {
    setAdminLoginOpen(false)
    setAdminEmail('')
    setAdminPassword('')
    setAdminLoginError('')
    setAdminLoggingIn(false)
  }, [])

  const handleAdminLogin = useCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setAdminLoginError('')
    setAdminLoggingIn(true)
    try {
      const credential = await signInWithEmailAndPassword(auth, adminEmail.trim(), adminPassword)
      if (credential.user.uid !== ADMIN_UID) {
        await signOut(auth).catch((error: unknown) => {
          console.debug('Non-admin sign out failed.', error)
        })
        setIsAdmin(false)
        setAdminLoginError('此帳號沒有管理權限')
        return
      }
      setIsAdmin(true)
      closeAdminLogin()
    } catch (error: unknown) {
      console.error('Firebase login error:', error)
      setIsAdmin(false)
      if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string') {
        setAdminLoginError(`Firebase 錯誤：${error.code}`)
      } else if (error instanceof Error) {
        setAdminLoginError(error.message)
      } else {
        setAdminLoginError('帳號或密碼錯誤')
      }
    } finally {
      setAdminLoggingIn(false)
    }
  }, [adminEmail, adminPassword, closeAdminLogin])

  const handleAdminLogout = useCallback(async () => {
    await signOut(auth).catch((error: unknown) => {
      console.debug('Admin sign out failed.', error)
    })
    setIsAdmin(false)
    setEditing(undefined)
    setRelationOpen(false)
    setAdminLoginOpen(false)
    setAdminEmail('')
    setAdminPassword('')
    setAdminLoginError('')
  }, [])

  useEffect(() => {
    selectedIdRef.current = selectedId
  }, [selectedId])

  useEffect(() => {
    viewerNodeIdRef.current = viewerNodeId
  }, [viewerNodeId])

  useEffect(() => {
    const unsubscribe = firestoreKnowledgeRepository.subscribeAll(
      (cloudData) => {
        setData(cloudData)
        cacheFallbackData(cloudData)
      },
      (error: unknown) => {
        console.error('Firestore realtime sync failed:', error)
      },
    )
    return unsubscribe
  }, [cacheFallbackData])

  useEffect(() => {
    if (isAdmin) return
    setEditing(undefined)
    setRelationOpen(false)
  }, [isAdmin])

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user) {
        setIsAdmin(false)
        return
      }
      if (user.uid === ADMIN_UID) {
        setIsAdmin(true)
        return
      }
      signOut(auth).catch((error: unknown) => {
        console.debug('Non-admin sign out failed.', error)
      })
      setIsAdmin(false)
    })
    return unsubscribe
  }, [])

  useEffect(() => () => {
    if (adminPressTimerRef.current !== undefined) {
      window.clearTimeout(adminPressTimerRef.current)
    }
  }, [])

  useEffect(() => {
    const audioManager = new AudioManager()
    audioManager.init(SELECT_SOUND_URL)
    audioManager.setSfxVolume(settings.sfxVolume / 100)
    audioManager.setMusicVolume(settings.musicVolume / 100)
    audioManagerRef.current = audioManager
    loadBackgroundMusic()
      .then((stored) => {
        if (stored) audioManager.setBackgroundMusic(stored.blob)
      })
      .catch((error: unknown) => {
        console.debug('Background music restore failed.', error)
      })
    return () => {
      audioManager.dispose()
      audioManagerRef.current = undefined
    }
  }, [])

  useEffect(() => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
    audioManagerRef.current?.setSfxVolume(settings.sfxVolume / 100)
    audioManagerRef.current?.setMusicVolume(settings.musicVolume / 100)
  }, [settings])

  useEffect(() => {
    if (!gesturePointerScreen || gestureStatus.activeGesture !== 'pointer') {
      clearGestureUiDwell()
      return
    }
    let frame = 0
    const updateDwell = () => {
      const target = getGestureUiTarget(gesturePointerScreen)
      if (!target) {
        clearGestureUiDwell()
        frame = window.requestAnimationFrame(updateDwell)
        return
      }

      const now = performance.now()
      const state = gestureUiDwellRef.current
      if (state.element !== target) {
        state.element?.classList.remove('gesture-dwell-hover')
        target.classList.add('gesture-dwell-hover')
        gestureUiDwellRef.current = {
          element: target,
          since: now,
          triggered: false,
          cooldownUntil: state.cooldownUntil,
        }
        setGestureUiDwell({ active: true, progress: 0 })
        frame = window.requestAnimationFrame(updateDwell)
        return
      }

      if (state.triggered) {
        setGestureUiDwell({ active: true, progress: 1 })
      } else {
        const progress = Math.min(1, (now - state.since) / GESTURE_UI_DWELL_MS)
        setGestureUiDwell({ active: true, progress })
        if (progress >= 1 && now >= state.cooldownUntil) {
          state.triggered = true
          state.cooldownUntil = now + GESTURE_UI_COOLDOWN_MS
          playGestureUiClick(target)
          const gestureHref = target.dataset.gestureHref
          if (gestureHref && openExternalLink(gestureHref, 'same-tab')) {
            return
          }
          target.click()
        }
      }
      frame = window.requestAnimationFrame(updateDwell)
    }
    frame = window.requestAnimationFrame(updateDwell)
    return () => window.cancelAnimationFrame(frame)
  }, [gesturePointerScreen?.x, gesturePointerScreen?.y, gestureStatus.activeGesture, clearGestureUiDwell, getGestureUiTarget, playGestureUiClick])

  useEffect(() => () => clearGestureUiDwell(), [clearGestureUiDwell])

  useEffect(() => {
    const updateViewport = () => setViewportSize({
      width: window.visualViewport?.width ?? window.innerWidth,
      height: window.visualViewport?.height ?? window.innerHeight,
    })
    updateViewport()
    window.addEventListener('resize', updateViewport)
    window.addEventListener('orientationchange', updateViewport)
    window.visualViewport?.addEventListener('resize', updateViewport)
    return () => {
      window.removeEventListener('resize', updateViewport)
      window.removeEventListener('orientationchange', updateViewport)
      window.visualViewport?.removeEventListener('resize', updateViewport)
    }
  }, [])

  useEffect(() => {
    resetIdle()
    const handleKeyDown = () => {
      resetIdle()
      audioManagerRef.current?.unlock()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      if (idleTimerRef.current) window.clearTimeout(idleTimerRef.current)
    }
  }, [resetIdle])

  useEffect(() => {
    if (!gestureEnabled) {
      trackingRef.current?.stop()
      trackingRef.current = undefined
      gestureMachineRef.current.reset()
      setHands([])
      setGestureStatus(emptyGestureStatus(false))
      setHoveredId(undefined)
      setControlResetKey((value) => value + 1)
      clearGestureUiDwell()
      return
    }
    const video = videoRef.current
    if (!video) return
    let cancelled = false
    const session = new HandTrackingSession()
    trackingRef.current = session
    setGestureStatus(emptyGestureStatus(true))
    session.start(video, (nextHands) => {
      if (cancelled) return
      if (video.videoWidth && video.videoHeight) {
        setVideoSize((current) => (
          current.width === video.videoWidth && current.height === video.videoHeight
            ? current
            : { width: video.videoWidth, height: video.videoHeight }
        ))
      }
      setHands(nextHands)
      const nextStatus = gestureMachineRef.current.update(nextHands, performance.now(), true, 'ready', !!viewerNodeIdRef.current)
      if (nextHands.length || nextStatus.activeGesture !== 'none') resetIdle()
      setGestureStatus(nextStatus)
    }).then(() => {
      if (!cancelled) setGestureStatus((current) => ({ ...current, cameraStatus: 'ready' }))
    }).catch((error) => {
      console.error(error)
      if (!cancelled) {
        setGestureStatus({
          ...emptyGestureStatus(true),
          cameraStatus: 'error',
          message: '攝影機或手部追蹤啟動失敗',
        })
      }
    })
    return () => {
      cancelled = true
      session.stop()
    }
  }, [gestureEnabled, resetIdle, clearGestureUiDwell])

  const handleAdminPressStart = () => {
    if (isAdmin) return
    if (adminPressTimerRef.current !== undefined) {
      window.clearTimeout(adminPressTimerRef.current)
    }

    adminPressTimerRef.current = window.setTimeout(() => {
      resetIdle()
      setAdminLoginError('')
      setAdminLoginOpen(true)
      adminPressTimerRef.current = undefined
    }, 7000)
  }

  const handleAdminPressEnd = () => {
    if (adminPressTimerRef.current !== undefined) {
      window.clearTimeout(adminPressTimerRef.current)
      adminPressTimerRef.current = undefined
    }
  }

  const uploadLocalDataToFirestore = async () => {
    if (!isAdmin || firestoreUploading) return
    const confirmed = confirm('這會把目前本機的節點與關聯寫入 Firestore。確定要繼續嗎？')
    if (!confirmed) return

    setFirestoreUploading(true)
    setFirestoreUploadMessage('上傳中...')
    try {
      const localData = knowledgeRepository.load()
      await Promise.all(localData.nodes.map((node) => firestoreKnowledgeRepository.saveNode(node)))
      await Promise.all(localData.links.map((connection) => firestoreKnowledgeRepository.saveConnection(connection)))
      setFirestoreUploadMessage(`已上傳 ${localData.nodes.length} 個節點、${localData.links.length} 個關聯`)
    } catch (error: unknown) {
      console.error('Firestore upload failed:', error)
      if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string') {
        setFirestoreUploadMessage(`Firestore 錯誤：${error.code}`)
      } else if (error instanceof Error) {
        setFirestoreUploadMessage(error.message)
      } else {
        setFirestoreUploadMessage('Firestore 上傳失敗')
      }
    } finally {
      setFirestoreUploading(false)
    }
  }

  return (
    <main
      className={`app-shell ${immersive ? 'immersive' : ''} ${viewerNode ? 'viewer-active' : ''}`}
      onPointerMoveCapture={resetIdle}
      onPointerDownCapture={registerUserActivity}
      onClickCapture={registerUserActivity}
      onTouchStartCapture={registerUserActivity}
      onTouchMoveCapture={resetIdle}
      onWheelCapture={registerUserActivity}
      onInputCapture={registerUserActivity}
    >
      <KnowledgeGraph3D
        data={data}
        selectedId={selectedId}
        hoveredId={hoveredId}
        focusId={focusId}
        controlResetKey={controlResetKey}
        gestureControl={{
          activeGesture: gestureStatus.activeGesture,
          zoomDelta: gestureStatus.zoomDelta,
          panDelta: gestureStatus.panDelta,
          pointerScreen: gesturePointerScreen,
          rotateDelta: gestureStatus.rotateDelta,
        }}
        gesturePointerBlocked={gestureUiDwell.active}
        isGesturePointerOverUi={getGestureUiTarget}
        viewerNode={viewerNode}
        viewerResetKey={viewerResetKey}
        onViewerLoadStateChange={setViewerLoadState}
        onHover={setHoveredId}
        onSelect={selectNode}
        onClearSelection={clearSelection}
        immersive={immersive}
      />
      {viewerNode && viewerLoadState !== 'ready' ? (
        <div className={`viewer-status ${viewerLoadState === 'error' ? 'error' : ''}`} role="status">
          {viewerLoadState === 'error' ? '圖片無法載入' : '圖片載入中...'}
        </div>
      ) : null}
      {gestureEnabled || gestureStatus.cameraStatus === 'error' ? (
        <video ref={videoRef} className="camera-sensor" muted playsInline aria-hidden="true" />
      ) : null}
      <HandEnergyOverlay
        hands={hands}
        status={gestureStatus}
        videoSize={videoSize}
        viewportSize={viewportSize}
        uiDwellActive={gestureUiDwell.active}
        uiDwellProgress={gestureUiDwell.progress}
      />
      <header className="top-bar">
        <div className="title-panel">
          <strong
            onMouseDown={handleAdminPressStart}
            onMouseUp={handleAdminPressEnd}
            onMouseLeave={handleAdminPressEnd}
            onTouchStart={handleAdminPressStart}
            onTouchEnd={handleAdminPressEnd}
            onTouchCancel={handleAdminPressEnd}
            onContextMenu={(event) => event.preventDefault()}
          >
            J-Space
          </strong>
        </div>
        <section className="search-panel">
          {viewerNode ? (
            <div className="viewer-toolbar" aria-label="圖片檢視工具列">
              <strong>{viewerNode.title}</strong>
              <div>
                <button data-gesture-clickable="true" onClick={() => setViewerResetKey((value) => value + 1)}>重置</button>
                {viewerNode.url ? (
                  <button data-gesture-clickable="true" data-gesture-href={viewerNode.url} onClick={() => openExternalLink(viewerNode.url ?? '')}>原始連結</button>
                ) : null}
                <button
                  data-gesture-clickable="true"
                  onClick={() => {
                    setViewerNodeId(undefined)
                    setViewerLoadState('idle')
                  }}
                >
                  關閉
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="search-box">
                <span className="search-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" focusable="false">
                    <circle cx="10.5" cy="10.5" r="5.7" />
                    <path d="M15.2 15.2L20 20" />
                  </svg>
                </span>
                <input
                  aria-label="搜尋節點"
                  placeholder="探索"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
                {query ? <button className="clear-search" aria-label="清除搜尋" onClick={() => { setQuery(''); setFocusId(undefined); setHoveredId(undefined) }}>×</button> : null}
              </div>
              {results.length ? <div className="search-results">{results.map((node) => (
                <button key={node.id} onClick={() => { selectNode(node, 'search'); setQuery('') }}>{node.title}<small>{node.category}</small></button>
              ))}</div> : null}
            </>
          )}
        </section>
        <div className="camera-controls">
          {gestureEnabled || gestureStatus.cameraStatus === 'error' ? (
            <div className={`gesture-pill ${gestureStatus.activeGesture !== 'none' ? 'active' : ''}`}>
              <span />
              {gestureStatus.cameraStatus === 'requesting' ? '啟動中' :
                gestureStatus.cameraStatus === 'error' ? gestureStatus.message :
                  gestureStatus.activeGesture === 'zoomIn' ? '放大' :
                    gestureStatus.activeGesture === 'zoomOut' ? '縮小' :
                      gestureStatus.activeGesture === 'pan' ? '平移' :
                        gestureStatus.activeGesture === 'pointer' ? '游標' :
                          gestureStatus.activeGesture === 'rotate' ? '旋轉' :
                            hands.length ? '已偵測' : '待偵測'}
            </div>
          ) : null}
          <button
            className={`camera-button ${gestureEnabled ? 'active' : ''} ${gestureStatus.cameraStatus === 'error' ? 'error' : ''}`}
            aria-label={gestureEnabled ? '關閉手勢控制' : '開啟手勢控制'}
            onClick={() => setGestureEnabled((value) => !value)}
          >
            <svg className="camera-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M6.75 7.25h2.1l1.12-1.85h4.06l1.12 1.85h2.1a2.75 2.75 0 0 1 2.75 2.75v6.25A2.75 2.75 0 0 1 17.25 19H6.75A2.75 2.75 0 0 1 4 16.25V10a2.75 2.75 0 0 1 2.75-2.75Z" />
              <circle cx="12" cy="13" r="3.25" />
              <circle cx="17" cy="10.25" r="0.7" />
            </svg>
            <span className="camera-status-dot" aria-hidden="true" />
          </button>
          <button
            className={`settings-button ${settingsOpen ? 'active' : ''}`}
            aria-label={settingsOpen ? '關閉設定' : '開啟設定'}
            onClick={() => setSettingsOpen((value) => !value)}
          >
            <svg className="settings-icon" viewBox="0 0 24 24" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false">
              <path d="M9.6 3.35h4.8l.55 2.18c.5.2.98.47 1.42.8l2.16-.63 2.4 4.15-1.61 1.55c.04.54.04 1.07 0 1.61l1.61 1.55-2.4 4.15-2.16-.63c-.44.33-.92.6-1.42.8l-.55 2.18H9.6l-.55-2.18a8.8 8.8 0 0 1-1.42-.8l-2.16.63-2.4-4.15 1.61-1.55a8.68 8.68 0 0 1 0-1.61L3.07 9.85l2.4-4.15 2.16.63c.44-.33.92-.6 1.42-.8L9.6 3.35Z" />
              <circle cx="12" cy="12.2" r="3.05" />
            </svg>
          </button>
        </div>
      </header>
      {settingsOpen ? (
        <section className="settings-panel" aria-label="設定面板">
          <div className="settings-heading">
            <div>
              <strong>設定</strong>
            </div>
            <button className="icon-button" aria-label="關閉設定" onClick={() => setSettingsOpen(false)}>×</button>
          </div>
          <label className="range-control">
            <span><strong>音樂音量</strong><small>{settings.musicVolume}%</small></span>
            <input
              type="range"
              min="0"
              max="100"
              value={settings.musicVolume}
              style={{ '--value': `${settings.musicVolume}%` } as CSSProperties}
              onChange={(event) => setSettings((current) => ({ ...current, musicVolume: Number(event.target.value), musicVolumeTouched: true }))}
            />
          </label>
          <label className="range-control">
            <span><strong>音效音量</strong><small>{settings.sfxVolume}%</small></span>
            <input
              type="range"
              min="0"
              max="100"
              value={settings.sfxVolume}
              style={{ '--value': `${settings.sfxVolume}%` } as CSSProperties}
              onChange={(event) => setSettings((current) => ({ ...current, sfxVolume: Number(event.target.value) }))}
            />
          </label>
          <div className="music-import">
            <div className="music-actions">
              <button onClick={() => musicInputRef.current?.click()}>匯入背景音樂</button>
              <button onClick={restoreDefaultSettings}>恢復預設值</button>
            </div>
            <small>{settings.backgroundMusicName ? `目前：${settings.backgroundMusicName}` : '尚未匯入背景音樂'}</small>
          </div>
        </section>
      ) : null}
      {isAdmin ? (
        <div className="action-bar-shell">
          <nav className="action-bar" aria-label="主要功能">
            <div className="action-bar-track">
              <button data-gesture-clickable="true" onClick={() => setEditing('new')}>新增節點</button>
              <button data-gesture-clickable="true" onClick={() => selected && setEditing(selected)} disabled={!selected}>編輯節點</button>
              <button data-gesture-clickable="true" onClick={() => selected && setRelationOpen(true)} disabled={!selected}>新增關聯</button>
              <button data-gesture-clickable="true" onClick={uploadLocalDataToFirestore} disabled={firestoreUploading}>
                {firestoreUploading ? '同步中' : '同步資料'}
              </button>
              <button data-gesture-clickable="true" className="action-logout" onClick={handleAdminLogout}>登出</button>
            </div>
          </nav>
          {firestoreUploadMessage ? <span className="action-bar-status" aria-live="polite">{firestoreUploadMessage}</span> : null}
        </div>
      ) : null}
      {viewerNode ? null : (
        <NodeHUD
          node={selected}
          data={data}
          isAdmin={isAdmin}
          hasActionBar={isAdmin}
          onEdit={setEditing}
          onDelete={async (node) => {
            if (confirm(`確定要刪除「${node.title}」嗎？\n\n與此節點相關的連線也會一併刪除。`)) {
              const next: KnowledgeData = {
                nodes: data.nodes.filter((item) => item.id !== node.id),
                links: data.links.filter((link) => link.source !== node.id && link.target !== node.id),
              }
              persist(next)
              const deleted = await deleteNodeFromFirestore(node.id, next)
              if (deleted) {
                clearSelection()
              } else {
                persist(data)
              }
            }
          }}
          onAddRelation={() => setRelationOpen(true)}
          onSelectRelatedNode={(node) => selectNode(node, 'relation')}
          onDeleteLink={async (link: KnowledgeLink) => {
            const next = { ...data, links: data.links.filter((item) => item.id !== link.id) }
            persist(next)
            const deleted = await deleteConnectionFromFirestore(link.id, next)
            if (!deleted) persist(data)
          }}
        />
      )}
      <input
        ref={musicInputRef}
        type="file"
        accept="audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/mp4,audio/aac,.mp3,.wav,.m4a,.aac"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) {
            saveBackgroundMusic(file)
              .then(() => {
                audioManagerRef.current?.setBackgroundMusic(file)
                setSettings((current) => {
                  const shouldApplyDefaultMusicVolume = !current.musicVolumeTouched && !current.hasBackgroundMusic && current.musicVolume === 0
                  return {
                    ...current,
                    musicVolume: shouldApplyDefaultMusicVolume ? 80 : current.musicVolume,
                    backgroundMusicName: file.name,
                    hasBackgroundMusic: true,
                  }
                })
                audioManagerRef.current?.unlock()
              })
              .catch((error: unknown) => {
                console.debug('Background music import failed.', error)
                alert('背景音樂匯入失敗，請換一個音訊檔案再試。')
              })
          }
          event.currentTarget.value = ''
        }}
      />
      {isAdmin && editing ? (
        <NodeForm
          node={editing === 'new' ? undefined : editing}
          onCancel={() => setEditing(undefined)}
          onSubmit={async (value) => {
            const savedNode = editing === 'new' ? createKnowledgeNode(value) : updateKnowledgeNode(editing, value)
            const next = editing === 'new'
              ? { ...data, nodes: [...data.nodes, savedNode] }
              : { ...data, nodes: data.nodes.map((node) => node.id === editing.id ? savedNode : node) }
            persist(next)
            const saved = await saveNodeToFirestore(savedNode, next)
            if (saved) {
              setEditing(undefined)
            } else {
              persist(data)
            }
          }}
        />
      ) : null}
      {isAdmin && relationOpen && selected ? (
        <RelationForm
          node={selected}
          data={data}
          onCancel={() => setRelationOpen(false)}
          onSubmit={async (target, relation) => {
            if (selected.id === target) {
              setRelationOpen(false)
              return
            }
            const exists = data.links.some((item) =>
              (item.source === selected.id && item.target === target) ||
              (item.source === target && item.target === selected.id),
            )
            if (exists) {
              alert('這兩個節點之間已存在關聯')
              return
            }
            const connection = createKnowledgeLink({ source: selected.id, target, relation: relation?.trim() || undefined })
            const next = { ...data, links: [...data.links, connection] }
            persist(next)
            const saved = await saveConnectionToFirestore(connection, next)
            if (saved) {
              setRelationOpen(false)
            } else {
              setData((current) => ({ ...current, links: current.links.filter((item) => item.id !== connection.id) }))
            }
          }}
        />
      ) : null}
      {adminLoginOpen ? (
        <div className="modal-backdrop admin-login-backdrop" role="presentation">
          <form className="modal admin-login-modal" onSubmit={handleAdminLogin}>
            <h2>管理者登入</h2>
            <label>
              Email
              <input
                type="email"
                autoComplete="username"
                value={adminEmail}
                onChange={(event) => setAdminEmail(event.target.value)}
                required
              />
            </label>
            <label>
              Password
              <input
                type="password"
                autoComplete="current-password"
                value={adminPassword}
                onChange={(event) => setAdminPassword(event.target.value)}
                required
              />
            </label>
            <div className="admin-login-error" aria-live="polite">
              {adminLoginError}
            </div>
            <div className="modal-actions">
              <button type="button" onClick={closeAdminLogin} disabled={adminLoggingIn}>取消</button>
              <button type="submit" disabled={adminLoggingIn}>{adminLoggingIn ? '登入中' : '登入'}</button>
            </div>
          </form>
        </div>
      ) : null}
    </main>
  )
}
