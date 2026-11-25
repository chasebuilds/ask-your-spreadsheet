// Pure ranking logic, shared by the page, the tests and the benchmark.

const STOP = new Set(
  'a an and the of in on at to for with by from or who whose which that is are was were be been has have had do does did any all show me find list get rows row jobs job customers customer people what where when there their them they it its this these those over under above below than more less least most about not no will wont keep keeps still'.split(' ')
);

export function tokenize(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9$.\s-]/g, ' ')
    .split(/\s+/)
    .map((t) => t.replace(/^[-.]+|[-.]+$/g, ''))
    .filter((t) => t && !STOP.has(t));
}

export function rowText(row, columns) {
  return columns
    .map((c) => (row[c] === '' || row[c] == null ? '' : `${c}: ${row[c]}`))
    .filter(Boolean)
    .join('; ');
}

// ---------- column profiling ----------

const MONEY = /^-?\$?\s*-?[\d,]+(\.\d+)?$/;
const DATE = /^\d{4}-\d{2}-\d{2}$|^\d{1,2}\/\d{1,2}\/\d{2,4}$/;

export function toNumber(v) {
  if (typeof v === 'number') return v;
  const s = String(v ?? '').trim();
  if (!MONEY.test(s)) return null;
  return Number(s.replace(/[$,\s]/g, ''));
}

export function toDate(v) {
  if (v instanceof Date) return v;
  const s = String(v ?? '').trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    return new Date(Date.UTC(y, +m[1] - 1, +m[2]));
  }
  return null;
}

export function profile(rows, columns) {
  return columns.map((name) => {
    const vals = rows.map((r) => r[name]).filter((v) => v !== '' && v != null);
    const numeric = vals.length > 0 && vals.every((v) => toNumber(v) !== null);
    const date = !numeric && vals.length > 0 && vals.every((v) => DATE.test(String(v).trim()));
    const distinct = new Set(vals.map((v) => String(v).toLowerCase()));
    const categorical = !numeric && !date && distinct.size <= Math.max(30, rows.length * 0.05) && distinct.size < rows.length;
    return { name, numeric, date, categorical, values: categorical ? [...distinct] : [] };
  });
}

// ---------- query parsing ----------

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const SEASONS = { winter: [11, 0, 1], spring: [2, 3, 4], summer: [5, 6, 7], fall: [8, 9, 10], autumn: [8, 9, 10] };
const GT = /(over|above|more than|greater than|at least|>=?|exceeding|upwards of)/;
const LT = /(under|below|less than|at most|<=?|no more than)/;
const OWE = /\b(owe|owes|owed|owing|balance|due|outstanding|unpaid amount)\b/;
const BILLED = /\b(billed|charged|cost|costs|spent|paid|invoice[ds]?|total|price|amount)\b/;

export function parseQuery(query, cols, refDate) {
  const q = ` ${query.toLowerCase()} `;
  const filters = [];

  // numbers with a comparison word: "over $500", "less than 1,000"
  const numRe = /(no more than|more than|greater than|less than|at least|at most|upwards of|exceeding|over|above|under|below|between|>=?|<=?)\s*\$?\s*([\d,]+(?:\.\d+)?)(k)?(?:\s*(?:and|-|to)\s*\$?\s*([\d,]+(?:\.\d+)?)(k)?)?/g;
  for (const m of q.matchAll(numRe)) {
    const op = m[1];
    const a = Number(m[2].replace(/,/g, '')) * (m[3] ? 1000 : 1);
    const target = pickNumberColumn(q, cols);
    if (!target) continue;
    if (op === 'between' && m[4]) {
      const b = Number(m[4].replace(/,/g, '')) * (m[5] ? 1000 : 1);
      filters.push({ kind: 'range', column: target, min: Math.min(a, b), max: Math.max(a, b), label: `${target} ${a} to ${b}` });
    } else if (LT.test(op)) filters.push({ kind: 'range', column: target, max: a, maxStrict: !/most|=|no more/.test(op), label: `${target} < ${a}` });
    else if (GT.test(op)) filters.push({ kind: 'range', column: target, min: a, minStrict: !/least|=/.test(op), label: `${target} > ${a}` });
  }

  // "who still owes" with no amount: balance above zero
  if (!filters.length && OWE.test(q)) {
    const owe = cols.find((c) => c.numeric && OWE.test(c.name.toLowerCase()));
    if (owe) filters.push({ kind: 'range', column: owe.name, min: 0, minStrict: true, label: `${owe.name} > 0` });
  }

  // categorical values named in the query: "in Pikeville", "plumbing"
  for (const c of cols.filter((c) => c.categorical)) {
    const hits = c.values.filter((v) => v.length > 2 && new RegExp(`[^a-z0-9]${escapeRe(v)}s?[^a-z0-9]`).test(q));
    // keep the longest match only ("elkhorn city" beats "city")
    const best = hits.filter((h) => !hits.some((o) => o !== h && o.includes(h)));
    if (best.length) filters.push({ kind: 'in', column: c.name, values: best, label: `${c.name} = ${best.join(' or ')}` });
  }

  // dates: month names, seasons, years, "last"/"this"
  const dateCol = cols.find((c) => c.date);
  if (dateCol) {
    const ref = refDate ?? new Date();
    const yearM = q.match(/\b(20\d{2})\b/);
    let year = yearM ? +yearM[1] : null;
    let months = null;
    const season = Object.keys(SEASONS).find((s) => q.includes(` ${s}`));
    if (season) months = SEASONS[season];
    const named = MONTHS.map((m, i) => (new RegExp(`\\b${m}\\b`).test(q) ? i : -1)).filter((i) => i >= 0);
    if (named.length) months = named;
    const last = /\blast\b/.test(q);
    const thisWord = /\bthis\b/.test(q);
    if (year === null && /\blast year\b/.test(q)) {
      year = ref.getUTCFullYear() - 1;
    } else if (year === null && /\bthis year\b/.test(q)) {
      year = ref.getUTCFullYear();
    } else if (year === null && months && (last || thisWord)) {
      // "last spring" = most recent finished occurrence before the reference date
      const refM = ref.getUTCMonth();
      const endM = months[months.length - 1];
      const startM = months[0];
      year = ref.getUTCFullYear();
      if (last && (refM <= endM || (startM > endM && refM >= startM))) year -= 1;
      if (startM > endM) year -= refM >= startM ? 0 : 1; // winter spans the new year
    }
    if (months || year !== null) {
      filters.push({ kind: 'date', column: dateCol.name, months, year, wraps: months && months[0] > months[months.length - 1], label: `${dateCol.name} ${season ?? (months ? months.map((m) => MONTHS[m]).join('/') : '')} ${year ?? ''}`.trim() });
    }
  }
  return filters;
}

function pickNumberColumn(q, cols) {
  const nums = cols.filter((c) => c.numeric);
  if (!nums.length) return null;
  const want = OWE.test(q) ? OWE : BILLED.test(q) ? BILLED : null;
  if (want) {
    const hit = nums.find((c) => want.test(c.name.toLowerCase()));
    if (hit) return hit.name;
  }
  // a bare amount ("under $200") most often means the charge, not what is still owed
  return (nums.find((c) => /amount|total|price|cost|billed|charge/i.test(c.name)) ?? nums[0]).name;
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function passes(row, f) {
  if (f.kind === 'range') {
    const v = toNumber(row[f.column]);
    if (v === null) return false;
    if (f.min !== undefined && (f.minStrict ? v <= f.min : v < f.min)) return false;
    if (f.max !== undefined && (f.maxStrict ? v >= f.max : v > f.max)) return false;
    return true;
  }
  if (f.kind === 'in') return f.values.includes(String(row[f.column] ?? '').toLowerCase());
  if (f.kind === 'date') {
    const d = toDate(row[f.column]);
    if (!d) return false;
    const m = d.getUTCMonth();
    let y = d.getUTCFullYear();
    if (f.months && !f.months.includes(m)) return false;
    // a winter that wraps (Dec-Feb) is labelled by the year it starts in
    if (f.wraps && m < f.months[0]) y -= 1;
    if (f.year !== null && y !== f.year) return false;
    return true;
  }
  return true;
}

// ---------- keyword (BM25) ----------

export function buildKeywordIndex(texts) {
  const docs = texts.map((t) => tokenize(t));
  const df = new Map();
  for (const d of docs) for (const t of new Set(d)) df.set(t, (df.get(t) ?? 0) + 1);
  const avg = docs.reduce((s, d) => s + d.length, 0) / Math.max(docs.length, 1);
  return { docs, df, avg, n: docs.length };
}

export function keywordScores(index, query, k1 = 1.2, b = 0.75) {
  const terms = [...new Set(tokenize(query))];
  return index.docs.map((d) => {
    let s = 0;
    for (const t of terms) {
      const tf = d.filter((x) => x === t || (x.length > 3 && x.startsWith(t) && x.length - t.length <= 2)).length;
      if (!tf) continue;
      const df = index.df.get(t) ?? 1;
      const idf = Math.log(1 + (index.n - df + 0.5) / (df + 0.5));
      s += (idf * tf * (k1 + 1)) / (tf + k1 * (1 - b + (b * d.length) / index.avg));
    }
    return s;
  });
}

// ---------- combining ----------

export function cosine(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s; // vectors are normalized
}

function minmax(xs) {
  const lo = Math.min(...xs);
  const hi = Math.max(...xs);
  return xs.map((x) => (hi > lo ? (x - lo) / (hi - lo) : 0));
}

/**
 * Rank rows. mode: 'semantic' | 'keyword' | 'hybrid'.
 * Hybrid = 0.65 semantic + 0.35 keyword, and rows that pass every filter
 * parsed from the query are placed ahead of rows that do not.
 */
export function rank({ mode, semantic, keyword, rows, filters = [] }) {
  const sem = semantic ? minmax(semantic) : rows.map(() => 0);
  const kw = keyword ? minmax(keyword) : rows.map(() => 0);
  const scored = rows.map((row, i) => {
    const matched = filters.filter((f) => passes(row, f)).length;
    let score;
    if (mode === 'semantic') score = sem[i];
    else if (mode === 'keyword') score = kw[i];
    else score = 0.65 * sem[i] + 0.35 * kw[i] + (filters.length ? matched / filters.length : 0) * 2;
    return { i, score, sem: sem[i], kw: kw[i], matched, of: filters.length };
  });
  return scored.sort((a, b) => b.score - a.score || a.i - b.i);
}

// ---------- metrics ----------

export function recallAt(rankedIdx, relevant, k = 5) {
  const top = rankedIdx.slice(0, k);
  const hit = top.filter((i) => relevant.has(i)).length;
  return hit / Math.min(relevant.size, k);
}

export function reciprocalRank(rankedIdx, relevant) {
  const pos = rankedIdx.findIndex((i) => relevant.has(i));
  return pos < 0 ? 0 : 1 / (pos + 1);
}
