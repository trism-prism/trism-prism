import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { activitySection, escapeHtml, latestSection, plaque, root } from './build.mjs';
import { fetchActivity, renderActivity, renderActivitySection } from './activity.mjs';

const owner = 'trism-prism';
const excluded = new Set(['trism-prism', 'trism-dev', 'lore-tool-pages']);

export async function fetchPublicRepos(fetcher = fetch) {
  const repos = [];
  const ids = new Set();
  for (let page = 1; ; page++) {
    if (page > 100) throw new Error('Repository pagination exceeded safety bound');
    const response = await fetcher(`https://api.github.com/users/${owner}/repos?type=owner&sort=created&direction=asc&per_page=100&page=${page}`, {
      headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2026-03-10', ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}) },
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`Public repository scan failed: HTTP ${response.status} on page ${page}`);
    const batch = await response.json();
    if (!Array.isArray(batch)) throw new Error('Expected a repository array');
    for (const repo of batch) {
      if (!Number.isSafeInteger(repo.id) || ids.has(repo.id)) throw new Error('Invalid or repeated repository ID; retry a complete scan');
      ids.add(repo.id);
      repos.push(repo);
    }
    if (batch.length < 100 && !response.headers.get('link')?.includes('rel="next"')) return repos;
  }
}

function date(value) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) throw new Error('Invalid repository push timestamp');
  return new Date(value).toISOString();
}

export function selectLatest(repos) {
  const current = [];
  const seen = new Set();
  for (const repo of repos) {
    if (repo.private !== false || repo.visibility !== 'public' || repo.owner?.login?.toLowerCase() !== owner || repo.fork) continue;
    if (!Number.isSafeInteger(repo.id) || seen.has(repo.id) || !/^[A-Za-z0-9_.-]+$/.test(repo.name) || repo.html_url !== `https://github.com/${owner}/${repo.name}` || typeof repo.archived !== 'boolean') throw new Error('Invalid public repository metadata');
    seen.add(repo.id);
    if (!repo.archived && !excluded.has(repo.name.toLowerCase()) && repo.pushed_at !== null) current.push({ ...repo, pushed_at: date(repo.pushed_at) });
  }
  current.sort((a, b) => b.pushed_at.localeCompare(a.pushed_at) || b.id - a.id);
  return current.slice(0, 3);
}

export function renderLatest(repos) {
  if (!repos.length) return '<p>No public projects to show yet. <a href="https://github.com/trism-prism?tab=repositories">Browse repositories</a>.</p>';
  // Three buttons share one row (no whitespace between the links, so the widths add up).
  return '<p>' + repos.map((repo, index) => `<a href="${repo.html_url}"><img src="assets/latest-${index + 1}.svg" width="${Math.floor(100 / 3)}%" alt="${escapeHtml(repo.name)}"></a>`).join('') + '</p>';
}

export async function refresh({ directory = root, fetcher = fetch, counts } = {}) {
  const readmePath = directory + '/README.md';
  const readme = readFileSync(readmePath, 'utf8').replaceAll('\r\n', '\n');
  const before = latestSection(readme);
  const beforeActivity = activitySection(readme);
  const repos = await fetchPublicRepos(fetcher);
  const latest = selectLatest(repos);
  const activity = counts ?? await fetchActivity({ fetcher });
  const output = readme
    .replace(`<!-- latest:start -->\n${before}\n<!-- latest:end -->`, `<!-- latest:start -->\n${renderLatest(latest)}\n<!-- latest:end -->`)
    .replace(`<!-- activity:start -->\n${beforeActivity}\n<!-- activity:end -->`, `<!-- activity:start -->\n${renderActivitySection(activity)}\n<!-- activity:end -->`);
  const changes = [];
  // Finish the complete scan and validation before touching either tracked file.
  const plaques = Array.from({ length: 3 }, (_, i) => [directory + `/assets/latest-${i + 1}.svg`, plaque(latest[i]?.name ?? '', 330)]);
  for (const [path, content] of [[readmePath, output], [directory + '/assets/activity.svg', renderActivity(activity)], ...plaques]) {
    if (existsSync(path) && readFileSync(path, 'utf8').replaceAll('\r\n', '\n') === content) continue;
    mkdirSync(directory + '/assets', { recursive: true });
    writeFileSync(path + '.tmp', content);
    changes.push([path, path + '.tmp']);
  }
  for (const [path, temporary] of changes) renameSync(temporary, path);
  return changes.length > 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  refresh().then(changed => console.log(changed ? 'Updated Latest projects.' : 'No public project changes.')).catch(error => { console.error(error.message); process.exitCode = 1; });
}
