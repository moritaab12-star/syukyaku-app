'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { ArrowLeft, Plus, Pencil, Trash2 } from 'lucide-react';
import type { ServicePersonaParsed } from '@/app/lib/service-persona/parse-db-row';

const btn =
  'inline-flex items-center gap-1.5 rounded-xl border border-slate-600 bg-slate-800 px-3 py-2 text-xs font-medium text-slate-200 transition hover:bg-slate-700';

export default function ServicePersonasListPage() {
  const [rows, setRows] = useState<ServicePersonaParsed[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/service-personas', {
        credentials: 'include',
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j?.ok) {
        setMessage(
          typeof j?.error === 'string'
            ? j.error
            : '一覧の取得に失敗しました。',
        );
        setRows([]);
        return;
      }
      setRows(Array.isArray(j.rows) ? j.rows : []);
    } catch {
      setMessage('一覧の取得に失敗しました。');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleActive = async (row: ServicePersonaParsed) => {
    try {
      const res = await fetch(`/api/admin/service-personas/${row.id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !row.is_active }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j?.ok) {
        setMessage(
          typeof j?.error === 'string' ? j.error : '更新に失敗しました。',
        );
        return;
      }
      await load();
    } catch {
      setMessage('更新に失敗しました。');
    }
  };

  const deleteRow = async (row: ServicePersonaParsed) => {
    if (
      typeof window !== 'undefined' &&
      !window.confirm(
        `「${row.service_name}」を削除しますか？この操作は取り消せません。`,
      )
    ) {
      return;
    }
    try {
      const res = await fetch(`/api/admin/service-personas/${row.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j?.ok) {
        setMessage(
          typeof j?.error === 'string' ? j.error : '削除に失敗しました。',
        );
        return;
      }
      await load();
    } catch {
      setMessage('削除に失敗しました。');
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-5xl px-4 py-10 md:px-8">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <Link
              href="/admin"
              className="mb-3 inline-flex items-center gap-2 text-xs text-slate-400 hover:text-slate-200"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              ダッシュボード
            </Link>
            <h1 className="text-xl font-semibold text-slate-50 md:text-2xl">
              業種ルールマスター一覧
            </h1>
            <p className="mt-2 text-sm text-slate-400">
              LP 新規作成時に選べる業種のみがここに登録されたものです。
            </p>
          </div>
          <Link
            href="/admin/service-personas/new"
            className="inline-flex items-center gap-2 rounded-2xl bg-sky-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-sky-500"
          >
            <Plus className="h-4 w-4" />
            新規登録
          </Link>
        </div>

        {message && (
          <div className="mb-6 rounded-xl border border-amber-700/60 bg-amber-950/40 px-4 py-3 text-sm text-amber-100">
            {message}
          </div>
        )}

        {loading ? (
          <p className="text-slate-400">読み込み中…</p>
        ) : rows.length === 0 ? (
          <p className="text-slate-400">
            まだ登録がありません。新規登録から追加してください。
          </p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-800">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-slate-800 bg-slate-900/80">
                <tr>
                  <th className="px-4 py-3 font-medium text-slate-300">
                    業種名
                  </th>
                  <th className="px-4 py-3 font-medium text-slate-300">
                    service_key
                  </th>
                  <th className="px-4 py-3 font-medium text-slate-300">
                    有効
                  </th>
                  <th className="px-4 py-3 font-medium text-slate-300">
                    更新
                  </th>
                  <th className="px-4 py-3 font-medium text-slate-300">
                    操作
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {rows.map((r) => (
                  <tr key={r.id} className="bg-slate-950/50">
                    <td className="px-4 py-3 text-slate-100">{r.service_name}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-400">
                      {r.service_key}
                    </td>
                    <td className="px-4 py-3">
                      {r.is_active ? (
                        <span className="text-emerald-400">有効</span>
                      ) : (
                        <span className="text-slate-500">無効</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {r.updated_at
                        ? new Date(r.updated_at).toLocaleString('ja-JP')
                        : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <Link
                          href={`/admin/service-personas/${r.id}/edit`}
                          className={btn}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          編集
                        </Link>
                        <button type="button" className={btn} onClick={() => void toggleActive(r)}>
                          {r.is_active ? '無効化' : '有効化'}
                        </button>
                        <button
                          type="button"
                          className={`${btn} border-red-900/50 text-red-200 hover:bg-red-950/40`}
                          onClick={() => void deleteRow(r)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          削除
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
