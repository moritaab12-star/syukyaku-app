-- WordPress 連携用カラム追加

ALTER TABLE projects
ADD COLUMN IF NOT EXISTS wp_page_id bigint,
ADD COLUMN IF NOT EXISTS wp_url text,
ADD COLUMN IF NOT EXISTS publish_status text,
ADD COLUMN IF NOT EXISTS published_at timestamptz;

