// Stamp the build: computes a content hash of every shipped file and writes it (plus the precache list)
// into js/version.js, version.json and sw.js. Deterministic: same files => same build id.
//
//   node tools/stamp.mjs                 stamp in place
//   node tools/stamp.mjs --check         exit 1 if the committed stamp is stale (used by tests/CI)
//   node tools/stamp.mjs --build-id abc  force a specific id (e.g. a git SHA)

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHIP_DIRS = ['css', 'js', 'icons', 'art'];
const SHIP_FILES = ['index.html', 'manifest.webmanifest', 'version.json', 'sw.js'];
const STAMPED = new Set(['js/version.js', 'version.json']);
const NEVER_PRECACHE = new Set(['sw.js', 'version.json']);

function walk(dir, out = []) {
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = path.posix.join(dir, e.name);
    if (e.isDirectory()) walk(rel, out); else out.push(rel);
  }
  return out;
}

export function shippedFiles() {
  const files = [...SHIP_FILES];
  for (const d of SHIP_DIRS) if (fs.existsSync(path.join(ROOT, d))) files.push(...walk(d));
  return files.filter((f) => !f.endsWith('.DS_Store')).sort();
}

const BUILD_RE = /const BUILD = '[^']*';/;
const PRE_RE = /const PRECACHE = \[[\s\S]*?\];/;

function normalized(file) {
  const buf = fs.readFileSync(path.join(ROOT, file));
  if (file === 'sw.js') return Buffer.from(buf.toString('utf8').replace(BUILD_RE, "const BUILD = '';").replace(PRE_RE, 'const PRECACHE = [];'));
  return buf;
}

export function computeBuildId() {
  const h = crypto.createHash('sha256');
  for (const f of shippedFiles()) {
    if (STAMPED.has(f)) continue;
    h.update(f + '\0'); h.update(normalized(f)); h.update('\0');
  }
  return h.digest('hex').slice(0, 12);
}

export function stamp(buildId = computeBuildId()) {
  const files = shippedFiles().filter((f) => !NEVER_PRECACHE.has(f));
  const pre = '[\n' + files.map((f) => `  './${f}'`).join(',\n') + ',\n]';
  let sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  sw = sw.replace(BUILD_RE, `const BUILD = '${buildId}';`).replace(PRE_RE, `const PRECACHE = ${pre};`);
  fs.writeFileSync(path.join(ROOT, 'sw.js'), sw);
  fs.writeFileSync(path.join(ROOT, 'js/version.js'), `// Stamped at build time by tools/stamp.mjs - do not edit by hand.\nexport const BUILD = '${buildId}';\n`);
  fs.writeFileSync(path.join(ROOT, 'version.json'), JSON.stringify({ version: buildId }) + '\n');
  return buildId;
}

export function readStamp() {
  const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  return {
    sw: (sw.match(BUILD_RE) || [])[0]?.match(/'([^']*)'/)[1],
    js: fs.readFileSync(path.join(ROOT, 'js/version.js'), 'utf8').match(/BUILD = '([^']*)'/)[1],
    json: JSON.parse(fs.readFileSync(path.join(ROOT, 'version.json'), 'utf8')).version,
    precache: eval(sw.match(PRE_RE)[0].replace('const PRECACHE =', '(') .replace(/;$/, ')')),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  if (args.includes('--check')) {
    const want = computeBuildId();
    const have = readStamp();
    const files = shippedFiles().filter((f) => !NEVER_PRECACHE.has(f)).map((f) => './' + f);
    const ok = have.sw === want && have.js === want && have.json === want && JSON.stringify(have.precache) === JSON.stringify(files);
    console.log(ok ? `stamp ok (${want})` : `stamp STALE: files hash to ${want}, found sw=${have.sw} js=${have.js} json=${have.json}. Run: npm run stamp`);
    process.exit(ok ? 0 : 1);
  }
  const i = args.indexOf('--build-id');
  const id = stamp(i >= 0 ? args[i + 1] : undefined);
  console.log('stamped build', id);
}
