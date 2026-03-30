'use client';

import React from 'react';
import { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Plus,
  Trash2,
  ExternalLink,
  Loader2,
  FolderOpen,
  Pencil,
  X,
  Copy,
  Check,
} from 'lucide-react';

type LpLinkItem = {
  id: string;
  slug: string | null;
  area: string | null;
  service: string | null;
  publish_status: string | null;
  /** プレビュー用 `/p/{projectId}` */
  path: string;
  slug_missing?: boolean;
};

export type Project = {
  id: string;
  company_name: string | null;
  project_type: string | null;
  status: string | null;
  publish_status?: string | null;
  slug: string | null;
  created_at: string | null;
  area?: string | null;
  service?: string | null;
  lp_group_id?: string | null;
};

type Props = {
  initialProjects: Project[];
  /** サーバーが lp_group_id で絞り込んだとき、表示の文脈用（任意） */
  filterLpGroupId?: string | null;
};

function formatDate(s: string | null) {
  if (!s) return '—';
  try {
    return new Date(s).toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  } catch {
    return s;
  }
}

export function ProjectsTable({
  initialProjects,
  filterLpGroupId = null,
}: Props) {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>(initialProjects);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [bulkDeleteError, setBulkDeleteError] = useState<string | null>(null);

  const [lpDrawerOpen, setLpDrawerOpen] = useState(false);
  const [lpDrawerIn, setLpDrawerIn] = useState(false);
  const [lpDrawerProjectId, setLpDrawerProjectId] = useState<string | null>(
    null,
  );
  const [lpDrawerTitle, setLpDrawerTitle] = useState('');
  const [lpLinksLoading, setLpLinksLoading] = useState(false);
  const [lpLinksError, setLpLinksError] = useState<string | null>(null);
  const [lpLinksNeedLogin, setLpLinksNeedLogin] = useState(false);
  const [lpLinksItems, setLpLinksItems] = useState<LpLinkItem[]>([]);
  const [lpLinksCopied, setLpLinksCopied] = useState(false);

  useEffect(() => {
    setProjects(initialProjects);
  }, [initialProjects]);

  const filteredBatchLabel =
    filterLpGroupId != null && filterLpGroupId.trim() !== ''
      ? `（同一 lp_group のみ ${projects.length} 件）`
      : '';

  useEffect(() => {
    if (!lpDrawerOpen) {
      setLpDrawerIn(false);
      return;
    }
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => setLpDrawerIn(true));
    });
    return () => cancelAnimationFrame(id);
  }, [lpDrawerOpen]);

  const refresh = useCallback(() => {
    router.refresh();
  }, [router]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === projects.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(projects.map((p) => p.id)));
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    const count = selectedIds.size;
    const idsToRemove = Array.from(selectedIds);
    if (!window.confirm(`本当に ${count} 件削除しますか？`)) return;
    setBulkDeleteError(null);
    setDeleting(true);
    try {
      const res = await fetch('/api/admin/projects/bulk-delete', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: idsToRemove }),
      });
      const json = await res.json().catch(() => ({}));

      if (res.status === 401) {
        const msg =
          typeof json?.error === 'string'
            ? json.error
            : '認可に失敗しました。/admin/login でログインしてください。';
        setBulkDeleteError(msg);
        alert(msg);
        return;
      }

      if (!res.ok || json?.ok !== true) {
        const msg =
          typeof json?.error === 'string'
            ? json.error
            : '削除に失敗しました。';
        setBulkDeleteError(msg);
        alert(msg);
        return;
      }

      setSelectedIds(new Set());
      setProjects((prev) => prev.filter((p) => !idsToRemove.includes(p.id)));
      refresh();
    } catch (err) {
      console.error(err);
      const msg = '通信エラーで削除を完了できませんでした。';
      setBulkDeleteError(msg);
      alert(msg);
    } finally {
      setDeleting(false);
    }
  };

  const closeLpDrawer = useCallback(() => {
    setLpDrawerOpen(false);
    setLpDrawerProjectId(null);
    setLpLinksError(null);
    setLpLinksNeedLogin(false);
    setLpLinksItems([]);
    setLpLinksCopied(false);
  }, []);

  const openLpDrawer = useCallback(async (p: Project) => {
    setLpDrawerOpen(true);
    setLpDrawerProjectId(p.id);
    setLpDrawerTitle(p.company_name?.trim() || 'プロジェクト');
    setLpLinksLoading(true);
    setLpLinksError(null);
    setLpLinksNeedLogin(false);
    setLpLinksItems([]);
    setLpLinksCopied(false);
    try {
      const res = await fetch(
        `/api/admin/project-lp-links?projectId=${encodeURIComponent(p.id)}`,
        { credentials: 'include' },
      );
      const json = await res.json().catch(() => ({}));
      if (res.status === 401) {
        setLpLinksNeedLogin(true);
        setLpLinksError(null);
        return;
      }
      if (!res.ok || !json?.ok) {
        setLpLinksError(
          typeof json?.error === 'string'
            ? json.error
            : 'LP 一覧の取得に失敗しました',
        );
        return;
      }
      setLpLinksItems(Array.isArray(json.items) ? json.items : []);
    } catch {
      setLpLinksError('通信に失敗しました');
    } finally {
      setLpLinksLoading(false);
    }
  }, []);

  const copyLpUrls = useCallback(async () => {
    if (typeof window === 'undefined' || lpLinksItems.length === 0) return;
    const origin = window.location.origin;
    const lines = lpLinksItems
      .filter((i) => i.path.length > 0)
      .map((i) => `${origin}${i.path}`);
    if (lines.length === 0) {
      setLpLinksError('コピーできるプレビュー URL がありません');
      return;
    }
    const text = lines.join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setLpLinksCopied(true);
      window.setTimeout(() => setLpLinksCopied(false), 2000);
    } catch {
      setLpLinksError('クリップボードへのコピーに失敗しました');
    }
  }, [lpLinksItems]);

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/80 shadow-lg shadow-slate-950/60 overflow-hidden">
      {projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <FolderOpen className="h-12 w-12 text-slate-600" />
          <p className="mt-4 text-slate-400">プロジェクトがありません</p>
          <Link
            href="/admin/projects/new"
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-slate-700 px-4 py-2 text-sm font-medium text-slate-100 hover:bg-slate-600"
          >
            <Plus className="h-4 w-4" />
            新規作成
          </Link>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 px-4 py-3">
            <span className="text-sm text-slate-400">
              {projects.length} 件
              {filteredBatchLabel ? (
                <span className="text-violet-300/90">{filteredBatchLabel}</span>
              ) : null}
            </span>
            <div className="flex flex-wrap items-center gap-2">
              {bulkDeleteError && (
                <p className="max-w-md text-xs text-amber-200">{bulkDeleteError}</p>
              )}
              {selectedIds.size > 0 && (
                <button
                  type="button"
                  onClick={() => void handleBulkDelete()}
                  disabled={deleting}
                  className="inline-flex items-center gap-2 rounded-lg bg-red-500/90 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-red-500 disabled:opacity-50"
                >
                  {deleting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                  選択した項目を削除
                </button>
              )}
            </div>
          </div>
          <div className="relative">
            {deleting && (
              <div
                className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-b-2xl bg-slate-950/65 backdrop-blur-[2px]"
                aria-busy="true"
                aria-live="polite"
              >
                <Loader2 className="h-8 w-8 animate-spin text-sky-400" />
                <span className="text-sm font-medium text-slate-200">削除中…</span>
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px]">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-900/60">
                  <th className="w-12 px-4 py-3 text-left">
                    <input
                      type="checkbox"
                      checked={
                        projects.length > 0 && selectedIds.size === projects.length
                      }
                      onChange={toggleSelectAll}
                      className="h-4 w-4 rounded border-slate-600 bg-slate-800 text-sky-500 focus:ring-sky-500"
                    />
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                    プロジェクト名
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                    エリア
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                    サービス
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                    タイプ
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                    作成日
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                    ステータス
                  </th>
                  <th className="min-w-[12rem] px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-400">
                    操作
                  </th>
                </tr>
              </thead>
              <tbody>
                {projects.map((p) => (
                  <tr
                    key={p.id}
                    className="border-b border-slate-800/80 transition hover:bg-slate-800/40"
                  >
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(p.id)}
                        onChange={() => toggleSelect(p.id)}
                        className="h-4 w-4 rounded border-slate-600 bg-slate-800 text-sky-500 focus:ring-sky-500"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-medium text-slate-100">
                        {p.company_name || '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-300">
                      {p.area || '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-300">
                      {p.service || '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-slate-700 px-2 py-0.5 text-xs text-slate-200">
                        {p.project_type === 'saas' ? 'SaaS' : '実店舗'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-300">
                      {formatDate(p.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-slate-400">
                        {(p.publish_status ?? '').trim() ||
                          p.status ||
                          '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex flex-wrap items-center justify-end gap-1.5">
                        {p.project_type !== 'saas' && (
                          <Link
                            href={`/admin/projects/${p.id}/edit`}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-600 bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-slate-200 transition hover:bg-slate-700 hover:text-amber-200"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            編集
                          </Link>
                        )}
                        <button
                          type="button"
                          onClick={() => void openLpDrawer(p)}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-600 bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-slate-200 transition hover:bg-slate-700 hover:text-sky-300"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          LP表示
                        </button>
                        {p.project_type !== 'saas' && (
                          <Link
                            href={`/admin/projects/new?clone_from=${encodeURIComponent(p.id)}`}
                            className="inline-flex items-center gap-1 rounded-lg border border-violet-700/60 bg-violet-950/40 px-2.5 py-1.5 text-xs font-medium text-violet-200 transition hover:bg-violet-900/50"
                          >
                            新規版
                          </Link>
                        )}
                        {p.lp_group_id &&
                          typeof p.lp_group_id === 'string' &&
                          /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
                            p.lp_group_id.trim(),
                          ) &&
                          p.project_type !== 'saas' && (
                            <Link
                              href={`/admin/projects/new?lp_group=${encodeURIComponent(p.lp_group_id.trim())}`}
                              className="inline-flex items-center gap-1 rounded-lg border border-emerald-700/60 bg-emerald-950/40 px-2.5 py-1.5 text-xs font-medium text-emerald-200 transition hover:bg-emerald-900/50"
                            >
                              同じグループで新規
                            </Link>
                          )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {lpDrawerOpen && lpDrawerProjectId && (
        <div className="fixed inset-0 z-[100]" role="dialog" aria-modal="true">
          <button
            type="button"
            className="absolute inset-0 bg-black/60"
            onClick={closeLpDrawer}
            aria-label="パネルを閉じる"
          />
          <aside
            className={`absolute right-0 top-0 z-[101] flex h-full w-full max-w-md flex-col border-l border-slate-800 bg-slate-950 shadow-2xl transition-transform duration-300 ease-out ${
              lpDrawerIn ? 'translate-x-0' : 'translate-x-full'
            }`}
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-800 p-4">
              <div>
                <h2 className="text-sm font-semibold text-sky-200">LP 一覧</h2>
                <p className="mt-1 text-xs text-slate-400">
                  同じ lp_group_id の行、または親子（parent_project_id）に紐づく
                  /p/… の URL 一覧です。
                </p>
                <p className="mt-2 text-xs font-medium text-slate-200">
                  {lpDrawerTitle}
                </p>
                <p className="mt-0.5 font-mono text-[11px] text-slate-500">
                  id: {lpDrawerProjectId}
                </p>
              </div>
              <button
                type="button"
                onClick={closeLpDrawer}
                className="rounded-lg border border-slate-600 p-2 text-slate-300 hover:bg-slate-800"
                aria-label="閉じる"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
              {lpLinksLoading && (
                <div className="flex items-center gap-2 text-sm text-slate-400">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  読み込み中…
                </div>
              )}

              {lpLinksNeedLogin && !lpLinksLoading && (
                <div className="rounded-xl border border-amber-500/40 bg-amber-950/30 px-3 py-2 text-sm text-amber-100">
                  認可に失敗しました。{' '}
                  <Link
                    href="/admin/login"
                    className="font-medium text-sky-300 underline underline-offset-2"
                  >
                    /admin/login
                  </Link>{' '}
                  でセッションを開始してから再度お試しください。
                </div>
              )}

              {lpLinksError && !lpLinksLoading && (
                <div className="rounded-xl border border-red-500/40 bg-red-950/30 px-3 py-2 text-sm text-red-100">
                  {lpLinksError}
                </div>
              )}

              {!lpLinksLoading &&
                !lpLinksNeedLogin &&
                !lpLinksError &&
                lpLinksItems.length > 0 && (
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void copyLpUrls()}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-600 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700"
                      >
                        {lpLinksCopied ? (
                          <Check className="h-3.5 w-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                        {lpLinksCopied ? 'コピーしました' : 'URL を改行区切りでコピー'}
                      </button>
                    </div>
                    <ul className="space-y-3">
                      {lpLinksItems.map((item) => {
                        const absUrl =
                          typeof window !== 'undefined'
                            ? `${window.location.origin}${item.path}`
                            : item.path;
                        return (
                          <li
                            key={item.id}
                            className="rounded-xl border border-slate-800 bg-slate-900/80 p-3 text-xs text-slate-300"
                          >
                            <a
                              href={absUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="break-all font-mono text-[11px] text-sky-300 hover:text-sky-200"
                            >
                              {absUrl}
                            </a>
                            {item.slug_missing ? (
                              <p className="mt-1 text-amber-200/80">
                                slug 未設定（公開用のきれいな URL とは別。プレビューは上記 id
                                パスで表示されます）
                              </p>
                            ) : null}
                            <div className="mt-2 grid gap-0.5 text-[11px] text-slate-400">
                              <span>
                                エリア: {item.area?.trim() || '—'}
                              </span>
                              <span>
                                サービス: {item.service?.trim() || '—'}
                              </span>
                              <span>
                                公開状態:{' '}
                                {(item.publish_status ?? '').trim() || '—'}
                              </span>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </>
                )}

              {!lpLinksLoading &&
                !lpLinksNeedLogin &&
                !lpLinksError &&
                lpLinksItems.length === 0 && (
                  <p className="text-sm text-slate-500">
                    表示する LP がありません。
                  </p>
                )}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
