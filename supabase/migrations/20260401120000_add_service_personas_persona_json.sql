-- 業種人格の構造化ソース（フォーム同期用の正規化コピー）。LP 生成は将来的にこれを参照しやすくする。

alter table public.service_personas
  add column if not exists persona_json jsonb;

comment on column public.service_personas.persona_json is '検証済みの業種人格JSON（cta_patterns 等）。フォーム保存時は列から再構築したコピーも格納する。';
