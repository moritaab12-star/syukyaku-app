/**
 * URL 事前除外（パス・ホストヒューリスティクス）。本文は読まない。
 */

const PATH_SEGMENT_BLOCKLIST = [
  '/blog',
  '/blogs',
  '/news',
  '/topics',
  '/category',
  '/categories',
  '/tag/',
  '/tags/',
  '/author/',
  '/ir/',
  '/recruit',
  '/recruitment',
  '/privacy',
  '/policy',
  '/terms',
  '/sitemap',
  '/login',
  '/signin',
  '/cart',
  '//wp-admin',
];

const HOST_BLOCKLIST = [
  'facebook.com',
  'www.facebook.com',
  'twitter.com',
  'x.com',
  'instagram.com',
  'youtube.com',
  'tiktok.com',
  'linkedin.com',
  'google.com',
  'www.google.com',
  'bing.com',
  'go.jp',
];

/** @returns 除外理由コード（参照用）。null なら通過 */
export function getUrlPrefilterRejection(urlString: string): string | null {
  let u: URL;
  try {
    u = new URL(urlString);
  } catch {
    return 'invalid_url';
  }

  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    return 'not_http';
  }

  const host = u.hostname.toLowerCase();
  if (
    host === 'localhost' ||
    host.endsWith('.local') ||
    host.startsWith('192.168.') ||
    host.startsWith('10.') ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  ) {
    return 'forbidden_host';
  }

  for (const h of HOST_BLOCKLIST) {
    if (host === h || host.endsWith(`.${h}`)) {
      return 'blocked_host';
    }
  }

  const path = `${u.pathname}`.toLowerCase();
  if (path.endsWith('.pdf')) return 'pdf';

  for (const seg of PATH_SEGMENT_BLOCKLIST) {
    if (path.includes(seg)) {
      return 'path_excluded';
    }
  }

  return null;
}
