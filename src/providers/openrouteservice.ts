import type { Isochrone, IsochroneRequest, LatLng, Provider } from '../types';

const BASE = 'https://api.openrouteservice.org/v2/isochrones/driving-car';

type Ring = [number, number][];
interface OrsResponse {
  features: { properties: { value: number }; geometry: { type: 'Polygon'; coordinates: Ring[] } }[];
}

/**
 * openrouteservice isochrones: all rings in one request over OpenStreetMap roads.
 * Free-flow speeds only (no traffic), and the public API caps driving at 1 hour.
 */
export const openrouteservice: Provider = {
  id: 'ors',
  label: 'openrouteservice (no traffic, max 1 h)',
  supportsTraffic: false,
  trafficOptional: false,
  keys: [{ name: 'apiKey', label: 'openrouteservice API key', envDefault: import.meta.env.VITE_ORS_KEY }],
  signupUrl: 'https://openrouteservice.org/dev/#/signup',
  limits: { maxMinutes: 60, maxRings: 10 },

  async compute(req: IsochroneRequest): Promise<Isochrone[]> {
    req.onProgress('Requesting reachable areas from openrouteservice…');
    const res = await fetch(BASE, {
      method: 'POST',
      headers: { Authorization: req.keys.apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        locations: [[req.origin.lng, req.origin.lat]],
        range: req.budgetsMin.map((m) => m * 60),
        range_type: 'time',
      }),
      signal: req.signal,
    });
    if (!res.ok) throw new Error(`openrouteservice: ${await describeError(res)}`);
    const json = (await res.json()) as OrsResponse;

    return req.budgetsMin.map((budgetMin) => {
      const f = json.features.find((x) => x.properties.value === budgetMin * 60);
      if (!f) throw new Error(`openrouteservice returned no area for ${budgetMin} min.`);
      const [outer, ...holes] = f.geometry.coordinates.map(toLatLngs);
      return { budgetMin, polygons: [{ outer, holes }] };
    });
  },
};

const toLatLngs = (ring: Ring): LatLng[] => ring.map(([lng, lat]) => ({ lat, lng }));

async function describeError(res: Response): Promise<string> {
  try {
    const j = await res.json();
    // Errors come back as either {error: "..."} or {error: {code, message}}.
    return (typeof j.error === 'string' ? j.error : j.error?.message) ?? `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status} ${res.statusText}`;
  }
}
