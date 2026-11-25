// Benchmark: embeds the sample sheet with the same model the page uses, runs
// every labeled query in three modes and writes recall@5 and MRR.
// Usage: node bench/run.mjs   (first run downloads the model, about 23 MB)
import { readFileSync, writeFileSync } from 'node:fs';
import Papa from 'papaparse';
import { QUERIES } from './queries.mjs';
import { embed, MODEL } from '../src/embed.js';
import { rowText, profile, parseQuery, buildKeywordIndex, keywordScores, cosine, rank, recallAt, reciprocalRank, toDate } from '../src/search.js';

const csv = readFileSync(new URL('../public/sample.csv', import.meta.url), 'utf8');
const { data: rows, meta } = Papa.parse(csv.trim(), { header: true });
const columns = meta.fields;
const texts = rows.map((r) => rowText(r, columns));
const cols = profile(rows, columns);
const refDate = new Date(Math.max(...rows.map((r) => toDate(r.Date))));

const t0 = Date.now();
const vecs = await embed(texts);
const embedMs = Date.now() - t0;
const kwIndex = buildKeywordIndex(texts);

const MODES = ['keyword', 'semantic', 'hybrid'];
const agg = {};
const perQuery = [];
for (const item of QUERIES) {
  const relevant = new Set(rows.map((r, i) => (item.relevant(r) ? i : -1)).filter((i) => i >= 0));
  if (!relevant.size) throw new Error(`no relevant rows for "${item.q}"`);
  const [qv] = await embed([item.q]);
  const semantic = vecs.map((v) => cosine(v, qv));
  const keyword = keywordScores(kwIndex, item.q);
  const filters = parseQuery(item.q, cols, refDate);
  const line = { q: item.q, kind: item.kind, relevant: relevant.size };
  for (const mode of MODES) {
    const order = rank({ mode, semantic, keyword, rows, filters }).map((s) => s.i);
    const rec = recallAt(order, relevant, 5);
    const rr = reciprocalRank(order, relevant);
    line[mode] = rec;
    for (const k of [item.kind, 'all']) {
      agg[k] ??= { n: 0 };
      agg[k].n += 0; // counted below
      agg[k][mode] ??= { rec: 0, rr: 0 };
      agg[k][mode].rec += rec;
      agg[k][mode].rr += rr;
    }
  }
  for (const k of [item.kind, 'all']) agg[k].n += 1;
  perQuery.push(line);
}

const pct = (x) => `${(x * 100).toFixed(1)}%`;
const LABEL = { meaning: 'Meaning (paraphrased notes)', filter: 'Filters (place, amount, date)', mixed: 'Mixed', all: '**All**' };
let table = '| Query set | Queries | Keyword R@5 | Keyword MRR | Semantic R@5 | Semantic MRR | Hybrid R@5 | Hybrid MRR |\n|---|---:|---:|---:|---:|---:|---:|---:|\n';
for (const k of ['meaning', 'filter', 'mixed', 'all']) {
  const a = agg[k];
  const cells = MODES.flatMap((m) => [pct(a[m].rec / a.n), (a[m].rr / a.n).toFixed(3)]);
  if (k === 'all') cells[4] = `**${cells[4]}**`;
  table += `| ${LABEL[k]} | ${a.n} | ${cells.join(' | ')} |\n`;
}
const summary = `${rows.length} synthetic rows, ${QUERIES.length} labeled queries, model \`${MODEL}\` (q8). Embedding the sheet took ${(embedMs / 1000).toFixed(1)} s in Node on the machine that ran it.`;
console.log(summary + '\n\n' + table);

writeFileSync(new URL('./results.json', import.meta.url), JSON.stringify({ model: MODEL, rows: rows.length, queries: QUERIES.length, agg, perQuery }, null, 2) + '\n');

const readmeUrl = new URL('../README.md', import.meta.url);
try {
  const readme = readFileSync(readmeUrl, 'utf8');
  const block = `<!-- benchmark:start -->\n${table}\n${summary}\n<!-- benchmark:end -->`;
  writeFileSync(readmeUrl, readme.replace(/<!-- benchmark:start -->[\s\S]*<!-- benchmark:end -->/, block));
} catch {
  // README not written yet
}
