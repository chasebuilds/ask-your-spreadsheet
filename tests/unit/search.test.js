import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import Papa from 'papaparse';
import { tokenize, toNumber, toDate, profile, parseQuery, passes, buildKeywordIndex, keywordScores, rank, recallAt, reciprocalRank } from '../../src/search.js';
import { QUERIES } from '../../bench/queries.mjs';

const { data: rows, meta } = Papa.parse(readFileSync(new URL('../../public/sample.csv', import.meta.url), 'utf8').trim(), { header: true });
const cols = profile(rows, meta.fields);
const ref = new Date(Date.UTC(2026, 9, 31));

describe('parsing helpers', () => {
  it('tokenizes and drops stop words', () => {
    expect(tokenize('Customers in Pikeville who owe')).toEqual(['pikeville', 'owe']);
  });
  it('reads money and dates', () => {
    expect(toNumber('$1,250.50')).toBe(1250.5);
    expect(toNumber('abc')).toBeNull();
    expect(toDate('3/4/2026').toISOString().slice(0, 10)).toBe('2026-03-04');
  });
  it('profiles the sample columns', () => {
    const by = Object.fromEntries(cols.map((c) => [c.name, c]));
    expect(by.Billed.numeric).toBe(true);
    expect(by.Date.date).toBe(true);
    expect(by.City.categorical).toBe(true);
    expect(by.Notes.categorical).toBe(false);
  });
});

describe('parseQuery', () => {
  it('reads a place and an owed amount', () => {
    const f = parseQuery('customers in Pikeville who owe over $500', cols, ref);
    expect(f).toContainEqual(expect.objectContaining({ kind: 'range', column: 'Balance Due', min: 500 }));
    expect(f).toContainEqual(expect.objectContaining({ kind: 'in', column: 'City', values: ['pikeville'] }));
  });
  it('resolves "last spring" against the newest date in the sheet', () => {
    const d = parseQuery('plumbing jobs last spring', cols, ref).find((x) => x.kind === 'date');
    expect(d).toMatchObject({ months: [2, 3, 4], year: 2026 });
    expect(parseQuery('plumbing last spring', cols, new Date(Date.UTC(2026, 3, 1))).find((x) => x.kind === 'date').year).toBe(2025);
  });
  it('handles between, k suffix and "no more than"', () => {
    expect(parseQuery('billed between 300 and 600', cols, ref)[0]).toMatchObject({ min: 300, max: 600 });
    expect(parseQuery('billed over 2k', cols, ref)[0]).toMatchObject({ min: 2000 });
    expect(parseQuery('billed no more than 100', cols, ref)[0]).toMatchObject({ max: 100, maxStrict: false });
  });
  it('a bare "owes" means a balance above zero', () => {
    expect(parseQuery('who still owes money', cols, ref)[0]).toMatchObject({ column: 'Balance Due', min: 0, minStrict: true });
  });
  it('prefers the longest place name', () => {
    expect(parseQuery('jobs in Elkhorn City', cols, ref).find((x) => x.column === 'City').values).toEqual(['elkhorn city']);
  });
  it('filters agree with the benchmark labels on filter queries', () => {
    for (const item of QUERIES.filter((x) => x.kind === 'filter')) {
      const fs = parseQuery(item.q, cols, ref);
      const got = rows.filter((r) => fs.every((f) => passes(r, f)));
      expect(got.length, item.q).toBe(rows.filter(item.relevant).length);
    }
  });
});

describe('ranking', () => {
  const texts = ['plumbing leak fixed', 'roof shingles', 'plumbing drain clog'];
  it('BM25 ranks keyword matches first', () => {
    const s = keywordScores(buildKeywordIndex(texts), 'plumbing drain');
    expect(s[2]).toBeGreaterThan(s[0]);
    expect(s[1]).toBe(0);
  });
  it('hybrid puts filter matches ahead', () => {
    const r = [{ City: 'A' }, { City: 'B' }];
    const out = rank({ mode: 'hybrid', rows: r, semantic: [1, 0], keyword: [1, 0], filters: [{ kind: 'in', column: 'City', values: ['b'] }] });
    expect(out[0].i).toBe(1);
  });
  it('metrics', () => {
    expect(recallAt([3, 1, 2], new Set([1, 9]), 2)).toBe(0.5);
    expect(reciprocalRank([3, 1, 2], new Set([2]))).toBeCloseTo(1 / 3);
    expect(reciprocalRank([3], new Set([2]))).toBe(0);
  });
  it('every benchmark query has at least one correct row', () => {
    expect(QUERIES.length).toBeGreaterThanOrEqual(40);
    for (const q of QUERIES) expect(rows.some(q.relevant), q.q).toBe(true);
  });
});
