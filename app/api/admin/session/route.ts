import { NextResponse } from 'next/server';
import {
  adminAuthRequired,
  buildAdminSessionCookieValue,
  adminSessionCookieName,
  adminSessionCookieOptions,
} from '@/lib/admin-auth';

/**
 * 管理画面用セッション（httpOnly Cookie）。
 * body: { "secret": "<ADMIN_API_SECRET と同じ値>" }
 */
export async function POST(request: Request) {
  if (!adminAuthRequired()) {
    return NextResponse.json({
      ok: true,
      message: 'ADMIN_API_SECRET が未設定のため、セッションは不要です。',
    });
  }

  const body = await request.json().catch(() => ({}));
  const sent =
    typeof body?.secret === 'string'
      ? body.secret.trim()
      : typeof body?.password === 'string'
        ? body.password.trim()
        : '';
  const expected = process.env.ADMIN_API_SECRET?.trim() ?? '';

  if (!sent || sent !== expected) {
    return NextResponse.json({ ok: false, error: '認可に失敗しました。' }, { status: 401 });
  }

  const token = buildAdminSessionCookieValue();
  if (!token) {
    return NextResponse.json({ ok: false, error: '設定エラー' }, { status: 500 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(adminSessionCookieName(), token, adminSessionCookieOptions());
  return res;
}
