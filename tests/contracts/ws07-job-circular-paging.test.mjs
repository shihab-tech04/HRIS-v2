import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fetchJobCircularPage, appendUniqueJobCirculars } from '../../src/live/jobCircularPaging.mjs';

const manager = readFileSync(new URL('../../src/live/JobCircularManager.tsx', import.meta.url), 'utf8');

test('HR11 recruiter can advance past 100 jobs without silently truncating the directory', async () => {
  const jobs = Array.from({ length: 237 }, (_, i) => ({ id: String(i) }));
  const calls = [];
  const getPage = async (from, to) => {
    calls.push([from, to]);
    return { data: jobs.slice(from, to + 1), error: null };
  };
  let all = [];
  let offset = 0;
  let hasMore = true;
  while (hasMore) {
    const page = await fetchJobCircularPage(getPage, offset);
    all = appendUniqueJobCirculars(all, page.rows);
    offset = page.nextOffset;
    hasMore = page.hasMore;
  }
  assert.equal(all.length, 237);
  assert.deepEqual(calls, [[0, 99], [100, 199], [200, 299]]);
  assert.equal(offset, 237);
});

test('exactly 100 rows still offer one final empty-page check', async () => {
  const jobs = Array.from({ length: 100 }, (_, i) => ({ id: String(i) }));
  const first = await fetchJobCircularPage(async (start,end) => ({ data: jobs.slice(start, end + 1), error: null }), 0);
  assert.equal(first.hasMore, true);
  const last = await fetchJobCircularPage(async (start,end) => ({ data: jobs.slice(start, end + 1), error: null }), first.nextOffset);
  assert.equal(last.hasMore, false);
  assert.deepEqual(last.rows, []);
});

test('later-page server errors remain errors and never corrupt existing rows', async () => {
  const denied = new Error('Not authorized to read tenant');
  const existing = [{ id:'old' }];
  await assert.rejects(fetchJobCircularPage(async () => ({ data: null, error: denied }), 100), err => err === denied);
  assert.deepEqual(existing, [{ id:'old' }]);
});

test('an overlapped page cannot duplicate job actions or replace previously loaded rows', () => {
  assert.deepEqual(appendUniqueJobCirculars([{ id:'a', title:'original' },{ id:'b', title:'second' }],
    [{ id:'b', title:'overlap' }, { id:'c', title:'third' },{ id:'c', title:'duplicate' }]),
    [{ id:'a', title:'original' },{ id:'b', title:'second' },{ id:'c', title:'third' }]);
});

test('invalid offsets, missing data and oversized pages fail closed', async () => {
  const fetch = async () => ({ data: [], error: null });
  await assert.rejects(fetchJobCircularPage(fetch, -1), RangeError);
  await assert.rejects(fetchJobCircularPage(fetch, 0, 0), RangeError);
  await assert.rejects(fetchJobCircularPage(async () => ({ data:null, error:null }), 0), /Invalid job circular page/);
  await assert.rejects(fetchJobCircularPage(async () => ({ data: Array(101).fill({id:'x'}), error:null }), 0), /Invalid job circular page/);
});

test('the actual HR11 screen uses a tenant-filtered stable page range with generation checks and no writes', () => {
  assert.match(manager, /\.from\('jobs'\)[\s\S]*?\.eq\('tenant_id', tenantId\)[\s\S]*?\.order\('created_at', \{ ascending: false \}\)[\s\S]*?\.order\('id', \{ ascending: true \}\)[\s\S]*?\.range\(from, to\)/);
  assert.match(manager, /fetchJobCircularPage\(readJobRange, 0, JOB_PAGE_SIZE\)/);
  assert.match(manager, /fetchJobCircularPage\(readJobRange, nextJobOffset, JOB_PAGE_SIZE\)/);
  assert.match(manager, /const requestId = jobListGeneration\.current/);
  assert.match(manager, /if \(requestId !== jobListGeneration\.current\) return/);
  assert.match(manager, /appendUniqueJobCirculars\(previous, page\.rows as Job\[\]\)/);
  assert.doesNotMatch(manager, /\.limit\(100\);\s*if \(!current\) return;\s*if \(records\.error\)/);
  assert.match(manager, /setMoreJobsError\(locale === 'bn'/);
  assert.match(manager, /canManage && <button type="button" onClick=\{openCreate\}/);
});
