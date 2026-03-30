-- LP デザイン戦略レイヤー（コピー用 AgentAppealMode とは別 JSON）
alter table public.projects
  add column if not exists lp_design jsonb default null;

comment on column public.projects.lp_design is
  'design strategy + tokens + diagram_flags（Zod 検証済み想定）。未設定時は表示側でフォールバック。';
