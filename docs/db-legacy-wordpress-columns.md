# `projects` テーブル: WP 由来のレガシー列

アプリは WordPress REST 連携を撤去済み。DB の列名に `wp_` が残っているものは**歴史的経緯**であり、将来のマイグレーションで **`public_url` などへのリネーム**、または **`wp_page_id` の DROP** を検討できる。

## コード参照の整理（grep ベース）

| 列名 | 現状の用途 |
|------|------------|
| `wp_url` | **現役**: Next 公開時の canonical URL を保存（名前はレガシー）。`publishProjectToNextSite` が更新。UI・型では「公開 URL」として扱う。 |
| `wp_page_id` | **レガシー**: 常に `null` を書き込む・読み取りは API の select のみ。WP 固定ページ ID はもう使わない。 |

### 参照ファイル（意図別）

- **null クリア / 新規行の初期値**: `app/api/projects/save/route.ts`, `app/api/admin/publish-batch/route.ts`, `app/lib/publish-project-next.ts`（`wp_page_id: null`。公開時は `wp_url` に Next URL）
- **読取（管理 API）**: `app/api/projects/[id]/route.ts` の GET `select` に `wp_page_id` が含まれる（将来削除可）。`wp_url` は公開 URL 表示用に select へ含める
- **型の残骸**: `app/admin/projects/new/page.tsx` 内の fetch レスポンス型に `wp_page_id` が残る場合あり（表示には未使用なら削除候補）

## マイグレーション案（任意・未実行）

1. アプリから `wp_page_id` の read/write をすべて削除したうえで、列を `DROP`
2. `wp_url` を `public_url`（または `canonical_url`）へリネームし、コード参照を一括置換

いまの段階では**列を DROP しない**。本番 DB 変更はバックアップ後に別タスクで実施する。
