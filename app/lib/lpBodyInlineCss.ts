import 'server-only';

import fs from 'fs';
import path from 'path';

let cache: string | null = null;

/**
 * app/styles/lp-body.css の生本文を返す（ファイルは1つのみ）。
 * Next のページは globals の @import で読む。`/api/lp-body-css` は外部に CSS だけ配りたい場合のオプション。
 */
export function getLpBodyInlineCss(): string {
  if (cache !== null) return cache;
  try {
    const filePath = path.join(process.cwd(), 'app', 'styles', 'lp-body.css');
    cache = fs.readFileSync(filePath, 'utf8');
  } catch {
    cache = '';
  }
  return cache;
}
