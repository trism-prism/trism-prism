import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchActivity, shares, renderActivity, renderActivitySection, activityAlt } from '../scripts/activity.mjs';

const counts = { commits: 372, pullRequests: 139, issues: 16, reviews: 0 };
const reply = c => new Response(JSON.stringify({ data: { user: { contributionsCollection: { totalCommitContributions: c.commits, totalPullRequestContributions: c.pullRequests, totalIssueContributions: c.issues, totalPullRequestReviewContributions: c.reviews } } } }));

test('shares are whole numbers that always add up to 100', () => {
  assert.deepEqual(shares(counts), { commits: 71, pullRequests: 26, issues: 3, reviews: 0 });
  for (const c of [[1, 1, 1, 0], [1, 1, 1, 1], [7, 3, 0, 0], [999, 1, 1, 1]]) {
    const out = shares({ commits: c[0], pullRequests: c[1], issues: c[2], reviews: c[3] });
    assert.equal(Object.values(out).reduce((a, b) => a + b, 0), 100);
  }
  assert.deepEqual(shares({ commits: 0, pullRequests: 0, issues: 0, reviews: 0 }), { commits: 0, pullRequests: 0, issues: 0, reviews: 0 });
});

test('the chart is accessible, bounded and handles empty data', () => {
  const svg = renderActivity(counts);
  assert(svg.includes('role="img"'));
  assert(svg.includes(activityAlt(counts).replaceAll('&', '&amp;')));
  for (const label of ['Commits', 'Pull requests', 'Issues', 'Code review']) assert(svg.includes(label));
  assert(!svg.includes('NaN') && !svg.includes('undefined'));
  const empty = renderActivity({ commits: 0, pullRequests: 0, issues: 0, reviews: 0 });
  assert(!empty.includes('NaN'));
  assert(renderActivitySection(counts).includes('assets/activity.svg'));
});

test('the contribution query needs a token, reads four counts and rejects bad data', async () => {
  await assert.rejects(fetchActivity({ token: '' }), /token/);
  assert.deepEqual(await fetchActivity({ token: 't', fetcher: async () => reply(counts) }), counts);
  await assert.rejects(fetchActivity({ token: 't', fetcher: async () => new Response('', { status: 502 }) }), /HTTP 502/);
  await assert.rejects(fetchActivity({ token: 't', fetcher: async () => new Response(JSON.stringify({ errors: [{}] })) }), /no data/);
  await assert.rejects(fetchActivity({ token: 't', fetcher: async () => reply({ ...counts, commits: -1 }) }), /Invalid/);
});
