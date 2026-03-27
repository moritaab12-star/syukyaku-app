import { redirect } from 'next/navigation';

/** 一覧の「編集」から既存の50問フォーム（/new?edit=）へ集約する */
export default async function EditProjectRedirectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const trimmed = (id ?? '').trim();
  if (!trimmed) {
    redirect('/admin/projects');
  }
  redirect(`/admin/projects/new?edit=${encodeURIComponent(trimmed)}`);
}
