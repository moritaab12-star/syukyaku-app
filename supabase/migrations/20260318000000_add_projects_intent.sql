-- intent（検索意図）を projects に追加
-- 既存フローを壊さないため IF NOT EXISTS を使用

ALTER TABLE public.projects
ADD COLUMN IF NOT EXISTS intent text;

CREATE INDEX IF NOT EXISTS idx_projects_intent ON public.projects(intent);

