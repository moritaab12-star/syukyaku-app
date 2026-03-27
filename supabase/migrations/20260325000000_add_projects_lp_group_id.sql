-- LP 一覧: 同一保存バッチ・運用グループで projects 行をまとめる
ALTER TABLE public.projects
ADD COLUMN IF NOT EXISTS lp_group_id uuid;

CREATE INDEX IF NOT EXISTS idx_projects_lp_group_id
  ON public.projects (lp_group_id)
  WHERE lp_group_id IS NOT NULL;
