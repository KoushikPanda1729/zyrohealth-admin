const apiUrl = process.env.NEXT_PUBLIC_API_URL;

if (!apiUrl) {
  throw new Error('NEXT_PUBLIC_API_URL is not defined in environment variables');
}

// Single switch point for which map backend the location picker renders
// (see app/components/maps) — 'osm' needs no API key and works today;
// flipping to 'google' later is a config change plus a new provider
// implementation, not a rewrite of every call site.
export type MapProviderKind = 'osm' | 'google';
const mapProvider = process.env.NEXT_PUBLIC_MAP_PROVIDER === 'google' ? 'google' : 'osm';

export const env = {
  API_URL: apiUrl,
  MAP_PROVIDER: mapProvider as MapProviderKind,
} as const;
