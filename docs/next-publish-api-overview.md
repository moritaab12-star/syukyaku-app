# WP 撤去後: 公開フローと関連 API（ファイル一覧）

WordPress への投稿はない。LP の公開は **Next の `/p/{slug}`** を正とし、DB の `publish_status` と `wp_url`（列名はレガシーだが中身は canonical URL）を更新する。

## コア

| ファイル | 役割 |
|----------|------|
| `app/lib/publish-project-next.ts` | `publishProjectToNextSite`: 公開 URL 算出・`publish_status` / `wp_url` / `wp_page_id: null` 更新 |
| `app/lib/seo-indexing.ts` | `buildPublicLpUrl` 等（サイト origin・`/p/{slug}/`） |

## HTTP API

| パス | 役割 |
|------|------|
| `app/api/projects/save/route.ts` | 新規・分割保存。作成時 `wp_page_id` / `wp_url` を null |
| `app/api/projects/[id]/route.ts` | 管理向け GET/PATCH。プロジェクトメタ取得 |
| `app/api/admin/publish-batch/route.ts` | 管理向け一括: Next 公開（内部で `publishProjectToNextSite`） |
| `app/api/admin/publish-candidates/route.ts` | 公開候補一覧（WP ではない） |
| `app/api/cron/publish-one/route.ts` | スケジュール公開 1 件（WP ではなく lib 呼び出し） |

## 管理 UI

| ファイル | 役割 |
|----------|------|
| `app/admin/projects/new/page.tsx` | 新規・編集・クローン。保存後の公開パネル |
| `app/admin/projects/new/PublishTestPanel.tsx` | 本番公開テスト UI |
| `app/admin/projects/new/publish-test-types.ts` | フォーカスプロジェクト型（`publicUrl` 等） |

## 関連ドキュメント

- [db-legacy-wordpress-columns.md](./db-legacy-wordpress-columns.md) — `wp_*` 列の意味とマイグレーション案
- [post-wp-cutover-checklist.md](./post-wp-cutover-checklist.md) — 本番切替チェックリスト
- [wordpress-integration-audit.md](./wordpress-integration-audit.md) — 撤去後の整理と廃止済みパス（歴史）
