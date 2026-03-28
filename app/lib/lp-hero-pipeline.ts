/**
 * Gemini（プロンプト文案）→ Vertex Imagen（画像）→ Supabase Storage → projects.hero_image_url 更新。
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { generateHeroImagePromptEnglish } from '@/app/lib/gemini-hero-image-prompt';
import { generateImageBytesWithImagen } from '@/app/lib/vertex-imagen';
import {
  lpIndustryToneDescriptionForPrompt,
  resolveLpIndustryTone,
} from '@/app/lib/lp-industry';

const LP_IMAGES_BUCKET = 'lp-images';
const HERO_OBJECT_PATH = (projectId: string) => `${projectId}/hero.png`;

export type HeroPipelineResult = { publicUrl: string; imagePrompt: string };

export async function runHeroImagePipelineForProject(
  supabase: SupabaseClient,
  projectId: string,
): Promise<HeroPipelineResult> {
  const { data: project, error } = await supabase
    .from('projects')
    .select('id, industry_key, service')
    .eq('id', projectId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  if (!project?.id) {
    throw new Error('Project not found');
  }

  const industryKey =
    typeof project.industry_key === 'string' && project.industry_key.trim()
      ? project.industry_key.trim()
      : null;
  const serviceRaw =
    typeof project.service === 'string' ? project.service.trim() : '';
  const service =
    serviceRaw.length > 0 ? serviceRaw : 'local professional services';

  const tone = resolveLpIndustryTone(industryKey, service);
  const industryDescription = lpIndustryToneDescriptionForPrompt(tone);

  const imagePrompt = await generateHeroImagePromptEnglish({
    industryKey,
    industryDescription,
    service,
  });
  if (!imagePrompt) {
    throw new Error(
      'Could not generate hero image prompt (check GEMINI_API_KEY and GEMINI_HERO_PROMPT_MODEL)',
    );
  }

  const bytes = await generateImageBytesWithImagen(imagePrompt);
  const path = HERO_OBJECT_PATH(projectId);

  const { error: uploadError } = await supabase.storage
    .from(LP_IMAGES_BUCKET)
    .upload(path, bytes, {
      contentType: 'image/png',
      upsert: true,
    });

  if (uploadError) {
    throw new Error(
      `Storage upload failed: ${uploadError.message}. Ensure bucket "${LP_IMAGES_BUCKET}" exists and service role can write.`,
    );
  }

  const { data: pub } = supabase.storage
    .from(LP_IMAGES_BUCKET)
    .getPublicUrl(path);
  const publicUrl = pub?.publicUrl?.trim();
  if (!publicUrl) {
    throw new Error('Could not resolve public URL for uploaded hero image');
  }

  const { error: updateErr } = await supabase
    .from('projects')
    .update({ hero_image_url: publicUrl })
    .eq('id', projectId);

  if (updateErr) {
    throw new Error(updateErr.message);
  }

  return { publicUrl, imagePrompt };
}
