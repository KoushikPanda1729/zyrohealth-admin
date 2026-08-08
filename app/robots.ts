import type { MetadataRoute } from 'next';

// Internal, login-gated admin tool — nothing here should ever be crawled
// or indexed (also enforced via the `robots: noindex` metadata in layout.tsx).
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        disallow: '/',
      },
    ],
  };
}
