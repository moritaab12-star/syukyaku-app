/**
 * 業種人格（service_personas）。LP 生成・保存ゲート・プロンプト用の入口。
 */
export {
  countActiveServicePersonas,
  getActiveServicePersonaByKey,
  getServiceMaster,
  getServicePersonaById,
  isActiveServicePersonaKey,
  listActiveServicePersonasForSelect,
  listAllServicePersonasOrdered,
} from '@/app/lib/service-persona/db-server';
export {
  buildServicePersonaPromptBlock,
  forbiddenPhrasesForValidation,
} from '@/app/lib/service-persona/prompt-block';
export type { ServicePersonaParsed } from '@/app/lib/service-persona/parse-db-row';
export { assertIndustryKeyAllowedForLocalSave } from '@/app/lib/service-persona/save-gate';
