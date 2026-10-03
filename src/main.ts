import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './style.css';
import { providers } from './providers';
import type { Isochrone, KeyField, LatLng, Provider } from './types';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const ui = {
  provider: $<HTMLSelectElement>('provider'),
  keys: $<HTMLElement>('keys'),
  trafficRow: $<HTMLElement>('traffic-row'),
  trafficToggle: $<HTMLElement>('traffic-toggle'),
  traffic: $<HTMLInputElement>('traffic'),
  trafficNote: $<HTMLElement>('traffic-note'),
  depart: $<HTMLInputElement>('depart'),
  departNow: $<HTMLButtonElement>('depart-now'),
  maxTime: $<HTMLSelectElement>('max-time'),
  rings: $<HTMLSelectElement>('rings'),
  budgetsPreview: $<HTMLElement>('budgets-preview'),
  limitNote: $<HTMLElement>('limit-note'),
  showRays: $<HTMLInputElement>('show-rays'),
  showFill: $<HTMLInputElement>('show-fill'),
  compute: $<HTMLButtonElement>('compute'),
  status: $<HTMLElement>('status'),
  legend: $<HTMLUListElement>('legend'),
  search: $<HTMLFormElement>('search'),
  searchInput: $<HTMLInputElement>('search-input'),
  locate: $<HTMLButtonElement>('locate'),
};

// Short trips green through blue/purple to long trips red. Every stop is saturated and
// mid-dark so it stays visible on light map tiles (no pale yellows).
const RAMP = ['#1b9e48', '#0f8b8d', '#2563eb', '#7c3aed', '#c026d3', '#dc2626'];
const MAX_RAYS = 72;

const store = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
};

// ---- Map ----
const map = L.map('map').setView([51.5074, -0.1278], 10);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
}).addTo(map);

const resultLayer = L.layerGroup().addTo(map);
let originMarker: L.CircleMarker | null = null;
let origin: LatLng | null = null;
let lastResult: Isochrone[] = [];
let controller: AbortController | null = null;
// While true, the departure field tracks the clock and requests use live traffic.
let departIsNow = true;

// ---- Controls ----
// A typed key wins over one from .env.local.
const keyStoreName = (p: Provider, f: KeyField) => `key.${p.id}.${f.name}`;
const getKey = (p: Provider, f: KeyField) => (store.get(keyStoreName(p, f)) ?? f.envDefault ?? '').trim();
const hasKeys = (p: Provider) => p.keys.every((f) => getKey(p, f));

for (const p of providers) ui.provider.add(new Option(p.label, p.id));
ui.provider.value =
  store.get('provider') ?? providers.find((p) => p.keys.length && hasKeys(p))?.id ?? 'osrm';
if (!ui.provider.value) ui.provider.value = 'osrm';

// The user's chosen time and rings. An engine with lower limits shows less, but switching
// back to an engine without them restores the choice.
const choice = {
  maxTime: store.get('maxTime') ?? '60',
  rings: store.get('rings') ?? '3',
};

const currentProvider = () => providers.find((p) => p.id === ui.provider.value) ?? providers[0];

function syncProviderUi() {
  const p = currentProvider();
  renderKeyFields(p);
  ui.trafficRow.hidden = !p.supportsTraffic;
  ui.trafficToggle.hidden = !p.trafficOptional;
  ui.trafficNote.textContent = p.trafficNote ?? '';
  syncLimits(p);
  syncBudgetsPreview();
}

function renderKeyFields(p: Provider) {
  ui.keys.replaceChildren();
  for (const f of p.keys) {
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'password';
    input.autocomplete = 'off';
    input.value = getKey(p, f);
    input.addEventListener('change', () => {
      store.set(keyStoreName(p, f), input.value.trim());
      compute();
    });
    label.append(f.label, input);
    ui.keys.append(label);
  }
  if (p.signupUrl) {
    const small = document.createElement('small');
    const a = Object.assign(document.createElement('a'), {
      href: p.signupUrl, target: '_blank', rel: 'noopener', textContent: new URL(p.signupUrl).host,
    });
    small.append('Free key from ', a);
    ui.keys.append(small);
  }
}

/** Grey out times and ring counts the engine can't do, and pick the closest allowed choice. */
function syncLimits(p: Provider) {
  const pick = (sel: HTMLSelectElement, want: string, max = Infinity) => {
    let best: HTMLOptionElement | undefined;
    for (const o of sel.options) {
      o.disabled = Number(o.value) > max;
      if (!o.disabled && Number(o.value) <= Number(want)) best = o;
    }
    sel.value = (best ?? sel.options[0]).value;
  };
  pick(ui.maxTime, choice.maxTime, p.limits?.maxMinutes);
  pick(ui.rings, choice.rings, p.limits?.maxRings);

  const restricted = (sel: HTMLSelectElement) => [...sel.options].some((o) => o.disabled);
  const parts = [
    restricted(ui.maxTime) && `${p.limits?.maxMinutes} min`,
    restricted(ui.rings) && `${p.limits?.maxRings} rings`,
  ].filter(Boolean);
  ui.limitNote.hidden = !parts.length;
  ui.limitNote.textContent = `This engine allows at most ${parts.join(' and ')}.`;
}

syncProviderUi();

ui.provider.addEventListener('change', () => {
  store.set('provider', ui.provider.value);
  syncProviderUi();
  compute();
});
for (const [el, key] of [[ui.maxTime, 'maxTime'], [ui.rings, 'rings']] as const) {
  el.addEventListener('change', () => {
    choice[key] = el.value;
    store.set(key, el.value);
    syncBudgetsPreview();
    compute();
  });
}
ui.traffic.addEventListener('change', () => compute());
ui.depart.addEventListener('change', () => {
  departIsNow = false;
  compute();
});
ui.departNow.addEventListener('click', () => {
  departIsNow = true;
  syncDepartNow();
  compute();
});
syncDepartNow();
setInterval(syncDepartNow, 30 * 1000);
ui.showRays.addEventListener('change', () => render(lastResult));
ui.showFill.addEventListener('change', () => render(lastResult));
ui.compute.addEventListener('click', () => compute());

map.on('click', (e: L.LeafletMouseEvent) => setOrigin({ lat: e.latlng.lat, lng: e.latlng.lng }));

ui.search.addEventListener('submit', async (e) => {
  e.preventDefault();
  const q = ui.searchInput.value.trim();
  if (!q) return;
  setStatus('Searching…');
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`,
    );
    const hits = (await res.json()) as { lat: string; lon: string }[];
    if (!hits.length) return setStatus(`No match for "${q}".`, true);
    const pt = { lat: +hits[0].lat, lng: +hits[0].lon };
    map.setView([pt.lat, pt.lng], 11);
    setOrigin(pt);
  } catch (err) {
    setStatus(`Search failed: ${(err as Error).message}`, true);
  }
});

ui.locate.addEventListener('click', () => locateUser(false));

/**
 * Start from the user's current location. On page load (`quiet`) a denial or failure just
 * leaves the default view, and a starting point the user picked in the meantime wins.
 */
function locateUser(quiet: boolean) {
  if (!navigator.geolocation) return quiet || setStatus('Geolocation is not available.', true);
  if (!quiet) setStatus('Locating…');
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      if (quiet && origin) return;
      const pt = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      map.setView([pt.lat, pt.lng], 11);
      setOrigin(pt);
    },
    (err) => quiet || setStatus(`Could not get location: ${err.message}`, true),
    { timeout: 15000, maximumAge: 5 * 60 * 1000 },
  );
}

// ---- Logic ----
function setOrigin(pt: LatLng) {
  origin = pt;
  if (originMarker) originMarker.setLatLng([pt.lat, pt.lng]);
  else
    originMarker = L.circleMarker([pt.lat, pt.lng], {
      radius: 7, color: '#fff', weight: 2, fillColor: '#111', fillOpacity: 1,
    }).addTo(map);
  originMarker.bringToFront();
  compute();
}

/** Keep the departure field showing the current local time while "now" is selected. */
function syncDepartNow() {
  if (!departIsNow) return;
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  ui.depart.value =
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Evenly spaced travel times up to the chosen maximum, e.g. 60 min / 3 rings -> 20, 40, 60.
 * Whole minutes, since some engines (Mapbox) accept nothing else.
 */
function budgets(): number[] {
  const max = Number(ui.maxTime.value);
  const n = Number(ui.rings.value);
  return [...new Set(Array.from({ length: n }, (_, i) => Math.round((max * (i + 1)) / n)))];
}

function syncBudgetsPreview() {
  ui.budgetsPreview.textContent = `Rings at ${budgets().join(', ')} min`;
}

function setStatus(msg: string, isError = false) {
  ui.status.textContent = msg;
  ui.status.classList.toggle('error', isError);
}

async function compute() {
  if (!origin) return setStatus('Click the map to choose a starting point.');
  const provider = currentProvider();
  const budgetsMin = budgets();
  const missing = provider.keys.find((f) => !getKey(provider, f));
  if (missing) return setStatus(`Enter your ${missing.label}, or pick another routing engine.`, true);
  const keys = Object.fromEntries(provider.keys.map((f) => [f.name, getKey(provider, f)]));
  const traffic = provider.trafficOptional ? ui.traffic.checked : provider.supportsTraffic;

  controller?.abort();
  const mine = (controller = new AbortController());
  ui.compute.disabled = true;
  try {
    const result = await provider.compute({
      origin,
      budgetsMin,
      departAt: departIsNow ? null : ui.depart.value || null,
      traffic,
      keys,
      signal: mine.signal,
      onProgress: (m) => setStatus(m),
    });
    lastResult = result;
    render(result, true);
    const mode = traffic
      ? `with traffic, departing ${departIsNow || !ui.depart.value ? 'now' : ui.depart.value.replace('T', ' ')}`
      : 'free-flow (no traffic)';
    setStatus(`Done: ${mode}.`);
  } catch (err) {
    if (mine.signal.aborted) return;
    setStatus((err as Error).message, true);
  } finally {
    if (controller === mine) ui.compute.disabled = false;
  }
}

function colorFor(i: number, n: number) {
  return RAMP[n === 1 ? 0 : Math.round((i * (RAMP.length - 1)) / (n - 1))];
}

function render(isochrones: Isochrone[], fit = false) {
  resultLayer.clearLayers();
  ui.legend.replaceChildren();
  if (!origin || !isochrones.length) return;
  const n = isochrones.length;

  // Largest first so smaller areas sit on top.
  [...isochrones].reverse().forEach((iso, ri) => {
    const color = colorFor(n - 1 - ri, n);
    const rings = iso.polygons.map((p) => [p.outer, ...p.holes].map((r) => r.map(toTuple)));
    L.polygon(rings, {
      color,
      weight: 2.5,
      fillColor: color,
      fillOpacity: ui.showFill.checked ? 0.18 : 0,
    })
      .bindTooltip(`${iso.budgetMin} min`, { sticky: true })
      .addTo(resultLayer);
  });

  if (ui.showRays.checked) {
    // Rays go to the main piece of the largest area; outlying islands would just add clutter.
    const outer = largestRing(isochrones[n - 1]);
    const step = Math.max(1, Math.ceil(outer.length / MAX_RAYS));
    for (let i = 0; i < outer.length; i += step) {
      L.polyline([[origin.lat, origin.lng], [outer[i].lat, outer[i].lng]], {
        color: '#333', weight: 1, opacity: 0.35, interactive: false,
      }).addTo(resultLayer);
    }
  }

  isochrones.forEach((iso, i) => {
    const li = document.createElement('li');
    const sw = document.createElement('span');
    sw.className = 'swatch';
    sw.style.background = colorFor(i, n);
    li.append(sw, `${iso.budgetMin} min`);
    ui.legend.append(li);
  });

  originMarker?.bringToFront();
  if (fit) {
    const pts = isochrones[n - 1].polygons.flatMap((p) => p.outer.map(toTuple));
    if (pts.length) map.fitBounds(L.latLngBounds(pts), { padding: [20, 20] });
  }
}

const toTuple = (p: LatLng): L.LatLngTuple => [p.lat, p.lng];

/** Outer ring of the biggest piece, by shoelace area in degrees (fine for comparing). */
function largestRing(iso: Isochrone): LatLng[] {
  const area = (r: LatLng[]) =>
    Math.abs(r.reduce((s, p, i) => {
      const q = r[(i + 1) % r.length];
      return s + p.lng * q.lat - q.lng * p.lat;
    }, 0));
  return iso.polygons.reduce<LatLng[]>((best, p) => (area(p.outer) > area(best) ? p.outer : best), []);
}

setStatus('Click the map to choose a starting point.');
locateUser(true);
