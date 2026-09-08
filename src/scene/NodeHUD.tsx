import type { KnowledgeData, KnowledgeLink, KnowledgeNode, NodeType } from '../types/knowledge'

type Props = {
  node?: KnowledgeNode
  data: KnowledgeData
  onEdit: (node: KnowledgeNode) => void
  onDelete: (node: KnowledgeNode) => void
  onAddRelation: () => void
  onDeleteLink: (link: KnowledgeLink) => void
}

const typeLabels: Record<NodeType, string> = {
  topic: '主題',
  resource: '資源',
  website: '網站',
  project: '作品',
  file: '檔案',
}

export default function NodeHUD({ node, data, onEdit, onDelete, onAddRelation, onDeleteLink }: Props) {
  if (!node) {
    return (
      <aside className="hud empty">
        <h2>J-Space Prototype</h2>
        <p>選取星體節點，檢視教材、知識與作品之間的連結。</p>
      </aside>
    )
  }

  const relations = data.links.filter((link) => link.source === node.id || link.target === node.id)
  const getTitle = (id: string) => data.nodes.find((item) => item.id === id)?.title ?? id

  return (
    <aside className="hud">
      <div className="hud-kicker">{typeLabels[node.type]} / {node.category || '未分類'}</div>
      <h2>{node.title}</h2>
      {node.tags?.length ? <div className="tag-row">{node.tags.map((tag) => <span key={tag}>{tag}</span>)}</div> : null}
      <p>{node.description || '尚未加入簡介。'}</p>
      <div className="hud-actions">
        {node.url ? <button onClick={() => window.open(node.url, '_blank', 'noopener,noreferrer')}>開啟連結</button> : null}
        <button onClick={() => onEdit(node)}>編輯</button>
        <button onClick={onAddRelation}>新增關聯</button>
        <button className="danger" onClick={() => onDelete(node)}>刪除</button>
      </div>
      <div className="relation-list">
        <h3>既有關聯</h3>
        {relations.length === 0 ? <p className="muted">尚無關聯。</p> : relations.map((link) => {
          const other = link.source === node.id ? link.target : link.source
          return (
            <div className="relation-item" key={link.id}>
              <span>{getTitle(other)} <small>{link.relation || '相關'}</small></span>
              <button aria-label="刪除關聯" onClick={() => onDeleteLink(link)}>刪除</button>
            </div>
          )
        })}
      </div>
    </aside>
  )
}
