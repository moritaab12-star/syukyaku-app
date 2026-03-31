-- LP 生成用の業種人格マスタ。projects.industry_key に service_key を保存して参照する。

create table if not exists public.service_personas (
  id uuid primary key default gen_random_uuid(),
  service_key text not null unique,
  service_name text not null,
  tone text,
  cta_labels jsonb not null default '[]'::jsonb,
  pain_points jsonb not null default '[]'::jsonb,
  faq_topics jsonb not null default '[]'::jsonb,
  forbidden_words jsonb not null default '[]'::jsonb,
  section_structure jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  raw_json jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists service_personas_active_key_idx
  on public.service_personas (service_key)
  where is_active = true;

comment on table public.service_personas is 'LP生成用の業種人格。is_active=true かつ service_key が projects.industry_key と一致する行を参照。';
