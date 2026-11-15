// GET|POST /api/file?u=<URL>[&r=<referer>]
// リファラーチェック (ホットリンク対策) で直接アクセスがブロックされる
// fanbox / patreon のファイル・外部リンク先ページを、サーバー側で
// Referer / Origin を付けて中継する。
// ブラウザの JS からは Referer を設定できない (禁止ヘッダー) ため、
// 同一オリジン経由にしてアクセスできるようにする。
//
// セキュリティ: 内部アドレス・IP 直指定を拒否 (_proxy.ts の isForbiddenHost)。
// 共通ロジックは functions/api/_proxy.ts にあり、開発時は Vite ミドルウェアも利用する。

import { handleProxy } from "./_proxy"

async function proxy(request: Request, method: "GET" | "POST"): Promise<Response> {
  const bodyText = method === "POST" ? await request.text() : undefined
  const out = await handleProxy(
    method,
    request.url,
    request.headers,
    bodyText,
    new URL(request.url).origin,
  )
  const headers = new Headers()
  for (const [k, v] of Object.entries(out.headers)) headers.set(k, v)
  if (out.bodyText !== undefined) return new Response(out.bodyText, { status: out.status, headers })
  return new Response(out.body, { status: out.status, headers })
}

export const onRequestGet: PagesFunction = async ({ request }) => proxy(request, "GET")

export const onRequestPost: PagesFunction = async ({ request }) => proxy(request, "POST")
