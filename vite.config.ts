import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import { VitePWA } from "vite-plugin-pwa"

// ローカル開発時は /api/v1 を pawchive.pw に直接プロキシして CORS を回避する。
// 本番 (Cloudflare Pages) では functions/api/v1/[[path]].ts が同一オリジンで応答する。

/** 開発用: POST /api/login を pawchive.pw/account/login に中継し session cookie を抽出。
 *  pawchive は失敗時でも flash 入りの session を発行するため、
 *  取得キーで /api/v1/account/favorites を叩いて有効性を検証してから返す。 */
async function devLoginMiddleware(req, res, next) {
  if (req.url !== "/api/login" || req.method !== "POST") return next()
  let body = ""
  for await (const chunk of req) body += chunk
  let username = ""
  let password = ""
  try {
    const j = JSON.parse(body || "{}")
    username = j.username || ""
    password = j.password || ""
  } catch {
    /* ignore */
  }
  if (!username || !password) {
    res.statusCode = 400
    res.setHeader("content-type", "application/json")
    res.end(JSON.stringify({ ok: false, error: "ユーザー名とパスワードを入力してください" }))
    return
  }
  const form = new URLSearchParams({ username, password, location: "/login" })
  const up = await fetch("https://pawchive.pw/account/login", {
    method: "POST",
    body: form,
    redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded" },
  })
  let session
  for (const c of up.headers.getSetCookie?.() || []) {
    const m = c.match(/(?:^|;\s*)session=([^;]+)/)
    if (m) session = m[1]
  }
  let ok = false
  if (session) {
    // セッションキーの有効性を検証 (失敗時でも flash 入りの cookie が来るため)
    const v = await fetch("https://pawchive.pw/api/v1/account/favorites?type=artist", {
      redirect: "manual",
      headers: { cookie: `session=${session}` },
    })
    ok = !(v.status >= 300 && v.status < 400) && v.ok
  } else if (up.status >= 300 && up.status < 400) {
    ok = true
  }
  res.statusCode = ok ? 200 : 401
  res.setHeader("content-type", "application/json")
  res.end(
    JSON.stringify(
      ok && session ? { ok: true, session } : { ok: false, error: "ユーザー名またはパスワードが正しくありません" },
    ),
  )
}

/** 開発用: /api/file を Referer/Origin 付きで中継するプロキシ。
 *  fanbox / patreon のホットリンク対策 (リファラーチェック) を回避する。
 *  本番では functions/api/file.ts が同一オリジンで応答する。
 *  ロジックは functions/api/_proxy.ts を共有。 */
async function devFileProxyMiddleware(req, res, next) {
  if (!req.url?.startsWith("/api/file?") || (req.method !== "GET" && req.method !== "POST"))
    return next()
  try {
    let bodyText: string | undefined
    if (req.method === "POST") {
      bodyText = ""
      for await (const chunk of req) bodyText += chunk
    }
    const out = await handleProxy(
      req.method,
      req.url,
      req.headers,
      bodyText,
      `http://${req.headers.host || "localhost:5173"}`,
    )
    res.statusCode = out.status
    for (const [k, v] of Object.entries(out.headers)) res.setHeader(k, v)
    if (out.bodyText !== undefined) {
      res.end(out.bodyText)
    } else if (out.body) {
      const { Readable } = await import("node:stream")
      Readable.fromWeb(out.body).pipe(res)
    } else {
      res.end()
    }
  } catch (e) {
    res.statusCode = 502
    res.end(String(e))
  }
}

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "prompt",
      includeAssets: ["favicon.svg"],
      manifest: {
        name: "Pawchive Viewer",
        short_name: "PawViewer",
        description: "pawchive.pw を快適に閲覧するビューア",
        theme_color: "#14161a",
        background_color: "#14161a",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
        ],
      },
    }),
    {
      name: "dev-login-middleware",
      configureServer(server) {
        server.middlewares.use(devLoginMiddleware)
        server.middlewares.use(devFileProxyMiddleware)
      },
    },
  ],
  server: {
    proxy: {
      "/api/v1": {
        target: "https://pawchive.pw",
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on("proxyReq", (proxyReq, req) => {
            const session = req.headers["x-pawchive-session"]
            if (typeof session === "string" && session) {
              proxyReq.setHeader("cookie", `session=${session}`)
              proxyReq.removeHeader("x-pawchive-session")
            }
          })
        },
      },
    },
  },
})
