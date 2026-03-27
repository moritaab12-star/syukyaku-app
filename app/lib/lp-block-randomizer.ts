import type { RawAnswerItem } from './lp-seo';
import { getBlockForQuestionId, type LpBlockKey } from '@/app/config/block-map';

export type { LpBlockKey } from '@/app/config/block-map';

export type BlockData = {
  trustBlock: string[];
  localBlock: string[];
  painBlock: string[];
  strengthBlock: string[];
  storyBlock: string[];
};

type Rng = () => number;

function mulberry32(seed: number): Rng {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function sampleUnique<T>(arr: T[], n: number, rng: Rng): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, Math.max(0, Math.min(n, a.length)));
}

function splitToBullets(text: string): string[] {
  return text
    .split(/\r?\n|[、・]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function softRewrite(text: string, rng: Rng): string {
  const t = text.trim();
  if (!t) return '';

  // 箇条書きを文章に寄せる（意味を変えない）
  const bullets = splitToBullets(t);
  const base =
    bullets.length >= 2 && bullets.join('').length <= 180
      ? bullets.join('、')
      : t;

  // 語尾だけ軽く揺らす（意味は維持）
  const endings = ['です。', 'です。', 'です。', 'になります。', 'ですのでご安心ください。'];
  const ending = endings[Math.floor(rng() * endings.length)];

  let out = base
    .replace(/です。$/g, '')
    .replace(/ます。$/g, '')
    .replace(/しました。$/g, 'しています')
    .trim();

  // すでに句点がある場合は付け直さない
  if (!/[。.!?！？]$/.test(out)) out += ending;

  return out;
}

function formatAnswer(i: RawAnswerItem, rng: Rng): string {
  const a = (i.answer ?? '').trim();
  if (!a) return '';

  // ラベルを残しつつ、テンプレ感を抑える
  const leadVariants = [
    `${i.question}：`,
    `${i.question}について：`,
    '',
  ];
  const lead = leadVariants[Math.floor(rng() * leadVariants.length)];
  const body = softRewrite(a, rng);
  const combined = (lead ? `${lead}${body}` : body).trim();
  return combined;
}

export function buildRandomBlockData(
  items: RawAnswerItem[],
  opts?: { seed?: number; perBlockMin?: number; perBlockMax?: number },
): BlockData {
  const seed =
    typeof opts?.seed === 'number'
      ? opts.seed
      : Date.now() ^ Math.floor(Math.random() * 1_000_000);
  const rng = mulberry32(seed);

  const perBlockMin = Math.max(0, opts?.perBlockMin ?? 2);
  const perBlockMax = Math.max(perBlockMin, opts?.perBlockMax ?? 3);
  const pickN = () =>
    perBlockMin + Math.floor(rng() * (perBlockMax - perBlockMin + 1));

  const buckets: Record<LpBlockKey, RawAnswerItem[]> = {
    trust: [],
    local: [],
    pain: [],
    strength: [],
    story: [],
  };

  for (const it of items) {
    const key = getBlockForQuestionId(it.id);
    if (!key) continue;
    const ans = (it.answer ?? '').trim();
    if (!ans) continue;
    buckets[key].push(it);
  }

  const trust = sampleUnique(buckets.trust, pickN(), rng).map((i) =>
    formatAnswer(i, rng),
  ).filter(Boolean);
  const local = sampleUnique(buckets.local, pickN(), rng).map((i) =>
    formatAnswer(i, rng),
  ).filter(Boolean);
  const pain = sampleUnique(buckets.pain, pickN(), rng).map((i) =>
    formatAnswer(i, rng),
  ).filter(Boolean);
  const strength = sampleUnique(buckets.strength, pickN(), rng).map((i) =>
    formatAnswer(i, rng),
  ).filter(Boolean);
  const story = sampleUnique(buckets.story, pickN(), rng).map((i) =>
    formatAnswer(i, rng),
  ).filter(Boolean);

  return {
    trustBlock: trust,
    localBlock: local,
    painBlock: pain,
    strengthBlock: strength,
    storyBlock: story,
  };
}

