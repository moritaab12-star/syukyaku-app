import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/admin-auth';
import { createSupabaseAdminClient } from '@/lib/supabase';
import { executeLpGeneration } from '@/app/lib/agent/executeLpGeneration';
import { evaluateLp } from '@/app/lib/agent/evaluateLp';
import { buildAgentPlanFromInstruction } from '@/app/lib/agent/buildAgentPlanFromInstruction';

type RunBody = {
  instruction?: string;
  template_project_id?: string | null;
  use_competitor_research?: boolean;
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

  let body: RunBody;
  try {
    body = (await request.json()) as RunBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const instruction = typeof body.instruction === 'string' ? body.instruction : '';
  if (!instruction.trim()) {
    return NextResponse.json({ error: 'instruction は必須です。' }, { status: 400 });
  }

  const templateRaw = body.template_project_id;
  const templateProjectId =
    typeof templateRaw === 'string' && templateRaw.trim().length > 0
      ? templateRaw.trim()
      : null;

  const useCompetitorResearch = body.use_competitor_research === true;

  const supabase = createSupabaseAdminClient();

  try {
    console.error('[agent] run: buildAgentPlanFromInstruction');
    const {
      parsed,
      themes,
      themePreview,
      patternSummary,
      researchUsed,
    } = await buildAgentPlanFromInstruction(instruction, useCompetitorResearch);
    console.error('[agent] run: executeLpGeneration', parsed);

    const planId = randomUUID();
    const lpGroupId = randomUUID();

    const exec = await executeLpGeneration({
      supabase,
      planId,
      lpGroupId,
      parsed,
      themes,
      templateProjectId,
      patternSummary,
      researchUsed,
    });

    if (exec.error && exec.created.length === 0) {
      return NextResponse.json(
        {
          plan_id: planId,
          lp_group_id: lpGroupId,
          created: [],
          preview: {
            parsed,
            themes: themePreview,
            research_used: researchUsed,
            pattern_summary: patternSummary,
          },
          error: exec.error,
        },
        { status: 400 },
      );
    }

    const siblingKeywords = themes.map((t) => t.title);

    for (const row of exec.created) {
      await evaluateLp(supabase, row.id, { siblingKeywords });
    }

    const ids = exec.created.map((c) => c.id);
    const { data: rows } = await supabase
      .from('projects')
      .select('id, slug, keyword, mode, agent_score, agent_status')
      .in('id', ids);

    const created = (rows ?? []).map((r) => {
      const row = r as {
        id: string;
        slug: string | null;
        keyword: string | null;
        mode: string | null;
        agent_score: number | null;
        agent_status: string | null;
      };
      return {
        id: row.id,
        slug: row.slug ?? '',
        title: (row.keyword ?? '').trim() || '(無題)',
        mode: row.mode,
        score: row.agent_score,
        status: row.agent_status,
      };
    });

    return NextResponse.json({
      plan_id: planId,
      lp_group_id: lpGroupId,
      created,
      preview: {
        parsed,
        themes: themePreview,
        research_used: researchUsed,
        pattern_summary: patternSummary,
      },
      error: exec.error,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    console.error('[agent] run failed', e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
