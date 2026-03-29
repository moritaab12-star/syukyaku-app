'use client';

import React from 'react';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createSupabaseClient } from '@/lib/supabase';
import { Store } from 'lucide-react';
import { buildLpViewModel, type LpViewModel } from '@/app/lib/lp-template';
import { parseLpUiCopy } from '@/app/lib/lp-ui-copy';
import type { CompanyInfoDisplay } from '@/app/lib/companyInfoFormatter';
import { buildLpHtmlMarkup } from '@/app/lib/lpToHtmlCore';
import {
  fetchRelatedProjectRows,
  buildAnchorTitle,
  type RelatedLink,
} from '@/app/lib/related-links';
import type { AgentAppealMode } from '@/app/lib/agent/types';

const AGENT_MODES: AgentAppealMode[] = [
  'price',
  'trust',
  'empathy',
  'urgency',
  'local',
];

function parseAgentMode(m: string | null | undefined): AgentAppealMode | null {
  const s = (m ?? '').trim();
  return AGENT_MODES.includes(s as AgentAppealMode) ? (s as AgentAppealMode) : null;
}

export type PublicLpProjectRow = {
  id: string;
  slug: string | null;
  company_name: string | null;
  project_type: string | null;
  raw_answers: unknown;
  company_info: unknown;
  area?: string | null;
  service?: string | null;
  target_area?: string | null;
  areas?: string[] | null;
  keyword?: string | null;
  intent?: string | null;
  lp_group_id?: string | null;
  variation_seed?: number | null;
  industry_key?: string | null;
  hero_image_url?: string | null;
  fv_catch_headline?: string | null;
  fv_catch_subheadline?: string | null;
  lp_ui_copy?: unknown;
  mode?: string | null;
};

export type PublicLpClientProps = {
  /** サーバー（service role）で取得済み。draft も含む */
  initialProject: PublicLpProjectRow | null;
  initialError: string | null;
};

export function PublicLpClient({
  initialProject,
  initialError,
}: PublicLpClientProps) {
  const [project, setProject] = useState<PublicLpProjectRow | null>(initialProject);
  const [view, setView] = useState<LpViewModel | null>(null);
  const [company, setCompany] = useState<CompanyInfoDisplay | null>(null);
  const [loading, setLoading] = useState(true);
  const [previewPageUrl, setPreviewPageUrl] = useState<string | undefined>(
    undefined,
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialError) {
      setError(initialError);
      setLoading(false);
      return;
    }
    if (!initialProject) {
      setError('プロジェクトが見つかりません');
      setLoading(false);
      return;
    }

    const proj = initialProject;
    setProject(proj);
    const supabase = createSupabaseClient();

    (async () => {
      try {
        const relatedRows = await fetchRelatedProjectRows(
          supabase,
          {
            id: proj.id,
            slug: proj.slug || proj.id,
            area: proj.area ?? null,
            service: proj.service ?? null,
            intent: proj.intent ?? null,
            industry_key: proj.industry_key ?? null,
          },
          { min: 3, max: 5 },
        );

        const relatedLinks: RelatedLink[] = relatedRows.map((r) => {
          const area = (
            r.area ??
            r.target_area ??
            (Array.isArray(r.areas) ? r.areas[0] : '') ??
            ''
          ).trim();
          const service = (r.service ?? '').trim();
          const intent = (
            typeof r.intent === 'string' ? (r.intent as any) : 'general'
          ) as any;
          return {
            title: buildAnchorTitle({ area, service, intent }),
            slug: r.slug,
            area: area || '{{area_name}}',
            service: service || '{{service_name}}',
            intent,
          };
        });

        const vs =
          typeof proj.variation_seed === 'number' &&
          Number.isFinite(proj.variation_seed)
            ? Math.trunc(proj.variation_seed)
            : 0;

        const lpUiCopy = parseLpUiCopy(proj.lp_ui_copy);

        const { view: nextView, company: nextCompany } = buildLpViewModel(
          proj.raw_answers,
          {
            projectType: proj.project_type,
            fallbackName: proj.company_name ?? undefined,
            companyInfoRaw: proj.company_info,
            areaOverride: proj.area ?? undefined,
            targetArea: proj.target_area ?? undefined,
            areasList: proj.areas ?? undefined,
            serviceOverride: proj.service ?? undefined,
            keywordOverride: proj.keyword ?? undefined,
            industryKey: proj.industry_key ?? null,
            relatedLinks,
            projectStableId: proj.id,
            lpGroupId: proj.lp_group_id ?? undefined,
            variationSeed: vs,
            fvCatchHeadline: proj.fv_catch_headline ?? null,
            fvCatchSubheadline: proj.fv_catch_subheadline ?? null,
            lpUiCopy,
            agentMode: parseAgentMode(proj.mode),
          },
        );
        setView(nextView);
        setCompany(nextCompany);
        setError(null);
      } catch {
        setError('取得に失敗しました');
      } finally {
        setLoading(false);
      }
    })();
  }, [initialProject, initialError]);

  useEffect(() => {
    setPreviewPageUrl(
      typeof window !== 'undefined' ? window.location.href : undefined,
    );
  }, []);

  const lpPreviewInnerHtml = useMemo(() => {
    if (!project || !view || !company) return '';
    const diagnosisModeTitle =
      view.diagnosisMode === 'diagnosis'
        ? '3つ当てはまったら早めの診断をおすすめします'
        : 'まずは無料相談からはじめませんか？';
    const uiCopy = parseLpUiCopy(project.lp_ui_copy);
    const { jsonLdScript, bodyInner } = buildLpHtmlMarkup({
      view,
      company,
      projectType: project.project_type,
      diagnosisModeTitle,
      pageUrl: previewPageUrl,
      heroImageUrl: project.hero_image_url ?? null,
      uiCopy,
    });
    return `${jsonLdScript}\n${bodyInner}`;
  }, [view, company, project, previewPageUrl]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-100">
        <p className="text-slate-400">読み込み中...</p>
      </div>
    );
  }

  if (error || !project || !view || !company) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100">
        <div className="mx-auto max-w-2xl px-4 py-16 text-center">
          <p className="mb-6 text-slate-400">
            {error ?? 'プロジェクトが見つかりません。'}
          </p>
          <p className="mb-6 text-xs text-slate-500">
            下書き（draft）の LP もこの URL でプレビューできます。表示されない場合は
            slug が一致しているか確認してください。
          </p>
          <Link
            href="/admin/projects"
            className="inline-flex items-center gap-2 rounded-full bg-slate-700 px-5 py-2.5 text-sm font-semibold text-slate-100 transition hover:bg-slate-600"
          >
            <Store className="h-4 w-4" />
            プロジェクト一覧へ
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="lp-body">
      <div dangerouslySetInnerHTML={{ __html: lpPreviewInnerHtml }} />
    </div>
  );
}
