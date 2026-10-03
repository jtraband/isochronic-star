import type { LatLng } from './types';

/**
 * Decoder for HERE's Flexible Polyline encoding
 * (https://github.com/heremaps/flexible-polyline). Any third dimension is skipped.
 */
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const VALUE = new Map([...ALPHABET].map((c, i) => [c, i]));

export function decodeFlexPolyline(encoded: string): LatLng[] {
  let pos = 0;

  // Unsigned varint: 5-bit groups, least significant first, 0x20 = more to come.
  // Plain arithmetic rather than bit operations so values above 2^31 stay exact.
  const readUnsigned = () => {
    let result = 0;
    let scale = 1;
    for (;;) {
      if (pos >= encoded.length) throw new Error('Truncated flexible polyline');
      const v = VALUE.get(encoded[pos++]);
      if (v === undefined) throw new Error('Invalid flexible polyline character');
      result += (v & 0x1f) * scale;
      if (!(v & 0x20)) return result;
      scale *= 32;
    }
  };
  // Zigzag: even -> v/2, odd -> -(v+1)/2.
  const readSigned = () => {
    const u = readUnsigned();
    return u % 2 ? -(u + 1) / 2 : u / 2;
  };

  if (readUnsigned() !== 1) throw new Error('Unsupported flexible polyline version');
  const header = readUnsigned();
  const factor = 10 ** (header & 15);
  const hasThird = ((header >> 4) & 7) !== 0;

  const points: LatLng[] = [];
  let lat = 0;
  let lng = 0;
  while (pos < encoded.length) {
    lat += readSigned();
    lng += readSigned();
    if (hasThird) readSigned();
    points.push({ lat: lat / factor, lng: lng / factor });
  }
  return points;
}
