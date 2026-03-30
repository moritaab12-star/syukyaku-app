-- LP コピー生成用: 訴求モデル・デザイン意図など（業種・事実の主入力には使わない旨をプロンプトで縛る）
alter table public.projects
  add column if not exists lp_editor_instruction text;

comment on column public.projects.lp_editor_instruction is 'LP生成の補助: 訴求（価格/信頼/共感等）とデザイン意図。service・raw_answers を上書きしない';
