import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { embed, loadModel } from './embed.js';
import { rowText, profile, parseQuery, buildKeywordIndex, keywordScores, cosine, rank, toDate } from './search.js';

const $ = (id) => document.getElementById(id);
const EXAMPLES = ['customers in Pikeville who owe over $500', 'plumbing jobs last spring', 'water spot on the ceiling', 'power keeps cutting out', 'overdue roof repairs', 'jobs billed over $5,000'];
const state = {};

function setStatus(text, frac) {
  $('status').textContent = text;
  if (frac !== undefined) $('progress').style.width = `${Math.round(frac * 100)}%`;
}

async function readFile(file) {
  if (/\.(xlsx|xls)$/i.test(file.name)) {
    const wb = XLSX.read(await file.arrayBuffer(), { cellDates: true });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false, dateNF: 'yyyy-mm-dd' });
    return { rows, columns: rows.length ? Object.keys(rows[0]) : [] };
  }
  const { data, meta } = Papa.parse((await file.text()).trim(), { header: true, skipEmptyLines: true });
  return { rows: data, columns: meta.fields };
}

async function load(name, { rows, columns }) {
  document.body.dataset.ready = 'false';
  $('ask').hidden = true;
  if (!rows.length) return setStatus(`${name}: no rows found.`);
  const capped = rows.slice(0, 5000);
  setStatus('Loading the model (first visit only, about 23 MB)...', 0);
  await loadModel((p) => p.status === 'progress' && p.total && setStatus(`Loading the model: ${Math.round(p.progress)}%`, p.progress / 100));
  const texts = capped.map((r) => rowText(r, columns));
  const t0 = performance.now();
  const vecs = await embed(texts, { onBatch: (done, total) => setStatus(`Reading rows: ${done} of ${total}`, done / total) });
  const dates = capped.map((r) => columns.map((c) => toDate(r[c])).find(Boolean)).filter(Boolean);
  Object.assign(state, {
    rows: capped,
    columns,
    vecs,
    kw: buildKeywordIndex(texts),
    cols: profile(capped, columns),
    refDate: dates.length ? new Date(Math.max(...dates)) : new Date(),
  });
  const cut = rows.length > capped.length ? ` (first ${capped.length} of ${rows.length})` : '';
  setStatus(`${name}: ${capped.length} rows${cut} ready in ${((performance.now() - t0) / 1000).toFixed(1)} s. Ask a question.`, 1);
  $('ask').hidden = false;
  $('examples').replaceChildren(
    ...(name === 'sample.csv' ? EXAMPLES : []).map((q) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip';
      b.textContent = q;
      b.onclick = () => {
        $('q').value = q;
        search();
      };
      return b;
    })
  );
  $('results').replaceChildren();
  $('filters').replaceChildren();
  document.body.dataset.ready = 'true';
  $('q').focus();
}

async function search() {
  const q = $('q').value.trim();
  if (!q || !state.rows) return;
  document.body.dataset.searching = 'true';
  const [qv] = await embed([q]);
  const mode = $('mode').value;
  const filters = mode === 'hybrid' ? parseQuery(q, state.cols, state.refDate) : [];
  const ranked = rank({
    mode,
    rows: state.rows,
    filters,
    semantic: state.vecs.map((v) => cosine(v, qv)),
    keyword: keywordScores(state.kw, q),
  }).slice(0, 10);

  $('filters').replaceChildren(
    ...filters.map((f) => Object.assign(document.createElement('span'), { className: 'chip on', textContent: f.label }))
  );
  const head = document.createElement('tr');
  for (const c of ['#', 'Match', ...state.columns]) head.append(Object.assign(document.createElement('th'), { textContent: c }));
  const body = ranked.map((s, n) => {
    const tr = document.createElement('tr');
    if (s.of && s.matched === s.of) tr.className = 'hit';
    const why = `meaning ${(s.sem * 100).toFixed(0)}, words ${(s.kw * 100).toFixed(0)}${s.of ? `, filters ${s.matched}/${s.of}` : ''}`;
    for (const v of [n + 1, why, ...state.columns.map((c) => state.rows[s.i][c])]) tr.append(Object.assign(document.createElement('td'), { textContent: v }));
    return tr;
  });
  $('results').replaceChildren(Object.assign(document.createElement('thead'), {}), document.createElement('tbody'));
  $('results').tHead.append(head);
  $('results').tBodies[0].append(...body);
  document.body.dataset.searching = 'false';
  document.body.dataset.results = String(ranked.length);
}

$('form').onsubmit = (e) => {
  e.preventDefault();
  search();
};
$('mode').onchange = search;
$('sample').onclick = async () => {
  const text = await (await fetch('./sample.csv')).text();
  const { data, meta } = Papa.parse(text.trim(), { header: true });
  await load('sample.csv', { rows: data, columns: meta.fields });
};
$('file').onchange = async (e) => e.target.files[0] && load(e.target.files[0].name, await readFile(e.target.files[0]));
const drop = $('drop');
drop.ondragover = (e) => {
  e.preventDefault();
  drop.classList.add('over');
};
drop.ondragleave = () => drop.classList.remove('over');
drop.ondrop = async (e) => {
  e.preventDefault();
  drop.classList.remove('over');
  const f = e.dataTransfer.files[0];
  if (f) load(f.name, await readFile(f));
};
window.addEventListener('unhandledrejection', (e) => setStatus(`Something went wrong: ${e.reason?.message ?? e.reason}`));
