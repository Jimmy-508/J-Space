import type { NodeType } from '../types/knowledge'

export const NODE_TYPES: NodeType[] = ['topic', 'resource', 'website', 'project', 'file']

export const NODE_TYPE_LABELS: Record<NodeType, string> = {
  topic: '主題',
  resource: '資源',
  website: '網站',
  project: '作品',
  file: '檔案',
}
