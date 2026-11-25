// Writes public/sample.csv: a synthetic job ledger for a small trades office.
// Every business name, address and amount is invented. Seeded, so it is reproducible.
import { writeFileSync } from 'node:fs';
import Papa from 'papaparse';

function rng(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const r = rng(20261125);
const pick = (a) => a[Math.floor(r() * a.length)];

const CITIES = ['Pikeville', 'Prestonsburg', 'Paintsville', 'Hazard', 'Whitesburg', 'Inez', 'Elkhorn City', 'Belfry'];
const FIRST = ['Ridgeview', 'Hollow Creek', 'Blue Lick', 'Cedar Branch', 'Lone Oak', 'Sandy Fork', 'Mill Run', 'Coal Hollow', 'Laurel Gap', 'Stony Point', 'Rock Bridge', 'Big Shoal', 'Pine Knob', 'Hemlock', 'Redbud', 'Long Branch', 'Twin Rivers', 'Grassy Ridge', 'Copper Creek', 'Shelby Gap'];
const KIND = ['Dental', 'Diner', 'Pharmacy', 'Church', 'Auto Parts', 'Hardware', 'Apartments', 'Realty', 'Insurance', 'Daycare', 'Feed Store', 'Bakery', 'Law Office', 'Clinic', 'Motel', 'Laundromat', 'Rentals', 'Tax Service', 'Florist', 'Storage'];

// Notes are written in plain trade language. Each service has several ways of
// describing the same work so that a search has to match meaning, not words.
const SERVICES = {
  Plumbing: [
    'replaced leaking water heater in utility room',
    'cleared clogged kitchen drain line',
    'fixed dripping faucet and replaced cartridge',
    'burst pipe under crawlspace, patched and insulated',
    'toilet running constantly, new flapper and fill valve',
    'sewer backup in basement, snaked main line',
  ],
  Electrical: [
    'breaker keeps tripping, replaced panel breaker',
    'installed new outlets in break room',
    'flickering lights traced to loose neutral',
    'upgraded service panel to 200 amp',
    'parking lot lamps out, replaced ballasts',
    'wired backup generator transfer switch',
  ],
  HVAC: [
    'furnace not igniting, replaced flame sensor',
    'air conditioner blowing warm, recharged refrigerant',
    'seasonal tune-up on heat pump',
    'replaced blower motor on rooftop unit',
    'thermostat swapped for programmable model',
    'duct cleaning and new filters throughout',
  ],
  Roofing: [
    'storm damage, replaced missing shingles',
    'ceiling stain from roof leak, resealed flashing',
    'gutters pulled loose, rehung and cleaned',
    'full tear-off and new metal roof',
    'patched flat roof membrane over office',
  ],
  Landscaping: [
    'weekly mowing and trimming',
    'removed fallen tree after windstorm',
    'spread mulch and planted shrubs at entrance',
    'leaf cleanup and haul away',
    'regraded yard to fix standing water',
  ],
  Painting: [
    'interior repaint of waiting area',
    'pressure washed and stained deck',
    'exterior trim scraped and repainted',
    'touched up scuffed hallway walls',
  ],
};
const STATUS = ['Paid', 'Paid', 'Paid', 'Invoiced', 'Overdue'];

const rows = [];
const start = Date.UTC(2025, 0, 1);
const end = Date.UTC(2026, 9, 31);
const businesses = Array.from({ length: 90 }, () => `${pick(FIRST)} ${pick(KIND)}`);
for (let i = 0; i < 360; i++) {
  const service = pick(Object.keys(SERVICES));
  const note = pick(SERVICES[service]);
  const big = /full tear-off|upgraded service|new metal roof|water heater|rooftop|generator/.test(note);
  const billed = Math.round((big ? 1800 + r() * 6000 : 90 + r() * 1100) / 5) * 5;
  const status = pick(STATUS);
  const due = status === 'Paid' ? 0 : status === 'Invoiced' ? billed : Math.round(billed * (0.3 + r() * 0.7));
  const d = new Date(start + Math.floor(r() * (end - start)));
  rows.push({
    'Job ID': `J-${String(1001 + i)}`,
    Customer: pick(businesses),
    City: pick(CITIES),
    Service: service,
    Date: d.toISOString().slice(0, 10),
    Billed: billed,
    'Balance Due': due,
    Status: status,
    Notes: note,
  });
}
rows.sort((a, b) => a.Date.localeCompare(b.Date));
rows.forEach((row, i) => (row['Job ID'] = `J-${1001 + i}`));
writeFileSync(new URL('../public/sample.csv', import.meta.url), Papa.unparse(rows) + '\n');
console.log(`wrote ${rows.length} rows to public/sample.csv`);
