import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const sourceRoots = ['app', 'lib'];
const brandRoot = join(root, 'public', 'brand');
const referenced = new Map();

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) await walk(full);
    else if (/\.(tsx?|css|scss|md|json)$/.test(entry.name)) {
      const source = await readFile(full, 'utf8');
      const regex = /\/brand\/([^'"`\)?#}]+)/g;
      for (const match of source.matchAll(regex)) {
        const asset = match[1].trim();
        if (!asset || asset.includes('${')) continue;
        const list = referenced.get(asset) ?? [];
        list.push(relative(root, full));
        referenced.set(asset, list);
      }
    }
  }
}

for (const sourceRoot of sourceRoots) await walk(join(root, sourceRoot));

const missing = [];
for (const [asset, sources] of referenced) {
  try {
    const target = join(brandRoot, decodeURIComponent(asset));
    const info = await stat(target);
    if (!info.isFile()) missing.push({ asset, sources });
  } catch {
    missing.push({ asset, sources });
  }
}

if (missing.length) {
  console.error('Missing JASLYN NET brand assets:');
  for (const item of missing) console.error('- /brand/' + item.asset + ' <- ' + item.sources.join(', '));
  process.exit(1);
}

console.log('Brand asset integrity OK: ' + referenced.size + ' referenced asset(s) resolved.');