const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../..');

test('real MV3 worker: offline dictionary, concurrent saves, browser restart, editing and backup roundtrip', { timeout: 90000 }, async t => {
  fs.mkdirSync(path.join(root, 'test-results'), { recursive: true });
  const profile = fs.mkdtempSync(path.join(root, 'test-results/vocabulary-profile-'));
  let context;
  const launch = async () => chromium.launchPersistentContext(profile, {
    headless: true, channel: process.env.BROWSER_CHANNEL || 'chromium',
    args: [`--disable-extensions-except=${root}`, `--load-extension=${root}`]
  });
  t.after(async () => { await context?.close(); });
  context = await launch();
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  const id = new URL(worker.url()).host;
  let page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  // No network is needed for lookups or the collection.
  await context.setOffline(true);
  await page.goto(`chrome-extension://${id}/src/vocabulary/vocabulary.html`);
  const request = (action, payload) => page.evaluate(async ({ action, payload }) =>
    SubtitleClick.VocabularyClient.request(action, payload), { action, payload });
  const lookup = await request('lookup', { word: 'bank', sourceLanguage: 'en', targetLanguage: 'pt' });
  assert.equal(lookup.status, 'found');
  assert.ok(lookup.entries.flatMap(e => e.senses.flat()).length > 1);
  const item = { word: 'bank', sourceLanguage: 'en', targetLanguage: 'pt', definitions: ['banco'], note: 'river bank',
    dictionarySource: lookup.source, example: { text: 'We sat on the bank.', videoId: 'abcdefghijk', time: 42 } };
  await Promise.all(Array.from({ length: 8 }, (_, i) => request('save', { ...item, definitions: ['banco', `sentido ${i}`], example: { ...item.example, time: 42 + i } })));
  let saved = await request('list');
  assert.equal(saved.length, 1); assert.equal(saved[0].definitions.length, 9); assert.equal(saved[0].examples.length, 8);
  await context.close();
  context = await launch();
  await context.setOffline(true);
  page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`chrome-extension://${id}/src/vocabulary/vocabulary.html`);
  await page.getByRole('button', { name: /bank/ }).waitFor();
  await page.getByRole('button', { name: /bank/ }).click();
  assert.equal(await page.getByLabel('Sua anotação', { exact: true }).inputValue(), 'river bank');
  const malicious = '<img src=x onerror=alert(1)>';
  await page.getByLabel('Sua anotação', { exact: true }).fill(malicious);
  await page.getByLabel('Significados — um por linha').fill('margem de rio\nbanco');
  await page.getByRole('button', { name: 'Salvar alterações' }).click();
  await page.getByText('Alterações salvas neste navegador.', { exact: true }).waitFor();
  await page.reload(); await page.getByRole('button', { name: /bank/ }).click();
  assert.equal(await page.getByLabel('Sua anotação', { exact: true }).inputValue(), malicious);
  assert.equal(await page.locator('img').count(), 0);
  assert.match(await page.getByRole('link', { name: /Voltar ao vídeo/ }).first().getAttribute('href'), /^https:\/\/www.youtube.com\/watch\?v=abcdefghijk&t=\d+s$/);
  await page.locator('#search').fill('margem'); assert.equal(await page.locator('.word-item').count(), 1);
  await page.locator('#search').fill('não existe'); assert.equal(await page.locator('.word-item').count(), 0);
  await page.locator('#search').fill('');
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar backup' }).click();
  const download = await downloadEvent;
  const backup = fs.readFileSync(await download.path(), 'utf8');
  assert.equal(JSON.parse(backup).words.length, 1);
  await page.screenshot({ path: path.join(root, 'test-results/my-dictionary.png'), fullPage: true });
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Remover palavra' }).click();
  await page.getByText('Palavra removida.', { exact: true }).waitFor();
  assert.equal((await request('list')).length, 0);
  await page.locator('#file').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(backup) });
  await page.getByText(/1 palavras importadas/).waitFor();
  saved = await request('list'); assert.equal(saved[0].note, malicious);
  await page.locator('#file').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{not json') });
  await page.getByText('Arquivo JSON inválido. Nada foi importado.', { exact: true }).waitFor();
  assert.equal((await request('list')).length, 1);
  assert.deepEqual(errors, []);
});
