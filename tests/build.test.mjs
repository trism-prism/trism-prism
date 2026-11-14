import test from 'node:test';
import assert from 'node:assert/strict';
import { renderReadme, featured, root, latestSection, activitySection, plaque } from '../scripts/build.mjs';
import { readFileSync, statSync } from 'node:fs';

test('native README keeps readable content and supported motion fallback', () => {
  const readme = readFileSync(root + 'README.md', 'utf8').replaceAll('\r\n', '\n');
  const output = renderReadme(latestSection(readme), activitySection(readme));
  assert(output.includes('alt="Tristan Morton.'));
  assert(!output.includes('# Tristan Morton'));
  assert(!output.includes('[trism-dev]'));
  assert(output.indexOf('## Latest projects') < output.indexOf('## Featured projects'));
  assert(output.indexOf('## Featured projects') < output.indexOf('## Activity'));
  assert(output.includes('(prefers-reduced-motion: reduce)'));
  assert.equal((output.match(/<tr>/g) || []).length, 3);
  assert(!output.includes('<details'));
  for (const p of featured) {
    assert(output.includes(p.text.replaceAll("'", '&#39;')));
    assert(output.includes(`https://github.com/trism-prism/${p.repo}`));
  }
  assert(!/<script|<style|<canvas|2027|internship availability|Matter:/.test(output));
  assert.equal(output, readme);
});

test('navigation uses portfolio/repositories and every featured project has a plaque', () => {
  const output = renderReadme();
  assert(output.includes('href="https://portfolio-site-trism2.vercel.app"'));
  assert(output.includes('alt="Portfolio"'));
  assert(output.includes('href="https://www.linkedin.com/in/tristan-morton"'));
  assert(output.includes('alt="Discord"'));
  assert(output.includes('alt="Repositories"'));
  for (const project of featured) {
    assert(output.includes(`assets/featured-${project.repo}.svg`));
    assert(readFileSync(root + `assets/featured-${project.repo}.svg`, 'utf8').includes(project.name));
  }
});

test('shared prism plaques retain accessible names, safe labels and fixed geometry', () => {
  const svg = plaque('a<&"repo');
  assert(svg.includes('width="400" height="58"'));
  assert(svg.includes('aria-label="a&lt;&amp;&quot;repo"'));
  assert(svg.includes('url(#prism)'));
  for (const color of ['#66dedb', '#b49ae9', '#f1c580']) assert(svg.includes(color));
  assert(!svg.includes('<&"repo'));
  assert(plaque('x'.repeat(60)).includes('x'.repeat(34) + '…'));
  assert(renderReadme().includes('Prism Spellblade rests with a steaming mug'));
});

test('navigation fills its row, latest projects share a row, featured projects are table rows with tags', () => {
  const output = renderReadme();
  assert.equal((output.match(/width="25%"/g) || []).length, 4);
  assert(!output.includes('</a>\n  <a'));
  assert(!output.includes('<summary>'));
  for (const project of featured) {
    assert(output.includes(`<a href="https://github.com/trism-prism/${project.repo}"><img src="assets/featured-${project.repo}.svg" width="100%"`));
    for (const tag of project.stack.split(' · ')) assert(output.includes(`<code>${tag.replaceAll(' ', '&nbsp;')}</code>`));
  }
});

test('exported images have valid headers, dimensions and bounded size', () => {
  const png = readFileSync(root + 'assets/scene.png');
  assert.equal(png.subarray(1, 4).toString(), 'PNG');
  assert.equal(png.readUInt32BE(16), 1660);
  assert.equal(png.readUInt32BE(20), 722);
  const gif = readFileSync(root + 'assets/scene.gif');
  assert.equal(gif.subarray(0, 6).toString(), 'GIF89a');
  assert.equal(gif.readUInt16LE(6), 1660);
  assert.equal(gif.readUInt16LE(8), 722);
  assert(statSync(root + 'assets/scene.gif').size < 8_000_000);
});

test('scene uses separate reusable sprites with an explicit integer pixel grid', () => {
  const layout = JSON.parse(readFileSync(root + 'art/layers.json', 'utf8'));
  assert.deepEqual(layout.canvas, [1920, 819]);
  assert.equal(layout.sprites.length, 2);
  assert.equal(layout.background, 'art/layers/background.png');
  for (const sprite of layout.sprites) {
    assert(readFileSync(root + sprite.file).subarray(1, 4).toString() === 'PNG');
    assert(sprite.crop.every(Number.isInteger));
    assert.equal(sprite.pixelScale, 4);
    assert(Number.isInteger(sprite.nativeHeight) && sprite.nativeHeight >= 72);
    assert.equal(sprite.y + sprite.nativeHeight * sprite.pixelScale, 744, 'Both sprites contact the floor');
  }
});

test('GIF contains 100 evenly timed 40ms frames', () => {
  const gif = readFileSync(root + 'assets/scene.gif');
  let offset = 13 + (gif[10] & 128 ? 3 * 2 ** ((gif[10] & 7) + 1) : 0);
  const delays = [];
  let frames = 0;
  while (gif[offset] !== 0x3b) {
    assert(offset < gif.length, 'GIF terminator missing');
    const block = gif[offset++];
    if (block === 0x21) {
      if (gif[offset++] === 0xf9) delays.push(gif.readUInt16LE(offset + 2));
    } else {
      assert.equal(block, 0x2c, 'unknown GIF block');
      const packed = gif[offset + 8];
      offset += 9 + (packed & 128 ? 3 * 2 ** ((packed & 7) + 1) : 0);
      offset++;
      frames++;
    }
    while (gif[offset]) offset += gif[offset] + 1;
    offset++;
  }
  assert.equal(frames, 100);
  assert.equal(delays.length, frames);
  assert(delays.every(delay => delay === 4));
});

test('approved helmet scene is preserved as the render source', async () => {
  const { createHash } = await import('node:crypto');
  const layout = JSON.parse(readFileSync(root + 'art/layers.json', 'utf8'));
  assert.equal(layout.approvedScene, 'art/approved-scene.png');
  assert.equal(createHash('sha256').update(readFileSync(root + layout.approvedScene)).digest('hex'), '48420ad667af5dbd2e6ce1e4806d6068eb6fc8eea58523ec8632d392dd3a19af');
});

test("refresh workflow targets the renamed profile repository", () => {
  const workflow = readFileSync(root + ".github/workflows/profile.yml", "utf8");
  assert(workflow.includes("github.repository == 'trism-prism/trism-prism'"));
});
