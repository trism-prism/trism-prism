import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { selectLatest, fetchPublicRepos, refresh, renderLatest } from '../scripts/refresh.mjs';
import { renderReadme, latestSection, activitySection } from '../scripts/build.mjs';

const counts = { commits: 10, pullRequests: 5, issues: 1, reviews: 0 };

const repo = (id, overrides = {}) => ({ id, name: `project-${id}`, html_url: `https://github.com/trism-prism/project-${id}`, owner: { login: 'trism-prism' }, private: false, visibility: 'public', fork: false, archived: false, created_at: '2025-01-01T00:00:00Z', pushed_at: '2025-01-01T00:00:00Z', description: 'A public project.', language: 'JavaScript', ...overrides });
const response = (repos, link = '') => new Response(JSON.stringify(repos), { headers: { link } });

test('latest projects are name-only buttons ordered by code push recency', () => {
  const recent = repo(1, { pushed_at: '2026-11-03T09:00:00Z' });
  const older = repo(2, { pushed_at: '2026-11-02T09:00:00Z' });
  assert.deepEqual(selectLatest([older, recent]).map(r => r.id), [1, 2]);
  const output = renderLatest([recent]);
  assert(!output.includes('A public project.'));
  assert(!output.includes('JavaScript'));
});

test('at most three projects with deterministic ties', () => {
  assert.deepEqual(selectLatest([repo(1), repo(3), repo(2), repo(4)]).map(r => r.id), [4, 3, 2]);
});

test('a new push to an older repo leads; creation and metadata edits do not affect recency', () => {
  const edited = repo(1, { created_at: '2020-01-01T00:00:00Z', pushed_at: '2026-11-03T12:00:00Z' });
  const renamed = repo(2, { name: 'renamed', html_url: 'https://github.com/trism-prism/renamed', created_at: '2026-11-03T12:00:00Z', updated_at: '2026-11-03T13:00:00Z' });
  assert.deepEqual(selectLatest([renamed, edited]).map(r => r.id), [1, 2]);
  assert.deepEqual(selectLatest([repo(3, { pushed_at: null })]), []);
});

test('only public owned eligible repositories show, featured repositories remain eligible', () => {
  const sample = [repo(1, { private: true }), repo(2, { archived: true }), repo(3, { fork: true }), repo(4, { owner: { login: 'elsewhere' } }), repo(5, { name: 'trism-prism', html_url: 'https://github.com/trism-prism/trism-prism' }), repo(6, { name: 'lore-tool-pages', html_url: 'https://github.com/trism-prism/lore-tool-pages' }), repo(7, { name: 'docs-qa-copilot', html_url: 'https://github.com/trism-prism/docs-qa-copilot' })];
  assert.deepEqual(selectLatest(sample).map(r => r.id), [7]);
  assert.deepEqual(selectLatest([]), []);
});

test('descriptions and language are omitted entirely', () => {
  const text = renderLatest([repo(1, { description: '<script>alert("x")</script> & [click](javascript:evil)\n' + 'a'.repeat(400), language: '<b>JS</b>' })]);
  assert(!text.includes('<script>'));
  assert(!text.includes('<b>JS'));
  assert(!text.includes('&lt;script&gt;'));
  assert(text.startsWith('<p>') && text.endsWith('</p>') && (text.match(/<p>/g) || []).length === 1);
  assert(!text.includes('<strong>'));
  assert(!text.includes('a'.repeat(300)));
  assert(!renderLatest([repo(2, { description: null, language: null })]).includes('undefined'));
  assert(renderLatest([]).includes('No public projects'));
});

test('latest project links include the matching generated stone plaque', () => {
  assert(renderLatest([repo(1), repo(2)]).includes('src="assets/latest-1.svg"'));
  assert(renderLatest([repo(1), repo(2)]).includes('src="assets/latest-2.svg"'));
});

test('invalid repository metadata fails closed', () => {
  assert.throws(() => selectLatest([repo(1, { html_url: 'javascript:alert(1)' })]));
  assert.throws(() => selectLatest([repo(1, { pushed_at: 'bad' })]));
  assert.throws(() => selectLatest([repo(1), repo(1)]));
  assert.throws(() => latestSection('<!-- latest:start -->\na\n<!-- latest:end -->\n<!-- latest:start -->'));
});

test('all pages are fetched, including a short page with a next link', async () => {
  let calls = 0;
  const repos = await fetchPublicRepos(async url => {
    calls++;
    assert(new URL(url).searchParams.get('page') === String(calls));
    return calls === 1 ? response(Array.from({ length: 100 }, (_, i) => repo(i))) : calls === 2 ? response([repo(100)], '<https://api.github.com/users/trism-prism/repos?page=3>; rel="next"') : response([repo(101)]);
  });
  assert.equal(calls, 3);
  assert.equal(repos.length, 102);
});

test('failed, malformed or repeated pages reject an incomplete scan', async () => {
  await assert.rejects(fetchPublicRepos(async () => new Response('', { status: 403 })), /HTTP 403/);
  await assert.rejects(fetchPublicRepos(async () => response({ message: 'bad' })), /array/);
  await assert.rejects(fetchPublicRepos(async () => response([repo(1)], '<next>; rel="next"')), /repeated/);
});

test('a failed contribution query keeps the chart and still refreshes projects', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'profile-test-'));
  writeFileSync(directory + '/README.md', renderReadme());
  const before = readFileSync(directory + '/README.md', 'utf8');
  const fetcher = async url => String(url).includes('graphql') ? new Response('', { status: 502 }) : response([repo(1)]);
  const previous = process.env.GITHUB_TOKEN;
  process.env.GITHUB_TOKEN = 't';
  try {
    assert.equal(await refresh({ directory, fetcher }), true);
  } finally {
    if (previous === undefined) delete process.env.GITHUB_TOKEN; else process.env.GITHUB_TOKEN = previous;
  }
  const after = readFileSync(directory + '/README.md', 'utf8');
  assert(after.includes('project-1'));
  assert.equal(activitySection(after), activitySection(before));
});

test('refresh is stable, follows new pushes and preserves README/plaques on failure', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'profile-test-'));
  writeFileSync(directory + '/README.md', renderReadme());
  const options = { directory, counts, fetcher: async () => response([repo(1)]) };
  assert.equal(await refresh(options), true);
  const readme = readFileSync(directory + '/README.md', 'utf8');
  const plaque = readFileSync(directory + '/assets/latest-1.svg', 'utf8');
  assert(plaque.includes('project-1'));
  assert.equal(await refresh(options), false);
  let page = 0;
  await assert.rejects(refresh({ ...options, fetcher: async () => ++page === 1 ? response(Array.from({ length: 100 }, (_, i) => repo(i))) : new Response('', { status: 503 }) }), /HTTP 503/);
  assert.equal(readFileSync(directory + '/README.md', 'utf8'), readme);
  assert.equal(readFileSync(directory + '/assets/latest-1.svg', 'utf8'), plaque);
  assert.equal(readme, renderReadme(latestSection(readme), activitySection(readme)));
  assert(readFileSync(directory + '/assets/activity.svg', 'utf8').includes('Commits'));
  await refresh({ ...options, fetcher: async () => response([repo(1), repo(2, { pushed_at: '2026-11-03T12:00:00Z' })]) });
  assert(readFileSync(directory + '/assets/latest-1.svg', 'utf8').includes('project-2'));
  await refresh({ ...options, fetcher: async () => response([]) });
  assert(readFileSync(directory + '/assets/latest-1.svg', 'utf8').includes('aria-label=""'));
});
