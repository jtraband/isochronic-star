import type { Provider } from '../types';
import { here } from './here';
import { mapbox } from './mapbox';
import { openrouteservice } from './openrouteservice';
import { osrm } from './osrm';
import { tomtom } from './tomtom';
import { traveltime } from './traveltime';

export const providers: Provider[] = [tomtom, here, mapbox, traveltime, openrouteservice, osrm];
