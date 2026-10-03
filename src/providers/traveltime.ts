import type { Isochrone, IsochroneRequest, LatLng, Provider } from '../types';

const URL_ = 'https://api.traveltimeapp.com/v4/time-map';

interface TravelTimeResponse {
  results: { search_id: string; shapes: { shell: LatLng[]; holes: LatLng[][] }[] }[];
}

/**
 * TravelTime time-map: one search per ring, all in one request. Driving times depend on
 * the time of day (typical traffic); there is no live traffic and no way to turn it off.
 */
export const traveltime: Provider = {
  id: 'traveltime',
  label: 'TravelTime (time-of-day traffic)',
  supportsTraffic: true,
  trafficOptional: false,
  trafficNote: 'Uses typical traffic for the chosen day and hour. TravelTime has no live traffic.',
  keys: [
    { name: 'appId', label: 'TravelTime Application ID', envDefault: import.meta.env.VITE_TRAVELTIME_APP_ID },
    { name: 'apiKey', label: 'TravelTime API key', envDefault: import.meta.env.VITE_TRAVELTIME_KEY },
  ],
  signupUrl: 'https://traveltime.com/',
  limits: { maxMinutes: 240, maxRings: 10 },

  async compute(req: IsochroneRequest): Promise<Isochrone[]> {
    req.onProgress('Requesting reachable areas from TravelTime…');
    // TravelTime needs an explicit offset. The browser's time zone stands in for the
    // origin's, which is only wrong if you pick a start point in another time zone.
    const departure_time = (req.departAt ? new Date(req.departAt) : new Date()).toISOString();
    const body = {
      departure_searches: req.budgetsMin.map((m) => ({
        id: String(m),
        coords: req.origin,
        departure_time,
        travel_time: m * 60,
        transportation: { type: 'driving' },
      })),
    };

    const res = await fetch(URL_, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Application-Id': req.keys.appId,
        'X-Api-Key': req.keys.apiKey,
      },
      body: JSON.stringify(body),
      signal: req.signal,
    });
    if (!res.ok) throw new Error(`TravelTime: ${await describeError(res)}`);
    const json = (await res.json()) as TravelTimeResponse;

    return req.budgetsMin.map((budgetMin) => {
      const r = json.results.find((x) => x.search_id === String(budgetMin));
      if (!r) throw new Error(`TravelTime returned no area for ${budgetMin} min.`);
      return {
        budgetMin,
        polygons: r.shapes.map((s) => ({ outer: s.shell, holes: s.holes ?? [] })),
      };
    });
  },
};

async function describeError(res: Response): Promise<string> {
  try {
    const j = await res.json();
    return j.description ?? `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status} ${res.statusText}`;
  }
}
