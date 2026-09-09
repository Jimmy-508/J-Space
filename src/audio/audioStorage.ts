const DB_NAME = 'j-space-audio'
const STORE_NAME = 'files'
const MUSIC_KEY = 'backgroundMusic'

const openAudioDb = () => new Promise<IDBDatabase>((resolve, reject) => {
  const request = indexedDB.open(DB_NAME, 1)
  request.onupgradeneeded = () => {
    request.result.createObjectStore(STORE_NAME)
  }
  request.onerror = () => reject(request.error)
  request.onsuccess = () => resolve(request.result)
})

export type StoredBackgroundMusic = {
  blob: Blob
  name: string
  type: string
}

export async function loadBackgroundMusic() {
  if (typeof indexedDB === 'undefined') return undefined
  const db = await openAudioDb()
  return new Promise<StoredBackgroundMusic | undefined>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly')
    const request = transaction.objectStore(STORE_NAME).get(MUSIC_KEY)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result as StoredBackgroundMusic | undefined)
    transaction.oncomplete = () => db.close()
  })
}

export async function saveBackgroundMusic(file: File) {
  if (typeof indexedDB === 'undefined') return
  const db = await openAudioDb()
  const payload: StoredBackgroundMusic = {
    blob: file,
    name: file.name,
    type: file.type,
  }
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite')
    const request = transaction.objectStore(STORE_NAME).put(payload, MUSIC_KEY)
    request.onerror = () => reject(request.error)
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
  })
  db.close()
}

export async function clearBackgroundMusic() {
  if (typeof indexedDB === 'undefined') return
  const db = await openAudioDb()
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite')
    const request = transaction.objectStore(STORE_NAME).delete(MUSIC_KEY)
    request.onerror = () => reject(request.error)
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
  })
  db.close()
}
