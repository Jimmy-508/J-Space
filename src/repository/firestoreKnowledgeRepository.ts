import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  setDoc,
  writeBatch,
  type DocumentData,
  type QueryDocumentSnapshot,
} from 'firebase/firestore'
import { db } from '../firebase'
import type { KnowledgeData, KnowledgeLink, KnowledgeNode } from '../types/knowledge'

const NODES_COLLECTION = 'nodes'
const CONNECTIONS_COLLECTION = 'connections'

const removeUndefinedFields = <T extends Record<string, unknown>>(value: T): Record<string, unknown> =>
  Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined))

const toKnowledgeNode = (snapshot: QueryDocumentSnapshot<DocumentData>): KnowledgeNode => {
  const data = snapshot.data() as Partial<KnowledgeNode>
  return {
    id: data.id ?? snapshot.id,
    title: data.title ?? '',
    type: data.type ?? 'topic',
    category: data.category,
    description: data.description,
    tags: Array.isArray(data.tags) ? data.tags : [],
    url: data.url,
    createdAt: data.createdAt ?? new Date(0).toISOString(),
    updatedAt: data.updatedAt ?? new Date(0).toISOString(),
  }
}

const toKnowledgeLink = (snapshot: QueryDocumentSnapshot<DocumentData>): KnowledgeLink => {
  const data = snapshot.data() as Partial<KnowledgeLink>
  return {
    id: data.id ?? snapshot.id,
    source: data.source ?? '',
    target: data.target ?? '',
    relation: data.relation,
  }
}

export async function loadNodes(): Promise<KnowledgeNode[]> {
  const snapshot = await getDocs(collection(db, NODES_COLLECTION))
  return snapshot.docs.map(toKnowledgeNode)
}

export async function loadConnections(): Promise<KnowledgeLink[]> {
  const snapshot = await getDocs(collection(db, CONNECTIONS_COLLECTION))
  return snapshot.docs.map(toKnowledgeLink)
}

export async function loadAll(): Promise<KnowledgeData> {
  const [nodes, links] = await Promise.all([loadNodes(), loadConnections()])
  return { nodes, links }
}

export function subscribeAll(
  onData: (data: KnowledgeData) => void,
  onError: (error: unknown) => void,
): () => void {
  let nodes: KnowledgeNode[] = []
  let links: KnowledgeLink[] = []
  let nodesReady = false
  let connectionsReady = false
  const emitWhenReady = () => {
    if (nodesReady && connectionsReady) onData({ nodes, links })
  }

  const unsubscribeNodes = onSnapshot(
    collection(db, NODES_COLLECTION),
    (snapshot) => {
      nodes = snapshot.docs.map(toKnowledgeNode)
      nodesReady = true
      emitWhenReady()
    },
    onError,
  )
  const unsubscribeConnections = onSnapshot(
    collection(db, CONNECTIONS_COLLECTION),
    (snapshot) => {
      links = snapshot.docs.map(toKnowledgeLink)
      connectionsReady = true
      emitWhenReady()
    },
    onError,
  )

  return () => {
    unsubscribeNodes()
    unsubscribeConnections()
  }
}

export async function saveNode(node: KnowledgeNode): Promise<void> {
  await setDoc(doc(db, NODES_COLLECTION, node.id), removeUndefinedFields({
    ...node,
    syncedAt: serverTimestamp(),
  }))
}

export async function deleteNode(nodeId: string): Promise<void> {
  const batch = writeBatch(db)
  batch.delete(doc(db, NODES_COLLECTION, nodeId))

  const connectionsSnapshot = await getDocs(collection(db, CONNECTIONS_COLLECTION))
  connectionsSnapshot.docs.forEach((snapshot) => {
    const connection = toKnowledgeLink(snapshot)
    if (connection.source === nodeId || connection.target === nodeId) {
      batch.delete(snapshot.ref)
    }
  })

  await batch.commit()
}

export async function saveConnection(connection: KnowledgeLink): Promise<void> {
  if (!connection.id || !connection.source || !connection.target || connection.source === connection.target) {
    throw new Error('Invalid Firestore connection data')
  }
  await setDoc(doc(db, CONNECTIONS_COLLECTION, connection.id), removeUndefinedFields({
    ...connection,
    syncedAt: serverTimestamp(),
  }))
}

export async function deleteConnection(connectionId: string): Promise<void> {
  await deleteDoc(doc(db, CONNECTIONS_COLLECTION, connectionId))
}

export const firestoreKnowledgeRepository = {
  loadNodes,
  loadConnections,
  loadAll,
  subscribeAll,
  saveNode,
  deleteNode,
  saveConnection,
  deleteConnection,
}
