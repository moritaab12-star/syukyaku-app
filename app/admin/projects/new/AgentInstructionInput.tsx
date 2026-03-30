'use client';

import React, { useCallback, useState } from 'react';
import Link from 'next/link';
import {
  Bot,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Loader2,
  Sparkles,
} from 'lucide-react';

type CreatedRow = {
  id: string;
  slug: string;
  title: string;
  mode: string | null;
  score: number | null;
  status: string | null;
};

type ThemePreview = { title: string; mode: string };

type RunPreview = {
  parsed?: {
    area: string;
    service: string;
    count: number;
    target: string;
    appeal: string;
  };
  themes?: ThemePreview[];
  research_used?: boolean;
  pattern_summary?: {
    commonHeadlines?: string[];
    commonCtas?: string[];
    commonSections?: string[];
    notes?: string[];
  } | null;
};

export type AgentInstructionInputProps = {
  instruction: string;
  onInstructionChange: (value: string) => void;
  /** 同期 parse → PATCH/POST テンプレ → project id を返す（デバウンスに依存しない） */
  ensureTemplateForAgentRun: (instruction: string) => Promise<string | null>;
  parsedCountHint: number | null;
  disabled?: boolean;
  showToast: (type: 'success' | 'error', message: string) => void;
};

export function AgentInstructionInput({
  instruction,
  onInstructionChange,
  ensureTemplateForAgentRun,
  parsedCountHint,
  disabled = false,
  showToast,
}: AgentInstructionInputProps) {
  const [useResearch, setUseResearch] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(true);
  const [loading, setLoading] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [planId, setPlanId] = useState<string | null>(null);
  const [lpGroupId, setLpGroupId] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedRow[]>([]);
  const [preview, setPreview] = useState<RunPreview | null>(null);
  const [panelError, setPanelError] = useState<string | null>(null);
  const [runNote, setRunNote] = useState<string | null>(null);

  const runPreview = useCallback(async () => {
    setPanelError(null);
    setRunNote(null);
    const trimmed = instruction.trim();
    if (!trimmed) {
      setPanelError('指示を入力してください。');
      return;
    }
    setPreviewLoading(true);
    setPreview(null);
    try {
      const res = await fetch('/api/admin/agent/preview', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instruction: trimmed,
          use_competitor_research: useResearch,
        }),
      });
      const json = await res.json().catch(() => ({}));

      if (res.status === 401) {
        setPanelError(
          typeof json?.error === 'string'
            ? json.error
            : '認可に失敗しました。/admin/login でログインしてください。',
        );
        return;
      }

      if (!res.ok) {
        setPanelError(
          typeof json?.error === 'string' ? json.error : 'プレビューに失敗しました。',
        );
        return;
      }

      if (json?.preview && typeof json.preview === 'object') {
        setPreview(json.preview as RunPreview);
        setPreviewOpen(true);
      }
    } catch {
      setPanelError('通信に失敗しました。');
    } finally {
      setPreviewLoading(false);
    }
  }, [instruction, useResearch]);

  const runAgent = useCallback(async () => {
    setPanelError(null);
    setRunNote(null);
    const trimmed = instruction.trim();
    if (!trimmed) {
      setPanelError('指示を入力してください。');
      return;
    }

    setLoading(true);
    setCreated([]);
    setPlanId(null);
    setLpGroupId(null);
    try {
      const templateProjectId = await ensureTemplateForAgentRun(trimmed);
      if (!templateProjectId) {
        setPanelError(
          'テンプレ用の project id を取得できませんでした。指示を確認するか、エリア・サービスを1件ずつ入力してから再度お試しください。',
        );
        return;
      }

      const res = await fetch('/api/admin/agent/run', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instruction: trimmed,
          template_project_id: templateProjectId,
          use_competitor_research: useResearch,
        }),
      });
      const json = await res.json().catch(() => ({}));

      if (typeof json?.lp_group_id === 'string' && json.lp_group_id.trim()) {
        setLpGroupId(json.lp_group_id.trim());
      }

      if (res.status === 401) {
        setPanelError(
          typeof json?.error === 'string'
            ? json.error
            : '認可に失敗しました。/admin/login でログインしてください。',
        );
        return;
      }

      if (json?.preview && typeof json.preview === 'object') {
        setPreview(json.preview as RunPreview);
      }

      if (!res.ok) {
        setPanelError(typeof json?.error === 'string' ? json.error : '実行に失敗しました。');
        return;
      }

      if (typeof json?.plan_id === 'string') {
        setPlanId(json.plan_id);
      }
      if (Array.isArray(json?.created)) {
        setCreated(json.created as CreatedRow[]);
      }
      if (typeof json?.error === 'string' && json.error.trim()) {
        setRunNote(json.error);
      }

      const rows = Array.isArray(json?.created) ? (json.created as CreatedRow[]) : [];
      if (rows.length > 0) {
        showToast(
          'success',
          `${rows.length} 件の LP を作成しました。一覧または下記リンクから確認できます。`,
        );
      }
    } catch {
      setPanelError('通信に失敗しました。');
    } finally {
      setLoading(false);
    }
  }, [instruction, useResearch, ensureTemplateForAgentRun, showToast]);

  const busy = disabled || loading;
  const prevBusy = disabled || previewLoading;

  return (
    <section className="mb-8 rounded-2xl border border-violet-500/35 bg-gradient-to-b from-violet-950/40 to-slate-950/40 p-5 shadow-lg shadow-violet-950/20">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-500/20 text-violet-200">
          <Bot className="h-5 w-5" aria-hidden />
        </span>
        <div>
          <h2 className="text-base font-semibold text-violet-100 md:text-lg">
            AI で複数 LP を量産
          </h2>
          <p className="text-xs text-slate-400 md:text-sm">
            1 行の指示からテーマを計画し、テンプレを複製して複数 projects 行を作成します（保存済みの
            project をテンプレに使います）。
          </p>
        </div>
      </div>

      <label className="mb-1 block text-xs font-medium text-slate-400">指示</label>
      <textarea
        value={instruction}
        onChange={(e) => onInstructionChange(e.target.value)}
        disabled={disabled}
        placeholder="例：尼崎 外壁塗装 10LP 価格訴求"
        rows={4}
        className="mb-2 w-full rounded-xl border border-violet-500/30 bg-slate-900/90 px-4 py-3 text-sm text-slate-50 outline-none placeholder:text-slate-500 focus:border-violet-400 focus:ring-1 focus:ring-violet-400 disabled:opacity-60"
      />
      <div className="mb-4 flex flex-wrap items-center gap-3 text-xs text-slate-400">
        {parsedCountHint != null && parsedCountHint > 0 ? (
          <span className="rounded-full border border-slate-600 bg-slate-900/80 px-2.5 py-1 text-slate-300">
            生成予定件数: <strong className="text-slate-100">{parsedCountHint}</strong>
          </span>
        ) : null}
        <label className="inline-flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={useResearch}
            onChange={(e) => setUseResearch(e.target.checked)}
            disabled={disabled}
            className="rounded border-slate-600 bg-slate-800 text-violet-500 focus:ring-violet-500"
          />
          競合リサーチを使う（時間がかかることがあります）
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void runAgent()}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-full bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-violet-900/40 transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:bg-slate-600 disabled:text-slate-300"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          LP 生成
        </button>
        <button
          type="button"
          onClick={() => void runPreview()}
          disabled={prevBusy}
          className="inline-flex items-center gap-2 rounded-full border border-violet-500/50 bg-slate-900/80 px-4 py-2.5 text-sm font-medium text-violet-100 transition hover:bg-violet-950/50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {previewLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : null}
          指示のプレビュー
        </button>
      </div>

      {panelError && (
        <p className="mt-4 rounded-lg border border-rose-500/40 bg-rose-950/30 px-3 py-2 text-sm text-rose-100">
          {panelError}
        </p>
      )}
      {runNote && (
        <p className="mt-2 text-sm text-amber-200/90">{runNote}</p>
      )}

      {preview && (
        <div className="mt-5 rounded-xl border border-slate-700 bg-slate-900/70">
          <button
            type="button"
            onClick={() => setPreviewOpen((o) => !o)}
            className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-slate-200 hover:bg-slate-800/60"
          >
            <span>解析・テーマプレビュー</span>
            {previewOpen ? (
              <ChevronUp className="h-4 w-4 text-slate-400" />
            ) : (
              <ChevronDown className="h-4 w-4 text-slate-400" />
            )}
          </button>
          {previewOpen && (
            <div className="space-y-3 border-t border-slate-800 px-4 py-3 text-xs text-slate-300 md:text-sm">
              {preview.parsed && (
                <div>
                  <p className="mb-1 font-medium text-slate-400">解析結果</p>
                  <ul className="list-inside list-disc space-y-0.5">
                    <li>地域: {preview.parsed.area || '—'}</li>
                    <li>サービス: {preview.parsed.service || '—'}</li>
                    <li>件数: {preview.parsed.count}</li>
                    {preview.parsed.target ? (
                      <li>ターゲット補足: {preview.parsed.target}</li>
                    ) : null}
                    {preview.parsed.appeal ? (
                      <li>訴求補足: {preview.parsed.appeal}</li>
                    ) : null}
                  </ul>
                </div>
              )}
              {preview.research_used != null && (
                <p className="text-slate-400">
                  競合リサーチ: {preview.research_used ? '使用' : '未使用'}
                </p>
              )}
              {preview.themes && preview.themes.length > 0 && (
                <div>
                  <p className="mb-1 font-medium text-slate-400">
                    テーマ × モード（{preview.themes.length} 件）
                  </p>
                  <ul className="max-h-48 overflow-y-auto space-y-1.5">
                    {preview.themes.map((t, i) => (
                      <li
                        key={`${t.title}-${i}`}
                        className="rounded-lg border border-slate-700/80 bg-slate-950/50 px-2 py-1.5"
                      >
                        <span className="text-slate-200">{t.title}</span>{' '}
                        <span className="text-violet-300/90">({t.mode})</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {preview.pattern_summary &&
                (preview.pattern_summary.commonSections?.length ||
                  preview.pattern_summary.notes?.length) ? (
                <div>
                  <p className="mb-1 font-medium text-slate-400">パターン要約</p>
                  <p className="whitespace-pre-wrap text-slate-400">
                    {[
                      ...(preview.pattern_summary.commonSections ?? []).slice(0, 6),
                      ...(preview.pattern_summary.notes ?? []).slice(0, 4),
                    ].join(' / ')}
                  </p>
                </div>
              ) : null}
            </div>
          )}
        </div>
      )}

      {created.length > 0 && (
        <div className="mt-5 rounded-xl border border-emerald-500/35 bg-emerald-950/20 p-4">
          <p className="mb-2 text-sm font-medium text-emerald-100">
            {created.length} 件の LP を作成しました
          </p>
          {planId ? (
            <p className="mb-2 font-mono text-[10px] text-slate-500">plan_id: {planId}</p>
          ) : null}
          <ul className="space-y-2 text-sm">
            {created.map((c) => (
              <li
                key={c.id}
                className="flex flex-wrap items-center gap-2 border-b border-slate-800/80 pb-2 last:border-0 last:pb-0"
              >
                <span className="text-slate-200">{c.title}</span>
                {c.slug?.trim() ? (
                  <Link
                    href={`/p/${encodeURIComponent(c.slug.trim())}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-sky-400 hover:underline"
                  >
                    プレビュー
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                ) : (
                  <span className="text-xs text-amber-200/90">
                    slug 未設定のためプレビュー不可
                  </span>
                )}
                <span className="font-mono text-[10px] text-slate-500">
                  {c.slug?.trim() ? c.slug.trim() : `id: ${c.id}`}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <Link
              href="/admin/projects"
              className="inline-block text-sm font-medium text-sky-400 hover:underline"
            >
              プロジェクト一覧を開く →
            </Link>
            {lpGroupId ? (
              <Link
                href={`/admin/projects?lp_group_id=${encodeURIComponent(lpGroupId)}`}
                className="inline-block text-sm font-medium text-violet-300 hover:underline"
              >
                今回作成分のみ一覧で見る →
              </Link>
            ) : null}
          </div>
        </div>
      )}
    </section>
  );
}
