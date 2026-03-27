'use client';

import React from 'react';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createSupabaseClient } from '@/lib/supabase';
import { seededShuffle, getTodaySeed } from './lib/lp';
import { Q50_LABELS } from './admin/projects/new/questions';
import { Store, ArrowRight } from 'lucide-react';

type LpData = {
  contractor_id: string;
  raw_answers: Record<string, string>;
};

function buildLpContent(raw_answers: Record<string, string>, seed: string): { items: { id: string; label: string; value: string }[] } {
  const indices = Array.from({ length: 50 }, (_, i) => i + 1);
  const shuffled = seededShuffle(indices, seed);
  const items: { id: string; label: string; value: string }[] = [];
  for (const i of shuffled) {
    const id = `q${i}`;
    const value = (raw_answers[id] ?? '').trim();
    if (!value) continue;
    items.push({ id, label: Q50_LABELS[id] ?? id, value });
    if (items.length >= 15) break;
  }
  return { items };
}

export default function LpViewerPage() {
  const [lpData, setLpData] = useState<LpData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const seed = getTodaySeed();
  const generated = lpData ? buildLpContent(lpData.raw_answers, seed) : { items: [] };

  useEffect(() => {
    const supabase = createSupabaseClient();
    (async () => {
      try {
        const { data, error: e } = await supabase
          .from('contractors')
          .select('id, raw_answers')
          .eq('project_type', 'local')
          .not('raw_answers', 'is', null)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();
        if (e || !data) {
          setLpData(null);
          setError(data ? null : 'データがありません');
          return;
        }
        const raw = (data as { id: string; raw_answers: Record<string, string> }).raw_answers;
        if (!raw || typeof raw !== 'object') {
          setLpData(null);
          return;
        }
        setLpData({ contractor_id: data.id, raw_answers: raw });
        setError(null);
      } catch {
        setError('取得に失敗しました');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const [scoreRequested, setScoreRequested] = useState(false);
  useEffect(() => {
    if (!generated.items.length || !lpData || scoreRequested) return;
    setScoreRequested(true);
    const content = generated.items.map((i) => `【${i.label}】\n${i.value}`).join('\n\n');
    fetch('/api/lp/score', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contractor_id: lpData.contractor_id,
        seed_date: seed,
        generated_content: content,
      }),
    }).catch(() => {});
  }, [lpData, seed, generated.items.length, scoreRequested]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center">
        <p className="text-slate-400">読み込み中...</p>
      </div>
    );
  }

  if (error || !lpData) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100">
        <div className="mx-auto max-w-2xl px-4 py-16 text-center">
          <p className="text-slate-400 mb-6">{error ?? '実店舗の raw_answers がまだありません。'}</p>
          <Link
            href="/admin"
            className="inline-flex items-center gap-2 rounded-full bg-slate-700 px-5 py-2.5 text-sm font-semibold text-slate-100 transition hover:bg-slate-600"
          >
            <Store className="h-4 w-4" />
            ダッシュボードへ
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-3xl px-4 py-10 md:py-14">
        <div className="mb-8 flex items-center justify-between">
          <h1 className="text-xl font-semibold text-slate-50 md:text-2xl">
            本日のLP（{seed}）
          </h1>
          <Link
            href="/admin"
            className="inline-flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-900/80 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
          >
            <ArrowRight className="h-3.5 w-3.5" />
            管理
          </Link>
        </div>

        <div className="space-y-6">
          {generated.items.map((item) => (
            <section
              key={item.id}
              className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-lg shadow-slate-950/60"
            >
              <h2 className="mb-3 text-sm font-semibold text-sky-300">
                {item.label}
              </h2>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-200">
                {item.value}
              </p>
            </section>
          ))}
        </div>

        <p className="mt-8 text-center text-xs text-slate-500">
          50の素材から毎日内容が切り替わります。編集は
          <Link href="/admin/projects/new?type=local" className="ml-1 text-sky-400 hover:underline">
            新規プロジェクト登録
          </Link>
          から。
        </p>
      </div>
    </div>
  );
}
