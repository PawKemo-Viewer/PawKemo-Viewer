import { useState } from "react"
import { getSettings, updateSettings, api } from "../api"
import { creatorsCount, getMeta, setMeta } from "../db"
import { navigate } from "../router"

export function SettingsPage() {
  const s = getSettings()
  const [apiBase, setApiBase] = useState(s.apiBase)
  const [sessionKey, setSessionKey] = useState(s.sessionKey)
  const [saved, setSaved] = useState(false)
  const [testResult, setTestResult] = useState<string | null>(null)
  const [version, setVersion] = useState<string>("")

  const save = () => {
    updateSettings({ apiBase: apiBase.trim() || "/api/v1", sessionKey: sessionKey.trim() })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const testSession = async () => {
    setTestResult("テスト中…")
    try {
      await api.accountFavorites("artist")
      setTestResult("✅ お気に入りを取得できました (セッション有効)")
    } catch (e) {
      setTestResult(`❌ 失敗: ${e instanceof Error ? e.message : e}`)
    }
  }

  const clearCreatorCache = async () => {
    // creators ストアを全消去 (簡易に localStorage 経由ではなく IDB を直接)
    const req = indexedDB.open("pawchive-viewer")
    req.onsuccess = () => {
      const db = req.result
      const t = db.transaction("creators", "readwrite")
      t.objectStore("creators").clear()
      t.oncomplete = async () => {
        await setMeta("creatorsFetchedAt", undefined)
        setTestResult("クリエイターキャッシュを消去しました")
      }
    }
  }

  const showVersion = async () => {
    try {
      setVersion(await api.version())
    } catch {
      setVersion("取得失敗")
    }
  }

  return (
    <div className="page settings">
      <h2>設定</h2>

      <h2>ログイン</h2>
      <div className="settings-actions">
        <button className="btn btn-primary" onClick={() => navigate("/login?next=/settings")}>
          ID / パスワードでログイン
        </button>
        <small className="small">
          ログインするとセッションキーが自動設定されます。手動での貼り付けは下のフィールドでも可能です。
        </small>
      </div>

      <label className="field">
        <span>pawchive セッションキー (お気に入り同期に使用)</span>
        <input
          type="password"
          value={sessionKey}
          onChange={(e) => setSessionKey(e.target.value)}
          placeholder="pawchive.pw ログイン後の cookie: session=xxxx"
        />
        <small>
          pawchive.pw にログイン → DevTools → アプリケーション → Cookie → <code>session</code> の値をコピー。
          この端末のブラウザにのみ保存され、API リクエスト時だけプロキシ経由で pawchive に送られます。
        </small>
        <button className="btn" onClick={testSession}>
          セッションをテスト
        </button>
        {testResult && <span className="small">{testResult}</span>}
      </label>

      <label className="field">
        <span>API ベース URL (通常は変更不要)</span>
        <input value={apiBase} onChange={(e) => setApiBase(e.target.value)} placeholder="/api/v1" />
        <small>
          既定は同オリジンの <code>/api/v1</code> (Cloudflare Pages Functions のプロキシ)。
          ローカル開発時は Vite のプロキシが応答します。
        </small>
      </label>

      <div className="settings-actions">
        <button className="btn btn-primary" onClick={save}>
          保存
        </button>
        {saved && <span className="ok">保存しました</span>}
      </div>

      <h2>キャッシュ</h2>
      <div className="settings-actions">
        <button className="btn" onClick={clearCreatorCache}>
          クリエイターキャッシュを消去
        </button>
      </div>

      <h2>情報</h2>
      <div className="settings-actions">
        <button className="btn" onClick={showVersion}>
          サーバーのバージョン (git hash)
        </button>
        {version && <code className="small">{version}</code>}
      </div>

      <h2>このアプリについて</h2>
      <p className="small">
        Pawchive Viewer は <a href="https://pawchive.pw" target="_blank" rel="noreferrer">pawchive.pw</a> 非公式の閲覧クライアントです。
        公式 API (<code>/api/v1</code>) のみを使用します。データは端末内に保存されます。
      </p>
    </div>
  )
}
