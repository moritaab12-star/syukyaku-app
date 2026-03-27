-- LP 量産: 同一 lp_group 内でも行ごとに決定的にブロック文言を揺らす edition 番号
ALTER TABLE public.projects
ADD COLUMN IF NOT EXISTS variation_seed integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.projects.variation_seed IS
  'Deterministic LP copy edition per row; combined with lp_group_id and id for seeded block/template picks.';
