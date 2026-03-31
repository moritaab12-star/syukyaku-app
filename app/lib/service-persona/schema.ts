import { z } from 'zod';

/** API・フォーム用: service_key（英数字・ハイフン・アンダースコア） */
export const servicePersonaKeySchema = z
  .string()
  .min(1, 'service_key は必須です')
  .max(80)
  .regex(
    /^[a-zA-Z0-9_-]+$/,
    'service_key は英数字・ハイフン・アンダースコアのみにしてください',
  );

export const servicePersonaNameSchema = z
  .string()
  .min(1, '業種名は必須です')
  .max(200);

export const servicePersonaToneSchema = z
  .string()
  .max(4000)
  .optional()
  .nullable();

/** 1行1項目（空行無視）を string[] に正規化したあと検証 */
export const stringListSchema = z
  .array(z.string().max(2000))
  .max(200);

export const servicePersonaCreateBodySchema = z.object({
  service_key: servicePersonaKeySchema,
  service_name: servicePersonaNameSchema,
  tone: servicePersonaToneSchema,
  cta_labels: stringListSchema.optional().default([]),
  pain_points: stringListSchema.optional().default([]),
  faq_topics: stringListSchema.optional().default([]),
  forbidden_words: stringListSchema.optional().default([]),
  section_structure: stringListSchema.optional().default([]),
  is_active: z.boolean().optional().default(true),
  raw_json: z.any().optional().nullable(),
});

export const servicePersonaUpdateBodySchema = z.object({
  service_name: servicePersonaNameSchema.optional(),
  tone: servicePersonaToneSchema,
  cta_labels: stringListSchema.optional(),
  pain_points: stringListSchema.optional(),
  faq_topics: stringListSchema.optional(),
  forbidden_words: stringListSchema.optional(),
  section_structure: stringListSchema.optional(),
  is_active: z.boolean().optional(),
  raw_json: z.any().optional().nullable(),
});

export type ServicePersonaCreateBody = z.infer<
  typeof servicePersonaCreateBodySchema
>;

export type ServicePersonaUpdateBody = z.infer<
  typeof servicePersonaUpdateBodySchema
>;
