import { useEffect, useState } from 'react'
import type { KnowledgeData, KnowledgeNode } from '../types/knowledge'

type Props = {
  node: KnowledgeNode
  data: KnowledgeData
  onCancel: () => void
  onSubmit: (target: string, relation?: string) => void | Promise<void>
}

export default function RelationForm({ node, data, onCancel, onSubmit }: Props) {
  const candidates = data.nodes.filter((item) => item.id !== node.id)
  const [target, setTarget] = useState(candidates[0]?.id ?? '')
  const [relation, setRelation] = useState('相關概念')
  const [query, setQuery] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const filtered = candidates.filter((item) => item.title.toLowerCase().includes(query.toLowerCase()))

  useEffect(() => {
    if (!filtered.some((item) => item.id === target)) setTarget(filtered[0]?.id ?? '')
  }, [filtered, target])

  return (
    <div className="modal-backdrop">
      <form className="modal" onSubmit={async (event) => {
        event.preventDefault()
        if (!target || submitting) return
        setSubmitting(true)
        try {
          await onSubmit(target, relation.trim() || undefined)
        } finally {
          setSubmitting(false)
        }
      }}>
        <h2>新增關聯</h2>
        <p className="muted">目前節點：{node.title}</p>
        <label>搜尋節點<input value={query} onChange={(event) => setQuery(event.target.value)} /></label>
        <label>連結到<select value={target} onChange={(event) => setTarget(event.target.value)}>{filtered.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
        <label>關係<input value={relation} onChange={(event) => setRelation(event.target.value)} /></label>
        <div className="modal-actions"><button type="button" onClick={onCancel} disabled={submitting}>取消</button><button type="submit" disabled={!target || submitting}>{submitting ? '建立中…' : '建立連線'}</button></div>
      </form>
    </div>
  )
}
