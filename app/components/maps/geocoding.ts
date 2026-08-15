// OSM Nominatim client — free, no API key. This is the one place that
// talks to the geocoding backend; swapping providers later (see mapConfig)
// means adding a sibling implementation here, not touching call sites.

export interface GeocodeAddress {
  displayName: string;
  addressLine1?: string;
  city?: string;
}

export interface SearchResult extends GeocodeAddress {
  latitude: number;
  longitude: number;
}

export async function reverseGeocode(lat: number, lng: number): Promise<GeocodeAddress> {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`,
  );
  if (!res.ok) throw new Error('Reverse geocode failed');
  const data = await res.json();
  const addr = data.address ?? {};
  const addressLine1: string | undefined =
    [addr.house_number, addr.road].filter(Boolean).join(' ') ||
    addr.suburb ||
    addr.neighbourhood ||
    undefined;
  const city: string | undefined = addr.city || addr.town || addr.village || addr.county;
  return { displayName: data.display_name as string, addressLine1, city };
}

interface NominatimSearchResult {
  display_name: string;
  lat: string;
  lon: string;
  address?: { road?: string; city?: string; town?: string; village?: string };
}

export async function searchPlaces(query: string): Promise<SearchResult[]> {
  if (!query.trim()) return [];
  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=6&q=${encodeURIComponent(query)}`,
  );
  if (!res.ok) throw new Error('Search failed');
  const data = (await res.json()) as NominatimSearchResult[];
  return data.map((r) => ({
    displayName: r.display_name,
    addressLine1: r.address?.road,
    city: r.address?.city || r.address?.town || r.address?.village,
    latitude: parseFloat(r.lat),
    longitude: parseFloat(r.lon),
  }));
}
