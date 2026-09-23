const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
assert.equal(manifest.manifest_version, 3);
assert.deepEqual(manifest.permissions, ['storage']);
assert.deepEqual(manifest.content_scripts[0].matches, ['https://www.youtube.com/*']);
assert.equal(manifest.host_permissions, undefined);
for (const item of manifest.content_scripts) {
  for (const file of [...item.js, ...item.css]) assert.ok(fs.existsSync(path.join(root, file)), file);
}
let count = 0;
for (const file of fs.readdirSync(path.join(root, 'src'), { recursive: true })) {
  if (!file.endsWith('.js')) continue;
  const source = fs.readFileSync(path.join(root, 'src', file), 'utf8');
  new vm.Script(source, { filename: file });
  assert.ok(!/\beval\s*\(|\bnew\s+Function\s*\(|\bfetch\s*\(|\bXMLHttpRequest\b/.test(source), file);
  count++;
}
assert.ok(fs.existsSync(path.join(root, manifest.action.default_popup)));
console.log(`Manifest MV3, arquivos e sintaxe de ${count} scripts: OK.`);
