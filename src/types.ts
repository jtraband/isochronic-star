export interface LatLng {
  lat: number;
  lng: number;
}

/** One connected reachable area: an outer ring plus any unreachable holes inside it. */
export interface Polygon {
  outer: LatLng[];
  holes: LatLng[][];
}

export interface Isochrone {
  budgetMin: number;
  /** Usually one, but water, borders etc. can split the reachable area into several pieces. */
  polygons: Polygon[];
}

export interface IsochroneRequest {
  origin: LatLng;
  /** Whole minutes, ascending. */
  budgetsMin: number[];
  /** Value of a datetime-local input (local time at the origin), or null for "now". */
  departAt: string | null;
  traffic: boolean;
  /** Credentials keyed by KeyField.name. */
  keys: Record<string, string>;
  signal: AbortSignal;
  onProgress: (message: string) => void;
}

export interface KeyField {
  name: string;
  label: string;
  /** Value from .env.local, used until the user types their own. */
  envDefault?: string;
}

export interface Provider {
  id: string;
  label: string;
  /** Whether results depend on the departure time (traffic). */
  supportsTraffic: boolean;
  /** Whether traffic can be switched off for this engine. */
  trafficOptional: boolean;
  /** Explains how this engine uses the departure time. */
  trafficNote?: string;
  keys: KeyField[];
  signupUrl?: string;
  /** API limits; the UI won't offer settings beyond these. */
  limits?: { maxMinutes: number; maxRings: number };
  compute(req: IsochroneRequest): Promise<Isochrone[]>;
}
