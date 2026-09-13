import type { KnowledgeNode } from '../types/knowledge'

export const SUMMON_NODE_ID = 'system:summon'

export const SUMMON_NODE: KnowledgeNode = {
  id: SUMMON_NODE_ID,
  title: '召喚',
  type: 'topic',
  category: '內建教學工具',
  description: '進入 J-Space 內建的數字召喚工具。',
  tags: ['system', 'tool', 'summon'],
  createdAt: 'system',
  updatedAt: 'system',
}

export const isSystemNode = (node?: Pick<KnowledgeNode, 'id'>) => node?.id === SUMMON_NODE_ID
