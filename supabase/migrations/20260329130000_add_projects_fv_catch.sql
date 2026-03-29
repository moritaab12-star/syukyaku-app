alter table public.projects
  add column if not exists fv_catch_headline text;

alter table public.projects
  add column if not exists fv_catch_subheadline text;

comment on column public.projects.fv_catch_headline is 'FV メイン見出し（AI 生成・手入力可）';
comment on column public.projects.fv_catch_subheadline is 'FV リード文';
