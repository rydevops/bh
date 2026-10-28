// Produce a deployable `dist/` folder: stamp, then copy only the files the game ships.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, shippedFiles, stamp } from './stamp.mjs';

const id = stamp(process.env.BUILD_ID || undefined);
const out = path.join(ROOT, 'dist');
fs.rmSync(out, { recursive: true, force: true });
for (const f of shippedFiles()) {
  fs.mkdirSync(path.dirname(path.join(out, f)), { recursive: true });
  fs.copyFileSync(path.join(ROOT, f), path.join(out, f));
}
fs.writeFileSync(path.join(out, '.nojekyll'), '');
console.log(`built dist/ (${shippedFiles().length} files, build ${id})`);
