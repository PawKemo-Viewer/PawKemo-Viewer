# Pawchive Viewer

[pawchive.pw](https://pawchive.pw) 非公式の閲覧クライアント (PWA)。iOS / Android / Windows / macOS すべてのモダンブラウザで動作し、ホーム画面に追加してネイティブアプリのように使えます。

## 機能

- **サムネイルギャラリー**: 最近の投稿・クリエイター投稿をサムネグリッド + 無限スクロールで閲覧
- **検索・タグ絞り込み**: サイト全体検索、クリエイター内検索、タグフィルタ (投稿数付き)
- **クリエイター検索**: 約10万件のクリエイターを端末内 (IndexedDB) にキャッシュして瞬時に検索
- **フォローと新着検知**: フォローしたクリエイターの最新投稿をチェックし、未読を NEW バッジ表示 (「既読」で解消)
- **お気に入り同期**: pawchive アカウントのお気に入りを取得・追加 (セッションキー使用、任意)
- **投稿詳細**: 本文・添付画像のライトボックス・コメント・改訂履歴・前後の投稿ナビゲーション
- **ハッシュ検索**: 同一ファイル (SHA-256) が使われている他の投稿を検索
- **ダウンロード**: 添付ファイルを元ファイル名で保存
- **再取得申請 (flag)**: 投稿の再インポートを申請

## 開発

```bash
npm install
npm run dev     # http://localhost:5173 (API は Vite が pawchive.pw にプロキシ)
```

## 本番デプロイ (Cloudflare Pages + Functions)

```bash
npm run deploy  # wrangler login 済みであること。functions/api/v1/[[path]].ts が API プロキシになる
```

同一オリジンで `/api/v1/*` を pawchive に中継するため CORS の制約を受けません。

## セッションキーについて

お気に入り同期には pawchive.pw のログイン cookie (`session`) の値が必要です。

- **アプリ内ログイン**: 設定 → 「ID / パスワードでログイン」(または フォロータブ → ログイン)。`/api/login` が pawchive の `/account/login` を中継し、成功時に発行されるセッションキーを自動設定します。
- **手動設定**: pawchive.pw にログイン → DevTools → Application → Cookies → `session` の値をコピーして設定画面に貼り付け。

キーは端末のブラウザにのみ保存され、リクエスト時だけ `x-pawchive-session` ヘッダとして自分のオリジンに送られ、サーバー側で pawchive への `Cookie` に変換されます。認証情報 (ID/パスワード) は保存されません。

## 構成

```
src/            React (TypeScript) PWA 本体
  api.ts        Pawchive API クライアント
  db.ts         IndexedDB (クリエイターキャッシュ / 既読管理)
  follows.ts    ローカルフォロー管理
  pages/        ホーム / クリエイター / 投稿 / フォロー / ログイン / 設定
functions/      Cloudflare Pages Functions (API プロキシ + ログイン中継)
vite.config.ts  PWA マニフェスト + 開発プロキシ + 開発用ログインミドルウェア
```
