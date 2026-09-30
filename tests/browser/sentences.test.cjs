const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../..');

test('real sentence collection: editing, reveal cards, language filter, references and atomic mixed backup', { timeout: 60000 }, async t => {
  const context = await chromium.launchPersistentContext('', { headless: true, channel: process.env.BROWSER_CHANNEL || 'chromium',
    args: [`--disable-extensions-except=${root}`, `--load-extension=${root}`] });
  t.after(() => context.close());
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  const page = await context.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await context.setOffline(true);
  // URL.origin for chrome-extension schemes can be "null" in Node, use host explicitly.
  const base = `chrome-extension://${new URL(worker.url()).host}`;
  await page.goto(`${base}/src/vocabulary/sentences.html`);
  const request = (action, payload) => page.evaluate(({ action, payload }) => SubtitleClick.VocabularyClient.request(action, payload), { action, payload });
  const item = { text: 'I learn something every day.', translation: 'Eu aprendo algo todos os dias.', sourceLanguage: 'en', targetLanguage: 'pt',
    example: { text: 'I learn something every day.', videoId: 'video1', time: 63 } };
  await request('sentences-save', item);
  await request('sentences-save', { ...item, example: { ...item.example, videoId: 'video2', time: 88 } });
  await request('sentences-save', { ...item, targetLanguage: 'de', translation: 'Ich lerne jeden Tag etwas.' });
  await page.reload();
  await page.locator('#language').selectOption('EN → PT');
  assert.equal(await page.locator('.word-item').count(), 1);
  await page.locator('.word-item').click();
  assert.equal(await page.getByRole('link', { name: /Voltar ao vídeo/ }).count(), 2);
  await page.getByLabel('Tradução (PT) — verso do cartão').fill('Aprendo algo novo todos os dias.');
  await page.getByRole('button', { name: 'Salvar alterações' }).click();
  await page.getByText('Frase atualizada.', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Estudar frases', exact: true }).click();
  assert.equal(await page.locator('#review .sentence-text').first().innerText(), item.text);
  assert.equal(await page.locator('#review .answer').isVisible(), false);
  await page.getByRole('button', { name: 'Mostrar tradução', exact: true }).click();
  assert.equal(await page.locator('#review .answer .sentence-text').innerText(), 'Aprendo algo novo todos os dias.');
  await page.screenshot({ path: path.join(root, 'test-results/sentence-flashcard.png'), fullPage: true });
  await page.getByRole('button', { name: 'Próxima frase', exact: true }).click();
  await page.getByText('Você chegou ao fim destas frases.', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Voltar à coleção', exact: true }).click();
  const backup = await request('export');
  assert.equal(backup.version, 2); assert.equal(backup.sentences.length, 2);
  await request('sentences-remove', item);
  await request('import', backup);
  assert.equal((await request('sentences-list')).length, 2);
  const before = await request('export');
  const invalid = { ...backup, words: [{ word: 'test', sourceLanguage: 'en', targetLanguage: 'pt', definitions: ['teste'] }], sentences: [{ ...item, text: null }] };
  await assert.rejects(request('import', invalid), /inválido/);
  assert.deepEqual((await request('export')).words, before.words, 'invalid sentence prevents word writes too');
  assert.equal((await request('sentences-list')).length, 2);
  await page.goto(`${base}/src/vocabulary/vocabulary.html`);
  await page.getByRole('button', { name: 'Exportar backup', exact: true }).waitFor({ state: 'visible' });
  assert.equal(await page.getByRole('button', { name: 'Exportar backup', exact: true }).isEnabled(), true, 'export works with sentences and no words');
  assert.deepEqual(errors, []);
});
