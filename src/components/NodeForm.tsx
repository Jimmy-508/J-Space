import { useEffect, useState } from 'react'
import { NODE_TYPE_LABELS, NODE_TYPES } from '../constants/nodeTypes'
import type { ContentType, KnowledgeNode, NodeType } from '../types/knowledge'

type FormValue = Omit<KnowledgeNode, 'id' | 'createdAt' | 'updatedAt'>

type Props = {
  node?: KnowledgeNode
  onCancel: () => void
  onSubmit: (value: FormValue) => void
}

export default function NodeForm({ node, onCancel, onSubmit }: Props) {
  const [value, setValue] = useState<FormValue>({
    title: '',
    type: 'topic',
    category: '',
    description: '',
    tags: [],
    url: '',
    contentType: undefined,
    imageUrl: '',
  })

  useEffect(() => {
    if (node) setValue({
      title: node.title,
      type: node.type,
      category: node.category,
      description: node.description,
      tags: node.tags ?? [],
      url: node.url ?? '',
      contentType: node.contentType,
      imageUrl: node.imageUrl ?? '',
    })
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
            contentType: value.contentType,
            imageUrl: value.contentType === 'image' ? value.imageUrl?.trim() || undefined : undefined,
          })
        }}
      >
        <h2>{node ? '編輯節點' : '新增節點'}</h2>
        <label>標題<input required value={value.title} onChange={(event) => setValue({ ...value, title: event.target.value })} /></label>
        <label>類型<select value={value.type} onChange={(event) => setValue({ ...value, type: event.target.value as NodeType })}>{NODE_TYPES.map((type) => <option key={type} value={type}>{NODE_TYPE_LABELS[type]}</option>)}</select></label>
        <label>分類<input value={value.category ?? ''} onChange={(event) => setValue({ ...value, category: event.target.value })} /></label>
        <label>簡介<textarea value={value.description ?? ''} onChange={(event) => setValue({ ...value, description: event.target.value })} /></label>
        <label>Tags<input value={(value.tags ?? []).join(', ')} onChange={(event) => setValue({ ...value, tags: event.target.value.split(',').map((tag) => tag.trim()) })} /></label>
        <label>URL<input type="url" value={value.url ?? ''} onChange={(event) => setValue({ ...value, url: event.target.value })} /></label>
        <label>
          內容類型
          <select
            value={value.contentType ?? ''}
            onChange={(event) => setValue({ ...value, contentType: (event.target.value || undefined) as ContentType | undefined })}
          >
            <option value="">一般節點</option>
            <option value="image">圖片</option>
          </select>
        </label>
        {value.contentType === 'image' ? (
          <label>圖片 URL<input required type="url" value={value.imageUrl ?? ''} onChange={(event) => setValue({ ...value, imageUrl: event.target.value })} /></label>
        ) : null}
        <div className="modal-actions"><button type="button" onClick={onCancel}>取消</button><button type="submit">儲存</button></div>
      </form>
    </div>
  )
}
