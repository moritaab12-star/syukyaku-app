import type { IndustryMaster } from '@/types/industry';
import type { LpGenerationRule } from '@/types/lp';
import type { CompanyInfoDisplay } from '@/app/lib/companyInfoFormatter';
import type { LpViewModel } from '@/app/lib/lp-template';
import { buildLpHtmlMarkup, type LpToHtmlInput } from '@/app/lib/lpToHtmlCore';
import { buildGeneratedLp } from './build-generated-lp';

export type BuildPhase5MarkupOpts = Pick<
  LpToHtmlInput,
  | 'view'
  | 'company'
  | 'projectType'
  | 'diagnosisModeTitle'
  | 'pageUrl'
  | 'heroImageUrl'
  | 'uiCopy'
  | 'template'
  | 'templateSeed'
> & {
  master: IndustryMaster;
  /** null = ルール OFF（従来の sectionsByTemplate のみ） */
  rule: LpGenerationRule | null;
  /** false のとき generatedLp を渡さない（view をそのまま利用） */
  withGeneratedLp?: boolean;
};

/**
 * Phase 5 単一アダプタ: 正規化 view + master + 任意ルール → buildLpHtmlMarkup
 */
export function buildPhase5LpHtmlMarkup(opts: BuildPhase5MarkupOpts): ReturnType<
  typeof buildLpHtmlMarkup
> {
  const withGl = opts.withGeneratedLp !== false;
  const generatedLp = withGl
    ? buildGeneratedLp({
        view: opts.view,
        master: opts.master,
        rule: opts.rule,
      })
    : null;

  return buildLpHtmlMarkup({
    view: opts.view,
    company: opts.company,
    projectType: opts.projectType,
    diagnosisModeTitle: opts.diagnosisModeTitle,
    pageUrl: opts.pageUrl,
    heroImageUrl: opts.heroImageUrl,
    uiCopy: opts.uiCopy ?? null,
    template: opts.template ?? (opts.rule ? 'cv' : undefined),
    templateSeed: opts.templateSeed,
    generationRule: opts.rule ?? undefined,
    generatedLp,
  });
}
