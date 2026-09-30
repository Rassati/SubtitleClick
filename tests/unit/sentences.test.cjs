const { test } = require('node:test');
const assert = require('node:assert/strict');
require('../../src/dictionary/dictionary-provider.js');
require('../../src/storage/vocabulary-store.js');
require('../../src/storage/sentence-store.js');
require('../../src/storage/settings.js');
const { VocabularyStore, SentenceStore, DictionaryProvider, Settings } = SubtitleClick;
function memory() {
  const values = {};
  return { values, async get(key) { return structuredClone(key === null ? values : { [key]: values[key] }); },
    async set(items) { Object.assign(values, structuredClone(items)); }, async remove(key) { delete values[key]; } };
}
const phrase = extra => ({ text: 'How are you?', translation: 'Como você está?', sourceLanguage: 'en', targetLanguage: 'pt',
  example: { text: 'How are you?', videoId: 'video1', time: 30 }, ...extra });

test('word meanings belong to individual references across videos; no five-reference eviction', async () => {
  const storage = memory(); const store = new VocabularyStore(storage);
  for (let i = 0; i < 9; i++) await store.save({ word: 'bank', sourceLanguage: 'en', targetLanguage: 'pt',
    definitions: [i % 2 ? 'margem' : 'banco'], note: `nota ${i}`,
    example: { text: `Example ${i}`, videoId: `video${i}`, time: i } });
  const word = (await new VocabularyStore(storage).list())[0];
  assert.equal(word.examples.length, 9); assert.equal(word.examples[0].videoId, 'video0');
  assert.deepEqual(word.examples[0].definitions, ['banco']); assert.deepEqual(word.examples[1].definitions, ['margem']);
  assert.equal(word.examples[1].note, 'nota 1');
  assert.deepEqual(word.definitions, ['banco', 'margem']);
});
test('legacy references stay intact without inventing a meaning; repeated occurrence merges senses', async () => {
  const storage = memory();
  storage.values['vocabulary:v1:en:pt:bank'] = { word: 'bank', sourceLanguage: 'en', targetLanguage: 'pt', id: 'en:pt:bank',
    definitions: ['banco'], note: 'nota antiga', examples: [{ text: 'old', videoId: 'oldvideo', time: 12 }], createdAt: 123 };
  const store = new VocabularyStore(storage);
  const input = { word: 'bank', sourceLanguage: 'en', targetLanguage: 'pt', definitions: ['margem'],
    example: { text: 'new', videoId: 'newvideo', time: 44 } };
  await store.save(input); await store.save({ ...input, definitions: ['barranco'] });
  const [word] = await store.list();
  assert.equal(word.examples.length, 2); assert.deepEqual(word.examples[0].definitions, []);
  assert.deepEqual(word.examples[1].definitions, ['margem', 'barranco']);
  assert.equal(word.createdAt, 123); assert.equal(word.note, 'nota antiga');
});
test('reverse dictionary uses complete equivalents and does not pretend to align sentence words', async () => {
  const provider = new DictionaryProvider(async () => ({ source: 'fixture', entries: {
    bank: [{ word: 'bank', senses: [['banco'], ['banco de areia']] }], seat: [{ word: 'seat', senses: [['banco']] }]
  } }));
  const result = await provider.lookup('banco', 'pt', 'en');
  assert.deepEqual(result.entries[0].senses, [['bank'], ['seat']]);
  assert.equal(result.entries[0].match, 'reverse');
  assert.equal((await provider.lookup('areia', 'pt', 'en')).status, 'missing');
});
test('sentences persist with original, translation and multiple video timestamps; same text avoids duplicates', async () => {
  const storage = memory(); const store = new SentenceStore(storage);
  const first = await store.save(phrase());
  await store.save(phrase({ example: { text: 'How are you?', videoId: 'video2', time: 75 } }));
  const [saved] = await new SentenceStore(storage).list();
  assert.equal(saved.id, first.id); assert.equal(saved.examples.length, 2);
  assert.equal(saved.text, 'How are you?'); assert.equal(saved.translation, 'Como você está?');
  assert.equal(saved.examples[1].time, 75);
  assert.equal((await store.save(phrase())).examples.length, 2);
});
test('sentence language pairs are independent, translations can be completed and edited, remove scoped', async () => {
  const storage = memory(); const store = new SentenceStore(storage);
  await store.save(phrase({ translation: '' }));
  const saved = await store.save(phrase());
  await store.save(phrase({ targetLanguage: 'de', translation: 'Wie geht es dir?' }));
  assert.equal((await store.list()).length, 2);
  assert.equal(saved.translation, 'Como você está?');
  await store.update({ ...saved, translation: 'Tudo bem?', note: 'cumprimento' });
  assert.equal((await store.save(phrase())).translation, 'Tudo bem?', 'a later save preserves a personal edit');
  await store.remove(saved); assert.equal((await store.list())[0].targetLanguage, 'de');
  await assert.rejects(store.save(phrase({ text: ' ' })), /inválido/);
});
test('v2 backup preserves word references and sentence cards while v1 remains supported', async () => {
  const storage = memory(), sentences = new SentenceStore(storage), words = new VocabularyStore(storage);
  const saved = await sentences.save(phrase());
  const backup = { format: 'subtitleclick-vocabulary', version: 2, words: [], sentences: [saved] };
  const fresh = memory();
  const changes = { ...words.prepareRestore(backup, {}), ...await sentences.prepareRestore(backup, {}) };
  await fresh.set(changes);
  assert.equal((await new SentenceStore(fresh).list())[0].translation, saved.translation);
  assert.deepEqual(await sentences.prepareRestore({ version: 1 }, {}), {});
  await assert.rejects(sentences.prepareRestore({ ...backup, sentences: [{ text: null }] }, {}), /inválido/);
});
test('experimental first view is reversible and target languages validated', () => {
  assert.equal(Settings.sanitize({}).originalFirst, true);
  assert.equal(Settings.sanitize({ originalFirst: false }).originalFirst, false);
  assert.equal(Settings.sanitize({ targetLanguage: 'de' }).targetLanguage, 'de');
  assert.equal(Settings.sanitize({ targetLanguage: '__proto__' }).targetLanguage, 'pt');
});
