'use client';

import React, { useCallback, useState } from 'react';
import Link from 'next/link';
import { Bot, ChevronDown, ChevronUp, ExternalLink, Loader2, Rocket } from 'lucide-react';

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
    commonSections: string[];
    commonCtas: string[];
    notes: string[];
  } | null;
};

export default function AgentInput() {
  const [instruction, setInstruction] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [useResearch, setUseResearch] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(true);
  const [loading, setLoading] = useState(false);
  const [publishLoading, setPublishLoading] = useState(false);
  const [planId, setPlanId] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedRow[]>([]);
  const [preview, setPreview] = useState<RunPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [runNote, setRunNote] = useState<string | null>(null);

  const runAgent = useCallback(async () => {
    setError(null);
    setRunNote(null);
    setLoading(true);
    setCreated([]);
    setPlanId(null);
    setPreview(null);
    try {
      const res = await fetch('/api/admin/agent/run', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instruction,
          template_project_id: templateId.trim() || undefined,
          use_competitor_research: useResearch,
        }),
      });
      const json = await res.json().catch(() => ({}));

      if (res.status === 401) {
        setError(
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
        setError(typeof json?.error === 'string' ? json.error : '実行に失敗しました。');
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
    } catch {
      setError('通信に失敗しました。');
    } finally {
      setLoading(false);
    }
  }, [instruction, templateId, useResearch]);

  const publishOkRows = useCallback(async () => {
    const okIds = created
      .filter((c) => (c.status ?? '').trim() === 'ok')
      .map((c) => c.id);
    if (okIds.length === 0) return;

    setPublishLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/agent/publish-ok', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_ids: okIds }),
      });
      const json = await res.json().catch(() => ({}));

      if (res.status === 401) {
        setError(
          typeof json?.error === 'string'
            ? json.error
            : '認可に失敗しました。/admin/login でログインしてください。',
        );
        return;
      }

      if (!res.ok) {
        setError(typeof json?.error === 'string' ? json.error : '公開に失敗しました。');
        return;
      }

      const lines = Array.isArray(json?.results)
        ? (json.results as { id: string; published?: boolean; url?: string; error?: string }[])
        : [];
      const summary = lines
        .map((r) => {
          if (r.published && r.url) return `${r.id.slice(0, 8)}… 公開: ${r.url}`;
          if (r.error) return `${r.id.slice(0, 8)}… 失敗: ${r.error}`;
          return `${r.id.slice(0, 8)}… スキップ`;
        })
        .join('\n');
      if (summary) {
        setRunNote(summary);
      }
    } catch {
      setError('公開リクエストに失敗しました。');
    } finally {
      setPublishLoading(false);
    }
  }, [created]);

  const okCount = created.filter((c) => (c.status ?? '').trim() === 'ok').length;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-lg shadow-slate-950/40">
        <label className="block text-sm font-medium text-slate-200">
          指示（自然文）
        </label>
        <textarea
          className="mt-2 w-full min-h-[120px] rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500/70 focus:outline-none focus:ring-1 focus:ring-emerald-500/70"
          placeholder="例: 東京都で外壁塗装のLPを5本作って。訴求は料金透明を軸に。"
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          disabled={loading}
        />

        <label className="mt-4 block text-sm font-medium text-slate-200">
          テンプレート project_id（任意）
        </label>
        <input
          type="text"
          className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500/70 focus:outline-none focus:ring-1 focus:ring-emerald-500/70"
          placeholder="UUID を貼り付け（未指定時は同サービスの下書き先頭を複製）"
          value={templateId}
          onChange={(e) => setTemplateId(e.target.value)}
          disabled={loading}
        />

        <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm text-slate-300">
          <input
            type="checkbox"
            checked={useResearch}
            onChange={(e) => setUseResearch(e.target.checked)}
            disabled={loading}
            className="rounded border-slate-600 bg-slate-950"
          />
          競合調査を挟む（参照 URL の構造メタのみ。Perplexity 利用）
        </label>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void runAgent()}
            disabled={loading || !instruction.trim()}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Bot className="h-4 w-4" />
            )}
            エージェント実行
          </button>
          {planId && (
            <span className="text-xs text-slate-500">plan: {planId}</span>
          )}
        </div>
      </div>

      {preview && (preview.parsed || preview.themes?.length) ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/40">
          <button
            type="button"
            onClick={() => setPreviewOpen((o) => !o)}
            className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-slate-200"
          >
            実行プレビュー（解析・テーマ・mode）
            {previewOpen ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </button>
          {previewOpen && (
            <div className="space-y-3 border-t border-slate-800 px-4 py-3 text-xs text-slate-400">
              {preview.parsed && (
                <div>
                  <p className="font-semibold text-slate-300">解析</p>
                  <p>
                    地域: {preview.parsed.area} / サービス: {preview.parsed.service} /{' '}
                    本数: {preview.parsed.count}
                  </p>
                  {preview.parsed.target ? (
                    <p>ターゲット: {preview.parsed.target}</p>
                  ) : null}
                  {preview.parsed.appeal ? (
                    <p>訴求: {preview.parsed.appeal}</p>
                  ) : null}
                </div>
              )}
              <p>
                競合調査: {preview.research_used ? '使用' : '未使用'}
              </p>
              {preview.pattern_summary &&
              (preview.pattern_summary.commonSections.length > 0 ||
                preview.pattern_summary.notes.length > 0) ? (
                <div>
                  <p className="font-semibold text-slate-300">構造メタ（要約）</p>
                  <p className="break-all">
                    セクション候補:{' '}
                    {preview.pattern_summary.commonSections.slice(0, 10).join(' → ')}
                  </p>
                  {preview.pattern_summary.notes.slice(0, 4).map((n) => (
                    <p key={n.slice(0, 40)}>{n}</p>
                  ))}
                </div>
              ) : null}
              {preview.themes && preview.themes.length > 0 ? (
                <ul className="max-h-48 list-inside list-disc overflow-y-auto text-slate-300">
                  {preview.themes.map((t) => (
                    <li key={t.title}>
                      <span className="text-slate-200">{t.title}</span>{' '}
                      <span className="text-emerald-400/90">[{t.mode}]</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          )}
        </div>
      ) : null}

      {error && (
        <div className="rounded-xl border border-rose-500/40 bg-rose-950/30 px-4 py-3 text-sm text-rose-200">
          {error}
        </div>
      )}

      {runNote && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 px-4 py-3 text-sm text-amber-100 whitespace-pre-wrap">
          {runNote}
        </div>
      )}

      {created.length > 0 && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-slate-200">
              生成結果（{created.length} 件）
            </h2>
            <button
              type="button"
              onClick={() => void publishOkRows()}
              disabled={publishLoading || okCount === 0}
              className="inline-flex items-center gap-2 rounded-xl bg-sky-500 px-4 py-2 text-sm font-semibold text-sky-950 transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {publishLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Rocket className="h-4 w-4" />
              )}
              status=ok のみ一括公開（{okCount} 件）
            </button>
          </div>

          <ul className="grid gap-3 sm:grid-cols-2">
            {created.map((c) => (
              <li
                key={c.id}
                className="rounded-xl border border-slate-800 bg-slate-900/70 p-4"
              >
                <p className="text-sm font-medium text-slate-100 line-clamp-2">
                  {c.title}
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  mode:{' '}
                  <span className="text-emerald-300">{c.mode ?? '—'}</span>
                  {' · '}
                  スコア: {c.score ?? '—'} / ステータス:{' '}
                  <span
                    className={
                      c.status === 'ok'
                        ? 'text-emerald-300'
                        : c.status === 'fix'
                          ? 'text-amber-300'
                          : 'text-rose-300'
                    }
                  >
                    {c.status ?? '—'}
                  </span>
                </p>
                {c.slug && (
                  <Link
                    href={`/p/${c.slug}`}
                    className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-sky-400 hover:text-sky-300"
                    target="_blank"
                    rel="noreferrer"
                  >
                    プレビュー <ExternalLink className="h-3 w-3" />
                  </Link>
                )}
                <p className="mt-1 font-mono text-[10px] text-slate-500 break-all">
                  {c.id}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
