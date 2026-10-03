import { destination, sleep } from '../geo';
import type { Isochrone, IsochroneRequest, LatLng, Provider } from '../types';

const BASE = (import.meta.env.VITE_OSRM_URL as string | undefined) ?? 'https://router.project-osrm.org';
const IS_PUBLIC_DEMO = BASE.includes('router.project-osrm.org');

const RAYS = 48; // directions in the star
const COARSE_SAMPLES = 16; // samples per ray in the first pass
const REFINE_STEPS = 4; // bisection steps per ray after the coarse pass
const MAX_SPEED_MS = 36; // ~130 km/h: nothing is reachable beyond budget * this
const MAX_SNAP_M = 750; // samples further than this from a road are treated as off-network
const TABLE_CHUNK = 99; // demo server allows 100 coordinates per table request (1 is the origin)
const MIN_GAP_MS = IS_PUBLIC_DEMO ? 1000 : 0; // demo server usage policy: ~1 req/s

let lastRequestAt = 0;

/**
 * OSRM has no isochrone endpoint, so we build the star directly: cast rays from the
 * origin, measure drive times to sample points along each ray with the Table service,
 * then bisect each ray to find where the drive time crosses each budget.
 * Free-flow speeds only - OSRM has no traffic data.
 */
export const osrm: Provider = {
  id: 'osrm',
  label: 'OSRM (no traffic, no key, slow)',
  supportsTraffic: false,
  trafficOptional: false,
  keys: [],

  async compute(req: IsochroneRequest): Promise<Isochrone[]> {
    const budgetsSec = req.budgetsMin.map((m) => m * 60);
    const maxDist = Math.max(...budgetsSec) * MAX_SPEED_MS;
    const bearings = Array.from({ length: RAYS }, (_, i) => (i * 360) / RAYS);
    const dists = Array.from({ length: COARSE_SAMPLES }, (_, k) => (maxDist * (k + 1)) / COARSE_SAMPLES);

    const progress = {
      done: 0,
      total:
        Math.ceil((RAYS * COARSE_SAMPLES) / TABLE_CHUNK) +
        REFINE_STEPS * Math.ceil((RAYS * budgetsSec.length) / TABLE_CHUNK),
    };

    // Coarse pass: every sample on every ray.
    const coarsePts = bearings.flatMap((b) => dists.map((d) => destination(req.origin, b, d)));
    const coarse = await measure(req, coarsePts, progress);

    // For each budget and ray, bracket the crossing between the furthest reachable
    // sample and the next one out.
    const brackets = budgetsSec.flatMap((budget, bi) =>
      bearings.map((bearing, r) => {
        let lo = 0;
        let hi = dists[0];
        for (let k = COARSE_SAMPLES - 1; k >= 0; k--) {
          const t = coarse[r * COARSE_SAMPLES + k];
          if (t !== null && t <= budget) {
            lo = dists[k];
            hi = dists[k + 1] ?? dists[k];
            break;
          }
        }
        return { bi, budget, bearing, lo, hi };
      }),
    );

    for (let step = 0; step < REFINE_STEPS; step++) {
      const mids = brackets.map((b) => destination(req.origin, b.bearing, (b.lo + b.hi) / 2));
      const times = await measure(req, mids, progress);
      brackets.forEach((b, i) => {
        const mid = (b.lo + b.hi) / 2;
        const t = times[i];
        if (t !== null && t <= b.budget) b.lo = mid;
        else b.hi = mid;
      });
    }

    return req.budgetsMin.map((budgetMin, bi) => ({
      budgetMin,
      polygons: [
        {
          outer: brackets.filter((b) => b.bi === bi).map((b) => destination(req.origin, b.bearing, b.lo)),
          holes: [],
        },
      ],
    }));
  },
};

interface TableResponse {
  code: string;
  message?: string;
  durations: (number | null)[][];
  destinations: { distance: number }[];
}

/** Drive time in seconds from the origin to each point, or null if unreachable / off-network. */
async function measure(
  req: IsochroneRequest,
  points: LatLng[],
  progress: { done: number; total: number },
): Promise<(number | null)[]> {
  const out: (number | null)[] = [];
  for (let i = 0; i < points.length; i += TABLE_CHUNK) {
    const chunk = points.slice(i, i + TABLE_CHUNK);
    const coords = [req.origin, ...chunk].map((p) => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`).join(';');

    const wait = lastRequestAt + MIN_GAP_MS - Date.now();
    if (wait > 0) await sleep(wait, req.signal);
    lastRequestAt = Date.now();
    req.onProgress(`Querying road network (${progress.done + 1}/${progress.total})…`);

    const res = await fetch(`${BASE}/table/v1/driving/${coords}?sources=0`, { signal: req.signal });
    if (res.status === 429) throw new Error('OSRM demo server rate limit hit - wait a moment and retry.');
    const json = (await res.json()) as TableResponse;
    if (!res.ok || json.code !== 'Ok') throw new Error(`OSRM: ${json.message ?? json.code ?? res.status}`);

    chunk.forEach((_, k) => {
      const t = json.durations[0][k + 1];
      const snap = json.destinations[k + 1]?.distance ?? Infinity;
      out.push(t === null || snap > MAX_SNAP_M ? null : t);
    });
    progress.done++;
  }
  return out;
}
