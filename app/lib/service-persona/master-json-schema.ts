import { z } from 'zod';
import { servicePersonaKeySchema } from '@/app/lib/service-persona/schema';

/**
 * 業種ルールマスター（master_json）の最低限の検証。
 * それ以外のキーは .passthrough で任意に拡張可能。
 */
export const serviceMasterJsonSchema = z
  .object({
    service_key: servicePersonaKeySchema,
  })
  .passthrough();

export type ServiceMasterJsonValidated = z.infer<typeof serviceMasterJsonSchema>;

export function formatServiceMasterJsonError(err: z.ZodError): string {
  return err.issues
    .slice(0, 12)
    .map((i) => `${i.path.length ? i.path.join('.') : 'root'}: ${i.message}`)
    .join(' / ');
}
