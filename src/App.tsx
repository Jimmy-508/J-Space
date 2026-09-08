import { useMemo, useRef, useState } from 'react'
import NodeForm from './components/NodeForm'
import RelationForm from './components/RelationForm'
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
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const selected = data.nodes.find((node) => node.id === selectedId)
  const results = useMemo(() => query.trim() ? data.nodes.filter((node) =>
    [node.title, node.category, node.description, ...(node.tags ?? [])].join(' ').toLowerCase().includes(query.toLowerCase()),
  ).slice(0, 8) : [], [data.nodes, query])

  const persist = (next: KnowledgeData) => setData(next)

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
        onHover={setHoveredId}
        onSelect={(node) => { setSelectedId(node.id); setFocusId(node.id) }}
        onClearSelection={() => { setSelectedId(undefined); setFocusId(undefined); setHoveredId(undefined) }}
      />
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
