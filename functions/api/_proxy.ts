// /api/file プロキシの共通ロジック (Cloudflare Pages Functions と Vite 開発ミドルウェアの双方から使う)
//
// 目的: fanbox / patreon の投稿本文から張られた外部リンク先が
// 「リファラー (元サイト) を検証してブロックする」ケースに対応する。
// サーバー側で Referer / Origin を偽装して取得し、同一オリジンで返す。
//
// 注意: ブラウザ JS からは Referer を設定できない (禁止ヘッダー) ため
// サーバー中継が必須。

/** このホスト群はリファラーチェックが無い (実測) / ミラー済みのため直接アクセスし、
 *  HTML 変換も行わない (fanbox や patreon は SPA なので同一オリジン化すると壊れる) */
export const DIRECT_HOSTS = [
  "fanbox.cc",
  "patreon.com",
  "patreonusercontent.com",
  "pximg.net", // FANBOX / pixiv の公式 CDN
  "pawchive.pw",
]

export function hostIsDirect(hostname: string): boolean {
  return DIRECT_HOSTS.some((d) => hostname === d || hostname.endsWith("." + d))
}

/** SSRF 対策: 内部アドレス・IP 直指定・ローカル名を拒否する */
export function isForbiddenHost(hostname: string): boolean {
  const h = hostname.toLowerCase()
  if (h.endsWith(".local") || h.endsWith(".internal") || h === "localhost" || h.endsWith(".localhost"))
    return true
  // IPv4/IPv6 リテラルは一律で拒否 (私的アドレス判定の抜け道を塞ぐ)
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h) || h.includes(":")) return true
  return false
}

/** ホストに応じた既定の Referer */
export function deriveReferer(hostname: string): string {
  const h = hostname.toLowerCase()
  if (h.endsWith("fanbox.cc") || h.endsWith("pximg.net")) return "https://www.fanbox.cc/"
  if (h.endsWith("patreon.com") || h.endsWith("patreonusercontent.com"))
    return "https://www.patreon.com/"
  if (h.endsWith("pawchive.pw")) return "https://pawchive.pw/"
  // それ以外 (投稿本文からの外部リンク) は既定で fanbox 由典として扱う
  return "https://www.fanbox.cc/"
}

export interface UpstreamResult {
  status: number
  headers: Record<string, string>
  body?: ReadableStream
  bodyText?: string
}

interface HeaderLike {
  get(name: string): string | null
}

/** Node のプレーンな headers オブジェクト / Headers インスタンスの両方に対応 */
function normalizeHeaders(h: unknown): HeaderLike {
  const anyH = h as { get?: unknown; [k: string]: unknown }
  if (typeof anyH?.get === "function") return anyH as HeaderLike
  return {
    get(name: string): string | null {
      const v = anyH[name.toLowerCase()]
      return v === undefined ? null : Array.isArray(v) ? (v[0] ?? null) : (v as string) ?? null
    },
  }
}

/** プロキシ本体。GET/POST を中継し、HTML は <base> 注入・リソース書き換えを行う */
export async function handleProxy(
  method: "GET" | "POST",
  rawUrl: string,
  reqHeaders: unknown,
  bodyText?: string,
  /** アプリ自身のオリジン (HTML 書き換えで絶対 URL のプロキシリンクを作るため) */
  selfOrigin?: string,
): Promise<UpstreamResult> {
  const headersIn = normalizeHeaders(reqHeaders)
  if (!selfOrigin) {
    try {
      selfOrigin = new URL(rawUrl, "https://proxy.invalid").origin
    } catch {
      selfOrigin = ""
    }
  }
  const qs = new URL(rawUrl, "https://proxy.local").searchParams
  const u = qs.get("u")
  const r = qs.get("r")

  if (!u) return { status: 400, headers: { "content-type": "text/plain" }, bodyText: "missing u" }

  let target: URL
  try {
    target = new URL(u)
  } catch {
    return { status: 400, headers: { "content-type": "text/plain" }, bodyText: "bad url" }
  }
  if (target.protocol !== "https:" && target.protocol !== "http:")
    return { status: 400, headers: { "content-type": "text/plain" }, bodyText: "bad protocol" }
  if (isForbiddenHost(target.hostname))
    return { status: 403, headers: { "content-type": "text/plain" }, bodyText: "forbidden host" }

  // Referer: クエリ指定があればそれ (https のみ)、なければホストから導出
  let referer = deriveReferer(target.hostname)
  if (r) {
    try {
      const ref = new URL(r)
      if (ref.protocol === "https:") referer = ref.toString()
    } catch {
      /* ignore: 既定 referer を使う */
    }
  }

  const headers: Record<string, string> = {
    referer,
    origin: new URL(referer).origin,
  }
  const ua = headersIn.get("user-agent")
  if (ua) headers["user-agent"] = ua
  const accept = headersIn.get("accept")
  if (accept) headers["accept"] = accept
  // 動画のレンジリクエスト (シーク) をそのまま通す
  const range = headersIn.get("range")
  if (range) headers["range"] = range

  let body: string | undefined
  if (method === "POST") {
    body = bodyText || ""
    headers["content-type"] =
      (headersIn.get("content-type") as string) || "application/x-www-form-urlencoded"
  }

  const upstream = await fetch(target.toString(), {
    method,
    headers,
    redirect: "follow",
    ...(body !== undefined ? { body } : {}),
  })

  const ct = (upstream.headers.get("content-type") as string) || ""

  // 外部 (direct 以外) ホストの HTML ページ: base 注入 + リンク/リソースのプロキシ化
  if (ct.includes("text/html") && !hostIsDirect(target.hostname)) {
    const html = await upstream.text()
    const out = transformHtml(html, target, referer, selfOrigin)
    return {
      status: upstream.status,
      headers: { "content-type": "text/html; charset=utf-8" },
      bodyText: out,
    }
  }

  // そのまま中継 (バイナリ / direct ホストの HTML)
  const respHeaders: Record<string, string> = {}
  for (const h of [
    "content-type",
    "content-length",
    "content-range",
    "accept-ranges",
    "etag",
    "last-modified",
    "cache-control",
  ]) {
    const v = upstream.headers.get(h)
    if (v) respHeaders[h] = v
  }
  // ダウンロード時のファイル名
  const cd = upstream.headers.get("content-disposition")
  if (cd) {
    respHeaders["content-disposition"] = cd
  } else {
    const name = target.pathname.split("/").pop() || "file"
    respHeaders["content-disposition"] = `inline; filename*=UTF-8''${encodeURIComponent(
      decodeURIComponent(name),
    )}`
  }
  return { status: upstream.status, headers: respHeaders, body: upstream.body as ReadableStream }
}

/** HTML への変換: <base> 注入、img/form/a をプロキシ経由に書き換え */
export function transformHtml(
  html: string,
  target: URL,
  referer: string,
  selfOrigin = "",
): string {
  // 相対 URL の解決基準を元サイトに向ける
  const baseHref = new URL(".", target).toString()
  const baseTag = `<base href="${baseHref}">`
  if (/<head[^>]*>/i.test(html)) {
    html = html.replace(/<head[^>]*>/i, (m) => m + baseTag)
  } else if (/<html[^>]*>/i.test(html)) {
    html = html.replace(/<html[^>]*>/i, (m) => m + baseTag)
  } else {
    html = baseTag + html
  }

  const prox = (abs: string) =>
    `${selfOrigin}/api/file?u=${encodeURIComponent(abs)}&r=${encodeURIComponent(referer)}`
  // 同一サイト内のリソース / フォーム / リンクは「自分自身のページ」をリファラーと
  // すべき (実サイトでの遷移と同じ)。初期取得のみ元サイト (fanbox 等) のリファラー。
  const proxSelf = (abs: string) =>
    `${selfOrigin}/api/file?u=${encodeURIComponent(abs)}&r=${encodeURIComponent(target.origin + "/")}`

  const shouldProxy = (abs: string): boolean => {
    try {
      return /^https?:$/.test(new URL(abs).protocol) && !hostIsDirect(new URL(abs).hostname)
    } catch {
      return false
    }
  }

  // img: リファラーが必要な可能性があるためプロキシ経由に (同一サイトは自己参照)
  html = html.replace(/<img\b[^>]*>/gi, (m) => {
    if (/\bsrc=["']data:/i.test(m)) return m
    const sm = m.match(/\bsrc=["']([^"']+)["']/i)
    if (!sm) return m
    try {
      const abs = new URL(sm[1], target).toString()
      if (!shouldProxy(abs)) return m
      return m.replace(/\bsrc=["'][^"']+["']/i, `src="${proxSelf(abs)}"`)
    } catch {
      return m
    }
  })

  // form: POST もプロキシ経由で飛ばしてリファラーを揃える (action が無い場合は現 URL)
  html = html.replace(/<form\b[^>]*>/gi, (m) => {
    const am = m.match(/\baction=["']([^"']*)["']/i)
    let abs: string
    try {
      abs = new URL(am ? am[1] : "", target).toString()
    } catch {
      return m
    }
    if (!shouldProxy(abs)) return m
    return m.replace(/\baction=["'][^"']*["']/i, `action="${proxSelf(abs)}"`)
  })

  // a: 外部 (direct 以外) へのリンクはプロキシ経由にして参照を維持
  html = html.replace(/<a\b[^>]*>/gi, (m) => {
    const hm = m.match(/\bhref=["']([^"']+)["']/i)
    if (!hm) return m
    if (/^(#|mailto:|javascript:|tel:)/i.test(hm[1])) return m
    try {
      const abs = new URL(hm[1], target).toString()
      if (!shouldProxy(abs)) return m
      return m.replace(/\bhref=["'][^"']+["']/i, `href="${proxSelf(abs)}"`)
    } catch {
      return m
    }
  })

  return html
}
