const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
assert.equal(manifest.manifest_version, 3);
assert.deepEqual(manifest.permissions, ['storage', 'declarativeNetRequestWithHostAccess']);
assert.deepEqual(manifest.content_scripts[0].matches, ['https://www.youtube.com/*']);
assert.deepEqual(manifest.host_permissions, ['https://www.youtube-nocookie.com/*']);
assert.match(manifest.content_security_policy.extension_pages, /frame-src https:\/\/www.youtube-nocookie.com$/);
const buildContext = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(root, 'src/build.js'), 'utf8'), buildContext);
assert.equal(buildContext.SubtitleClick.Build.version, manifest.version, 'running build must match manifest');
assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version, manifest.version);
for (const item of manifest.content_scripts) {
  for (const file of [...(item.js ?? []), ...(item.css ?? [])]) assert.ok(fs.existsSync(path.join(root, file)), file);
}
let count = 0;
for (const file of fs.readdirSync(path.join(root, 'src'), { recursive: true })) {
  if (!file.endsWith('.js')) continue;
  const source = fs.readFileSync(path.join(root, 'src', file), 'utf8');
  new vm.Script(source, { filename: file });
  assert.ok(!/\beval\s*\(|\bnew\s+Function\s*\(|\bXMLHttpRequest\b/.test(source), file);
  const withoutPackagedRead = source.replace("fetch(chrome.runtime.getURL('data/eng-por.json'))", 'PACKAGED_DATA')
    .replace("fetch(chrome.runtime.getURL('data/wikdict-en-pt.json'))", 'PACKAGED_DATA');
  assert.ok(!/\bfetch\s*\(/.test(withoutPackagedRead), `${file}: only the fixed packaged dictionary can be fetched`);
  count++;
}
assert.ok(fs.existsSync(path.join(root, manifest.action.default_popup)));
assert.ok(fs.existsSync(path.join(root, manifest.background.service_worker)));
assert.ok(fs.existsSync(path.join(root, 'data/eng-por.json')));
assert.ok(fs.existsSync(path.join(root, 'data/wikdict-en-pt.json')));
assert.ok(fs.existsSync(path.join(root, 'vendor/freedict/COPYING')));
console.log(`Manifest MV3, arquivos e sintaxe de ${count} scripts: OK.`);
