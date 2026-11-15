import { useCallback, useEffect, useState } from "react"
import { isFollowed, toggleFollow, loadFollows } from "../follows"
import { getSettings, api } from "../api"
import { getCreatorRow } from "../db"

export function FollowButton({ service, id }: { service: string; id: string }) {
  const [followed, setFollowed] = useState(() => isFollowed(service, id))
  const [busy, setBusy] = useState(false)

  // キャッシュ済みクリエイター名を補完 (フォローリスト表示用)
  useEffect(() => {
    let alive = true
    getCreatorRow(`${service}:${id}`).then((row) => {
      if (!alive || !row) return
      const list = loadFollows()
      const f = list.find((x) => x.service === service && x.id === id)
      if (f && f.name !== row.name && row.name) {
        f.name = row.name
        localStorage.setItem("pawchive-follows", JSON.stringify(list))
      }
    })
    return () => {
      alive = false
    }
  }, [service, id])

  const onToggle = useCallback(async () => {
    setBusy(true)
    let name = id
    const row = await getCreatorRow(`${service}:${id}`)
    if (row?.name) name = row.name
    const now = toggleFollow({ service, id, name })
    setFollowed(now)
    // sessionKey があればアカウント側にも同期 (失敗してもローカルは維持)
    const { sessionKey } = getSettings()
    if (sessionKey) {
      try {
        if (now) await api.favCreatorAdd(service, id)
        else await api.favCreatorRemove(service, id)
      } catch {
        /* ベストエフォート */
      }
    }
    setBusy(false)
  }, [service, id])

  return (
    <button
      className={`btn ${followed ? "btn-primary" : ""}`}
      disabled={busy}
      onClick={onToggle}
      title={followed ? "フォロー解除" : "フォロー"}
    >
      {followed ? "★ フォロー中" : "☆ フォロー"}
    </button>
  )
}

/** フォロー一覧の現在の数 */
export function followsCount() {
  return loadFollows().length
}
