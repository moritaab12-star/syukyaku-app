-- raw_answers 編集などで更新日時を記録するため（既存環境では no-op）
-- 推奨: 本番で更新日時を DB に残したい場合は適用。`PATCH /api/projects/[id]` は列未存在でも動くよう updated_at を送らない実装のため、未適用でも API は落ちない。
ALTER TABLE public.projects
ADD COLUMN IF NOT EXISTS updated_at timestamptz;
