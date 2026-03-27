# syukyaku-app

Next.js（App Router）の LP / 管理アプリ。公開は **Next の `/p/{slug}` のみ**（WordPress REST 連携は廃止済み）。

## ドキュメント

- [本番切替チェックリスト（DNS / 301 / Search Console 等）](docs/post-wp-cutover-checklist.md)
- [301 リダイレクトのテンプレ（`vercel.json` の `redirects` にマージ）](docs/vercel-redirects.template.json)
- [公開フローと API 一覧（WP 撤去後）](docs/next-publish-api-overview.md)

旧 WP からの 301 は、パス確定後に表で `OLD_PATH` → `/p/{slug}` を埋め、`vercel.json` の `redirects` に追記してデプロイする。

## 環境変数

`.env.example` を参照。`WORDPRESS_*` は**アプリからは使用しない**（廃止済み）。本番ホストからも削除すること。

## 開発

```bash
npm install
npm run dev
```

```bash
npm run build
```
