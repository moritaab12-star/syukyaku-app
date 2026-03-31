import { z } from 'zod';
import { servicePersonaKeySchema } from '@/app/lib/service-persona/schema';

const maxList = 200;
const maxItemLen = 2000;

function coerceStringList(v: unknown): string[] {
  if (v == null) return [];
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const x of v) {
    if (typeof x !== 'string') continue;
    const t = x.normalize('NFKC').trim();
    if (t.length > 0) out.push(t.slice(0, maxItemLen));
  }
  return out.slice(0, maxList);
}

function optList() {
  return z.preprocess(
    (v) => coerceStringList(v),
    z.array(z.string().max(maxItemLen)).max(maxList),
  ).default([]);
}

/**
 * 管理画面「業種人格JSON」直接入力用。余分なキーは .passthrough で保持し DB にも載せる。
 */
export const servicePersonaPersonaJsonSchema = z
  .object({
    service_key: servicePersonaKeySchema,
    service_name: z.string().max(200).optional(),
    tone: z.string().max(4000).optional().nullable(),
    cta_patterns: optList(),
    cta_labels: optList(),
    pain_point_patterns: optList(),
    pain_points: optList(),
    hero_angles: optList(),
    faq_topics: optList(),
    forbidden_words: optList(),
    section_structure: optList(),
    is_active: z.boolean().optional(),
  })
  .passthrough();

export type ServicePersonaPersonaJsonValidated = z.infer<
  typeof servicePersonaPersonaJsonSchema
>;

export function formatZodPersonaJsonError(err: z.ZodError): string {
  return err.issues
    .slice(0, 12)
    .map((i) => `${i.path.length ? i.path.join('.') : 'root'}: ${i.message}`)
    .join(' / ');
}
