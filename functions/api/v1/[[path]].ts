// Cloudflare Pages Functions: /api/v1/* を pawchive.pw/api/v1/* にプロキシする。
// 同一オリジンで配信するため CORS は不要。セッションキーは
// x-pawchive-session ヘッダで受け取り、pawchive へは cookie (session=) に変換する。

const UPSTREAM = "https://pawchive.pw/api/v1"

interface Env {
  /** npx wrangler pages secret put PAWCHIVE_SESSION で設定した既定セッションキー (任意) */
  PAWCHIVE_SESSION?: string
}

export const onRequest: PagesFunction<Env> = async ({ request, params, env }) => {
  const url = new URL(request.url)
  const path = (params.path as string) || ""
  const target = `${UPSTREAM}/${path}${url.search}`

  const headers = new Headers()
  const ct = request.headers.get("content-type")
  if (ct) headers.set("content-type", ct)
  const ua = request.headers.get("user-agent")
  headers.set("user-agent", ua || "PawchiveViewer/1.0")

  const session =
    request.headers.get("x-pawchive-session") ||
    (env ? env.PAWCHIVE_SESSION : undefined)
  if (session) {
    headers.set("cookie", `session=${session}`)
  }

  const upstream = await fetch(target, {
    method: request.method,
    headers,
    body: ["GET", "HEAD"].includes(request.method) ? undefined : request.body,
    redirect: "follow",
  })

  const resHeaders = new Headers()
  resHeaders.set("content-type", upstream.headers.get("content-type") || "application/json")
  const cc = upstream.headers.get("cache-control")
  resHeaders.set("cache-control", cc || (request.method === "GET" ? "public, max-age=60" : "no-store"))
  if (upstream.headers.has("set-cookie")) {
    // アップストリームの cookie はクライアントに転送しない (session は明示管理)
    void upstream.headers.get("set-cookie")
  }

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: resHeaders,
  })
}
