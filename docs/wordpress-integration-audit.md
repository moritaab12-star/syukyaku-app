# WordPress 連携 — 撤去完了後の整理（歴史的メモ含む）

**現行の公開フロー・API 一覧:** [next-publish-api-overview.md](./next-publish-api-overview.md)  
**本番切替（DNS / 301 / Search Console 等）:** [post-wp-cutover-checklist.md](./post-wp-cutover-checklist.md)  
**`projects.wp_url` / `wp_page_id` 等の DB 列:** [db-legacy-wordpress-columns.md](./db-legacy-wordpress-columns.md)

WordPress REST への投稿は **廃止済み**。LP の正は Next の `/p/{slug}`。本ファイルは「当時の調査の残り」と「いま実在する経路」の両方を、読者が迷わない順に並べたものです。

---

## 1. 現行（コードベースに実在するもの）

### 1.1 公開・スケジュール（WP なし）

| パス / モジュール | 役割 |
|------------------|------|
| `app/lib/publish-project-next.ts` | `publishProjectToNextSite` — `publish_status`・`wp_url`（canonical URL・列名はレガシー）・`wp_page_id: null` |
| `app/api/admin/publish-batch/route.ts` | 管理向け一括 → 内部で Next 公開 |
| `app/api/admin/publish-candidates/route.ts` | 本番公開テスト用の候補取得（`publish_status` が draft / null 等。旧「未 WP」条件は撤去済み） |
| `app/api/cron/publish-one/route.ts` | Vercel Cron — `publishProjectToNextSite` を直接呼ぶ（`/api/wordpress/post` は存在しない） |
| `app/lib/publish-scheduler.ts` | 候補取得・1 件ピック（`wp_page_id` 条件は撤去済み） |

### 1.2 LP 表示・スタイル（Next 正）

| パス / モジュール | 役割 |
|------------------|------|
| `app/p/[slug]/page.tsx` | LP ページ（`buildLpHtmlMarkup` / `lpToHtmlCore`） |
| `app/lib/lpToHtmlCore.ts` | 公開 LP マークアップ生成の正（契約は [LP_DESIGN_CONTRACT.md](./LP_DESIGN_CONTRACT.md)） |
| `app/api/lp-body-css/route.ts` | `lpBodyInlineCss` — 外部へ `<link>` 用途。WP 専用ではない |

### 1.3 管理 UI・プロジェクト API

| パス | 役割 |
|------|------|
| `app/admin/projects/new/page.tsx` ほか | 新規・編集・公開テストパネル（WordPress への投稿 UI はない） |
| `app/api/projects/save/route.ts` | 保存時 `wp_page_id` / `wp_url` を null で初期化する等 |
| `app/api/projects/[id]/route.ts` | GET `select` に `wp_page_id`・`wp_url`（公開 URL 表示用） |

### 1.4 環境変数（現行コードが読むもの）

`WORDPRESS_*` は **アプリから参照しない**（廃止済み）。本番ホストの環境変数からも削除すること（詳細は [post-wp-cutover-checklist.md](./post-wp-cutover-checklist.md)）。

---

## 2. 廃止済み（参考：旧 B1 調査時点のパス）

以下は **リポジトリから削除済み**。インデックスや手順書だけが残っていた場合の照合用です。

| 旧パス / ファイル | 旧役割 |
|-------------------|--------|
| `app/api/wordpress/**` | WP REST への post / test 等 |
| `app/lib/wordpress.ts` | `postPage`（WP `pages`） |
| `app/lib/wordpress-config.ts` | `WORDPRESS_*` 検証 |
| `app/lib/publish-project-wp.ts` | `publishProjectToWordPress` |
| `app/lib/lpToHtml.ts` | `buildLpHtml`（WP 向け HTML 生成。後継は `lpToHtmlCore`） |
| `app/admin/projects/new/publish-wordpress-sequential.ts` | クライアントから WP API を順叩き |

旧フロー: `publish-batch` / `cron/publish-one` が **`fetch(.../api/wordpress/post)`** へ繋がっていた → **現行は `publishProjectToNextSite` のみ**。

---

## 3. DB マイグレーション（歴史）

- `supabase/migrations/20250316000001_add_wp_columns.sql` — `wp_page_id`（bigint）, `wp_url`（text）の追加

列の **現在の意味と将来 DROP/リネーム** は [db-legacy-wordpress-columns.md](./db-legacy-wordpress-columns.md)。

---

## 4. ドキュメント・アセット（歴史的参照）

| パス | 備考 |
|------|------|
| [wordpress-lp-styles.md](./wordpress-lp-styles.md) | 旧 WP 側 KSES / mu-plugin 手順。**本番 WP を止めたら参考程度**。 |
| [LP_DESIGN_CONTRACT.md](./LP_DESIGN_CONTRACT.md) | **Next / `lpToHtmlCore` 正** に更新済み |
| `wordpress/mu-plugins/syukyaku-lp-content-allowed-tags.php` | 旧本番 WP 向け（リポジトリにあれば歴史的アセット）。**稼働 WP が無ければ不要** |

---

## 5. 撤去タスクで完了したこと（要約）

- WordPress API ルート・`publish-project-wp`・旧 `lpToHtml`・管理画面の WP 公開バー等を削除。
- 公開は `publishProjectToNextSite` のみ。`publish_status === 'published'` とサイトマップ / SEO 判定の意味は「Next で公開」に統一。
- `WORDPRESS_*` はコード未使用。本番 env からの削除は人手（チェックリスト参照）。

---

## 6. 補足（grep で気づきやすい残骸）

- 型・コメントに **`wp_page_id`** が残る場合がある（API レスポンス型など）。表示に使わなければ段階的に整理可。
- `improvementLog.ts` 等に「WordPress」という語がコメントだけ残っていても、連携コードがあるとは限らない。

---

*旧版の §1–8 は上記「2. 廃止済み」「5. 完了したこと」に再編した。現行のファイル一覧・HTTP パスは [next-publish-api-overview.md](./next-publish-api-overview.md) を正とする。*
