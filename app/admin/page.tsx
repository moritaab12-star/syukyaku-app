'use client';

import React from 'react';
import Link from 'next/link';
import { Sparkles, ArrowRight, Store, Cloud, Rocket, LayoutDashboard } from 'lucide-react';

export default function AdminDashboardPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto flex min-h-screen max-w-5xl flex-col px-4 py-10 md:px-8 md:py-16">
        <header className="mb-10 flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full bg-slate-900/80 px-3 py-1 text-[11px] text-slate-300 ring-1 ring-slate-700/80">
              <Sparkles className="h-3.5 w-3.5 text-sky-300" />
              <span>集客設計を、落ち着いたワークスペースで。</span>
            </div>
            <div>
              <h1 className="bg-gradient-to-r from-slate-100 via-sky-300 to-slate-400 bg-clip-text text-2xl font-semibold tracking-tight text-transparent md:text-3xl">
                集客プロジェクト管理システム
              </h1>
              <p className="mt-2 text-sm text-slate-400 md:text-base">
                ローカルビジネスとSaaSの「売り」を、静かに・丁寧に整理するためのダッシュボードです。
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/admin/login"
              className="flex items-center gap-2 rounded-2xl border border-slate-700 bg-slate-900/70 px-3 py-2 text-[11px] text-slate-400 transition hover:border-slate-600 hover:text-slate-200"
            >
              管理 API ログイン
            </Link>
            <Link
              href="/admin/projects"
              className="flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900/70 px-4 py-3 text-xs text-slate-300 transition hover:bg-slate-800/60 hover:text-slate-100"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-800 text-slate-200">
                <LayoutDashboard className="h-4 w-4" />
              </div>
              <div>
                <p className="font-medium text-slate-100">プロジェクト一覧</p>
                <p className="mt-0.5 text-[11px] text-slate-400">
                  一覧・削除・LP表示
                </p>
              </div>
            </Link>
            <Link
              href="/"
              className="flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900/70 px-4 py-3 text-xs text-slate-300 transition hover:bg-slate-800/60 hover:text-slate-100"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-800 text-slate-200">
                <Rocket className="h-4 w-4" />
              </div>
              <div>
                <p className="font-medium text-slate-100">本日のLPを見る</p>
                <p className="mt-0.5 text-[11px] text-slate-400">
                  50の素材から毎日自動更新
                </p>
              </div>
            </Link>
          </div>
        </header>

        <main className="flex flex-1 items-center justify-center">
          <div className="grid w-full max-w-3xl gap-6 md:grid-cols-2">
            <Link
              href="/admin/projects/new?type=local"
              className="group flex flex-col gap-4 rounded-2xl border border-slate-600/70 bg-slate-900 px-6 py-6 text-left shadow-lg shadow-slate-950/70 transition-all duration-200 hover:-translate-y-1 hover:border-sky-300/80 hover:shadow-[0_0_30px_rgba(125,211,252,0.35)] active:scale-95 active:translate-y-0 active:shadow-[0_0_18px_rgba(148,163,184,0.45)]"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-800 text-slate-100">
                    <Store className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                      LOCAL BUSINESS
                    </p>
                    <h2 className="mt-1 text-sm font-semibold text-slate-50 md:text-base">
                      ローカルビジネス（実店舗）
                    </h2>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-slate-300 transition group-hover:translate-x-1" />
              </div>
              <p className="text-xs leading-relaxed text-slate-300 md:text-sm">
                50の質問に答えると、毎日内容が切り替わるLPを自動作成。信頼・地域・差別化・エピソードを網羅します。
              </p>
              <ul className="mt-1 space-y-1.5 text-[11px] text-slate-400 md:text-xs">
                <li>・5ブロックのアコーディオン形式で入力</li>
                <li>・raw_answers に一括保存</li>
                <li>・日替わりLP＋AI自己採点</li>
              </ul>
            </Link>

            <Link
              href="/admin/projects/new?type=saas"
              className="group flex flex-col gap-4 rounded-2xl border border-slate-600/70 bg-slate-900 px-6 py-6 text-left shadow-lg shadow-slate-950/70 transition-all duration-200 hover:-translate-y-1 hover:border-sky-300/80 hover:shadow-[0_0_30px_rgba(125,211,252,0.35)] active:scale-95 active:translate-y-0 active:shadow-[0_0_18px_rgba(148,163,184,0.45)]"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-800 text-slate-100">
                    <Cloud className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                      SAAS / WEB SERVICE
                    </p>
                    <h2 className="mt-1 text-sm font-semibold text-slate-50 md:text-base">
                      SaaS・Webサービス向け
                    </h2>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-slate-300 transition group-hover:translate-x-1" />
              </div>
              <p className="text-xs leading-relaxed text-slate-300 md:text-sm">
                サービス名・ターゲット・悩み・メリット・料金を整理。LPや広告の元データとして活用できます。
              </p>
              <ul className="mt-1 space-y-1.5 text-[11px] text-slate-400 md:text-xs">
                <li>・サービス名・ターゲット層</li>
                <li>・解決する悩み・導入メリット</li>
                <li>・料金プラン</li>
              </ul>
            </Link>
          </div>
        </main>
      </div>
    </div>
  );
}
