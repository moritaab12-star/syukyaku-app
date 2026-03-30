/**
 * エージェント指示から訴求角度 A–E を解決。未検出時は variation_seed にフォールバック。
 * 角度の意味は gemini-lp-ui-copy-pack / gemini-fv-catch のプロンプトと一致させる。
 */

export const LP_APPEAL_ANGLE_CODES = ['A', 'B', 'C', 'D', 'E'] as const;
export type LpAppealAngleCode = (typeof LP_APPEAL_ANGLE_CODES)[number];

export type LpAppealAngleResolution = {
  code: LpAppealAngleCode;
  source: 'instruction' | 'seed';
};

export function lpAppealAngleMeaningJa(code: LpAppealAngleCode): string {
  const table: Record<LpAppealAngleCode, string> = {
    A: '(A) 手順・段取りのわかりやすさ',
    B: '(B) 不安・よくある失敗の先回り',
    C: '(C) 人柄・寄り添い・対話',
    D: '(D) 地域・現場経験（地名の連発は禁止）',
    E: '(E) 誠実さ・説明・見積／追加費用の扱い',
  };
  return table[code];
}

function angleFromSeed(seed: number): LpAppealAngleCode {
  const s = Number.isFinite(seed) ? Math.trunc(seed) : 0;
  return LP_APPEAL_ANGLE_CODES[((s % 5) + 5) % 5] ?? 'A';
}

/**
 * 指示文中のキーワードで角度を推定。複数ヒット時はより具体的なパターンを優先。
 */
export function resolveLpAppealAngle(
  editorInstruction: string,
  variationSeed: number,
): LpAppealAngleResolution {
  const t = (editorInstruction ?? '').trim();
  if (!t) {
    return { code: angleFromSeed(variationSeed), source: 'seed' };
  }

  // 価格・明朗さ（E）
  if (
    /価格|料金|安さ|安い|費用|コスパ|明朗|見積|透明|追加.?費用|割安|リーズナブル/i.test(
      t,
    )
  ) {
    return { code: 'E', source: 'instruction' };
  }
  // 共感・人柄（C）
  if (/共感|寄り添|お客様第一|丁寧|話を聴|人柄|対話|わかりやすく説明/i.test(t)) {
    return { code: 'C', source: 'instruction' };
  }
  // 緊急・不安先回り（B）
  if (
    /急ぎ|今すぐ|スピード|即日|すぐ|不安|失敗|よくある|問い合わせ|トラブル先/i.test(
      t,
    )
  ) {
    return { code: 'B', source: 'instruction' };
  }
  // 地域・現場（D）
  if (/地域|地元|近所|エリア|駆けつけ|現場|土地感|ローカル/i.test(t)) {
    return { code: 'D', source: 'instruction' };
  }
  // 信頼・実績（手順の明確さと誠実さのバランス → A）
  if (/信頼|実績|保証|創業|年数|資格|許可|実名|お客様の声|レビュー/i.test(t)) {
    return { code: 'A', source: 'instruction' };
  }
  // 手順・プロセス明示
  if (/手順|流れ|ステップ|段取り|スムーズ/i.test(t)) {
    return { code: 'A', source: 'instruction' };
  }

  return { code: angleFromSeed(variationSeed), source: 'seed' };
}
