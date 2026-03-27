-- プロジェクト一覧・公開LP用テーブル（Supabase SQL Editor で実行）
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  company_name text,
  project_type text,
  status text,
  slug text unique,
  raw_answers jsonb,
  company_info jsonb,
  areas text[] default '{}',
  created_at timestamptz default now()
);

create index if not exists projects_slug_idx on public.projects(slug);

-- RLS が必要な場合は有効化
-- alter table public.projects enable row level security;
