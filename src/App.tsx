import { useEffect, useMemo, useRef, useState } from 'react'
import NodeForm from './components/NodeForm'
import RelationForm from './components/RelationForm'
import { normalizedToCoverViewport } from './gesture/coordinateTransform'
import { GestureStateMachine } from './gesture/gestureStateMachine'
import { HandTrackingSession } from './gesture/handTracking'
import { knowledgeRepository, validateKnowledgeData } from './repository/knowledgeRepository'
import KnowledgeGraph3D from './scene/KnowledgeGraph3D'
import NodeHUD from './scene/NodeHUD'
import type { KnowledgeData, KnowledgeLink, KnowledgeNode } from './types/knowledge'
import type { GestureStatus, TrackedHand } from './gesture/gestureTypes'

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

function HandEnergyOverlay({
  hands,
  status,
  videoSize,
  viewportSize,
}: {
  hands: TrackedHand[]
  status: GestureStatus
  videoSize: { width: number; height: number }
  viewportSize: { width: number; height: number }
}) {
  if (!status.enabled || status.cameraStatus !== 'ready') return null
  const activeIds = new Set([...(status.zoomHands ?? []), ...(status.panHands ?? []), status.rotationHand].filter(Boolean) as string[])
  const slots: Array<TrackedHand | undefined> = [hands[0], hands[1]]
  return (
    <svg
      className="hand-energy-layer"
      viewBox={`0 0 ${viewportSize.width} ${viewportSize.height}`}
      aria-hidden="true"
    >
      {slots.map((hand, slotIndex) => {
        if (!hand) return <g key={slotIndex} className="hand-energy" visibility="hidden" />
        const active = activeIds.has(hand.id)
        const points = hand.landmarks.map((point) => normalizedToCoverViewport(point, videoSize, viewportSize, true))
        const palmCenter = normalizedToCoverViewport(hand.palmCenter, videoSize, viewportSize, true)
        const palmRadius = Math.max(20, Math.min(54, hand.palmSize * Math.max(videoSize.width, videoSize.height) * Math.max(viewportSize.width / Math.max(1, videoSize.width), viewportSize.height / Math.max(1, videoSize.height)) * 0.42))
        return (
          <g key={slotIndex} className={`hand-energy ${active ? 'active' : ''} ${hand.gesture}`}>
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
            <circle className="palm-aura" cx={palmCenter.x} cy={palmCenter.y} r={active ? palmRadius * 1.2 : palmRadius} />
            {active ? <circle className="palm-core" cx={palmCenter.x} cy={palmCenter.y} r={Math.max(5, palmRadius * 0.16)} /> : null}
          </g>
        )
      })}
    </svg>
  )
}

export default function App() {
  const [data, setData] = useState<KnowledgeData>(() => knowledgeRepository.load())
  const [selectedId, setSelectedId] = useState<string>()
  const [hoveredId, setHoveredId] = useState<string>()
  const [focusId, setFocusId] = useState<string>()
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<KnowledgeNode | 'new'>()
  const [relationOpen, setRelationOpen] = useState(false)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [gestureEnabled, setGestureEnabled] = useState(false)
  const [hands, setHands] = useState<TrackedHand[]>([])
  const [gestureStatus, setGestureStatus] = useState<GestureStatus>(() => emptyGestureStatus())
  const [videoSize, setVideoSize] = useState({ width: 640, height: 480 })
  const [viewportSize, setViewportSize] = useState(() => ({
    width: typeof window === 'undefined' ? 390 : window.visualViewport?.width ?? window.innerWidth,
    height: typeof window === 'undefined' ? 844 : window.visualViewport?.height ?? window.innerHeight,
  }))
  const fileInputRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const trackingRef = useRef<HandTrackingSession | undefined>(undefined)
  const gestureMachineRef = useRef(new GestureStateMachine())

  const selected = data.nodes.find((node) => node.id === selectedId)
  const results = useMemo(() => query.trim() ? data.nodes.filter((node) =>
    [node.title, node.category, node.description, ...(node.tags ?? [])].join(' ').toLowerCase().includes(query.toLowerCase()),
  ).slice(0, 8) : [], [data.nodes, query])

  const persist = (next: KnowledgeData) => setData(next)

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
    if (!gestureEnabled) {
      trackingRef.current?.stop()
      trackingRef.current = undefined
      setHands([])
      setGestureStatus(emptyGestureStatus(false))
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
      setGestureStatus(gestureMachineRef.current.update(nextHands, performance.now(), true, 'ready'))
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
  }, [gestureEnabled])

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'knowledge-universe.json'
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const importJson = async (file: File) => {
    const parsed = JSON.parse(await file.text()) as unknown
    if (!validateKnowledgeData(parsed)) throw new Error('JSON 格式錯誤，未覆蓋現有資料。')
    persist(knowledgeRepository.save(parsed))
  }

  return (
    <main className={`app-shell ${advancedOpen ? 'advanced-open' : ''}`}>
      <KnowledgeGraph3D
        data={data}
        selectedId={selectedId}
        hoveredId={hoveredId}
        focusId={focusId}
        gestureControl={{
          activeGesture: gestureStatus.activeGesture,
          zoomDelta: gestureStatus.zoomDelta,
          panDelta: gestureStatus.panDelta,
          rotateDelta: gestureStatus.rotateDelta,
        }}
        onHover={setHoveredId}
        onSelect={(node) => { setSelectedId(node.id); setFocusId(node.id) }}
        onClearSelection={() => { setSelectedId(undefined); setFocusId(undefined); setHoveredId(undefined) }}
      />
      {gestureEnabled || gestureStatus.cameraStatus === 'error' ? (
        <video ref={videoRef} className="camera-sensor" muted playsInline aria-hidden="true" />
      ) : null}
      <HandEnergyOverlay hands={hands} status={gestureStatus} videoSize={videoSize} viewportSize={viewportSize} />
      <div className="camera-controls">
        {gestureEnabled || gestureStatus.cameraStatus === 'error' ? (
          <div className={`gesture-pill ${gestureStatus.activeGesture !== 'none' ? 'active' : ''}`}>
            <span />
            {gestureStatus.cameraStatus === 'requesting' ? '啟動中' :
              gestureStatus.cameraStatus === 'error' ? gestureStatus.message :
                gestureStatus.activeGesture === 'zoomIn' ? '放大' :
                  gestureStatus.activeGesture === 'zoomOut' ? '縮小' :
                    gestureStatus.activeGesture === 'pan' ? '平移' :
                      gestureStatus.activeGesture === 'rotate' ? '旋轉' :
                        hands.length ? '已偵測' : '待偵測'}
          </div>
        ) : null}
        <button
          className={`camera-button ${gestureEnabled ? 'active' : ''} ${gestureStatus.cameraStatus === 'error' ? 'error' : ''}`}
          aria-label={gestureEnabled ? '關閉手勢控制' : '開啟手勢控制'}
          onClick={() => setGestureEnabled((value) => !value)}
        >
          <span className="camera-icon" aria-hidden="true" />
          <span className="camera-status-dot" aria-hidden="true" />
        </button>
      </div>
      <header className="title-panel">
        <strong>J-Space</strong>
        <span>個人資源宇宙原型</span>
      </header>
      <section className="search-panel">
        <div className="search-box">
          <span className="search-icon" aria-hidden="true" />
          <input
            aria-label="搜尋節點"
            placeholder="搜尋節點，例如：二分"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {query ? <button className="clear-search" aria-label="清除搜尋" onClick={() => { setQuery(''); setFocusId(undefined); setHoveredId(undefined) }}>×</button> : null}
        </div>
        {results.length ? <div className="search-results">{results.map((node) => (
          <button key={node.id} onClick={() => { setSelectedId(node.id); setFocusId(node.id); setQuery('') }}>{node.title}<small>{node.category}</small></button>
        ))}</div> : null}
      </section>
      <nav className="action-bar" aria-label="主要功能">
        <button onClick={() => setEditing('new')}>新增節點</button>
        <button onClick={() => selected && setEditing(selected)} disabled={!selected}>編輯目前節點</button>
        <button onClick={() => selected && setRelationOpen(true)} disabled={!selected}>新增關聯</button>
        <button className="danger" onClick={() => confirm('確定要重設為預設資料嗎？') && persist(knowledgeRepository.reset())}>重設資料</button>
        <button onClick={() => setAdvancedOpen((value) => !value)}>{advancedOpen ? '收合進階' : '進階功能'}</button>
      </nav>
      <NodeHUD
        node={selected}
        data={data}
        onEdit={setEditing}
        onDelete={(node) => {
          if (confirm(`確定要刪除「${node.title}」嗎？\n\n與此節點相關的連線也會一併刪除。`)) {
            persist(knowledgeRepository.deleteNode(data, node.id))
            setSelectedId(undefined)
          }
        }}
        onAddRelation={() => setRelationOpen(true)}
        onDeleteLink={(link: KnowledgeLink) => persist(knowledgeRepository.deleteLink(data, link.id))}
      />
      {advancedOpen ? (
        <section className="advanced-panel">
          <div>
            <strong>資料搬移</strong>
            <span>匯入前會先驗證格式，錯誤時不覆蓋現有資料。</span>
          </div>
          <button onClick={exportJson}>匯出 JSON</button>
          <button onClick={() => fileInputRef.current?.click()}>匯入 JSON</button>
        </section>
      ) : null}
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) importJson(file).catch((error) => alert(error instanceof Error ? error.message : '匯入失敗'))
          event.currentTarget.value = ''
        }}
      />
      {editing ? (
        <NodeForm
          node={editing === 'new' ? undefined : editing}
          onCancel={() => setEditing(undefined)}
          onSubmit={(value) => {
            const next = editing === 'new' ? knowledgeRepository.addNode(data, value) : knowledgeRepository.updateNode(data, editing.id, value)
            persist(next)
            setEditing(undefined)
          }}
        />
      ) : null}
      {relationOpen && selected ? (
        <RelationForm
          node={selected}
          data={data}
          onCancel={() => setRelationOpen(false)}
          onSubmit={(target, relation) => {
            persist(knowledgeRepository.addLink(data, { source: selected.id, target, relation }))
            setRelationOpen(false)
          }}
        />
      ) : null}
    </main>
  )
}
