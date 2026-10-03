import type { Isochrone, IsochroneRequest, Provider } from '../types';

const BASE = 'https://api.tomtom.com/routing/1/calculateReachableRange';

interface TomTomResponse {
  reachableRange: { boundary: { latitude: number; longitude: number }[] };
}

/**
 * TomTom "Calculate Reachable Range": returns a polygon of everywhere reachable
 * within a time budget, using live + historical traffic for the departure time.
 */
export const tomtom: Provider = {
  id: 'tomtom',
  label: 'TomTom (traffic-aware)',
  supportsTraffic: true,
  trafficOptional: true,
  trafficNote: '"Now" uses live traffic. Any other time uses typical traffic for that day and hour.',
  keys: [{ name: 'apiKey', label: 'TomTom API key', envDefault: import.meta.env.VITE_TOMTOM_KEY }],
  signupUrl: 'https://developer.tomtom.com/',

  async compute(req: IsochroneRequest): Promise<Isochrone[]> {
    const results: Isochrone[] = [];
    for (const [i, budgetMin] of req.budgetsMin.entries()) {
      req.onProgress(`Requesting ${budgetMin} min range from TomTom (${i + 1}/${req.budgetsMin.length})…`);
      const url = new URL(`${BASE}/${req.origin.lat},${req.origin.lng}/json`);
      url.searchParams.set('key', req.keys.apiKey);
      url.searchParams.set('timeBudgetInSec', String(Math.round(budgetMin * 60)));
      url.searchParams.set('travelMode', 'car');
      url.searchParams.set('routeType', 'fastest');
      url.searchParams.set('traffic', String(req.traffic));
      // Without an offset, TomTom interprets the time as local time at the origin.
      url.searchParams.set('departAt', req.departAt ? `${req.departAt}:00` : 'now');

      const res = await fetch(url, { signal: req.signal });
      if (!res.ok) throw new Error(`TomTom: ${await describeError(res)}`);
      const json = (await res.json()) as TomTomResponse;
      results.push({
        budgetMin,
        polygons: [
          { outer: json.reachableRange.boundary.map((p) => ({ lat: p.latitude, lng: p.longitude })), holes: [] },
        ],
      });
    }
    return results;
  },
};

async function describeError(res: Response): Promise<string> {
  try {
    const j = await res.json();
    return j.detailedError?.message ?? j.error?.description ?? j.errorText ?? `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status} ${res.statusText}`;
  }
}
