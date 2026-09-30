const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../..');

test('real Chrome recovers from old worker returning unknown action, reloads code and preserves saved data', { timeout: 60000 }, async t => {
  fs.mkdirSync(path.join(root, 'test-results'), { recursive: true });
  const extension = fs.mkdtempSync(path.join(root, 'test-results/update-extension-'));
  fs.cpSync(path.join(root, 'src'), path.join(extension, 'src'), { recursive: true });
  fs.copyFileSync(path.join(root, 'manifest.json'), path.join(extension, 'manifest.json'));
  // Reproduce the mixed state: new UI files on disk, an old running dispatcher.
  fs.writeFileSync(path.join(extension, 'src/background.js'), `chrome.runtime.onMessage.addListener((message, sender, reply) => {
    if (message.channel === 'subtitleclick-vocabulary') reply({ ok: false, error: 'Ação desconhecida.' });
  });`);
  const context = await chromium.launchPersistentContext('', { headless: true, channel: process.env.BROWSER_CHANNEL || 'chromium',
    args: ['--disable-extensions-except=' + extension, '--load-extension=' + extension] });
  t.after(() => context.close());
  const old = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  const origin = 'chrome-extension://' + new URL(old.url()).host;
  // Match the user's unpacked install: developer mode is required after reload.
  const extensions = await context.newPage();
  await extensions.goto('chrome://extensions');
  await extensions.evaluate(() => chrome.developerPrivate.updateProfileConfiguration({ inDeveloperMode: true }));
  const popup = await context.newPage();
  await popup.goto(origin + '/src/popup/popup.html');
  await popup.getByRole('button', { name: 'Aplicar atualização' }).waitFor();
  assert.match(await popup.locator('#storage-status').innerText(), /versão antiga/);
  const input = { text: 'A sentence to remember.', translation: '', sourceLanguage: 'en', targetLanguage: 'pt',
    example: { text: 'A sentence to remember.', videoId: 'fixture', time: 42 } };
  await assert.rejects(popup.evaluate(payload => SubtitleClick.VocabularyClient.request('sentences-save', payload), input), /versão antiga/);
  await popup.evaluate(() => chrome.storage.local.set({ userDataToPreserve: { note: 'minha nota antiga' } }));
  fs.copyFileSync(path.join(root, 'src/background.js'), path.join(extension, 'src/background.js'));
  const stopped = old.waitForEvent('close', { timeout: 15000 });
  await popup.getByRole('button', { name: 'Aplicar atualização' }).click();
  await stopped;
  // Worker close precedes extension re-registration. Wait for Chrome itself to
  // report readiness before opening the replacement popup, as a user would.
  await extensions.waitForFunction(async id => {
    const info = (await chrome.developerPrivate.getExtensionsInfo({ includeDisabled: true })).find(item => item.id === id);
    return info?.state === 'ENABLED' && !info.disableReasons.reloading;
  }, new URL(old.url()).host);
  // Extension workers are lazy: opening the new popup wakes the updated worker.
  const fresh = await context.newPage();
  for (let attempt = 0; ; attempt++) {
    try { await fresh.goto(origin + '/src/popup/popup.html'); break; }
    catch (error) {
      // Chrome briefly blocks extension URLs while re-registering the reload.
      if (attempt >= 20 || !error.message.includes('ERR_BLOCKED_BY_CLIENT')) throw error;
      await new Promise(resolve => setTimeout(resolve, 250));
    }
  }
  try { await fresh.getByText('Versão 0.5.0 · armazenamento pronto.', { exact: true }).waitFor({ timeout: 5000 }); }
  catch (error) {
    console.log('Popup after reload:', await fresh.locator('#storage-status').innerText());
    console.log('Workers:', context.serviceWorkers().map(worker => worker.url()));
    throw error;
  }
  const saved = await fresh.evaluate(payload => SubtitleClick.VocabularyClient.request('sentences-save', payload), input);
  assert.equal(saved.text, input.text); assert.equal(saved.examples[0].time, 42);
  const values = await fresh.evaluate(() => chrome.storage.local.get(null));
  assert.equal(values.userDataToPreserve.note, 'minha nota antiga');
  assert.equal(Object.keys(values).filter(key => key.startsWith('sentences:v1:')).length, 1);
});
