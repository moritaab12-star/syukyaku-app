import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase';
import {
  fetchDraftPostCandidates,
  fetchRecentPublished,
  pickOneScheduledPostTarget,
} from '@/app/lib/publish-scheduler';
import { publishProjectToNextSite } from '@/app/lib/publish-project-next';
import { getNextRetryAt, shouldMarkAsFailed } from '@/app/lib/publish-retry';

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return true; // 未設定なら開放（最小実装）
  const header = request.headers.get('x-cron-secret')?.trim();
  return header === secret;
}

export const dynamic = 'force-dynamic';

/**
 * 定期実行（2時間ごと想定）で、下書き LP を 1 件だけ Next 公開（DB 更新）する。
 *
 * フロー:
 * 1. 候補取得 → 1 件選ぶ
 * 2. publishing に claim
 * 3. publishProjectToNextSite（WP は使わない）
 * 4. 失敗時は retry_wait / failed
 */
export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createSupabaseAdminClient();

  const [candidates, recent] = await Promise.all([
    fetchDraftPostCandidates(supabase, { limit: 80 }),
    fetchRecentPublished(supabase, { limit: 20 }),
  ]);

  const picked = pickOneScheduledPostTarget(candidates, recent);
  if (!picked) {
    console.log('[CRON:PUBLISH_ONE] no target');
    return NextResponse.json({ ok: true, message: 'no target' });
  }

  const slug = (picked.project.slug || '').trim();
  const nowIso = new Date().toISOString();

  const { data: claimed, error: claimErr } = await supabase
    .from('projects')
    .update({ publish_status: 'publishing' })
    .eq('id', picked.project.id)
    .or('publish_status.is.null,publish_status.eq.draft,publish_status.eq.retry_wait')
    .or(`next_publish_retry_at.is.null,next_publish_retry_at.lte.${nowIso}`)
    .select('id')
    .maybeSingle();

  if (claimErr || !claimed) {
    console.log('[CRON:PUBLISH_ONE] claim skipped', { id: picked.project.id, slug, claimErr });
    return NextResponse.json({ ok: true, message: 'claim skipped' });
  }

  console.log('[CRON:PUBLISH_ONE] picked', {
    id: picked.project.id,
    slug,
    area: picked.project.area,
    service: picked.project.service,
    intent: picked.project.intent,
    reason: picked.reason,
  });

  const result = await publishProjectToNextSite(supabase, slug, {
    projectId: picked.project.id,
  });

  if (result.success === false) {
    const errorText = String(result.error || 'failed').slice(0, 2000);
    const prev = typeof picked.project.publish_retry_count === 'number' ? picked.project.publish_retry_count : 0;
    const nextCount = prev + 1;

    if (shouldMarkAsFailed(nextCount)) {
      const { error: updErr } = await supabase
        .from('projects')
        .update({
          publish_status: 'failed',
          publish_retry_count: nextCount,
          last_publish_error: errorText,
          next_publish_retry_at: null,
        })
        .eq('id', picked.project.id);
      console.error('[CRON:PUBLISH_ONE] failed->failed', { slug, nextCount, updErr, errorText });
      return NextResponse.json(
        { ok: false, slug, status: 'failed', retryCount: nextCount, error: errorText },
        { status: 500 },
      );
    }

    const nextAt = getNextRetryAt(nextCount);
    const { error: updErr } = await supabase
      .from('projects')
      .update({
        publish_status: 'retry_wait',
        publish_retry_count: nextCount,
        last_publish_error: errorText,
        next_publish_retry_at: nextAt.toISOString(),
      })
      .eq('id', picked.project.id);

    console.error('[CRON:PUBLISH_ONE] failed->retry_wait', {
      slug,
      nextCount,
      nextAt: nextAt.toISOString(),
      updErr,
      errorText,
    });

    return NextResponse.json(
      {
        ok: false,
        slug,
        status: 'retry_wait',
        retryCount: nextCount,
        nextRetryAt: nextAt.toISOString(),
        error: errorText,
      },
      { status: 500 },
    );
  }

  console.log('[CRON:PUBLISH_ONE] success', { slug, url: result.url });
  return NextResponse.json({ ok: true, slug, url: result.url });
}
