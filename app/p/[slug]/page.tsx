'use client';

import React from 'react';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { createSupabaseClient } from '@/lib/supabase';
import { Store } from 'lucide-react';
import { buildLpViewModel, type LpViewModel } from '@/app/lib/lp-template';
import type { CompanyInfoDisplay } from '@/app/lib/companyInfoFormatter';
import { buildLpHtmlMarkup } from '@/app/lib/lpToHtmlCore';
import { fetchRelatedProjectRows, buildAnchorTitle, type RelatedLink } from '@/app/lib/related-links';
import { fetchProjectBySlugOrId } from '@/app/lib/project-by-slug-or-id';

type ProjectRow = {
  id: string;
  slug: string | null;
  company_name: string | null;
  project_type: string | null;
  raw_answers: unknown;
  company_info: unknown;
  area?: string | null;
  service?: string | null;
  /** SEO/LP量産で狙うターゲット地域（projects.target_area） */
  target_area?: string | null;
  /** 会社として対応可能なエリア一覧（projects.areas） */
  areas?: string[] | null;
  keyword?: string | null;
  intent?: string | null;
  lp_group_id?: string | null;
  variation_seed?: number | null;
};

export default function PublicLpPage() {
  const params = useParams();
  const slug = typeof params?.slug === 'string' ? params.slug : '';
  const [project, setProject] = useState<ProjectRow | null>(null);
  const [view, setView] = useState<LpViewModel | null>(null);
  const [company, setCompany] = useState<CompanyInfoDisplay | null>(null);
  const [loading, setLoading] = useState(true);
  /** buildLpHtmlMarkup の pageUrl（テンプレ seed・内部リンク用） */
  const [previewPageUrl, setPreviewPageUrl] = useState<string | undefined>(
    undefined,
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) {
      setError('不正なURLです');
      setLoading(false);
      return;
    }
    const supabase = createSupabaseClient();
    (async () => {
      try {
        const { data: projectData, error: projectErr } =
          await fetchProjectBySlugOrId(
            supabase,
            slug,
            'id, slug, company_name, project_type, raw_answers, company_info, area, service, target_area, areas, keyword, intent, publish_status, lp_group_id, variation_seed',
          );
        if (projectErr || !projectData) {
          setError('プロジェクトが見つかりません');
          setLoading(false);
          return;
        }

        const proj = projectData as unknown as ProjectRow;
        setProject(proj);

        const relatedRows = await fetchRelatedProjectRows(
          supabase,
          {
            id: proj.id,
            slug: proj.slug || proj.id,
            area: proj.area ?? null,
            service: proj.service ?? null,
            intent: proj.intent ?? null,
          },
          { min: 3, max: 5 },
        );

        const relatedLinks: RelatedLink[] = relatedRows.map((r) => {
          const area = (r.area ?? r.target_area ?? (Array.isArray(r.areas) ? r.areas[0] : '') ?? '').trim();
          const service = (r.service ?? '').trim();
          const intent = (typeof r.intent === 'string' ? (r.intent as any) : 'general') as any;
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

        const { view, company } = buildLpViewModel(proj.raw_answers, {
          projectType: proj.project_type,
          fallbackName: proj.company_name ?? undefined,
          companyInfoRaw: proj.company_info,
          areaOverride: proj.area ?? undefined,
          targetArea: proj.target_area ?? undefined,
          areasList: proj.areas ?? undefined,
          serviceOverride: proj.service ?? undefined,
          keywordOverride: proj.keyword ?? undefined,
          relatedLinks,
          projectStableId: proj.id,
          lpGroupId: proj.lp_group_id ?? undefined,
          variationSeed: vs,
        });
        setView(view);
        setCompany(company);
        setError(null);
      } catch {
        setError('取得に失敗しました');
      } finally {
        setLoading(false);
      }
    })();
  }, [slug]);

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
    const { jsonLdScript, bodyInner } = buildLpHtmlMarkup({
      view,
      company,
      projectType: project.project_type,
      diagnosisModeTitle,
      pageUrl: previewPageUrl,
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
          <p className="mb-6 text-slate-400">{error ?? 'プロジェクトが見つかりません。'}</p>
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
      {/*
        マークアップ + JSON-LD のみ buildLpHtmlMarkup（LP CSS は含めない）。
        スタイル: app/globals.css → @import lp-body.css
        template（cv/trust/benefit）の抽選は pageUrl のハッシュ依存。
      */}
      <div dangerouslySetInnerHTML={{ __html: lpPreviewInnerHtml }} />
    </div>
  );
}
