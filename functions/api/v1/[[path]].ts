// Cloudflare Pages Functions: /api/v1/* を pawchive.pw/api/v1/* にプロキシする。
// 同一オリジンで配信するため CORS は不要。
// セッションキーは x-pawchive-session ヘッダで受け取り、pawchive へは cookie(session=) に変換する。

const UPSTREAM = "https://pawchive.pw/api/v1"

interface Env {
  /** npx wrangler pages secret put PAWCHIVE_SESSION で設定した既定セッションキー (任意) */
  PAWCHIVE_SESSION?: string
}

export const onRequest: PagesFunction<Env> = async ({
  request,
  params,
  env,
}) => {
  const url = new URL(request.url)
  const path = (params.path as string) || ""
  const target = `${UPSTREAM}/${path}${url.search}`

  const headers = new Headers(request.headers)

  // Cloudflare / Proxy 系ヘッダを削除
  headers.delete("host")
  headers.delete("cf-ray")
  headers.delete("cf-connecting-ip")
  headers.delete("x-forwarded-for")
  headers.delete("x-real-ip")

  // ブラウザ固有ヘッダを削除
  headers.delete("sec-fetch-site")
  headers.delete("sec-fetch-mode")
  headers.delete("sec-fetch-dest")
  headers.delete("sec-fetch-user")
  headers.delete("sec-ch-ua")
  headers.delete("sec-ch-ua-mobile")
  headers.delete("sec-ch-ua-platform")

  // Origin / Referer を pawchive 本体に偽装
  headers.set("referer", "https://pawchive.pw/")
  headers.set("origin", "https://pawchive.pw")

  // Chrome UA 偽装
  headers.set(
    "user-agent",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36"
  )

  headers.set(
    "accept",
    "application/json,text/plain,*/*"
  )

  headers.set(
    "accept-language",
    "ja,en-US;q=0.9,en;q=0.8"
  )

  // セッションキー
  const session =
    request.headers.get("x-pawchive-session") ??
    env.PAWCHIVE_SESSION

  if (session) {
    headers.set("cookie", `session=${session}`)
  }

  console.log("[REQUEST META]", {
    path,
    target,
    method: request.method,
    hasSession: !!session,
  })

  console.log(
    "[REQUEST HEADERS]",
    JSON.stringify(
      Object.fromEntries(headers.entries()),
      null,
      2
    )
  )

  const upstream = await fetch(target, {
    method: request.method,
    headers,
    body:
      request.method === "GET" ||
      request.method === "HEAD"
        ? undefined
        : request.body,
    redirect: "manual",
  })

  console.log("[UPSTREAM]", {
    target,
    status: upstream.status,
    statusText: upstream.statusText,
  })

  console.log("[RESPONSE HEADERS SUMMARY]", {
    server: upstream.headers.get("server"),
    cfCacheStatus: upstream.headers.get("cf-cache-status"),
    contentType: upstream.headers.get("content-type"),
    location: upstream.headers.get("location"),
    cfRay: upstream.headers.get("cf-ray"),
    cfMitigated: upstream.headers.get("cf-mitigated"),
  })

  console.log(
    "[RESPONSE HEADERS FULL]",
    JSON.stringify(
      Object.fromEntries(upstream.headers.entries()),
      null,
      2
    )
  )

  // エラー時は詳細デバッグJSONを返す
  if (!upstream.ok) {
    const text = await upstream.text()

    const requestHeaders =
      Object.fromEntries(headers.entries())

    const responseHeaders =
      Object.fromEntries(upstream.headers.entries())

    const debug = {
      timestamp: new Date().toISOString(),

      request: {
        method: request.method,
        originalUrl: request.url,
        path,
        target,
        headers: requestHeaders,
      },

      response: {
        status: upstream.status,
        statusText: upstream.statusText,
        headers: responseHeaders,
        body: text.slice(0, 20000),
      },
    }

    console.error(
      "[PAWCHIVE DEBUG]",
      JSON.stringify(debug, null, 2)
    )

    return new Response(
      JSON.stringify(debug, null, 2),
      {
        status: upstream.status,
        headers: {
          "content-type":
            "application/json; charset=utf-8",
        },
      }
    )
  }

  const resHeaders = new Headers()

  resHeaders.set(
    "content-type",
    upstream.headers.get("content-type") ??
      "application/json"
  )

  const cacheControl =
    upstream.headers.get("cache-control")

  resHeaders.set(
    "cache-control",
    cacheControl ??
      (
        request.method === "GET"
          ? "public, max-age=60"
          : "no-store"
      )
  )

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: resHeaders,
  })
}