export type NodeType = 'topic' | 'resource' | 'website' | 'project' | 'file'

export type KnowledgeNode = {
  id: string
  title: string
  type: NodeType
  category?: string
  description?: string
  tags?: string[]
  url?: string
  createdAt: string
  updatedAt: string
}

export type KnowledgeLink = {
  id: string
  source: string
  target: string
  relation?: string
}

export type KnowledgeData = {
  nodes: KnowledgeNode[]
  links: KnowledgeLink[]
}
