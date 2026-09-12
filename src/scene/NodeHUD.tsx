import { useEffect, useState } from 'react'
import { NODE_TYPE_LABELS } from '../constants/nodeTypes'
import type { KnowledgeData, KnowledgeLink, KnowledgeNode } from '../types/knowledge'
import { openExternalLink } from '../utils/navigation'

type Props = {
  node?: KnowledgeNode
  data: KnowledgeData
  isAdmin?: boolean
  hasActionBar?: boolean
  onEdit: (node: KnowledgeNode) => void
  onDelete: (node: KnowledgeNode) => void
  onAddRelation: () => void
  onDeleteLink: (link: KnowledgeLink) => void
  onSelectRelatedNode: (node: KnowledgeNode) => void
}

function DrawerArrow({ direction }: { direction: 'left' | 'right' | 'up' | 'down' }) {
  const paths = {
    left: 'M11 6 5 12l6 6M5.75 12H19',
    right: 'M13 6l6 6-6 6M5 12h13.25',
    up: 'M6 11l6-6 6 6M12 5.75V19',
    down: 'M6 13l6 6 6-6M12 5v13.25',
  } satisfies Record<'left' | 'right' | 'up' | 'down', string>

  return (
    <svg className="drawer-arrow-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d={paths[direction]} />
    </svg>
  )
}

export default function NodeHUD({
  node,
  data,
  isAdmin = false,
  hasActionBar = false,
  onEdit,
  onDelete,
  onAddRelation,
  onDeleteLink,
  onSelectRelatedNode,
}: Props) {
  const [expanded, setExpanded] = useState(false)
  const [layoutMode, setLayoutMode] = useState<'side' | 'bottom'>('bottom')

  useEffect(() => {
    const updateLayoutMode = () => {
      const side = window.matchMedia('(min-width: 860px), (orientation: landscape)').matches
      setLayoutMode(side ? 'side' : 'bottom')
    }
    updateLayoutMode()
    window.addEventListener('resize', updateLayoutMode)
    window.addEventListener('orientationchange', updateLayoutMode)
    return () => {
      window.removeEventListener('resize', updateLayoutMode)
      window.removeEventListener('orientationchange', updateLayoutMode)
    }
  }, [])

  useEffect(() => {
    setExpanded(false)
  }, [node?.id, layoutMode])

  if (!node) return null

  const relations = data.links.filter((link) => link.source === node.id || link.target === node.id)
  const getNode = (id: string) => data.nodes.find((item) => item.id === id)
  const getTitle = (id: string) => getNode(id)?.title ?? id

  return (
    <aside className={`node-drawer ${expanded ? 'expanded' : 'collapsed'} ${layoutMode === 'side' ? 'side-drawer' : 'bottom-drawer'} ${hasActionBar ? 'with-action-bar' : 'without-action-bar'}`}>
      <button data-gesture-clickable="true" className="drawer-summary" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded}>
        <span>
          <small>{NODE_TYPE_LABELS[node.type]} / {node.category || '未分類'}</small>
          <strong>{node.title}</strong>
        </span>
        <span className="drawer-toggle" aria-hidden="true">
          <DrawerArrow direction={layoutMode === 'side' ? (expanded ? 'right' : 'left') : (expanded ? 'down' : 'up')} />
        </span>
      </button>
      <div className="drawer-content" aria-hidden={!expanded}>
        {node.tags?.length ? <div className="tag-row">{node.tags.map((tag) => <span key={tag}>{tag}</span>)}</div> : null}
        <p>{node.description || '尚未加入簡介。'}</p>
        <div className="hud-actions">
          {node.url ? <button data-gesture-clickable="true" data-gesture-href={node.url} onClick={() => openExternalLink(node.url ?? '')}>開啟連結</button> : null}
          {isAdmin ? (
            <>
              <button data-gesture-clickable="true" onClick={() => onEdit(node)}>編輯</button>
              <button data-gesture-clickable="true" onClick={onAddRelation}>新增關聯</button>
              <button data-gesture-clickable="true" className="danger" onClick={() => onDelete(node)}>刪除</button>
            </>
          ) : null}
        </div>
        <div className="relation-list">
          <h3>關聯節點</h3>
          {relations.length === 0 ? <p className="muted">尚無關聯。</p> : relations.map((link) => {
            const other = link.source === node.id ? link.target : link.source
            const relatedNode = getNode(other)
            return (
              <div className="relation-item" key={link.id}>
                <button
                  className="relation-link"
                  type="button"
                  data-gesture-clickable="true"
                  data-gesture-click-sound="handled"
                  disabled={!relatedNode}
                  onClick={() => relatedNode && onSelectRelatedNode(relatedNode)}
                >
                  <span>{getTitle(other)} <small>{link.relation || '相關'}</small></span>
                </button>
                {isAdmin ? <button data-gesture-clickable="true" aria-label="刪除關聯" onClick={() => onDeleteLink(link)}>刪除</button> : null}
              </div>
            )
          })}
        </div>
      </div>
    </aside>
  )
}
