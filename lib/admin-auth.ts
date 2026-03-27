import { createHmac, timingSafeEqual } from 'crypto';

/**
 * 管理系 API（/api/projects/[id] 等）の最小認可。
 *
 * - `ADMIN_API_SECRET` が未設定のときは検証をスキップする（ローカル開発向け）。
 *   本番では必ず設定し、`POST /api/admin/session` で httpOnly Cookie を発行してから
 *   ブラウザから `credentials: 'include'` で API を呼ぶこと。
 * - 秘密を `NEXT_PUBLIC_*` やクライアント JS に埋め込まないこと。
 */
const COOKIE_NAME = 'sy_admin_session';
const COOKIE_PAYLOAD = 'sy_admin_v1';

export function adminAuthRequired(): boolean {
  return Boolean(process.env.ADMIN_API_SECRET?.trim());
}

function sessionTokenForSecret(secret: string): string {
  return createHmac('sha256', secret).update(COOKIE_PAYLOAD).digest('hex');
}

/** Route Handler 用: Cookie が正しければ true。ADMIN_API_SECRET 未設定なら常に true。 */
export function verifyAdminRequest(request: Request): boolean {
  const secret = process.env.ADMIN_API_SECRET?.trim();
  if (!secret) return true;

  const cookie = request.headers.get('cookie') ?? '';
  const prefix = `${COOKIE_NAME}=`;
  const start = cookie.split('; ').find((p) => p.startsWith(prefix));
  const raw = start ? decodeURIComponent(start.slice(prefix.length)) : '';
  const expected = sessionTokenForSecret(secret);
  if (raw.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(raw, 'utf8'), Buffer.from(expected, 'utf8'));
  } catch {
    return false;
  }
}

export function adminSessionCookieName(): string {
  return COOKIE_NAME;
}

export function buildAdminSessionCookieValue(): string | null {
  const secret = process.env.ADMIN_API_SECRET?.trim();
  if (!secret) return null;
  return sessionTokenForSecret(secret);
}

export function adminSessionCookieOptions(): {
  httpOnly: boolean;
  sameSite: 'lax';
  path: string;
  maxAge: number;
  secure: boolean;
} {
  return {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
    secure: process.env.NODE_ENV === 'production',
  };
}
