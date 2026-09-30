const { test } = require('node:test');
const assert = require('node:assert/strict');
require('../../src/content/caption-timing.js');
require('../../src/dictionary/dictionary-provider.js');
require('../../src/storage/vocabulary-store.js');
require('../../src/storage/sentence-store.js');
const { CaptionTiming, SentenceStore, VocabularyData } = SubtitleClick;
test('native cue boundaries win; DOM-only capture remains explicitly approximate and bounded', () => {
  const timing = new CaptionTiming(); timing.observe('Hello.', 20);
  const first = timing.capture('Hello.', 'Hello.', 20, 20, {});
  assert.deepEqual(first.clip, { start: 18, end: 21, source: 'estimated' });
  const native = timing.capture('Hello.', 'Hello.', 20, 20, { textTracks: [
    { mode: 'showing', activeCues: [{ text: 'Hello.', startTime: 19.1, endTime: 22.7 }] }
  ] });
  assert.deepEqual(native.clip, { start: 19.1, end: 22.7, source: 'cue' });
  assert.equal(timing.capture('', '', undefined, 0, {}), null);
  assert.equal(timing.capture('Hello.', 'Hello.', 20, 20, { duration: 17 }), null);
});
test('caption transition completes saved range; progressive words do not end it; seeks discard observers', () => {
  const timing = new CaptionTiming(); timing.observe('Previous.', 18); timing.observe('We learn', 19);
  const capture = timing.capture('We learn', 'We learn', 20, 19, {});
  let result;
  timing.track(capture, clip => { result = clip; });
  timing.observe('We learn English.', 21); assert.equal(result, undefined);
  timing.observe('', 22.5); assert.deepEqual(result, { start: 19, end: 22.5, source: 'observed' });
  result = undefined; timing.track(capture, clip => { result = clip; });
  timing.observe('Elsewhere.', 80); assert.equal(result, undefined);
  timing.observe('Earlier.', 10); assert.equal(timing.pending.length, 0);
});
test('ranges survive save, merge and backup; manual boundaries survive automatic updates; invalid bounds rejected', async () => {
  const values = {}; const storage = { async get(key) { return structuredClone(key === null ? values : { [key]: values[key] }); },
    async set(items) { Object.assign(values, structuredClone(items)); } };
  const store = new SentenceStore(storage);
  const input = { text: 'We learn.', translation: 'Nós aprendemos.', sourceLanguage: 'en', targetLanguage: 'pt',
    example: { text: 'We learn.', videoId: 'video000001', time: 20, clip: { start: 18, end: 22, source: 'estimated' } } };
  await store.save(input);
  await store.updateClip({ ...input, clip: { start: 18.2, end: 23.1 }, automatic: false });
  await store.updateClip({ ...input, clip: { start: 18, end: 24, source: 'observed' }, automatic: true });
  await store.save(input);
  const saved = (await store.list())[0];
  assert.deepEqual(saved.examples[0].clip, { start: 18.2, end: 23.1, source: 'manual' });
  const changes = await store.prepareRestore({ version: 2, sentences: [saved] }, {});
  assert.deepEqual(Object.values(changes)[0].examples[0].clip, saved.examples[0].clip);
  await assert.rejects(store.updateClip({ ...input, clip: { start: 25, end: 24 } }), /trecho/);
  for (const clip of [{ start: -1, end: 3 }, { start: 0, end: 121 }, { start: 0, end: Infinity }, { start: 1, end: 1.001 }]) assert.equal(VocabularyData.clipOf(clip), null);
  await assert.rejects(store.updateClip({ ...input, example: { ...input.example, time: 99 }, clip: { start: 1, end: 2 } }), /referência/);
});
