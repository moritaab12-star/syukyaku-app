-- 投稿失敗時リトライ用のカラムを projects に追加（最小実装）
-- 既存フローを壊さないため IF NOT EXISTS を使用

ALTER TABLE public.projects
ADD COLUMN IF NOT EXISTS publish_retry_count integer NOT NULL DEFAULT 0;

ALTER TABLE public.projects
ADD COLUMN IF NOT EXISTS last_publish_error text;

ALTER TABLE public.projects
ADD COLUMN IF NOT EXISTS next_publish_retry_at timestamptz;

-- publish_status は既存値を尊重しつつ運用拡張（draft / publishing / published / retry_wait / failed）
-- ここでは制約は付けず、アプリ側で運用する（最小差分）。

CREATE INDEX IF NOT EXISTS idx_projects_next_publish_retry_at
  ON public.projects(next_publish_retry_at);

