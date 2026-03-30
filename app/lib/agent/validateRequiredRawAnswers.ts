/**
 * ローカル・現場系 LP の公開前: raw_answers 必須15（q1, q3, …）の充足チェック。
 * 不動産など別必須セットは project_type / industry 分岐でスキップ（questions 側 TODO と整合）。
 */

import { resolveLpIndustryTone } from '@/app/lib/lp-industry';
import { normalizeServiceName } from '@/app/lib/agent/normalize-service';
import {
  LOCAL_REQUIRED_FIELDWORK_Q_IDS,
  REQUIRED_LOCAL_Q_ERROR_MESSAGES,
} from '@/app/config/local-required-questions';

/** 未入力・明らかなダミーのみとみなす */
export function isEffectivelyEmptyRawAnswer(text: string): boolean {
  const t = text.normalize('NFKC').trim();
  if (t.length === 0) return true;
  if (t.length < 2) return true;
  if (/^[\s　・\-ー—…\.。，,]+$/u.test(t)) return true;
  if (
    /^(なし|無|未定|未記入|未入力|要問合せ|要問い合わせ|ダミー|dummy|テスト|test|サンプル|sample|同上|略)$/i.test(
      t,
    )
  ) {
    return true;
  }
  return false;
}

function rawAnswerById(rawAnswers: unknown, qid: string): string {
  if (!Array.isArray(rawAnswers)) return '';
  for (const item of rawAnswers) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    if (o.id !== qid) continue;
    if (typeof o.answer === 'string') return o.answer;
    if (o.answer != null) return String(o.answer);
  }
  return '';
}

/**
 * `project_type === 'local'` かつ現場系（real_estate 以外）のときだけ検査。
 * SaaS / 不動産トーンはスキップ（422 にしない）。
 */
export function validateRequiredLocalFieldworkAnswers(
  row: {
    project_type: string | null;
    industry_key?: string | null;
    service?: string | null;
    raw_answers: unknown;
  },
): string[] {
  const errors: string[] = [];
  const isLocal = (row.project_type ?? '').trim() === 'local';
  if (!isLocal) return errors;

  const tone = resolveLpIndustryTone(
    typeof row.industry_key === 'string' ? row.industry_key.trim() || null : null,
    normalizeServiceName(row.service ?? ''),
  );
  if (tone === 'real_estate') {
    return errors;
  }

  for (const qid of LOCAL_REQUIRED_FIELDWORK_Q_IDS) {
    const msg = REQUIRED_LOCAL_Q_ERROR_MESSAGES[qid];
    if (!msg) continue;
    const raw = rawAnswerById(row.raw_answers, qid);
    if (isEffectivelyEmptyRawAnswer(raw)) {
      if (!errors.includes(msg)) errors.push(msg);
    }
  }

  return errors;
}
