const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..', '..');
const IGNORE_DIRS = new Set(['node_modules', '.git', 'data', 'coverage', '.next', 'dist']);
const TARGET_DIRS = ['app.js', 'index.js', 'config', 'controllers', 'middleware', 'models', 'routes', 'services', 'utils', 'scripts', 'tests'];

function collectJsFiles(entry, out) {
  const full = path.join(root, entry);
  if (!fs.existsSync(full)) return;
  const stat = fs.statSync(full);
  if (stat.isFile() && entry.endsWith('.js')) {
    out.push(full);
    return;
  }
  if (!stat.isDirectory()) return;
  for (const name of fs.readdirSync(full)) {
    if (IGNORE_DIRS.has(name)) continue;
    const rel = path.join(entry, name);
    const child = path.join(root, rel);
    const childStat = fs.statSync(child);
    if (childStat.isDirectory()) collectJsFiles(rel, out);
    else if (childStat.isFile() && name.endsWith('.js')) out.push(child);
  }
}

const files = [];
for (const target of TARGET_DIRS) collectJsFiles(target, files);
files.sort();

let failures = 0;
for (const file of files) {
  const res = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (res.status !== 0) {
    failures += 1;
    process.stderr.write(`SYNTAX ERROR: ${path.relative(root, file)}\n`);
    if (res.stderr) process.stderr.write(res.stderr);
  }
}

if (failures) {
  console.error(`\nLint (syntax) falhou em ${failures} arquivo(s).`);
  process.exit(1);
}
console.log(`Lint (syntax) OK em ${files.length} arquivo(s).`);
