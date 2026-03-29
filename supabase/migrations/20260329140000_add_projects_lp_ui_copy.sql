-- LP 固定ブロック差し替え用の生成コピー（JSON）。FV 見出し・CTA・診断ブロック等。
alter table public.projects
  add column if not exists lp_ui_copy jsonb;

comment on column public.projects.lp_ui_copy is 'Gemini 生成の UI コピー（headline, CTA 文言など）';
