const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '../..');
require('../../src/dictionary/dictionary-provider.js');

test('old worker unknown action is diagnosed as update-required; it is not reported as a saved sentence', async () => {
  const sandbox = vm.createContext({ chrome: { runtime: { sendMessage: async () => ({ ok: false, error: 'Ação desconhecida.' }) } } });
  for (const file of ['src/build.js', 'src/storage/vocabulary-client.js']) vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), sandbox);
  await assert.rejects(sandbox.SubtitleClick.VocabularyClient.request('sentences-save', {}), error => error.code === 'UPDATE_REQUIRED' && /antiga/.test(error.message));
  sandbox.chrome.runtime.sendMessage = async () => ({ ok: true, build: '0.0.1', data: { id: 'wrong' } });
  await assert.rejects(sandbox.SubtitleClick.VocabularyClient.request('sentences-save', {}), error => error.code === 'UPDATE_REQUIRED');
  sandbox.chrome.runtime.sendMessage = async message => ({ ok: true, build: message.build, data: { id: 'saved' } });
  assert.equal((await sandbox.SubtitleClick.VocabularyClient.request('sentences-save', {})).id, 'saved');
});

test('bundled supplementary source is reproducible and covers methamphetamine, its plural, and technical terms', async () => {
  const data = require('../../data/wikdict-en-pt.json');
  const source = zlib.gunzipSync(fs.readFileSync(path.join(root, 'vendor/wikdict/eng-por.tei.gz')));
  assert.equal(crypto.createHash('sha256').update(source).digest('hex'), data.sha256);
  assert.equal(data.license, 'CC-BY-SA-3.0');
  assert.equal(Object.values(data.entries).flat().length, 56350);
  const provider = new SubtitleClick.DictionaryProvider(async () => [require('../../data/eng-por.json'), data]);
  const singular = await provider.lookup('methamphetamine');
  assert.ok(singular.entries.some(entry => entry.senses.flat().includes('metanfetamina')));
  assert.ok(singular.entries.some(entry => entry.source.includes('WikDict')));
  const plural = await provider.lookup('methamphetamines');
  assert.ok(plural.entries.some(entry => entry.word === 'methamphetamine' && entry.match === 'inflected'));
  for (const word of ['neurotransmitter', 'photosynthesis', 'semiconductor']) assert.equal((await provider.lookup(word)).status, 'found', word);
  assert.ok((await provider.lookup('metanfetamina', 'pt', 'en')).entries[0].senses.flat().includes('methamphetamine'));
});
