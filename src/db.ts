// IndexedDB ヘルパー: クリエイターキャッシュと未読管理

const DB_NAME = "pawchive-viewer"
const DB_VERSION = 1

type StoreName = "creators" | "seen" | "meta"

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains("creators")) {
        const s = db.createObjectStore("creators", { keyPath: "key" })
        s.createIndex("name", "nameLower")
      }
      if (!db.objectStoreNames.contains("seen")) {
        db.createObjectStore("seen", { keyPath: "key" })
      }
      if (!db.objectStoreNames.contains("meta")) {
        db.createObjectStore("meta", { keyPath: "key" })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

function tx<T>(store: StoreName, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode)
        const req = fn(t.objectStore(store))
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      }),
  )
}

// ---------------------------------------------------------------------------
// creators キャッシュ: /creators (約10万件) を 1 回取得して永続化
// ---------------------------------------------------------------------------

export interface CreatorRow {
  key: string // "service:id"
  id: string
  service: string
  name: string
  nameLower: string
}

export async function saveCreators(rows: CreatorRow[]) {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction("creators", "readwrite")
    const s = t.objectStore("creators")
    for (const r of rows) s.put(r)
    t.oncomplete = () => resolve()
    t.onerror = () => reject(t.error)
  })
  await setMeta("creatorsFetchedAt", Date.now())
}

export async function creatorsCount(): Promise<number> {
  return tx("creators", "readonly", (s) => s.count())
}

/** 名前/ID で先頭から最大 limit 件検索 */
export async function searchCreators(q: string, limit = 60): Promise<CreatorRow[]> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const t = db.transaction("creators", "readonly")
    const out: CreatorRow[] = []
    const ql = q.toLowerCase()
    const cursorReq = t.objectStore("creators").openCursor()
    cursorReq.onsuccess = () => {
      const c = cursorReq.result
      if (!c || out.length >= limit) return resolve(out)
      const row = c.value as CreatorRow
      if (!q || row.nameLower.includes(ql) || row.id.includes(q)) out.push(row)
      c.continue()
    }
    cursorReq.onerror = () => reject(cursorReq.error)
  })
}

export async function getCreatorRow(key: string): Promise<CreatorRow | undefined> {
  return tx("creators", "readonly", (s) => s.get(key))
}

// ---------------------------------------------------------------------------
// meta
// ---------------------------------------------------------------------------

export async function setMeta(key: string, value: unknown) {
  await tx("meta", "readwrite", (s) => s.put({ key, value }))
}

export async function getMeta<T>(key: string): Promise<T | undefined> {
  const row = await tx<{ key: string; value: T } | undefined>("meta", "readonly", (s) => s.get(key))
  return row?.value
}

// ---------------------------------------------------------------------------
// 未読管理: クリエイターごとに「最後に確認した最新投稿ID」を保存
// ---------------------------------------------------------------------------

export interface SeenEntry {
  key: string // "service:id"
  lastSeenPostId: string
  checkedAt: number
  /** 最後に確認した最新投稿 (クールダウン中の再チェックでネットワークを避けるため) */
  newest?: { id: string; title?: string; published?: string }
}

export async function setSeen(
  key: string,
  lastSeenPostId: string,
  newest?: { id: string; title?: string; published?: string },
) {
  await tx("seen", "readwrite", (s) =>
    s.put({ key, lastSeenPostId, checkedAt: Date.now(), newest }),
  )
}

export async function getSeen(key: string): Promise<SeenEntry | undefined> {
  return tx("seen", "readonly", (s) => s.get(key))
}

export async function getAllSeen(): Promise<SeenEntry[]> {
  return tx("seen", "readonly", (s) => s.getAll())
}

export async function deleteSeen(key: string) {
  await tx("seen", "readwrite", (s) => s.delete(key))
}
