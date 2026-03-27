import { NextResponse } from 'next/server';
import { getLpBodyInlineCss } from '@/app/lib/lpBodyInlineCss';

/**
 * LP 用 CSS を単一ソース（app/styles/lp-body.css）から返す。
 * Next の通常表示は globals の @import を使う。こちらは外部システムへ `<link>` だけ渡す用途向け。
 */
export async function GET() {
  const css = getLpBodyInlineCss();
  return new NextResponse(css, {
    status: 200,
    headers: {
      'Content-Type': 'text/css; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
