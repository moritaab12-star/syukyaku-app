/**
 * Vertex AI Imagen 3（REST :predict）で画像バイナリを取得する。
 *
 * 【認証】Google Cloud の Application Default Credentials またはサービスアカウント JSON が必要。
 * 未設定の場合はエラーを投げる（LP テキスト生成とは独立して失敗させる想定）。
 *
 * 必要な環境変数（いずれかの組み合わせ）:
 * - GOOGLE_APPLICATION_CREDENTIALS … サービスアカウント JSON ファイルのパス（ローカル開発向け）
 * - VERTEX_GOOGLE_SERVICE_ACCOUNT_JSON … サービスアカウント JSON 文字列そのまま（Vercel 等）
 * - GOOGLE_CLOUD_PROJECT または GCP_PROJECT または VERTEX_AI_GCP_PROJECT_ID … GCP プロジェクト ID
 * - VERTEX_AI_LOCATION … リージョン（既定: us-central1）。Imagen が使えるリージョンを指定すること。
 * - VERTEX_IMAGEN_MODEL … 既定 imagen-3.0-generate-001
 */

import { GoogleAuth } from 'google-auth-library';

const SCOPE = 'https://www.googleapis.com/auth/cloud-platform';

function resolveProjectId(): string {
  const id =
    process.env.GOOGLE_CLOUD_PROJECT?.trim() ||
    process.env.GCP_PROJECT?.trim() ||
    process.env.VERTEX_AI_GCP_PROJECT_ID?.trim();
  if (!id) {
    throw new Error(
      'Vertex Imagen: set GOOGLE_CLOUD_PROJECT, GCP_PROJECT, or VERTEX_AI_GCP_PROJECT_ID',
    );
  }
  return id;
}

function resolveLocation(): string {
  return process.env.VERTEX_AI_LOCATION?.trim() || 'us-central1';
}

function resolveModelId(): string {
  return (
    process.env.VERTEX_IMAGEN_MODEL?.trim() || 'imagen-3.0-generate-001'
  );
}

async function getAccessToken(): Promise<string> {
  const jsonRaw = process.env.VERTEX_GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  const auth = jsonRaw
    ? new GoogleAuth({
        credentials: JSON.parse(jsonRaw) as object,
        scopes: [SCOPE],
      })
    : new GoogleAuth({ scopes: [SCOPE] });

  const client = await auth.getClient();
  const res = await client.getAccessToken();
  const token = res?.token;
  if (!token) {
    throw new Error(
      'Vertex Imagen: could not obtain access token. Set GOOGLE_APPLICATION_CREDENTIALS or VERTEX_GOOGLE_SERVICE_ACCOUNT_JSON.',
    );
  }
  return token;
}

type PredictResponse = {
  predictions?: { bytesBase64Encoded?: string; mimeType?: string }[];
  error?: { message?: string; code?: number };
};

export async function generateImageBytesWithImagen(
  prompt: string,
): Promise<Uint8Array> {
  const project = resolveProjectId();
  const location = resolveLocation();
  const modelId = resolveModelId();
  const token = await getAccessToken();

  const endpoint = `https://${location}-aiplatform.googleapis.com/v1/projects/${encodeURIComponent(
    project,
  )}/locations/${encodeURIComponent(
    location,
  )}/publishers/google/models/${encodeURIComponent(modelId)}:predict`;

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({
      instances: [{ prompt }],
      parameters: {
        sampleCount: 1,
        aspectRatio: '16:9',
        language: 'en',
        outputOptions: { mimeType: 'image/png' },
        addWatermark: false,
      },
    }),
  });

  const rawText = await res.text();
  if (!res.ok) {
    console.error('[vertex-imagen] predict failed', res.status, rawText.slice(0, 800));
    throw new Error(
      `Vertex Imagen predict failed (${res.status}): ${rawText.slice(0, 200)}`,
    );
  }

  let data: PredictResponse;
  try {
    data = JSON.parse(rawText) as PredictResponse;
  } catch {
    throw new Error('Vertex Imagen: invalid JSON response');
  }

  if (data.error?.message) {
    throw new Error(`Vertex Imagen: ${data.error.message}`);
  }

  const b64 = data.predictions?.[0]?.bytesBase64Encoded;
  if (!b64) {
    throw new Error(
      'Vertex Imagen: no image in response (blocked by safety filters or empty predictions)',
    );
  }

  const buf = Buffer.from(b64, 'base64');
  return new Uint8Array(buf);
}
