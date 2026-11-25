// Labeled queries for the benchmark. Each `relevant` predicate defines the
// correct rows from the sheet's own columns, so the labels cannot drift from the data.
// Kinds: "meaning" (paraphrase of a note, few shared words), "filter" (names a
// value, number or date), "mixed" (both).

const n = (v) => Number(v);
const note = (...ps) => (r) => ps.some((p) => r.Notes.includes(p));
const month = (r) => n(r.Date.slice(5, 7)) - 1;
const year = (r) => n(r.Date.slice(0, 4));
const inSeason = (r, ms, y) => ms.includes(month(r)) && year(r) === y;
const SPRING = [2, 3, 4];
const SUMMER = [5, 6, 7];
const FALL = [8, 9, 10];

export const QUERIES = [
  // meaning
  { kind: 'meaning', q: 'no hot water', relevant: note('water heater') },
  { kind: 'meaning', q: 'sink will not drain', relevant: note('clogged kitchen drain') },
  { kind: 'meaning', q: 'leaky tap', relevant: note('dripping faucet') },
  { kind: 'meaning', q: 'frozen pipe broke', relevant: note('burst pipe') },
  { kind: 'meaning', q: 'toilet keeps filling', relevant: note('toilet running') },
  { kind: 'meaning', q: 'sewage coming up in the basement', relevant: note('sewer backup') },
  { kind: 'meaning', q: 'power keeps cutting out', relevant: note('breaker keeps tripping') },
  { kind: 'meaning', q: 'added plugs to a room', relevant: note('new outlets') },
  { kind: 'meaning', q: 'lights blinking on and off', relevant: note('flickering lights') },
  { kind: 'meaning', q: 'standby power for outages', relevant: note('generator') },
  { kind: 'meaning', q: 'heater will not turn on', relevant: note('furnace not igniting') },
  { kind: 'meaning', q: 'AC not cooling', relevant: note('air conditioner blowing warm') },
  { kind: 'meaning', q: 'annual maintenance visit on heating system', relevant: note('seasonal tune-up') },
  { kind: 'meaning', q: 'fan motor died on the roof unit', relevant: note('blower motor') },
  { kind: 'meaning', q: 'water spot on the ceiling', relevant: note('ceiling stain') },
  { kind: 'meaning', q: 'wind blew shingles off', relevant: note('storm damage') },
  { kind: 'meaning', q: 'rain gutters fell down', relevant: note('gutters pulled loose') },
  { kind: 'meaning', q: 'brand new roof', relevant: note('full tear-off') },
  { kind: 'meaning', q: 'grass cutting', relevant: note('weekly mowing') },
  { kind: 'meaning', q: 'tree came down in a storm', relevant: note('fallen tree') },
  { kind: 'meaning', q: 'yard floods after rain', relevant: note('standing water') },
  { kind: 'meaning', q: 'raking leaves in autumn', relevant: note('leaf cleanup') },
  { kind: 'meaning', q: 'deck refinishing', relevant: note('stained deck') },
  { kind: 'meaning', q: 'paint the lobby', relevant: note('waiting area') },

  // filter
  { kind: 'filter', q: 'customers in Pikeville who owe over $500', relevant: (r) => r.City === 'Pikeville' && n(r['Balance Due']) > 500 },
  { kind: 'filter', q: 'overdue jobs in Hazard', relevant: (r) => r.City === 'Hazard' && r.Status === 'Overdue' },
  { kind: 'filter', q: 'plumbing jobs last spring', relevant: (r) => r.Service === 'Plumbing' && inSeason(r, SPRING, 2026) },
  { kind: 'filter', q: 'roofing in summer 2025', relevant: (r) => r.Service === 'Roofing' && inSeason(r, SUMMER, 2025) },
  { kind: 'filter', q: 'jobs billed over $5,000', relevant: (r) => n(r.Billed) > 5000 },
  { kind: 'filter', q: 'Whitesburg balance due more than 1000', relevant: (r) => r.City === 'Whitesburg' && n(r['Balance Due']) > 1000 },
  { kind: 'filter', q: 'electrical work in Paintsville', relevant: (r) => r.Service === 'Electrical' && r.City === 'Paintsville' },
  { kind: 'filter', q: 'HVAC jobs in January 2026', relevant: (r) => r.Service === 'HVAC' && month(r) === 0 && year(r) === 2026 },
  { kind: 'filter', q: 'invoiced landscaping', relevant: (r) => r.Service === 'Landscaping' && r.Status === 'Invoiced' },
  { kind: 'filter', q: 'painting jobs under $200', relevant: (r) => r.Service === 'Painting' && n(r.Billed) < 200 },
  { kind: 'filter', q: 'Belfry jobs in fall 2025', relevant: (r) => r.City === 'Belfry' && inSeason(r, FALL, 2025) },
  { kind: 'filter', q: 'who in Elkhorn City still owes money', relevant: (r) => r.City === 'Elkhorn City' && n(r['Balance Due']) > 0 },
  { kind: 'filter', q: 'Inez jobs billed between 300 and 600', relevant: (r) => r.City === 'Inez' && n(r.Billed) >= 300 && n(r.Billed) <= 600 },

  // mixed
  { kind: 'mixed', q: 'water leaks in Prestonsburg', relevant: (r) => r.City === 'Prestonsburg' && note('leaking', 'dripping', 'burst pipe', 'roof leak')(r) },
  { kind: 'mixed', q: 'no heat calls in Pikeville', relevant: (r) => r.City === 'Pikeville' && note('furnace not igniting')(r) },
  { kind: 'mixed', q: 'storm cleanup in Hazard', relevant: (r) => r.City === 'Hazard' && note('fallen tree', 'storm damage')(r) },
  { kind: 'mixed', q: 'overdue roof repairs', relevant: (r) => r.Service === 'Roofing' && r.Status === 'Overdue' },
  { kind: 'mixed', q: 'drain problems that still owe over $100', relevant: (r) => note('drain', 'sewer backup')(r) && n(r['Balance Due']) > 100 },
  { kind: 'mixed', q: 'big electrical upgrades billed over $2,000', relevant: (r) => r.Service === 'Electrical' && n(r.Billed) > 2000 },
  { kind: 'mixed', q: 'cooling problems in summer 2026', relevant: (r) => note('air conditioner blowing warm')(r) && inSeason(r, SUMMER, 2026) },
  { kind: 'mixed', q: 'new roofs in Paintsville', relevant: (r) => r.City === 'Paintsville' && note('full tear-off')(r) },
];
