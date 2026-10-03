# Isochronic Star

A map showing everywhere you can reach by car in a given time from a point you pick:
an isochrone, drawn as a "star" of rays out from the start point. Because it measures
time rather than distance, roads, speed limits and (with most engines) traffic all bend the shape.

**Live demo:** https://jtraband.github.io/isochronic-star/

## Run it locally

You need [Node.js](https://nodejs.org/) 22 or later.

```sh
git clone https://github.com/jtraband/isochronic-star.git
cd isochronic-star
npm install
cp .env.example .env.local   # then fill in the keys you have (see below)
npm run dev
```

Open the address Vite prints (usually http://localhost:5173). The app starts at your
current location if the browser allows it; otherwise click anywhere on the map, search
for a place, or press ◎.

Press `Ctrl+C` in the terminal to stop the server. Vite reads `.env.local` only at
startup, so restart `npm run dev` after changing it. Code changes reload by themselves.

### Other commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server with live reload |
| `npm run build` | Type-checks and builds the static site into `dist/` |
| `npm run preview` | Serves the built `dist/` locally, to check a build before deploying |

## API keys

Every engine except OSRM needs a free key. Put keys in `.env.local` (copied from
[`.env.example`](.env.example)), or paste them into the sidebar, which remembers them in
that browser. A key typed into the sidebar overrides the one in `.env.local`.

| Variable | Engine | Where to get it |
| --- | --- | --- |
| `VITE_TOMTOM_KEY` | TomTom | [developer.tomtom.com](https://developer.tomtom.com/) |
| `VITE_HERE_KEY` | HERE | [platform.here.com](https://platform.here.com/) |
| `VITE_MAPBOX_TOKEN` | Mapbox | [account.mapbox.com](https://account.mapbox.com/) |
| `VITE_TRAVELTIME_APP_ID`, `VITE_TRAVELTIME_KEY` | TravelTime (needs both) | [traveltime.com](https://traveltime.com/) |
| `VITE_ORS_KEY` | openrouteservice | [openrouteservice.org](https://openrouteservice.org/dev/#/signup) |
| `VITE_OSRM_URL` | OSRM (optional) | Your own OSRM server; defaults to the public demo server |

`.env.local` is in `.gitignore` and is never committed.

## Using the app

- **Routing engine:** which service calculates the areas. On first load the app uses
  openrouteservice if it has a key (otherwise the first engine with a key, or OSRM);
  after that it remembers your choice.
- **Departure:** starts at "now" and keeps up with the clock, which means live traffic
  (where the engine has it). Pick another date and time to see typical traffic for then;
  **Now** switches back.
- **Longest time / Rings:** e.g. 1 hour with 3 rings draws 20, 40 and 60 minutes.
  Engines with lower limits grey out the options they can't do.
- **Show star rays / Fill areas:** display options.

## Routing engines

| Engine | Traffic | Limits | How it works |
| --- | --- | --- | --- |
| **TomTom** | Live for "now", typical for other times | — | `calculateReachableRange`, one request per ring. |
| **HERE** | Live for "now", typical for other times | — | Isoline Routing v8, all rings in one request. Polygons arrive in HERE's flexible-polyline encoding (`src/flexpolyline.ts`). |
| **Mapbox** | Current for "now", typical for other times | 60 min, 4 rings | Isochrone API, all rings in one request. |
| **TravelTime** | Typical for the chosen day and hour (no live traffic) | — | Time-map API, all rings in one request. The departure time is sent in the browser's time zone. |
| **openrouteservice** | None | 60 min | Isochrones API over OpenStreetMap roads, all rings in one request. |
| **OSRM** | None | — | No key needed, but slow: casts 48 rays from the start, measures drive times along each with the Table service, and bisects to find where each ring is crossed. About 10–20 requests per star, throttled to 1 per second on the public demo server. |

## Deployment (GitHub Pages)

Every push to `main` runs [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml),
which builds the site and publishes it to https://jtraband.github.io/isochronic-star/.
Progress shows under the repo's **Actions** tab; a deploy takes a minute or two.

The workflow reads the API keys from **repository secrets** (Settings → Secrets and
variables → Actions) with the same names as in `.env.local`. Engines without a secret
simply ask visitors for a key.

- **Add or change a key:** `gh secret set VITE_HERE_KEY` (it prompts for the value), or
  `gh secret set -f .env.local` to upload every key in the file. Then redeploy.
- **Redeploy without a code change:** Actions tab → *Deploy to GitHub Pages* → *Run
  workflow*, or `gh workflow run deploy.yml`.

> [!WARNING]
> Vite builds the keys into the public JavaScript, so anyone can read them from the
> deployed site. That is acceptable for a demo on free plans with no payment card
> attached (the worst case is the daily allowance running out). Where the provider
> allows it, restrict each key to `jtraband.github.io` (TomTom, HERE and Mapbox all
> offer domain restrictions). To hide keys fully, put a small proxy (for example a
> Cloudflare Worker) between the site and the APIs.

## Project layout

- `src/main.ts`: map, sidebar controls, rendering
- `src/providers/`: one file per engine, registered in `index.ts`. To add an engine,
  implement the `Provider` interface from `src/types.ts` and add it to the list.
- `src/flexpolyline.ts`: decoder for HERE's flexible-polyline format
- `src/geo.ts`: great-circle helpers used by OSRM
- `vite.config.ts`: `base: './'` so the build works from the `/isochronic-star/` subpath

## Troubleshooting

- **"Enter your … key"**: that engine has no key. Add it to `.env.local` and restart
  `npm run dev`, or paste it into the sidebar.
- **A key change doesn't take effect:** a key typed into the sidebar overrides
  `.env.local`. Clear the field to fall back to the file.
- **The map doesn't start at your location:** the browser blocked location access, or
  the page isn't on `https`/`localhost`. Use ◎ after allowing it.
- **An engine shows an error:** the message comes straight from that provider; the
  usual causes are an invalid key or a used-up daily allowance.
