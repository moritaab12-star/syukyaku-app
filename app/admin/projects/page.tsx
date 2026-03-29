import Link from 'next/link';
import { createSupabaseClient } from '@/lib/supabase';
import { Bot, LayoutDashboard, Plus } from 'lucide-react';
import { ProjectsTable } from './ProjectsTable';

export default async function ProjectsListPage() {
  const supabase = createSupabaseClient();

  const { data, error } = await supabase
    .from('projects')
    .select(
      'id, company_name, project_type, status, publish_status, slug, created_at, area, service, lp_group_id',
    )
    .order('created_at', { ascending: false });

  const projects = (data ?? []) as Parameters<typeof ProjectsTable>[0]['initialProjects'];
  const fetchError = error
    ? '一覧の取得に失敗しました。projects テーブルを確認してください。'
    : null;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-6xl px-4 py-8 md:py-10">
        <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-800 text-sky-300">
              <LayoutDashboard className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-slate-50 md:text-2xl">
                プロジェクト一覧
              </h1>
              <p className="mt-0.5 text-xs text-slate-400 md:text-sm">
                量産システムの司令塔
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/admin/projects/agent"
              className="inline-flex items-center gap-2 rounded-xl border border-emerald-700/60 bg-emerald-950/40 px-4 py-2.5 text-sm font-semibold text-emerald-200 transition hover:bg-emerald-900/50"
            >
              <Bot className="h-4 w-4" />
              エージェント
            </Link>
            <Link
              href="/admin/projects/new"
              className="inline-flex items-center gap-2 rounded-xl bg-sky-500 px-4 py-2.5 text-sm font-semibold text-sky-950 shadow-lg shadow-sky-500/30 transition hover:bg-sky-400 active:scale-95"
            >
              <Plus className="h-4 w-4" />
              新規作成
            </Link>
            <Link
              href="/admin"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900/80 px-4 py-2.5 text-sm font-medium text-slate-200 transition hover:bg-slate-800"
            >
              ダッシュボード
            </Link>
          </div>
        </header>

        {fetchError && (
          <div className="mb-6 rounded-xl border border-amber-500/40 bg-amber-950/30 px-4 py-3 text-sm text-amber-200">
            {fetchError}
          </div>
        )}

        <ProjectsTable initialProjects={projects} />
      </div>
    </div>
  );
}
