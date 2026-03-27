import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase';
import { getLpPerformanceLists } from '@/app/lib/lp-performance';

export async function GET() {
  try {
    const supabase = createSupabaseAdminClient();
    const lists = await getLpPerformanceLists(supabase, { limit: 1000 });

    return NextResponse.json({
      ok: true,
      counts: {
        winners: lists.winners.length,
        candidates: lists.candidates.length,
        weaks: lists.weaks.length,
      },
      sample: {
        winners: lists.winners.slice(0, 5),
        candidates: lists.candidates.slice(0, 5),
        weaks: lists.weaks.slice(0, 5),
      },
      note:
        'metrics table name is controlled by env LP_METRICS_TABLE (default: lp_metrics).',
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '不明なエラー';
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

