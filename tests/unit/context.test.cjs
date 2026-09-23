const { test } = require('node:test');
const assert = require('node:assert/strict');
require('../../src/content/caption-context.js');
require('../../src/storage/settings.js');
const { CaptionContext, mergeCaptions, Settings } = globalThis.SubtitleClick;

test('fragmented phrases use only recent preceding captions', () => {
  const context = new CaptionContext();
  context.observe('I was thinking about', 10);
  context.observe('I was thinking about', 12);
  assert.equal(context.get('learning Japanese.', 13), 'I was thinking about learning Japanese.');
});
test('rolling captions and progressive words do not duplicate source text', () => {
  const context = new CaptionContext();
  context.observe('I want', 10);
  context.observe('I want to learn', 11);
  assert.equal(context.entries.length, 1);
  assert.equal(context.get('to learn Japanese', 12), 'I want to learn Japanese');
  assert.equal(mergeCaptions('this is', 'island life'), 'this is island life');
});
test('Japanese and Russian preserve Unicode and remove repeated boundaries', () => {
  assert.equal(mergeCaptions('私は日本語を', '日本語を勉強しています'), '私は日本語を勉強しています');
  assert.equal(mergeCaptions('я хочу изучать', 'изучать немецкий'), 'я хочу изучать немецкий');
  assert.equal(mergeCaptions('毎日', '勉強します'), '毎日勉強します');
});
test('sentence endings, long gaps and backwards seeks stop context carryover', () => {
  for (const ending of ['Done.', 'Готово!', '終わり。', 'Really?”']) {
    const context = new CaptionContext();
    context.observe(ending, 10);
    assert.equal(context.get('Next', 11), 'Next');
  }
  for (const nextTime of [2, 30]) {
    const context = new CaptionContext();
    context.observe('old fragment', 10);
    assert.equal(context.get('new fragment', nextTime), 'new fragment');
  }
});
test('empty gaps expire context and original line breaks survive without context', () => {
  const context = new CaptionContext();
  context.observe('older', 10);
  context.observe('', 12);
  context.observe('', 14);
  assert.equal(context.get('new\nline', 15), 'new\nline');
  context.clear();
  assert.equal(context.entries.length, 0);
});
test('memory and translation context stay bounded', () => {
  const context = new CaptionContext();
  for (let i = 0; i < 100; i++) context.observe(`fragment ${i}`, i / 10);
  assert.ok(context.entries.length <= 30);
  const text = context.get('current', 10.1);
  assert.ok(text.length <= 700);
  assert.ok(!text.includes('fragment 0 '));
});
test('older settings migrate and unsupported preferences are rejected', async () => {
  assert.deepEqual(Settings.sanitize({ enabled: false, pauseOnClick: false }), {
    ...Settings.defaults, enabled: false, pauseOnClick: false
  });
  for (const language of ['ja', 'ru', 'de', 'zh-Hant']) {
    assert.equal(Settings.sanitize({ sourceLanguage: language }).sourceLanguage, language);
  }
  assert.equal(Settings.sanitize({ sourceLanguage: '__proto__', rewindSeconds: -5 }).sourceLanguage, 'en');
  assert.equal(Settings.sanitize({ rewindSeconds: 5 }).rewindSeconds, 5);
  await assert.rejects(Settings.set('rewindSeconds', 999), TypeError);
  await assert.rejects(Settings.set('sourceLanguage', 'unknown'), TypeError);
});
