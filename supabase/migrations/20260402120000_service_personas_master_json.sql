-- 業種ルールマスター本体（任意構造を JSON で保持。列追加を避ける）

alter table public.service_personas
  add column if not exists master_json jsonb not null default '{}'::jsonb;

comment on column public.service_personas.master_json is
  '業種ルールマスター（ネスト可・拡張自由）。フォーム保存時はここから同期可能なキーも列に反映。';

-- 既存の persona_json をマスター初期値へ（空の master_json のみ）
update public.service_personas
set master_json = persona_json
where persona_json is not null
  and master_json = '{}'::jsonb;
