import { useEffect, useState } from 'react'
import type { KnowledgeNode, NodeType } from '../types/knowledge'

type FormValue = Omit<KnowledgeNode, 'id' | 'createdAt' | 'updatedAt'>

type Props = {
  node?: KnowledgeNode
  onCancel: () => void
  onSubmit: (value: FormValue) => void
}

const types: NodeType[] = ['topic', 'resource', 'website', 'project', 'file']

export default function NodeForm({ node, onCancel, onSubmit }: Props) {
  const [value, setValue] = useState<FormValue>({
    title: '',
    type: 'topic',
    category: '',
    description: '',
    tags: [],
    url: '',
  })

  useEffect(() => {
    if (node) setValue({ title: node.title, type: node.type, category: node.category, description: node.description, tags: node.tags ?? [], url: node.url ?? '' })
  }, [node])

  return (
    <div className="modal-backdrop">
      <form
        className="modal"
        onSubmit={(event) => {
          event.preventDefault()
          if (!value.title.trim()) return
          onSubmit({
            ...value,
            title: value.title.trim(),
            category: value.category?.trim(),
            description: value.description?.trim(),
            tags: value.tags?.filter(Boolean),
            url: value.url?.trim() || undefined,
          })
        }}
      >
        <h2>{node ? '編輯節點' : '新增節點'}</h2>
        <label>標題<input required value={value.title} onChange={(event) => setValue({ ...value, title: event.target.value })} /></label>
        <label>類型<select value={value.type} onChange={(event) => setValue({ ...value, type: event.target.value as NodeType })}>{types.map((type) => <option key={type}>{type}</option>)}</select></label>
        <label>分類<input value={value.category ?? ''} onChange={(event) => setValue({ ...value, category: event.target.value })} /></label>
        <label>簡介<textarea value={value.description ?? ''} onChange={(event) => setValue({ ...value, description: event.target.value })} /></label>
        <label>Tags<input value={(value.tags ?? []).join(', ')} onChange={(event) => setValue({ ...value, tags: event.target.value.split(',').map((tag) => tag.trim()) })} /></label>
        <label>URL<input type="url" value={value.url ?? ''} onChange={(event) => setValue({ ...value, url: event.target.value })} /></label>
        <div className="modal-actions"><button type="button" onClick={onCancel}>取消</button><button type="submit">儲存</button></div>
      </form>
    </div>
  )
}
