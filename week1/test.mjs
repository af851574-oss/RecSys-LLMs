import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('index.html', import.meta.url), 'utf8');
const menu = [...html.matchAll(/\{ name: "([^"]+)", icon: "([^"]+)" \}/g)]
    .map(([, name, icon]) => ({ name, icon }));

assert.equal(menu.length, 12, 'all 12 lunch options must be present');
assert.equal(new Set(menu.map(({ name }) => name)).size, menu.length, 'names must be unique');
assert.ok(menu.every(({ icon }) => icon && !icon.includes('fa-')), 'every option must use a native symbol');
assert.ok(!html.includes('font-awesome'), 'the broken icon dependency must stay removed');
assert.match(html, /foodIcon\.textContent = selectedLunch\.icon/, 'selected symbols must be rendered as text');

console.log(`PASS: ${menu.length}/${menu.length} menu entries have native symbols`);
