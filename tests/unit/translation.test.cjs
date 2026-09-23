const { test } = require('node:test');
const assert = require('node:assert/strict');
require('../../src/translation/chrome-translator-provider.js');
require('../../src/translation/translation-service.js');
require('../../src/storage/settings.js');
const { ChromeTranslatorProvider: Provider, TranslationService: Service, Settings } = globalThis.SubtitleClick;
const tick = () => new Promise(resolve => setImmediate(resolve));

test('missing or incomplete API is detected safely', async () => {
  for (const scope of [{}, { Translator: {} }, { Translator: { create() {} } }]) {
    const provider = new Provider(scope);
    assert.equal(await provider.availability(), 'unavailable');
    await assert.rejects(provider.translate('hello', 'en', 'pt'), { code: 'unavailable' });
  }
});
test('create runs synchronously in the user gesture; download progress is forwarded', async () => {
  let created = false, called, destroyed = 0;
  const states = [];
  const provider = new Provider({ Translator: {
    availability: async () => 'downloadable',
    create(options) {
      created = true;
      assert.equal(options.sourceLanguage, 'en');
      assert.equal(options.targetLanguage, 'pt');
      options.monitor({ addEventListener(type, callback) {
        assert.equal(type, 'downloadprogress');
        callback({ loaded: 0.42 });
      } });
      return Promise.resolve({ translate: async text => { called = text; return 'Olá!'; }, destroy() { destroyed++; } });
    }
  } });
  const promise = provider.translate('Hello!\nHow are you?', 'en', 'pt', { onStatus: s => states.push(s) });
  assert.ok(created);
  assert.equal(await promise, 'Olá!');
  assert.equal(called, 'Hello!\nHow are you?');
  assert.ok(states.some(s => s.state === 'downloading' && s.progress === .42));
  provider.destroy();
  assert.equal(destroyed, 1);
});
test('all modern availability states are passed through', async () => {
  for (const state of ['available', 'downloadable', 'downloading', 'unavailable']) {
    const provider = new Provider({ Translator: { availability: async () => state, create() {} } });
    assert.equal(await provider.availability(), state);
  }
});
test('creation failures have useful error codes and can be retried', async () => {
  for (const [name, availability, code] of [
    ['NotAllowedError', 'downloadable', 'activation'],
    ['NotSupportedError', 'available', 'unsupported'],
    ['OperationError', 'unavailable', 'unsupported'],
    ['NetworkError', 'downloadable', 'download']
  ]) {
    let failed = true;
    const provider = new Provider({ Translator: {
      availability: async () => availability,
      create() {
        if (failed) throw Object.assign(new Error(), { name });
        return Promise.resolve({ translate: async () => 'Olá', destroy() {} });
      }
    } });
    await assert.rejects(provider.translate('Hello', 'en', 'pt'), { code });
    failed = false;
    assert.equal(await provider.translate('Hello', 'en', 'pt'), 'Olá');
  }
});
test('translation failures and empty results are not returned as successful translations', async () => {
  for (const translate of [async () => { throw new Error('failure'); }, async () => '',
    async () => { throw new DOMException('Unexpected native abort', 'AbortError'); }]) {
    const provider = new Provider({ Translator: {
      availability: async () => 'available',
      create: async () => ({ translate, destroy() {} })
    } });
    await assert.rejects(provider.translate('Hello', 'en', 'pt'), { code: 'translation' });
  }
});
test('shared model download serves newest request and never translates the canceled text', async () => {
  let finish, creates = 0;
  const translated = [];
  const provider = new Provider({ Translator: {
    availability: async () => 'downloading',
    create: () => { creates++; return new Promise(resolve => { finish = resolve; }); }
  } });
  const service = new Service(provider);
  const first = service.translate('old');
  const rejected = assert.rejects(first, { name: 'AbortError' });
  const second = service.translate('new');
  finish({ translate: async text => { translated.push(text); return 'novo'; }, destroy() {} });
  await rejected;
  assert.equal(await second, 'novo');
  assert.equal(creates, 1);
  assert.deepEqual(translated, ['new']);
});
test('cache is bounded, in memory and separated by language and exact text', async () => {
  let calls = 0;
  const service = new Service({ translate: async text => { calls++; return text; } }, { cacheLimit: 2 });
  await service.translate('one');
  await service.translate('two');
  await service.translate('one');
  assert.equal(calls, 2);
  await service.translate('three');
  await service.translate('two');
  await service.translate('two', 'en', 'fr');
  assert.equal(calls, 5);
  assert.equal(service.cache.size, 2);
  service.clear();
  assert.equal(service.cache.size, 0);
});
test('cancel works even when a provider ignores abort and stale output never enters cache', async () => {
  let finish;
  const service = new Service({ translate: () => new Promise(resolve => { finish = resolve; }) });
  const result = service.translate('one');
  const rejected = assert.rejects(result, { name: 'AbortError' });
  service.clear();
  await rejected;
  finish('stale');
  await tick();
  assert.equal(service.cache.size, 0);
});
test('timeout releases waiting callers', async () => {
  let destroyed = false;
  const service = new Service({ translate: () => new Promise(() => {}), destroy() { destroyed = true; } }, { timeoutMs: 10 });
  await assert.rejects(service.translate('one'), { code: 'timeout' });
  assert.equal(destroyed, true);
});
test('destroy disposes a model that finishes downloading after teardown', async () => {
  let finish, destroyed = false;
  const provider = new Provider({ Translator: {
    availability: async () => 'downloadable',
    create: () => new Promise(resolve => { finish = resolve; })
  } });
  const result = provider.translate('one', 'en', 'pt');
  provider.destroy();
  finish({ destroy() { destroyed = true; } });
  await assert.rejects(result, { name: 'AbortError' });
  assert.ok(destroyed);
});
test('input and stored preferences are validated', async () => {
  const service = new Service({ translate() { assert.fail('must not be called'); } });
  for (const value of ['', ' ', null, 'x'.repeat(5001)]) await assert.rejects(service.translate(value), { code: 'invalid' });
  assert.deepEqual(Settings.sanitize({ enabled: false, pauseOnClick: 'no', other: true }), { ...Settings.defaults, enabled: false });
  assert.deepEqual(Settings.sanitize(null), Settings.defaults);
});
