-- エージェント訴求 mode / 競合調査利用フラグ（既存 agent_* 列は維持）
alter table public.projects
  add column if not exists mode text;

alter table public.projects
  add column if not exists research_used boolean default false;

comment on column public.projects.mode is '訴求モード: price | trust | empathy | urgency | local（エージェント量産用）';
comment on column public.projects.research_used is 'エージェント実行時に競合調査を使用したか';
