'use client';

import React, { useState } from 'react';
import Link from 'next/link';

/**
 * ADMIN_API_SECRET と同じ値を入力し、httpOnly Cookie を発行する。
 * 秘密はクライアントバンドルに含めない（この画面はユーザーが手入力するだけ）。
 */
export default function AdminLoginPage() {
  const [secret, setSecret] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch('/api/admin/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        setMsg(data?.error || 'ログインに失敗しました');
        return;
      }
      setMsg('ログインしました。管理画面に戻って編集・一覧を開いてください。');
      setSecret('');
    } catch {
      setMsg('通信エラー');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-16 text-slate-100">
      <div className="mx-auto max-w-md rounded-2xl border border-slate-800 bg-slate-900/80 p-8">
        <h1 className="text-lg font-semibold text-slate-50">管理セッション</h1>
        <p className="mt-2 text-xs text-slate-400">
          環境変数 <code className="text-slate-300">ADMIN_API_SECRET</code>{' '}
          と同じ値を入力してください。Cookie に保存され、編集 API などで使われます。
        </p>
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <input
            type="password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm"
            placeholder="シークレット"
            autoComplete="off"
          />
          <button
            type="submit"
            disabled={loading || !secret.trim()}
            className="w-full rounded-xl bg-sky-600 py-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            {loading ? '送信中…' : 'セッションを開始'}
          </button>
        </form>
        {msg && <p className="mt-4 text-sm text-amber-200">{msg}</p>}
        <Link
          href="/admin"
          className="mt-6 inline-block text-sm text-sky-400 hover:underline"
        >
          ← ダッシュボードへ
        </Link>
      </div>
    </div>
  );
}
