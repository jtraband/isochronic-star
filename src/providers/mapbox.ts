import type { Isochrone, IsochroneRequest, LatLng, Polygon, Provider } from '../types';

const BASE = 'https://api.mapbox.com/isochrone/v1/mapbox';

type Ring = [number, number][];
interface MapboxResponse {
  features: {
    properties: { contour: number };
    geometry: { type: 'Polygon'; coordinates: Ring[] } | { type: 'MultiPolygon'; coordinates: Ring[][] };
  }[];
}

/**
 * Mapbox Isochrone API: all rings in one request. The API caps contours at 60 minutes
 * and 4 per request, and only accepts whole minutes.
 */
export const mapbox: Provider = {
  id: 'mapbox',
  label: 'Mapbox (traffic-aware, max 1 h)',
  supportsTraffic: true,
  trafficOptional: true,
  trafficNote: '"Now" uses current traffic. Any other time uses typical traffic for that day and hour.',
  keys: [{ name: 'token', label: 'Mapbox access token', envDefault: import.meta.env.VITE_MAPBOX_TOKEN }],
  signupUrl: 'https://account.mapbox.com/',
  limits: { maxMinutes: 60, maxRings: 4 },

  async compute(req: IsochroneRequest): Promise<Isochrone[]> {
    req.onProgress('Requesting reachable areas from Mapbox…');
    const profile = req.traffic ? 'driving-traffic' : 'driving';
    const url = new URL(`${BASE}/${profile}/${req.origin.lng},${req.origin.lat}`);
    url.searchParams.set('access_token', req.keys.token);
    url.searchParams.set('contours_minutes', req.budgetsMin.join(','));
    url.searchParams.set('polygons', 'true');
    // Without an offset, Mapbox treats the time as local time at the origin.
    if (req.departAt) url.searchParams.set('depart_at', req.departAt);

    const res = await fetch(url, { signal: req.signal });
    if (!res.ok) throw new Error(`Mapbox: ${await describeError(res)}`);
    const json = (await res.json()) as MapboxResponse;

    return req.budgetsMin.map((budgetMin) => {
      const f = json.features.find((x) => x.properties.contour === budgetMin);
      if (!f) throw new Error(`Mapbox returned no area for ${budgetMin} min.`);
      const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
      return { budgetMin, polygons: polys.map(toPolygon) };
    });
  },
};

const toLatLngs = (ring: Ring): LatLng[] => ring.map(([lng, lat]) => ({ lat, lng }));
const toPolygon = ([outer, ...holes]: Ring[]): Polygon => ({
  outer: toLatLngs(outer),
  holes: holes.map(toLatLngs),
});

async function describeError(res: Response): Promise<string> {
  try {
    const j = await res.json();
    return j.message ?? `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status} ${res.statusText}`;
  }
}
