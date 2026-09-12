export type NodeType = 'topic' | 'resource' | 'website' | 'project' | 'file'

export type ContentType = 'image' | 'website' | 'project' | 'file' | 'video' | 'pdf'

export type KnowledgeNode = {
  id: string
  title: string
  type: NodeType
  category?: string
  description?: string
  tags?: string[]
  url?: string
  contentType?: ContentType
  imageUrl?: string
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
