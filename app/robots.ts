import type { MetadataRoute } from 'next';
import { getSiteOrigin } from '@/app/lib/seo-indexing';

export const dynamic = 'force-dynamic';

/** Next 本番オリジンの `/sitemap.xml` のみ参照（WP URL は含めない）。オリジンは `NEXT_PUBLIC_SITE_URL`。 */
export default function robots(): MetadataRoute.Robots {
  const origin = getSiteOrigin();
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
      },
    ],
    sitemap: `${origin}/sitemap.xml`,
  };
}

