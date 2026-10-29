import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, shippedFiles } from '../tools/stamp.mjs';

const read = (f) => fs.readFileSync(path.join(ROOT, f));
const atlas = JSON.parse(read('art/vanguard.json').toString());
const png = read('art/vanguard.png');

test('Vanguard sprite sheet is a transparent PNG matching its atlas', () => {
  assert.equal(png.subarray(1, 4).toString(), 'PNG');
  const w = png.readUInt32BE(16), h = png.readUInt32BE(20), colorType = png[25];
  assert.equal(colorType, 6, 'RGBA, so the background is transparent');
  for (const name of ['idle', 'fire', 'ability', 'icon']) {
    const f = atlas.frames[name];
    assert.ok(f, name + ' frame exists');
    assert.ok(f.x >= 0 && f.y >= 0 && f.x + f.w <= w && f.y + f.h <= h, `${name} lies inside the ${w}x${h} sheet`);
  }
  assert.equal(atlas.image, 'vanguard.png');
  const { idle, fire, ability, icon } = atlas.frames;
  assert.deepEqual([idle.w, idle.h], [atlas.logical.w * atlas.scale, atlas.logical.h * atlas.scale]);
  assert.deepEqual([fire.w, fire.h, ability.w, ability.h], [idle.w, idle.h, idle.w, idle.h]);
  assert.equal(icon.w, icon.h, 'the icon is square');
  assert.ok(atlas.animations && atlas.animations.idle.bob.periodMs > 0, 'the artist\'s idle bob timing is carried over');
  assert.ok(atlas.frames.fire.duration > 0, 'and the fire frame duration');
  const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  const list = Object.values(atlas.frames);
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) assert.ok(!overlaps(list[i], list[j]), 'frames do not overlap');
});

test('the art ships with the game (precached, part of the build id)', () => {
  assert.ok(shippedFiles().includes('art/vanguard.png') && shippedFiles().includes('art/vanguard.json'));
  const sw = read('sw.js').toString();
  assert.ok(sw.includes("'./art/vanguard.png'") && sw.includes("'./art/vanguard.json'"));
  assert.ok(!shippedFiles().some((f) => f.startsWith('art_desc/')), 'artist notes are not shipped');
});

test('the artist description for Vanguard is short (500 words max)', () => {
  const words = read('art_desc/vanguard.md').toString().split(/\s+/).filter(Boolean).length;
  assert.ok(words > 150 && words <= 500, `${words} words`);
});
