-- キーワード網羅キュー & Perplexity リサーチ履歴（RLS: anon からは不可。アプリは service_role）

CREATE TABLE IF NOT EXISTS public.keyword_matrix (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  area_key text NOT NULL,
  service text NOT NULL DEFAULT '',
  primary_keyword text NOT NULL,
  cluster text,
  status text NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned', 'draft', 'published', 'archived')),
  priority integer NOT NULL DEFAULT 0,
  industry_key text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS keyword_matrix_unique_natural_key
  ON public.keyword_matrix (
    lower(trim(area_key)),
    lower(trim(service)),
    lower(trim(primary_keyword))
  );

CREATE INDEX IF NOT EXISTS keyword_matrix_area_service_status
  ON public.keyword_matrix (lower(trim(area_key)), lower(trim(service)), status);

CREATE INDEX IF NOT EXISTS keyword_matrix_priority_created
  ON public.keyword_matrix (priority DESC, created_at ASC)
  WHERE status = 'planned';

CREATE TABLE IF NOT EXISTS public.keyword_research_run (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  matrix_id uuid REFERENCES public.keyword_matrix (id) ON DELETE SET NULL,
  area_key text NOT NULL,
  service text NOT NULL DEFAULT '',
  industry_key text,
  provider text NOT NULL DEFAULT 'perplexity',
  model text,
  raw_response_json jsonb,
  suggested_keywords text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS keyword_research_run_lookup
  ON public.keyword_research_run (
    lower(trim(area_key)),
    lower(trim(service)),
    created_at DESC
  );

CREATE INDEX IF NOT EXISTS keyword_research_run_industry_created
  ON public.keyword_research_run (industry_key, created_at DESC);

CREATE INDEX IF NOT EXISTS keyword_research_run_matrix_created
  ON public.keyword_research_run (matrix_id, created_at DESC);

ALTER TABLE public.keyword_matrix ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.keyword_research_run ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.keyword_matrix IS 'エリア×キーワード / エリア×サービス×キーワードの計画・進捗';
COMMENT ON TABLE public.keyword_research_run IS '需要キーワード選出の実行ログ（履歴参照用）';
