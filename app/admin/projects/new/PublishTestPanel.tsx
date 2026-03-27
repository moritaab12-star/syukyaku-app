'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  Loader2,
  XCircle,
  CheckCircle2,
  ExternalLink,
  X,
} from 'lucide-react';
import type { PublishTestFocusProject } from './publish-test-types';

const POST_COUNTS = [1, 3, 5, 10] as const;

type PreviewState = {
  /** DB 上の下書き・未公開候補の件数 */
  existingCandidateCount: number;
  /** 実行時に新規 INSERT する行数（0 のこともある） */
  clonesToCreate: number;
  willPublish: number;
  firstSlug: string | null;
  /** 表示用: 既存候補の先頭（clone 分は実行時まで未確定） */
  previewTargets: { id: string; slug: string }[];
  postCount: number;
  canProceed: boolean;
};

type BatchResultItem = {
  slug: string;
  success: boolean;
  url?: string;
  error?: string;
  dbUpdateWarning?: string;
};

type Props = {
  visible: boolean;
  presetService: string;
  onDismiss: () => void;
  /** 編集画面: 対象プロジェクトの公開可否メッセージ用（新規時は null） */
  focusProject?: PublishTestFocusProject | null;
};

const selectClass =
  'w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm text-slate-50 outline-none focus:border-sky-400';

export function PublishTestPanel({
  visible,
  presetService,
  onDismiss,
  focusProject = null,
}: Props) {
  const [drawerIn, setDrawerIn] = useState(false);
  const [services, setServices] = useState<string[]>([]);
  const [service, setService] = useState('');
  const [postCount, setPostCount] = useState<(typeof POST_COUNTS)[number]>(1);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [batchError, setBatchError] = useState<string | null>(null);
  const [batchResult, setBatchResult] = useState<{
    successCount: number;
    failCount: number;
    results: BatchResultItem[];
  } | null>(null);

  useEffect(() => {
    if (!visible) return;
    setDrawerIn(false);
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => setDrawerIn(true));
    });
    return () => cancelAnimationFrame(id);
  }, [visible]);

  const loadServices = useCallback(async () => {
    setPreviewError(null);
    try {
      const res = await fetch('/api/admin/publish-candidates', {
        credentials: 'include',
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        throw new Error(
          typeof json?.error === 'string'
            ? json.error
            : '業種一覧の取得に失敗しました',
        );
      }
      const list = Array.isArray(json.services)
        ? (json.services as string[])
        : [];
      setServices(list);
      setService((prev) => {
        if (prev && list.includes(prev)) return prev;
        const preset = presetService.trim();
        if (preset && list.includes(preset)) return preset;
        return list[0] ?? '';
      });
    } catch (e) {
      setServices([]);
      setPreviewError(
        e instanceof Error ? e.message : '業種一覧の取得に失敗しました',
      );
    }
  }, [presetService]);

  const loadPreview = useCallback(async () => {
    if (!service) {
      setPreview(null);
      return;
    }
    setPreviewLoading(true);
    setPreviewError(null);
    try {
      const params = new URLSearchParams({
        service,
        postCount: String(postCount),
      });
      if (focusProject?.projectId?.trim()) {
        params.set('focusProjectId', focusProject.projectId.trim());
      }
      const res = await fetch(`/api/admin/publish-batch?${params}`, {
        credentials: 'include',
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.ok === false) {
        throw new Error(
          typeof json?.error === 'string'
            ? json.error
            : 'プレビューの取得に失敗しました',
        );
      }
      const existingCandidateCount =
        typeof json.existingCandidateCount === 'number'
          ? json.existingCandidateCount
          : 0;
      const clonesToCreate =
        typeof json.clonesToCreate === 'number' ? json.clonesToCreate : 0;
      const willPublish =
        typeof json.willPublish === 'number' ? json.willPublish : 0;
      const previewTargets = Array.isArray(json.previewTargets)
        ? (json.previewTargets as { id: string; slug: string }[])
        : [];
      const canProceed = json.canProceed === true;

      setPreview({
        existingCandidateCount,
        clonesToCreate,
        willPublish,
        firstSlug: previewTargets[0]?.slug ?? null,
        previewTargets,
        postCount,
        canProceed,
      });
    } catch (e) {
      setPreview(null);
      setPreviewError(
        e instanceof Error ? e.message : 'プレビューの取得に失敗しました',
      );
    } finally {
      setPreviewLoading(false);
    }
  }, [service, postCount, focusProject?.projectId]);

  useEffect(() => {
    if (!visible) return;
    void loadServices();
  }, [visible, loadServices]);

  useEffect(() => {
    if (!visible || !service) {
      setPreview(null);
      return;
    }
    void loadPreview();
  }, [visible, service, postCount, loadPreview]);

  const handlePublish = async () => {
    if (!service || !preview?.canProceed) return;
    setPublishing(true);
    setBatchError(null);
    setBatchResult(null);

    try {
      const res = await fetch('/api/admin/publish-batch', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service,
          postCount,
          ...(focusProject?.projectId?.trim()
            ? { focusProjectId: focusProject.projectId.trim() }
            : {}),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.ok !== true) {
        throw new Error(
          typeof json?.error === 'string'
            ? json.error
            : '公開バッチに失敗しました',
        );
      }
      const rows = Array.isArray(json.results)
        ? (json.results as BatchResultItem[])
        : [];
      const successCount = rows.filter((r) => r.success).length;
      setBatchResult({
        successCount,
        failCount: rows.length - successCount,
        results: rows,
      });
      await loadServices();
      await loadPreview();
    } catch (e) {
      setBatchError(e instanceof Error ? e.message : '公開処理エラー');
    } finally {
      setPublishing(false);
    }
  };

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[100]" role="dialog" aria-modal="true">
      <button
        type="button"
        className="absolute inset-0 bg-black/60"
        onClick={onDismiss}
        aria-label="パネルを閉じる"
      />
      <aside
        className={`absolute right-0 top-0 z-[101] flex h-full w-full max-w-md flex-col border-l border-slate-800 bg-slate-950 shadow-2xl transition-transform duration-300 ease-out ${
          drawerIn ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-800 p-4">
          <div>
            <h2 className="text-sm font-semibold text-emerald-200">
              本番公開テスト
            </h2>
            <p className="mt-1 text-xs text-slate-400">
              公開件数 N に足りない場合は、テンプレ行から projects
              を自動複製してから N 件ぶん Next 上で公開（DB 更新）します（サーバ一括）。
            </p>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-lg border border-slate-600 p-2 text-slate-300 hover:bg-slate-800"
            aria-label="閉じる"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
          {focusProject && (
            <div className="rounded-xl border border-slate-600/80 bg-slate-900/80 p-3 text-xs text-slate-300">
              <p className="font-semibold text-slate-200">
                編集中のプロジェクト
              </p>
              <p className="mt-1 font-mono text-[11px] text-slate-500">
                id: {focusProject.projectId}
              </p>
              <p className="mt-1">
                slug:{' '}
                {focusProject.slug?.trim() ? (
                  <span className="font-mono text-emerald-200">
                    {focusProject.slug}
                  </span>
                ) : (
                  <span className="text-amber-200">
                    未設定 — この行は公開候補に含まれません。slug
                    を保存してからご利用ください。
                  </span>
                )}
              </p>
              <p className="mt-1">
                DB service:{' '}
                <span className="font-mono text-slate-400">
                  {focusProject.savedService?.trim() || '—'}
                </span>
                {' / '}
                フォーム:{' '}
                <span className="font-mono text-slate-400">
                  {focusProject.formService?.trim() || '（未入力）'}
                </span>
              </p>
              <p className="mt-1 text-slate-400">
                publish_status:{' '}
                <span className="font-mono">
                  {focusProject.publishStatus?.trim() || '—'}
                </span>
                {' · '}
                公開 URL（DB）:{' '}
                <span className="font-mono break-all">
                  {focusProject.publicUrl?.trim() || '—'}
                </span>
              </p>
              {focusProject.publishStatus === 'published' && (
                <p className="mt-2 text-amber-200">
                  このプロジェクトは Next 上で公開済みです。一括公開の候補は同じ
                  service・下書きの他 LP が対象です。
                </p>
              )}
              {focusProject.slug?.trim() &&
                focusProject.publishStatus === 'draft' && (
                  <p className="mt-2 text-emerald-200/90">
                    このプロジェクトは公開候補の条件を満たしています（先頭付近に並ぶことがあります）。
                  </p>
                )}
              {focusProject.formService?.trim() &&
                service &&
                focusProject.formService.trim() !== service.trim() && (
                  <p className="mt-2 text-amber-200/90">
                    プルダウンで選んでいる業種と、フォームのターゲットサービスが一致していません。DB
                    と揃えるには先に「変更を保存」してください。
                  </p>
                )}
            </div>
          )}

          <div className="grid gap-4">
            <div className="space-y-2">
              <label className="text-xs font-medium text-slate-300">
                業種（service）
              </label>
              <select
                className={selectClass}
                value={service}
                onChange={(e) => setService(e.target.value)}
                disabled={services.length === 0}
              >
                {services.length === 0 ? (
                  <option value="">候補となる業種がありません</option>
                ) : (
                  services.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))
                )}
              </select>
            </div>
            <div className="space-y-2">
              <span className="text-xs font-medium text-slate-300">
                投稿件数
              </span>
              <div className="flex flex-wrap gap-2">
                {POST_COUNTS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setPostCount(n)}
                    className={`rounded-lg border px-3 py-2 text-xs font-medium transition ${
                      postCount === n
                        ? 'border-emerald-400 bg-emerald-900/50 text-emerald-100'
                        : 'border-slate-600 bg-slate-800/60 text-slate-300 hover:border-slate-500'
                    }`}
                  >
                    {n} 件
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-700/80 bg-slate-900/50 p-4 text-sm">
            <p className="mb-2 text-xs font-medium text-slate-400">
              候補件数・実行前確認
            </p>
            {previewLoading ? (
              <p className="flex items-center gap-2 text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                候補を読み込み中…
              </p>
            ) : previewError ? (
              <p className="text-amber-200">{previewError}</p>
            ) : preview && service ? (
              <ul className="space-y-1.5 text-slate-200">
                <li>
                  既存の下書き・未公開候補:{' '}
                  <span className="font-mono text-sky-300">
                    {preview.existingCandidateCount}
                  </span>{' '}
                  件
                </li>
                {preview.clonesToCreate > 0 && (
                  <li>
                    実行時に新規行を{' '}
                    <span className="font-mono text-amber-200">
                      {preview.clonesToCreate}
                    </span>{' '}
                    件作成してから公開します。
                  </li>
                )}
                <li>
                  「<span className="font-medium text-slate-50">{service}</span>
                  」を{' '}
                  <span className="font-mono text-sky-300">
                    {preview.willPublish}
                  </span>{' '}
                  件公開します（選択 {postCount} 件）。
                </li>
                <li>
                  先頭 slug:{' '}
                  {preview.firstSlug ? (
                    <span className="break-all font-mono text-emerald-200">
                      {preview.firstSlug}
                    </span>
                  ) : (
                    <span className="text-slate-500">—</span>
                  )}
                </li>
              </ul>
            ) : (
              <p className="text-slate-500">業種を選択してください。</p>
            )}
          </div>

          <div className="flex flex-col gap-3">
            <button
              type="button"
              disabled={
                publishing ||
                !service ||
                !preview ||
                !preview.canProceed ||
                preview.willPublish === 0
              }
              onClick={() => void handlePublish()}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-600 disabled:shadow-none"
            >
              {publishing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  公開処理中…
                </>
              ) : (
                '公開開始'
              )}
            </button>
            {batchError && (
              <p className="text-sm text-amber-200">{batchError}</p>
            )}
          </div>

          {batchResult && (
            <div className="space-y-3 rounded-xl border border-slate-700 bg-slate-900/60 p-4">
              <p className="text-sm font-semibold text-slate-100">
                結果: 成功 {batchResult.successCount} 件 / 失敗{' '}
                {batchResult.failCount} 件
              </p>
              <ul className="max-h-48 space-y-2 overflow-y-auto text-xs md:text-sm">
                {batchResult.results.map((r, idx) => (
                  <li
                    key={`${r.slug}-${idx}`}
                    className="flex flex-col gap-1 rounded-lg border border-slate-800 bg-slate-950/80 p-2"
                  >
                    <span className="flex items-center gap-2 font-mono text-slate-200">
                      {r.success ? (
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                      ) : (
                        <XCircle className="h-4 w-4 shrink-0 text-red-400" />
                      )}
                      <span className="break-all">{r.slug}</span>
                    </span>
                    <span className="text-slate-400">
                      {r.success ? (
                        <>
                          {r.url ? (
                            <a
                              href={r.url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-sky-400 hover:underline"
                            >
                              開く
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          ) : (
                            '—'
                          )}
                          {r.dbUpdateWarning && (
                            <span className="mt-1 block text-amber-300">
                              {r.dbUpdateWarning}
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-red-300">
                          {r.error ?? 'エラー'}
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
