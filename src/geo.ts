import type { LatLng } from './types';

const EARTH_RADIUS_M = 6_371_008.8;
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

/** Point reached by travelling `distM` metres from `origin` on initial bearing `bearingDeg`. */
export function destination(origin: LatLng, bearingDeg: number, distM: number): LatLng {
  const delta = distM / EARTH_RADIUS_M;
  const theta = rad(bearingDeg);
  const phi1 = rad(origin.lat);
  const lambda1 = rad(origin.lng);
  const phi2 = Math.asin(
    Math.sin(phi1) * Math.cos(delta) + Math.cos(phi1) * Math.sin(delta) * Math.cos(theta),
  );
  const lambda2 =
    lambda1 +
    Math.atan2(
      Math.sin(theta) * Math.sin(delta) * Math.cos(phi1),
      Math.cos(delta) - Math.sin(phi1) * Math.sin(phi2),
    );
  return { lat: deg(phi2), lng: ((deg(lambda2) + 540) % 360) - 180 };
}

/** Abortable delay. */
export function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    const t = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      clearTimeout(t);
      reject(signal.reason);
    }, { once: true });
  });
}
