import { NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/admin-auth';
import { createSupabaseAdminClient } from '@/lib/supabase';
import { servicePersonaUpdateBodySchema } from '@/app/lib/service-persona/schema';
import {
  getServicePersonaById,
} from '@/app/lib/service-persona/db-server';
import {
  canonicalNestedMasterFromParsedRow,
  flatColumnsFromMasterJson,
  parseMasterJsonText,
} from '@/app/lib/service-persona/master-json-mapper';
import { readMasterJsonTextFromBody } from '@/app/lib/service-persona/master-json-api';
import { parseServicePersonaRow } from '@/app/lib/service-persona/parse-db-row';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    if (!verifyAdminRequest(request)) {
      return NextResponse.json(
        {
          ok: false,
          error:
            '認可に失敗しました。/admin/login でセッションを開始してください。',
        },
        { status: 401 },
      );
    }

    const { id: rawId } = await context.params;
    const id = rawId?.trim() ?? '';
    if (!UUID_RE.test(id)) {
      return NextResponse.json(
        { ok: false, error: '無効な ID です' },
        { status: 400 },
      );
    }

    const supabase = createSupabaseAdminClient();
    const row = await getServicePersonaById(supabase, id);
    if (!row) {
      return NextResponse.json(
        { ok: false, error: 'データが見つかりません' },
        { status: 404 },
      );
    }

    return NextResponse.json({ ok: true, row });
  } catch (e) {
    const msg = e instanceof Error ? e.message : '取得に失敗しました';
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    if (!verifyAdminRequest(request)) {
      return NextResponse.json(
        {
          ok: false,
          error:
            '認可に失敗しました。/admin/login でセッションを開始してください。',
        },
        { status: 401 },
      );
    }

    const { id: rawId } = await context.params;
    const id = rawId?.trim() ?? '';
    if (!UUID_RE.test(id)) {
      return NextResponse.json(
        { ok: false, error: '無効な ID です' },
        { status: 400 },
      );
    }

    const supabase = createSupabaseAdminClient();
    const existing = await getServicePersonaById(supabase, id);
    if (!existing) {
      return NextResponse.json(
        { ok: false, error: 'データが見つかりません。' },
        { status: 404 },
      );
    }

    const bodyRaw = (await request.json().catch(() => ({}))) as unknown;
    const masterText = readMasterJsonTextFromBody(bodyRaw);

    if (masterText.length > 0) {
      const pr = parseMasterJsonText(masterText);
      if (pr._result !== 'valid') {
        return NextResponse.json({ ok: false, error: pr.error }, { status: 400 });
      }
      const sk =
        typeof pr.data.service_key === 'string'
          ? pr.data.service_key.trim()
          : '';
      if (sk !== existing.service_key) {
        return NextResponse.json(
          {
            ok: false,
            error: `JSON の service_key「${sk}」がこの行のキー「${existing.service_key}」と一致しません。`,
          },
          { status: 400 },
        );
      }
      const flat = flatColumnsFromMasterJson(pr.data);
      const bodyObj =
        bodyRaw && typeof bodyRaw === 'object'
          ? (bodyRaw as Record<string, unknown>)
          : {};
      const updateRow: Record<string, unknown> = {
        service_name: flat.service_name,
        tone: flat.tone,
        cta_labels: flat.cta_labels,
        pain_points: flat.pain_points,
        faq_topics: flat.faq_topics,
        forbidden_words: flat.forbidden_words,
        section_structure: flat.section_structure,
        is_active: flat.is_active,
        master_json: pr.data,
        persona_json: pr.data,
        updated_at: new Date().toISOString(),
      };
      if (bodyObj.raw_json !== undefined) {
        updateRow.raw_json = bodyObj.raw_json;
      }

      const { error } = await supabase
        .from('service_personas')
        .update(updateRow)
        .eq('id', id);

      if (error) {
        return NextResponse.json(
          { ok: false, error: error.message },
          { status: 500 },
        );
      }
      return NextResponse.json({ ok: true });
    }

    const parsed = servicePersonaUpdateBodySchema.safeParse(bodyRaw);
    if (!parsed.success) {
      const first = parsed.error.flatten().fieldErrors;
      const msg = Object.entries(first)
        .map(([k, v]) => `${k}: ${(v ?? []).join(', ')}`)
        .join(' / ');
      return NextResponse.json(
        {
          ok: false,
          error: msg || '入力内容を確認してください',
          issues: parsed.error.flatten(),
        },
        { status: 400 },
      );
    }

    const patch = parsed.data;
    const updateRow: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (patch.service_name !== undefined) {
      updateRow.service_name = patch.service_name;
    }
    if (patch.tone !== undefined) {
      updateRow.tone = patch.tone;
    }
    if (patch.cta_labels !== undefined) {
      updateRow.cta_labels = patch.cta_labels;
    }
    if (patch.pain_points !== undefined) {
      updateRow.pain_points = patch.pain_points;
    }
    if (patch.faq_topics !== undefined) {
      updateRow.faq_topics = patch.faq_topics;
    }
    if (patch.forbidden_words !== undefined) {
      updateRow.forbidden_words = patch.forbidden_words;
    }
    if (patch.section_structure !== undefined) {
      updateRow.section_structure = patch.section_structure;
    }
    if (patch.is_active !== undefined) {
      updateRow.is_active = patch.is_active;
    }
    if (patch.raw_json !== undefined) {
      updateRow.raw_json = patch.raw_json;
    }

    const { error: updateErr } = await supabase
      .from('service_personas')
      .update(updateRow)
      .eq('id', id);

    if (updateErr) {
      return NextResponse.json(
        { ok: false, error: updateErr.message },
        { status: 500 },
      );
    }

    const { data: fresh, error: fetchErr } = await supabase
      .from('service_personas')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (!fetchErr && fresh) {
      const pr = parseServicePersonaRow(fresh as Record<string, unknown>);
      if (pr) {
        const nested = canonicalNestedMasterFromParsedRow(pr);
        const { error: pjErr } = await supabase
          .from('service_personas')
          .update({
            master_json: nested,
            persona_json: nested,
            updated_at: new Date().toISOString(),
          })
          .eq('id', id);
        if (pjErr) {
          console.warn(
            '[service-personas] master_json / persona_json sync failed',
            pjErr.message,
          );
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : '更新に失敗しました';
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    if (!verifyAdminRequest(request)) {
      return NextResponse.json(
        {
          ok: false,
          error:
            '認可に失敗しました。/admin/login でセッションを開始してください。',
        },
        { status: 401 },
      );
    }

    const { id: rawId } = await context.params;
    const id = rawId?.trim() ?? '';
    if (!UUID_RE.test(id)) {
      return NextResponse.json(
        { ok: false, error: '無効な ID です' },
        { status: 400 },
      );
    }

    const supabase = createSupabaseAdminClient();
    const { error } = await supabase
      .from('service_personas')
      .delete()
      .eq('id', id);

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : '削除に失敗しました';
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
