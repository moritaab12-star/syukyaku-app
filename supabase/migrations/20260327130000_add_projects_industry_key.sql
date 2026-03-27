-- 関連LP「同じ業種」判定用。NULL の行は従来どおり service 文字列のみで関連を絞る。
ALTER TABLE public.projects
ADD COLUMN IF NOT EXISTS industry_key text;

COMMENT ON COLUMN public.projects.industry_key IS
  '業種バケット（例: garden, insurance）。関連LPは同一 area・同一 service に加え、両方とも非 NULL のときは industry_key も一致させる。';

CREATE INDEX IF NOT EXISTS idx_projects_area_industry_key
  ON public.projects (area, industry_key)
  WHERE industry_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_projects_published_area_industry
  ON public.projects (publish_status, area, industry_key)
  WHERE publish_status = 'published' AND industry_key IS NOT NULL;
