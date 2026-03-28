-- 公開 LP ヒーロー画像 URL（Supabase Storage lp-images バケットの公開 URL 等）
alter table public.projects
  add column if not exists hero_image_url text;

comment on column public.projects.hero_image_url is 'LP ヒーロー画像の公開 URL（例: Supabase Storage public URL）';
