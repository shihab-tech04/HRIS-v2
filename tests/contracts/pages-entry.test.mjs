import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import test from 'node:test';

test('the GitHub Pages branch entry references the compiled app and checked-in assets', () => {
  const html = readFileSync('index.html', 'utf8');
  assert.doesNotMatch(html, /\/src\/main\.tsx/);
  assert.ok(existsSync('.nojekyll'), 'GitHub Pages must serve the generated asset directory unchanged');

  const assets = [...html.matchAll(/(?:src|href)="(\/HRIS-v2\/assets\/[^\"]+)"/g)].map(match => match[1]);
  assert.ok(assets.some(asset => asset.endsWith('.js')), 'compiled JavaScript must be linked');
  assert.ok(assets.some(asset => asset.endsWith('.css')), 'compiled stylesheet must be linked');
  for (const asset of assets) {
    const file = asset.replace(/^\/HRIS-v2\//, '');
    assert.ok(existsSync(file), `branch-served asset is missing: ${file}`);
    assert.ok(statSync(file).size > 0, `branch-served asset is empty: ${file}`);
  }
});
