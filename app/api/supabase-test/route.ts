import { NextResponse } from 'next/server';
import { createSupabaseAdminClient, createSupabaseClient } from '@/lib/supabase';

function decodeJwtInfo(token: string | undefined) {
  if (!token) return { present: false as const };
  try {
    const parts = token.split('.');
    if (parts.length < 2) return { present: true as const, valid: false as const };
    const payload = parts[1];
    const json = Buffer.from(payload, 'base64url').toString('utf8');
    const parsed = JSON.parse(json) as { ref?: string; role?: string; iss?: string };
    return {
      present: true as const,
      valid: true as const,
      ref: typeof parsed.ref === 'string' ? parsed.ref : null,
      role: typeof parsed.role === 'string' ? parsed.role : null,
      iss: typeof parsed.iss === 'string' ? parsed.iss : null,
    };
  } catch {
    return { present: true as const, valid: false as const };
  }
}

export async function GET() {
  try {
    const supabaseAnon = createSupabaseClient();
    const supabaseService = createSupabaseAdminClient();

    const envUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonInfo = decodeJwtInfo(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
    const serviceInfo = decodeJwtInfo(process.env.SUPABASE_SERVICE_ROLE_KEY);

    const { data: anonData, error: anonError } = await supabaseAnon
      .from('projects')
      .select('id')
      .limit(1);

    const { data: svcData, error: svcError } = await supabaseService
      .from('projects')
      .select('id')
      .limit(1);

    if (anonError || svcError) {
      return NextResponse.json(
        {
          ok: false,
          source: 'supabase',
          url: envUrl ?? null,
          anon: anonInfo,
          service: serviceInfo,
          anonError: anonError
            ? {
                message: anonError.message,
                details: anonError.details,
                hint: (anonError as any).hint,
              }
            : null,
          serviceError: svcError
            ? {
                message: svcError.message,
                details: svcError.details,
                hint: (svcError as any).hint,
              }
            : null,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      url: envUrl ?? null,
      anon: anonInfo,
      service: serviceInfo,
      anonRows: anonData ?? [],
      serviceRows: svcData ?? [],
    });
  } catch (err) {
    const anyErr = err as any;
    return NextResponse.json(
      {
        ok: false,
        source: 'route',
        error: anyErr?.message || 'Unknown error',
      },
      { status: 500 },
    );
  }
}

