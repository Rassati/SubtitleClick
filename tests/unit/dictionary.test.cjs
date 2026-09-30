const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');
require('../../src/dictionary/dictionary-provider.js');
require('../../src/storage/vocabulary-store.js');
require('../../src/content/word-tools.js');
const { DictionaryProvider, VocabularyStore, WordTools } = globalThis.SubtitleClick;
const data = require('../../data/eng-por.json');
function memory() {
  const values = { settings: { enabled: false } };
  return { values,
    async get(key) { return structuredClone(key === null ? values : { [key]: values[key] }); },
    async set(items) { Object.assign(values, structuredClone(items)); },
    async remove(key) { delete values[key]; }
  };
}
const word = (overrides = {}) => ({ word: 'Bank', sourceLanguage: 'en', targetLanguage: 'pt', definitions: ['banco', 'margem'],
  note: 'uma margem do rio', example: { text: 'We sat on the bank.', videoId: 'abc123', time: 25.8 }, ...overrides });

test('bundled dictionary preserves actual source checksum and multiple senses', async () => {
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.resolve(__dirname, '../../vendor/freedict/eng-por.tei'))).digest('hex'), data.sha256);
  assert.equal(Object.values(data.entries).flat().length, 15773);
  const provider = new DictionaryProvider(async () => data);
  const result = await provider.lookup(' BANK ');
  assert.equal(result.status, 'found');
  assert.deepEqual(result.entries[0].senses, data.entries.bank[0].senses);
  assert.ok(result.entries.flatMap(e => e.senses.flat()).length > 1);
});
test('dictionary handles unsupported pairs, missing words, inherited keys, forms and retry after load failure', async () => {
  let loads = 0;
  const provider = new DictionaryProvider(async () => { if (!loads++) throw Error('unavailable file'); return data; });
  assert.equal((await provider.lookup('bonjour', 'fr')).status, 'unsupported');
  assert.equal(loads, 0);
  await assert.rejects(provider.lookup('bank'), /unavailable file/);
  assert.equal((await provider.lookup('bank')).status, 'found');
  assert.equal((await provider.lookup('zzzzunknownword')).status, 'missing');
  assert.equal((await provider.lookup('__proto__')).status, 'missing');
  assert.equal((await provider.lookup('running')).entries.some(e => e.word === 'run' && e.match === 'related'), true);
  await assert.rejects(provider.lookup(''), /Escolha/);
  await assert.rejects(provider.lookup('a'.repeat(101)), /100/);
});
test('word segmentation preserves contractions and Unicode without splitting Japanese into letters', () => {
  assert.deepEqual(WordTools.segments("Don't stop!", 'en').filter(s => s.isWordLike).map(s => s.segment), ["Don't", 'stop']);
  assert.ok(WordTools.segments('日本語を勉強', 'ja').some(s => s.isWordLike && s.segment.length > 1));
  assert.deepEqual(WordTools.segments('привет мир', 'ru').filter(s => s.isWordLike).map(s => s.segment), ['привет', 'мир']);
});
test('saved words survive a fresh store and do not touch settings; duplicates merge senses and notes', async () => {
  const storage = memory();
  const store = new VocabularyStore(storage);
  const first = await store.save(word());
  const second = await new VocabularyStore(storage).save(word({ word: 'bank', definitions: ['banco', 'banca'], note: 'outro sentido' }));
  assert.equal(first.id, second.id);
  assert.deepEqual(second.definitions, ['banco', 'margem', 'banca']);
  assert.equal(second.note, 'uma margem do rio\noutro sentido');
  assert.equal(second.examples.length, 1);
  assert.equal(second.examples[0].time, 25);
  assert.equal((await store.list()).length, 1);
  assert.deepEqual(storage.values.settings, { enabled: false });
});
test('all references retained, invalid links excluded, edits remove senses, removal is scoped', async () => {
  const storage = memory(), store = new VocabularyStore(storage);
  for (let i = 0; i < 8; i++) await store.save(word({ example: { text: `Example ${i}`, time: i, videoId: 'javascript:evil()' } }));
  const saved = (await store.list())[0];
  assert.equal(saved.examples.length, 8);
  assert.ok(saved.examples.every(e => e.videoId === ''));
  const updated = await store.update({ ...saved, definitions: ['apenas um sentido'], note: '<script>literal</script>' });
  assert.deepEqual(updated.definitions, ['apenas um sentido']);
  await store.remove(saved);
  assert.deepEqual(await store.list(), []);
  assert.deepEqual(storage.values.settings, { enabled: false });
  await assert.rejects(store.update(saved), /removida/);
});
test('backup roundtrip merges duplicates, rejects a malformed entire import before writes', async () => {
  const storage = memory(), store = new VocabularyStore(storage);
  const saved = await store.save(word());
  const backup = { format: 'subtitleclick-vocabulary', version: 1, words: [saved] };
  const fresh = new VocabularyStore(memory());
  assert.equal(await fresh.restore(backup), 1);
  assert.equal((await fresh.list())[0].note, saved.note);
  await fresh.restore({ ...backup, words: [{ ...saved, definitions: ['margem', 'nova'], note: 'não substituir' }] });
  assert.equal((await fresh.list())[0].note, saved.note);
  const before = JSON.stringify(storage.values);
  await assert.rejects(store.restore({ ...backup, words: [saved, { ...saved, word: 'new', definitions: [null] }] }), /inválidos/);
  assert.equal(JSON.stringify(storage.values), before);
  await assert.rejects(store.restore({ format: 'wrong', words: [] }), /inválido/);
});
test('storage errors propagate instead of reporting a successful save', async () => {
  const storage = memory(); storage.set = async () => { throw Error('QUOTA_BYTES'); };
  await assert.rejects(new VocabularyStore(storage).save(word()), /QUOTA/);
});
