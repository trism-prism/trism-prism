import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const root = fileURLToPath(new URL('../', import.meta.url));
export const featured = [
  { name: 'Internship Scout', repo: 'internship-scout-agent', stack: 'Python · FastAPI · PostgreSQL · Claude tool calling · GitHub Actions', text: 'A resume-matching agent with a FastAPI web app. A scheduled Python job gathers internship postings, uses tool calling to retrieve details and explain matches, and sends an email digest. PostgreSQL stores the postings and results so the app can show them later.' },
  { name: 'Tripwire', repo: 'tripwire-awareness-dashboard', stack: 'Python · Streamlit · PostgreSQL · Docker · GDELT', text: 'A situational awareness dashboard backed by a Dockerized ingestion worker. It reads the GDELT event feed, stores geolocated conflict and unrest reports in PostgreSQL, and detects unusual changes in activity by country. A Streamlit interface makes the events easier to explore on a map.' },
  { name: 'Docs QA Copilot', repo: 'docs-qa-copilot', stack: 'TypeScript · Next.js · React · PostgreSQL / pgvector · Local embeddings · Claude', text: 'A retrieval-augmented generation (RAG) application for asking questions about PDFs. Local embeddings and pgvector find relevant passages, and the app generates answers with page-level citations. An evaluation view shows how it handles test questions and where it falls short.' },
];

export const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function plaque(label, width = 400) {
  const display = label.length > 35 ? label.slice(0, 34) + '…' : label;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="58" viewBox="0 0 ${width} 58" role="img" aria-label="${escapeHtml(label)}">
<defs><linearGradient id="stone" x2="0" y2="1"><stop stop-color="#263445"/><stop offset="1" stop-color="#191f32"/></linearGradient><linearGradient id="prism" x1="0" y1="1" x2="1" y2="0"><stop stop-color="#66dedb"/><stop offset=".52" stop-color="#b49ae9"/><stop offset="1" stop-color="#f1c580"/></linearGradient></defs>
<path fill="url(#stone)" stroke="#78849e" d="M10 .5h${width - 20}l9.5 9.5v38L${width - 10} 57.5H10L.5 48V10z"/>
<path fill="none" stroke="#43536c" d="M12 4.5h${width - 24}l7.5 7.5v34l-7.5 7.5H12L4.5 46V12z"/>
<path fill="none" stroke="url(#prism)" d="M12 4.5h65M${width - 77} 53.5h65"/>
<path fill="url(#prism)" stroke="#e2dbf3" stroke-width=".7" d="m24 17 9 12-9 12-9-12z"/><path fill="#eeedff" fill-opacity=".45" d="m24 17 0 24-9-12z"/><path fill="none" stroke="#f4f1ff" stroke-opacity=".7" stroke-width=".7" d="m15 29 9-3 9 3-9 3z"/>
<path fill="none" stroke="#8b87af" d="M${width - 34} 29h12m-12 0 6-8"/><path fill="#72d8d9" d="m${width - 36} 26 3 3-3 3-3-3z"/><path fill="#b8a3e8" d="m${width - 21} 26 3 3-3 3-3-3z"/><path fill="#e9be81" d="m${width - 27} 18 3 3-3 3-3-3z"/>
<text x="50%" y="50%" dy=".35em" text-anchor="middle" font-family="Georgia,serif" font-size="17" letter-spacing=".6" fill="#f0e8d6">${escapeHtml(display)}</text>
</svg>\n`;
}

const tags = stack => stack.split(' · ').map(t => `<code>${escapeHtml(t).replaceAll(' ', '&nbsp;')}</code>`).join(' ');

export function renderReadme(latest = '<p>Latest public projects will appear here after the first successful refresh.</p>', activity = '<p>Contribution mix will appear here after the first successful refresh.</p>') {
  return `<!-- Built by scripts/build.mjs. Edit the generator, then rebuild. -->
<picture>
  <source media="(prefers-reduced-motion: reduce)" srcset="assets/scene.png">
  <img src="assets/scene.gif" width="100%" alt="Tristan Morton. The faceless Prism Spellblade rests with a steaming mug on a sheltered bench, their prism sword leaning beside them, overlooking a rainy blue city under a warm lantern. No summoned magic.">
</picture>

<p>
  <a href="https://portfolio-site-trism2.vercel.app"><img src="assets/profile.svg" width="50%" alt="Portfolio Website"></a><a href="https://github.com/trism-prism?tab=repositories"><img src="assets/projects.svg" width="50%" alt="Repositories"></a>
</p>

<!-- Introduction — Tristan will write this. -->

## Latest projects

<!-- latest:start -->
${latest}
<!-- latest:end -->

## Featured projects

<table>
${featured.map(p => `<tr>
<td width="38%" valign="top"><a href="https://github.com/trism-prism/${p.repo}"><img src="assets/featured-${p.repo}.svg" width="100%" alt="${p.name}"></a><br>${tags(p.stack)}</td>
<td valign="top">${escapeHtml(p.text)}<br><br><a href="https://github.com/trism-prism/${p.repo}">View repository →</a></td>
</tr>`).join('\n')}
</table>

## Activity

<!-- activity:start -->
${activity}
<!-- activity:end -->
`;
}

export function activitySection(readme) {
  const match = readme.match(/<!-- activity:start -->\n([\s\S]*?)\n<!-- activity:end -->/);
  if (!match || (readme.match(/<!-- activity:start -->/g) || []).length !== 1 || (readme.match(/<!-- activity:end -->/g) || []).length !== 1) throw new Error('Expected exactly one Activity section');
  return match[1];
}

export function latestSection(readme) {
  const match = readme.match(/<!-- latest:start -->\n([\s\S]*?)\n<!-- latest:end -->/);
  if (!match || (readme.match(/<!-- latest:start -->/g) || []).length !== 1 || (readme.match(/<!-- latest:end -->/g) || []).length !== 1) throw new Error('Expected exactly one Latest projects section');
  return match[1];
}

export function build(latest, activity) {
  const current = existsSync(root + 'README.md') ? readFileSync(root + 'README.md', 'utf8').replaceAll('\r\n', '\n') : undefined;
  if (current && /<!-- latest:start -->/.test(current)) latest ??= latestSection(current);
  if (current && /<!-- activity:start -->/.test(current)) activity ??= activitySection(current);
  mkdirSync(root + 'assets', { recursive: true });
  writeFileSync(root + 'assets/profile.svg', plaque('Portfolio Website'));
  writeFileSync(root + 'assets/projects.svg', plaque('Repositories'));
  for (const project of featured) writeFileSync(root + `assets/featured-${project.repo}.svg`, plaque(project.name));
  writeFileSync(root + 'README.md', renderReadme(latest, activity));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  build();
  console.log('Built README and navigation plaques.');
}
