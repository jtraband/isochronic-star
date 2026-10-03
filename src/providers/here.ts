import { decodeFlexPolyline } from '../flexpolyline';
import type { Isochrone, IsochroneRequest, Provider } from '../types';

const BASE = 'https://isoline.router.hereapi.com/v8/isolines';

interface HereResponse {
  isolines: {
    range: { type: string; value: number };
    polygons: { outer: string; inner?: string[] }[];
  }[];
}

/**
 * HERE Isoline Routing v8: all rings in one request, with live traffic for "now" and
 * typical traffic for other departure times.
 */
export const here: Provider = {
  id: 'here',
  label: 'HERE (traffic-aware)',
  supportsTraffic: true,
  trafficOptional: true,
  trafficNote: '"Now" uses live traffic. Any other time uses typical traffic for that day and hour.',
  keys: [{ name: 'apiKey', label: 'HERE API key', envDefault: import.meta.env.VITE_HERE_KEY }],
  signupUrl: 'https://platform.here.com/',

  async compute(req: IsochroneRequest): Promise<Isochrone[]> {
    req.onProgress('Requesting reachable areas from HERE…');
    const url = new URL(BASE);
    url.searchParams.set('apiKey', req.keys.apiKey);
    url.searchParams.set('transportMode', 'car');
    url.searchParams.set('routingMode', 'fast');
    url.searchParams.set('origin', `${req.origin.lat},${req.origin.lng}`);
    url.searchParams.set('range[type]', 'time');
    url.searchParams.set('range[values]', req.budgetsMin.map((m) => m * 60).join(','));
    // Omitted = depart now with live traffic; 'any' = ignore traffic. A time without an
    // offset is local time at the origin.
    if (!req.traffic) url.searchParams.set('departureTime', 'any');
    else if (req.departAt) url.searchParams.set('departureTime', `${req.departAt}:00`);

    const res = await fetch(url, { signal: req.signal });
    if (!res.ok) throw new Error(`HERE: ${await describeError(res)}`);
    const json = (await res.json()) as HereResponse;

    return req.budgetsMin.map((budgetMin) => {
      const iso = json.isolines.find((i) => i.range.value === budgetMin * 60);
      if (!iso) throw new Error(`HERE returned no area for ${budgetMin} min.`);
      return {
        budgetMin,
        polygons: iso.polygons.map((p) => ({
          outer: decodeFlexPolyline(p.outer),
          holes: (p.inner ?? []).map(decodeFlexPolyline),
        })),
      };
    });
  },
};

async function describeError(res: Response): Promise<string> {
  try {
    const j = await res.json();
    return j.cause ?? j.title ?? j.error_description ?? `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status} ${res.statusText}`;
  }
}
