// Cloudflare Pages Functions: /api/v1/* を pawchive.pw/api/v1/* にプロキシする。
// 同一オリジンで配信するため CORS は不要。
// セッションキーは x-pawchive-session ヘッダで受け取り、pawchive へは cookie(session=) に変換する。

const UPSTREAM = "https://pawchive.pw/api/v1"

interface Env {
  PAWCHIVE_SESSION?: string
}

export const onRequest: PagesFunction<Env> = async ({
  request,
  params,
  env,
}) => {
  const url = new URL(request.url)
  const path = Array.isArray(params.path)
    ? params.path.join("/")
    : (params.path as string) || ""

  const target = `${UPSTREAM}/${path}${url.search}`

  //
  // 完全ホワイトリスト方式
  //
  const headers = new Headers()

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

  headers.set(
    "accept-encoding",
    "gzip, deflate, br"
  )

  headers.set(
    "referer",
    "https://pawchive.pw/"
  )

  headers.set(
    "origin",
    "https://pawchive.pw"
  )

  headers.set(
    "cache-control",
    "no-cache"
  )

  headers.set(
    "pragma",
    "no-cache"
  )

  const contentType =
    request.headers.get("content-type")

  if (contentType) {
    headers.set("content-type", contentType)
  }

  const session =
    request.headers.get("x-pawchive-session") ??
    env.PAWCHIVE_SESSION

  if (session) {
    headers.set(
      "cookie",
      `session=${session}`
    )
  }

  console.log(
    "[REQUEST META]",
    JSON.stringify(
      {
        path,
        target,
        method: request.method,
        hasSession: !!session,
      },
      null,
      2
    )
  )

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

  console.log(
    "[UPSTREAM]",
    JSON.stringify(
      {
        target,
        status: upstream.status,
        statusText: upstream.statusText,
      },
      null,
      2
    )
  )

  console.log(
    "[RESPONSE HEADERS]",
    JSON.stringify(
      Object.fromEntries(
        upstream.headers.entries()
      ),
      null,
      2
    )
  )

  //
  // エラー時は詳細情報を返す
  //
  if (!upstream.ok) {
    const text = await upstream.text()

    const debug = {
      timestamp: new Date().toISOString(),

      request: {
        method: request.method,
        originalUrl: request.url,
        path,
        target,
        headers: Object.fromEntries(
          headers.entries()
        ),
      },

      response: {
        status: upstream.status,
        statusText: upstream.statusText,

        headers: Object.fromEntries(
          upstream.headers.entries()
        ),

        body: text.slice(0, 20000),
      },
    }

    console.error(
      "[PAWCHIVE DEBUG]",
      JSON.stringify(
        debug,
        null,
        2
      )
    )

    return new Response(
      JSON.stringify(
        debug,
        null,
        2
      ),
      {
        status: upstream.status,
        headers: {
          "content-type":
            "application/json; charset=utf-8",
        },
      }
    )
  }

  //
  // 正常レスポンス
  //
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