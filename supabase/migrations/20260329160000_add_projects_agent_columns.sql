-- LP エージェント層: 同一バッチ plan・採点・ステータス
alter table public.projects
  add column if not exists agent_plan_id uuid;

alter table public.projects
  add column if not exists agent_status text;

alter table public.projects
  add column if not exists agent_score integer;

comment on column public.projects.agent_plan_id is 'エージェント実行バッチ ID（同一指示から作成した複数行で共有）';
comment on column public.projects.agent_status is 'エージェント評価: pending | ok | fix | ng';
comment on column public.projects.agent_score is 'エージェント採点 0–100';
