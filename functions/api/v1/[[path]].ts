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

const headers = new Headers(request.headers)

// Cloudflare系ヘッダを削除
headers.delete("host")
headers.delete("cf-ray")
headers.delete("cf-connecting-ip")
headers.delete("x-forwarded-for")
headers.delete("x-real-ip")

// Chrome UAを偽装
headers.set(
  "user-agent",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36"
)

headers.set("accept", "*/*")
headers.set("accept-language", "ja,en-US;q=0.9,en;q=0.8")
headers.set("referer", "https://pawchive.pw/")
headers.set("origin", "https://pawchive.pw")

const session =
  request.headers.get("x-pawchive-session") ||
  env?.PAWCHIVE_SESSION

if (session) {
  headers.set("cookie", `session=${session}`)
}

const upstream = await fetch(target, {
  method: request.method,
  headers,
  body: ["GET", "HEAD"].includes(request.method)
    ? undefined
    : request.body,
  redirect: "manual",
})

if (!upstream.ok) {
  const text = await upstream.text()

  return new Response(text, {
    status: upstream.status,
    headers: {
      "content-type": "text/html; charset=utf-8"
    }
  })
}

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
