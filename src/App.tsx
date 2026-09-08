import { useEffect, useMemo, useRef, useState } from 'react'
import NodeForm from './components/NodeForm'
import RelationForm from './components/RelationForm'
import { GestureStateMachine } from './gesture/gestureStateMachine'
import { toScreenPoint } from './gesture/coordinateTransform'
import type { GestureStatus, TrackedHand } from './gesture/gestureTypes'
import { knowledgeRepository, validateKnowledgeData } from './repository/knowledgeRepository'
import KnowledgeGraph3D from './scene/KnowledgeGraph3D'
import NodeHUD from './scene/NodeHUD'
import type { KnowledgeData, KnowledgeLink, KnowledgeNode } from './types/knowledge'

export default function App() {
  const [data, setData] = useState<KnowledgeData>(() => knowledgeRepository.load())
  const [selectedId, setSelectedId] = useState<string>()
  const [hoveredId, setHoveredId] = useState<string>()
  const [focusId, setFocusId] = useState<string>()
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<KnowledgeNode | 'new'>()
  const [relationOpen, setRelationOpen] = useState(false)
  const [performanceMode, setPerformanceMode] = useState(false)
  const [debugMode, setDebugMode] = useState(false)
  const [previewHidden, setPreviewHidden] = useState(false)
  const [gesture, setGesture] = useState<GestureStatus>({ enabled: false, cameraStatus: 'idle', handsDetected: 0, activeGesture: 'none', radialMenuOpen: false })
  const videoRef = useRef<HTMLVideoElement>(null)
  const trackerRef = useRef<{ stop: () => void } | null>(null)
  const stateMachineRef = useRef(new GestureStateMachine())
  const fileInputRef = useRef<HTMLInputElement>(null)

  const selected = data.nodes.find((node) => node.id === selectedId)
  const results = useMemo(() => query.trim() ? data.nodes.filter((node) =>
    [node.title, node.category, node.description, ...(node.tags ?? [])].join(' ').toLowerCase().includes(query.toLowerCase()),
  ).slice(0, 8) : [], [data.nodes, query])

  useEffect(() => () => trackerRef.current?.stop(), [])

  const persist = (next: KnowledgeData) => setData(next)

  const startGesture = async () => {
    if (!videoRef.current) return
    setGesture((current) => ({ ...current, enabled: true, cameraStatus: 'requesting', message: 'Camera requesting' }))
    try {
      const { HandTrackingSession } = await import('./gesture/handTracking')
      const tracker = new HandTrackingSession()
      trackerRef.current = tracker
      await tracker.start(videoRef.current, (hands: TrackedHand[]) => {
        const next = stateMachineRef.current.update(hands, performance.now(), true, 'ready')
        setGesture(next)
      })
      setGesture((current) => ({ ...current, enabled: true, cameraStatus: 'ready' }))
    } catch (error) {
      setGesture({ enabled: false, cameraStatus: 'error', handsDetected: 0, activeGesture: 'none', radialMenuOpen: false, message: error instanceof Error ? error.message : 'Gesture Mode failed' })
    }
  }

  const stopGesture = () => {
    trackerRef.current?.stop()
    stateMachineRef.current.closeRadialMenu()
    setGesture({ enabled: false, cameraStatus: 'idle', handsDetected: 0, activeGesture: 'none', radialMenuOpen: false })
  }

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

  const pointerScreen = gesture.pointer ? toScreenPoint(gesture.pointer, window.innerWidth, window.innerHeight, true) : undefined

  return (
    <main className="app-shell">
      <KnowledgeGraph3D
        data={data}
        selectedId={selectedId}
        hoveredId={hoveredId}
        focusId={focusId}
        performanceMode={performanceMode}
        pointer={gesture.pointer}
        onHover={setHoveredId}
        onSelect={(node) => { setSelectedId(node.id); setFocusId(node.id) }}
      />
      <header className="topbar">
        <div><strong>J-Space Prototype</strong><span>3D Knowledge Graph</span></div>
        <button onClick={() => setEditing('new')}>＋ 新增節點</button>
      </header>
      <section className="search-panel">
        <input placeholder="搜尋節點，例如：二分" value={query} onChange={(event) => setQuery(event.target.value)} />
        {results.length ? <div className="search-results">{results.map((node) => (
          <button key={node.id} onClick={() => { setSelectedId(node.id); setFocusId(node.id); setQuery('') }}>{node.title}<small>{node.category}</small></button>
        ))}</div> : null}
      </section>
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
      <section className="bottom-controls">
        <button onClick={() => performanceMode ? setPerformanceMode(false) : setPerformanceMode(true)}>Performance {performanceMode ? 'On' : 'Off'}</button>
        <button onClick={() => setDebugMode((value) => !value)}>Debug {debugMode ? 'On' : 'Off'}</button>
        <button onClick={exportJson}>匯出 JSON</button>
        <button onClick={() => fileInputRef.current?.click()}>匯入 JSON</button>
        <button className="danger" onClick={() => confirm('確定要重設為預設資料嗎？') && persist(knowledgeRepository.reset())}>重設</button>
      </section>
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
      <section className="gesture-panel">
        <button onClick={gesture.enabled ? stopGesture : startGesture}>Gesture Mode {gesture.enabled ? 'On' : 'Off'}</button>
        <button onClick={() => setPreviewHidden((value) => !value)}>{previewHidden ? '顯示預覽' : '隱藏預覽'}</button>
        <video className={previewHidden ? 'hidden' : ''} ref={videoRef} playsInline muted />
        <small>{gesture.cameraStatus} / hands {gesture.handsDetected}</small>
      </section>
      {gesture.radialMenuOpen ? <div className="radial-menu"><button onClick={() => setEditing('new')}>新增</button><button onClick={() => selected && setEditing(selected)}>編輯</button><button onClick={() => stateMachineRef.current.closeRadialMenu()}>關閉</button></div> : null}
      {pointerScreen ? <div className="gesture-pointer" style={{ left: pointerScreen.x, top: pointerScreen.y }} /> : null}
      {debugMode ? <pre className="debug-panel">{JSON.stringify({ selected: selected?.title, hoveredId, gesture, performanceMode }, null, 2)}</pre> : null}
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
