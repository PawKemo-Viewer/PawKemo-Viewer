// Pages Function: POST /api/login
// pawchive.pw /account/login にフォーム送信し、発行された session cookie を取得。
// 注意: pawchive は認証失敗時でも flash メッセージ入りの session cookie を発行するため、
// 取得したキーで /api/v1/account/favorites を叩いて有効性を検証してから返す。
// 認証情報は中継時にのみ使用し保存しない。

const LOGIN_URL = "https://pawchive.pw/account/login"
const FAVORITES_URL = "https://pawchive.pw/api/v1/account/favorites?type=artist"

interface LoginResult {
  ok: boolean
  session?: string
  status?: number
}

function extractSession(headers: Headers): string | null {
  // Headers.getSetCookie() は Cloudflare Workers / Node(undici) 両対応
  for (const c of headers.getSetCookie?.() || []) {
    const m = c.match(/(?:^|;\s*)session=([^;]+)/)
    if (m && m[1] && m[1] !== "") return m[1]
  }
  return null
}

/** session キーが実際に有効かを お気に入り API で確認 */
async function verifySession(session: string): Promise<boolean> {
  try {
    const r = await fetch(FAVORITES_URL, {
      redirect: "manual", // 未ログイン時はログインページへ 302 する
      headers: { cookie: `session=${session}` },
    })
    if (r.status >= 300 && r.status < 400) return false
    const ct = r.headers.get("content-type") || ""
    return r.ok && ct.includes("application/json")
  } catch {
    return false
  }
}

export async function doLogin(username: string, password: string): Promise<LoginResult> {
  const body = new URLSearchParams({ username, password, location: "/login" })
  let up: Response
  try {
    up = await fetch(LOGIN_URL, {
      method: "POST",
      body,
      redirect: "manual",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "user-agent": "PawchiveViewer/1.0",
      },
    })
  } catch {
    return { ok: false, status: 0 }
  }

  const session = extractSession(up.headers)
  if (!session) {
    // cookie が全く発行されない場合 (3xx リダイレクトはあるがキーが取れない環境など)
    if (up.status >= 300 && up.status < 400) {
      return { ok: true, status: up.status }
    }
    return { ok: false, status: up.status }
  }

  // 失敗時でも flash 入りの session が発行されるため必ず検証する
  const valid = await verifySession(session)
  if (valid) {
    return { ok: true, session, status: up.status }
  }
  return { ok: false, status: 401 }
}

export const onRequestPost: PagesFunction = async ({ request }) => {
  let username = ""
  let password = ""
  try {
    const data = (await request.json()) as { username?: string; password?: string }
    username = data.username || ""
    password = data.password || ""
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "bad request" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    })
  }
  if (!username || !password) {
    return new Response(JSON.stringify({ ok: false, error: "ユーザー名とパスワードを入力してください" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    })
  }
  const result = await doLogin(username, password)
  const headers = { "content-type": "application/json", "cache-control": "no-store" }
  if (result.ok) {
    return new Response(JSON.stringify(result), { status: 200, headers })
  }
  return new Response(
    JSON.stringify({ ok: false, error: "ユーザー名またはパスワードが正しくありません" }),
    { status: 401, headers },
  )
}

export const onRequest: PagesFunction = async () =>
  new Response(JSON.stringify({ error: "method not allowed" }), {
    status: 405,
    headers: { "content-type": "application/json" },
  })
