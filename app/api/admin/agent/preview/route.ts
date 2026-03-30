import { NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/admin-auth';
import { createSupabaseAdminClient } from '@/lib/supabase';
import {
  buildAgentPlanFromInstruction,
  type BuildAgentPlanContext,
} from '@/app/lib/agent/buildAgentPlanFromInstruction';

type Body = {
  instruction?: string;
  use_competitor_research?: boolean;
  template_project_id?: string | null;
};

export async function POST(request: Request) {
  if (!verifyAdminRequest(request)) {
    return NextResponse.json(
      {
        error:
          '認可に失敗しました。/admin/login でセッションを開始するか、ADMIN_API_SECRET を未設定の開発環境で利用してください。',
      },
      { status: 401 },
    );
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const instruction = typeof body.instruction === 'string' ? body.instruction : '';
  if (!instruction.trim()) {
    return NextResponse.json({ error: 'instruction は必須です。' }, { status: 400 });
  }

  const useCompetitorResearch = body.use_competitor_research === true;

  const templateRaw = body.template_project_id;
  const templateProjectId =
    typeof templateRaw === 'string' && templateRaw.trim().length > 0
      ? templateRaw.trim()
      : null;

  let planContext: BuildAgentPlanContext | null = null;
  if (templateProjectId) {
    try {
      const supabase = createSupabaseAdminClient();
      planContext = {
        supabase,
        historyAnchorProjectId: templateProjectId,
      };
    } catch {
      planContext = null;
    }
  }

  try {
    const {
      parsed,
      themePreview,
      patternSummary,
      researchUsed,
    } = await buildAgentPlanFromInstruction(
      instruction,
      useCompetitorResearch,
      planContext,
    );

    return NextResponse.json({
      preview: {
        parsed,
        themes: themePreview,
        research_used: researchUsed,
        pattern_summary: patternSummary,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    console.error('[agent] preview failed', e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
