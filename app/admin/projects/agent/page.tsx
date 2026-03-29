import Link from 'next/link';
import { Bot } from 'lucide-react';
import AgentInput from '@/app/admin/projects/agent/AgentInput';

export default function ProjectsAgentPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-4xl px-4 py-8 md:py-10">
        <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-900/50 text-emerald-300">
              <Bot className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-slate-50 md:text-2xl">
                LP エージェント
              </h1>
              <p className="mt-0.5 text-xs text-slate-400 md:text-sm">
                指示1行から複数下書きを生成・採点します
              </p>
            </div>
          </div>
          <Link
            href="/admin/projects"
            className="inline-flex items-center justify-center rounded-xl border border-slate-700 bg-slate-900/80 px-4 py-2.5 text-sm font-medium text-slate-200 transition hover:bg-slate-800"
          >
            プロジェクト一覧
          </Link>
        </header>

        <AgentInput />
      </div>
    </div>
  );
}
