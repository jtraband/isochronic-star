# Isochronic Star

A map showing everywhere you can reach by car in a given time from a point you pick:
an isochrone, drawn as a "star" of rays out from the start point. Because it measures
time rather than distance, roads, speed limits and (with most engines) traffic all bend the shape.

## Run

```sh
npm install
npm run dev
```

Then click anywhere on the map (or search / use your location).

## Routing engines

| Engine | Traffic | Key | How it works |
| --- | --- | --- | --- |
| **TomTom** | Live traffic for "now", historical traffic for a future departure time | Free key from [developer.tomtom.com](https://developer.tomtom.com/) | `calculateReachableRange` API returns the boundary polygon directly. One request per travel time. |
| **HERE** | Live traffic for "now", typical traffic for other times | Free key from [platform.here.com](https://platform.here.com/) | Isoline Routing v8. All rings in one request; polygons come back in HERE's flexible-polyline encoding (`src/flexpolyline.ts`). |
| **Mapbox** | Current traffic for "now", typical traffic for other times | Free token from [account.mapbox.com](https://account.mapbox.com/) | Isochrone API. All rings in one request. **Limited to 60 minutes and 4 rings**; the app greys out longer times and extra rings. |
| **TravelTime** | Typical traffic for the departure day and hour (no live traffic) | Application ID + API key from [traveltime.com](https://traveltime.com/) | Time-map API, one search per ring in a single request. The departure time is sent in the browser's time zone. |
| **openrouteservice** | None (free-flow speeds) | Free key from [openrouteservice.org](https://openrouteservice.org/dev/#/signup) | Isochrones API over OpenStreetMap roads. All rings in one request, so much faster than OSRM. **Limited to 60 minutes** on the public API. |
| **OSRM** | None (free-flow speeds) | None | Casts 48 rays from the origin, measures drive time to points along each ray with the OSRM Table service, then bisects each ray to find where it crosses each time budget. About 10–20 requests per star, throttled to 1 req/s for the public demo server. |

Put your keys in `.env.local` (see `.env.example`) or paste them into the sidebar,
which remembers them in your browser's local storage. Set `VITE_OSRM_URL` to use your own
OSRM server, which also removes the throttling.

## Layout

- `src/main.ts`: map, controls, rendering
- `src/providers/`: one file per engine (`tomtom`, `here`, `mapbox`, `traveltime`, `openrouteservice`, `osrm`), registered in `index.ts`
- `src/flexpolyline.ts`: decoder for HERE's flexible-polyline format
- `src/geo.ts`: great-circle helpers
