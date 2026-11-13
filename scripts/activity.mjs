import { escapeHtml } from './build.mjs';

export const owner = 'trism-prism';
export const kinds = [
  { key: 'commits', label: 'Commits', color: '#66dedb' },
  { key: 'pullRequests', label: 'Pull requests', color: '#b49ae9' },
  { key: 'issues', label: 'Issues', color: '#f1c580' },
  { key: 'reviews', label: 'Code review', color: '#8b87af' },
];

const query = `query($login: String!, $from: DateTime!, $to: DateTime!) {
  user(login: $login) {
    contributionsCollection(from: $from, to: $to) {
      totalCommitContributions
      totalPullRequestContributions
      totalIssueContributions
      totalPullRequestReviewContributions
    }
  }
}`;

// Last 12 months of contribution counts (GitHub's own numbers, the same ones behind the profile's activity overview).
export async function fetchActivity({ fetcher = fetch, now = new Date(), token = process.env.GITHUB_TOKEN } = {}) {
  if (!token) throw new Error('A GitHub token is required to read contribution counts');
  const to = new Date(now);
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - 364);
  const response = await fetcher('https://api.github.com/graphql', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/vnd.github+json' },
    body: JSON.stringify({ query, variables: { login: owner, from: from.toISOString(), to: to.toISOString() } }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Contribution query failed: HTTP ${response.status}`);
  const body = await response.json();
  const c = body?.data?.user?.contributionsCollection;
  if (body.errors || !c) throw new Error('Contribution query returned no data');
  const counts = {
    commits: c.totalCommitContributions,
    pullRequests: c.totalPullRequestContributions,
    issues: c.totalIssueContributions,
    reviews: c.totalPullRequestReviewContributions,
  };
  for (const value of Object.values(counts)) if (!Number.isSafeInteger(value) || value < 0) throw new Error('Invalid contribution count');
  return counts;
}

// Whole-number percentages that always add up to 100 (largest remainder), or all zeros when there is nothing yet.
export function shares(counts) {
  const total = kinds.reduce((sum, k) => sum + counts[k.key], 0);
  if (total === 0) return Object.fromEntries(kinds.map(k => [k.key, 0]));
  const raw = kinds.map(k => ({ key: k.key, exact: (counts[k.key] * 100) / total }));
  const out = Object.fromEntries(raw.map(r => [r.key, Math.floor(r.exact)]));
  let left = 100 - Object.values(out).reduce((a, b) => a + b, 0);
  for (const r of [...raw].sort((a, b) => (b.exact % 1) - (a.exact % 1) || kinds.findIndex(k => k.key === a.key) - kinds.findIndex(k => k.key === b.key))) {
    if (left-- <= 0) break;
    out[r.key]++;
  }
  return out;
}

export function activityAlt(counts) {
  const pct = shares(counts);
  return 'Contribution mix over the last 12 months: ' + kinds.map(k => `${counts[k.key]} ${k.label.toLowerCase()} (${pct[k.key]}%)`).join(', ') + '.';
}

// Four-axis radar (commits up, pull requests right, issues down, code review left) plus a legend, in the same stone/prism style as the plaques.
export function renderActivity(counts, width = 880, height = 236) {
  const pct = shares(counts);
  const max = Math.max(1, ...kinds.map(k => counts[k.key]));
  const cx = 222, cy = 118, R = 76;
  const axis = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  const point = (i, f) => `${(cx + axis[i][0] * R * f).toFixed(1)} ${(cy + axis[i][1] * R * f).toFixed(1)}`;
  const grid = [0.25, 0.5, 0.75, 1].map(f => `<path fill="none" stroke="#43536c" stroke-width="${f === 1 ? 1.2 : 0.8}" d="M${point(0, f)}L${point(1, f)}L${point(2, f)}L${point(3, f)}z"/>`).join('');
  const spokes = `<path fill="none" stroke="#43536c" d="M${cx} ${cy - R}V${cy + R}M${cx - R} ${cy}H${cx + R}"/>`;
  const f = kinds.map(k => counts[k.key] / max);
  const shape = `M${point(0, f[0])}L${point(1, f[1])}L${point(2, f[2])}L${point(3, f[3])}z`;
  const dots = kinds.map((k, i) => `<path fill="${k.color}" stroke="#f4f1ff" stroke-width=".8" d="m${(cx + axis[i][0] * R * f[i]).toFixed(1)} ${(cy + axis[i][1] * R * f[i] - 5).toFixed(1)} 5 5-5 5-5-5z"/>`).join('');
  const labels = [
    `<text x="${cx}" y="${cy - R - 14}" text-anchor="middle">${kinds[0].label}</text>`,
    `<text x="${cx + R + 12}" y="${cy + 5}">${kinds[1].label}</text>`,
    `<text x="${cx}" y="${cy + R + 26}" text-anchor="middle">${kinds[2].label}</text>`,
    `<text x="${cx - R - 12}" y="${cy + 5}" text-anchor="end">${kinds[3].label}</text>`,
  ].join('');
  const rows = kinds.map((k, i) => {
    const y = 84 + i * 36;
    const bar = Math.round((counts[k.key] / max) * 250);
    return `<path fill="${k.color}" stroke="#e2dbf3" stroke-width=".6" d="m528 ${y - 12} 8 8-8 8-8-8z"/>
<text x="548" y="${y - 2}" font-size="17" fill="#f0e8d6">${k.label}</text>
<text x="${width - 44}" y="${y - 2}" font-size="17" text-anchor="end" fill="#f0e8d6">${pct[k.key]}%</text>
<text x="${width - 44}" y="${y + 16}" font-size="12" text-anchor="end" fill="#9aa7bd">${counts[k.key].toLocaleString('en-US')}</text>
<path fill="#101528" d="M548 ${y + 6}h250v5H548z"/>${bar > 0 ? `<path fill="${k.color}" d="M548 ${y + 6}h${Math.max(bar, 3)}v5H548z"/>` : ''}`;
  }).join('\n');
  const alt = activityAlt(counts);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(alt)}" font-family="Georgia,serif" fill="#f0e8d6" font-size="15">
<defs><linearGradient id="stone" x2="0" y2="1"><stop stop-color="#263445"/><stop offset="1" stop-color="#191f32"/></linearGradient><linearGradient id="prism" x1="0" y1="1" x2="1" y2="0"><stop stop-color="#66dedb"/><stop offset=".52" stop-color="#b49ae9"/><stop offset="1" stop-color="#f1c580"/></linearGradient></defs>
<path fill="url(#stone)" stroke="#78849e" d="M12 .5h${width - 24}l11.5 12v${height - 25}L${width - 12} ${height - 0.5}H12L.5 ${height - 12.5}v${-(height - 25)}z"/>
<path fill="none" stroke="#43536c" d="M15 5.5h${width - 30}l9.5 10v${height - 31}l-9.5 10H15l-9.5-10v${-(height - 31)}z"/>
<path fill="none" stroke="url(#prism)" d="M15 5.5h80M${width - 95} ${height - 5.5}h80"/>
<text x="548" y="36" font-size="12" letter-spacing="1.4" fill="#9aa7bd">LAST 12 MONTHS</text>
<text x="548" y="56" font-size="19" fill="#f0e8d6">Contribution mix</text>
${grid}${spokes}
<path fill="url(#prism)" fill-opacity=".5" stroke="#e2dbf3" stroke-width="1.2" d="${shape}"/>${dots}
<g font-size="14" fill="#c9d1e3">${labels}</g>
${rows}
</svg>\n`;
}

export function renderActivitySection(counts) {
  return `<p><img src="assets/activity.svg" width="100%" alt="${escapeHtml(activityAlt(counts))}"></p>`;
}
