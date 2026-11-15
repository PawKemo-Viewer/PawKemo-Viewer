import { useCallback, useEffect, useRef, useState } from "react"
import { api } from "../api"
import type { PawPost } from "../types"
import { PostGrid, ErrorBox } from "../components"
import { useNavigate } from "../router"
import { useScrollMemory } from "../hooks"

const PAGE = 50
const MIN_QUERY = 3

export function HomePage({ query }: { query: URLSearchParams }) {
  const q = query.get("q") || ""
  const nav = useNavigate()
  const [posts, setPosts] = useState<PawPost[]>([])
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [input, setInput] = useState(q)
  const reqSeq = useRef(0)
  const tooShort = q.length > 0 && q.length < MIN_QUERY
  const scrollKey = `home:${q}`

  useEffect(() => {
    setInput(q)
    setPosts([])
    setOffset(0)
    setDone(false)
    setError(null)
  }, [q])

  const load = useCallback(
    async (o: number, replace: boolean) => {
      const seq = ++reqSeq.current
      setLoading(true)
      setError(null)
      try {
        const res = await api.posts({ q: q || undefined, o })
        if (seq !== reqSeq.current) return // 古いレスポンスは破棄
        setPosts((prev) => (replace ? res : [...prev, ...res]))
        setOffset(o)
        if (res.length < PAGE) setDone(true)
      } catch (e) {
        if (seq === reqSeq.current) setError(e)
      } finally {
        if (seq === reqSeq.current) setLoading(false)
      }
    },
    [q],
  )

  useEffect(() => {
    if (tooShort) return
    load(0, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q])

  useScrollMemory(scrollKey, posts.length > 0 || done)

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (input.trim() && input.trim().length < MIN_QUERY) return
    nav(input.trim() ? `/search?q=${encodeURIComponent(input.trim())}` : "/", true)
  }

  return (
    <div className="page">
      <form className="search-bar" onSubmit={submit}>
        <input
          type="search"
          placeholder="投稿を検索 (3文字以上)"
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <button type="submit" className="btn">
          検索
        </button>
      </form>
      {tooShort && <div className="hint-row">検索ワードは3文字以上入力してください</div>}
      {q && !tooShort && (
        <div className="hint-row">
          <span>「{q}」の検索結果</span>
          <button className="btn btn-ghost" onClick={() => nav("/", true)}>
            クリア
          </button>
        </div>
      )}
      {error !== null && <ErrorBox error={error} onRetry={() => load(offset, offset === 0)} />}
      {!tooShort && (
        <PostGrid
          posts={posts}
          loading={loading}
          done={done}
          onEndReached={loading || done ? undefined : () => load(offset + PAGE, false)}
        />
      )}
      {!loading && !error && posts.length === 0 && done && (
        <div className="empty">投稿がありません</div>
      )}
    </div>
  )
}

export { MIN_QUERY }
