const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../..');
test('real collection: lazy bounded embed, repeat, stop, next card, range persistence and old-card auto translation', { timeout: 60000 }, async t => {
  const context = await chromium.launchPersistentContext('', { headless: true, channel: process.env.BROWSER_CHANNEL || 'chromium',
    args: ['--disable-extensions-except=' + root, '--load-extension=' + root] });
  t.after(() => context.close());
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  const id = new URL(worker.url()).host;
  const page = await context.newPage();
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const requests = [];
  await context.route('https://www.youtube-nocookie.com/**', route => {
    requests.push(route.request().url());
    return route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<html><body style="background:#11252b;color:white;font:20px system-ui;display:grid;place-items:center;height:90vh"><p>Player de teste · trecho delimitado</p></body></html>' });
  });
  await context.setOffline(true);
  await page.goto('chrome-extension://' + id + '/src/vocabulary/sentences.html');
  const request = (action, payload) => page.evaluate(({ action, payload }) => SubtitleClick.VocabularyClient.request(action, payload), { action, payload });
  const item = { text: 'Learning is a journey.', translation: 'Aprender é uma jornada.', sourceLanguage: 'en', targetLanguage: 'pt',
    example: { text: 'Learning is a journey.', videoId: 'M7lc1UVf-VE', time: 20, clip: { start: 18.1, end: 22.4, source: 'estimated' } } };
  await request('sentences-save', item); await page.reload(); await page.locator('.word-item').click();
  assert.equal(requests.length, 0, 'no YouTube contact while browsing cards');
  await page.getByRole('button', { name: 'Ouvir trecho', exact: true }).click();
  await page.locator('iframe').waitFor();
  const embed = new URL(await page.locator('iframe').getAttribute('src'));
  assert.equal(embed.hostname, 'www.youtube-nocookie.com');
  assert.equal(embed.searchParams.get('start'), '18'); assert.equal(embed.searchParams.get('end'), '23');
  assert.equal(embed.searchParams.get('autoplay'), '1');
  const rules = await page.evaluate(() => chrome.declarativeNetRequest.getSessionRules());
  assert.equal(rules.length, 1); assert.deepEqual(rules[0].condition.initiatorDomains, [id]);
  assert.deepEqual(rules[0].condition.resourceTypes, ['sub_frame']);
  assert.match(rules[0].action.requestHeaders[0].value, new RegExp('^https://subtitleclick\\.' + id));
  await page.getByRole('button', { name: 'Repetir trecho', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('iframe')?.src.includes('end=23'));
  await page.getByRole('button', { name: 'Parar', exact: true }).click(); assert.equal(await page.locator('iframe').count(), 0);
  await page.getByText('Ajustar início e fim', { exact: true }).click();
  await page.getByLabel('Início (segundos)').fill('19.2'); await page.getByLabel('Fim (segundos)').fill('22.1');
  await page.getByRole('button', { name: 'Salvar limites', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.clip-status').textContent.includes('19.2–22.1'));
  const saved = (await request('sentences-list'))[0]; assert.deepEqual(saved.examples[0].clip, { start: 19.2, end: 22.1, source: 'manual' });
  assert.deepEqual((await request('export')).sentences[0].examples[0].clip, saved.examples[0].clip);
  await page.getByRole('button', { name: 'Estudar frases' }).click();
  assert.equal(await page.locator('#review .answer').isVisible(), false);
  await page.locator('#review').getByRole('button', { name: 'Ouvir trecho', exact: true }).click();
  await page.locator('#review iframe').waitFor();
  await page.screenshot({ path: path.join(root, 'test-results/clip-flashcard.png'), fullPage: true });
  await page.getByRole('button', { name: 'Próxima frase', exact: true }).click();
  assert.equal(await page.locator('iframe').count(), 0, 'next card destroys playback');
  await page.getByRole('button', { name: 'Voltar à coleção' }).click();
  const legacy = { ...item, text: 'Old card.', translation: '' };
  await request('sentences-save', legacy); await page.reload();
  await page.locator('.word-item').filter({ hasText: 'Old card.' }).click();
  await page.evaluate(() => Object.defineProperty(globalThis, 'Translator', { configurable: true, value: {
    availability: async () => 'available', create: async () => ({ translate: async () => 'Cartão antigo.', destroy() {} })
  } }));
  await page.getByRole('button', { name: 'Gerar tradução local' }).click();
  await page.waitForFunction(() => document.querySelector('#translation').value === 'Cartão antigo.');
  assert.equal((await request('sentences-list')).find(value => value.text === 'Old card.').translation, 'Cartão antigo.');
  assert.deepEqual(errors, []);
});
