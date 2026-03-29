import { runLpHtmlGuards, type RunLpHtmlGuardsOpts } from '@/lib/guard/lp-html-static-check';
import {
  buildPhase5LpHtmlMarkup,
  type BuildPhase5MarkupOpts,
} from './build-phase5-markup';

export function buildPhase5LpHtmlMarkupWithGuards(
  opts: BuildPhase5MarkupOpts & { guard?: RunLpHtmlGuardsOpts },
): ReturnType<typeof buildPhase5LpHtmlMarkup> & {
  guard: ReturnType<typeof runLpHtmlGuards>;
} {
  const out = buildPhase5LpHtmlMarkup(opts);
  const guard = runLpHtmlGuards(out.bodyInner, opts.guard ?? {});
  return { ...out, guard };
}
