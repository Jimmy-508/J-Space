import { defaultKnowledge } from '../data/defaultKnowledge'
import type { KnowledgeData, KnowledgeLink, KnowledgeNode } from '../types/knowledge'

const STORAGE_KEY = 'j-space.knowledge.v1'

const cloneData = (data: KnowledgeData): KnowledgeData => ({
  nodes: data.nodes.map((node) => ({ ...node, tags: [...(node.tags ?? [])] })),
  links: data.links.map((link) => ({ ...link })),
})

export const validateKnowledgeData = (value: unknown): value is KnowledgeData => {
  if (!value || typeof value !== 'object') return false
  const data = value as KnowledgeData
  if (!Array.isArray(data.nodes) || !Array.isArray(data.links)) return false
  return data.nodes.every((node) =>
    node &&
    typeof node.id === 'string' &&
    typeof node.title === 'string' &&
    ['topic', 'resource', 'website', 'project', 'file'].includes(node.type) &&
    typeof node.createdAt === 'string' &&
    typeof node.updatedAt === 'string',
  ) && data.links.every((link) =>
    link &&
    typeof link.id === 'string' &&
    typeof link.source === 'string' &&
    typeof link.target === 'string',
  )
}

export const knowledgeRepository = {
  load(): KnowledgeData {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return cloneData(defaultKnowledge)
    try {
      const parsed = JSON.parse(raw) as unknown
      return validateKnowledgeData(parsed) ? cloneData(parsed) : cloneData(defaultKnowledge)
    } catch {
      return cloneData(defaultKnowledge)
    }
  },

  save(data: KnowledgeData): KnowledgeData {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    return cloneData(data)
  },

  addNode(data: KnowledgeData, node: Omit<KnowledgeNode, 'id' | 'createdAt' | 'updatedAt'>): KnowledgeData {
    const timestamp = new Date().toISOString()
    const next: KnowledgeData = {
      ...data,
      nodes: [
        ...data.nodes,
        {
          ...node,
          id: crypto.randomUUID(),
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      ],
    }
    return this.save(next)
  },

  updateNode(data: KnowledgeData, id: string, patch: Partial<Omit<KnowledgeNode, 'id' | 'createdAt'>>): KnowledgeData {
    const next: KnowledgeData = {
      ...data,
      nodes: data.nodes.map((node) =>
        node.id === id ? { ...node, ...patch, updatedAt: new Date().toISOString() } : node,
      ),
    }
    return this.save(next)
  },

  deleteNode(data: KnowledgeData, id: string): KnowledgeData {
    const next: KnowledgeData = {
      nodes: data.nodes.filter((node) => node.id !== id),
      links: data.links.filter((link) => link.source !== id && link.target !== id),
    }
    return this.save(next)
  },

  addLink(data: KnowledgeData, link: Omit<KnowledgeLink, 'id'>): KnowledgeData {
    if (link.source === link.target) return cloneData(data)
    const exists = data.links.some((item) =>
      (item.source === link.source && item.target === link.target) ||
      (item.source === link.target && item.target === link.source),
    )
    if (exists) return cloneData(data)
    const next: KnowledgeData = {
      ...data,
      links: [...data.links, { ...link, id: crypto.randomUUID() }],
    }
    return this.save(next)
  },

  deleteLink(data: KnowledgeData, id: string): KnowledgeData {
    return this.save({ ...data, links: data.links.filter((link) => link.id !== id) })
  },

  reset(): KnowledgeData {
    return this.save(cloneData(defaultKnowledge))
  },
}
