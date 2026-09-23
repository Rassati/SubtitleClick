const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../..');

test('real MV3 manifest injects isolated scripts, popup persists preferences, unsupported API stays local', { timeout: 60000 }, async t => {
  const context = await chromium.launchPersistentContext('', {
    headless: true,
    channel: process.env.BROWSER_CHANNEL || 'chromium',
    args: [`--disable-extensions-except=${root}`, `--load-extension=${root}`]
  });
  t.after(() => context.close());
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  const worlds = [];
  cdp.on('Runtime.executionContextCreated', ({ context }) => worlds.push(context));
  await cdp.send('Runtime.enable');
  await page.route('https://www.youtube.com/**', route => route.fulfill({
    contentType: 'text/html', body: fs.readFileSync(path.join(root, 'tests/fixtures/youtube.html'), 'utf8')
  }));
  await page.goto('https://www.youtube.com/watch?v=fixture');
  await page.waitForSelector('[data-subtitleclick-caption]');
  assert.equal(await page.evaluate(() => typeof globalThis.SubtitleClick), 'undefined');
  const world = worlds.find(world => world.origin.startsWith('chrome-extension://'));
  assert.ok(world, 'extension isolated world exists');
  async function evaluate(expression) {
    const result = await cdp.send('Runtime.evaluate', { expression, contextId: world.id, awaitPromise: true, returnByValue: true });
    assert.equal(result.exceptionDetails, undefined);
    return result.result.value;
  }
  const extensionId = await evaluate('chrome.runtime.id');
  const nativeStatus = await evaluate('new SubtitleClick.ChromeTranslatorProvider().availability()');
  t.diagnostic(`Native Translator availability in isolated world: ${nativeStatus}`);
  assert.equal(await evaluate('chrome.runtime.getManifest().manifest_version'), 3);
  await evaluate("Object.defineProperty(globalThis, 'Translator', { configurable: true, value: undefined }); true");
  await page.locator('.caption-window').click();
  // CDP can inspect closed shadow roots without changing production encapsulation.
  let documentTree;
  for (let attempt = 0; attempt < 20; attempt++) {
    documentTree = await cdp.send('DOM.getDocument', { depth: -1, pierce: true });
    if (JSON.stringify(documentTree).includes('Tradução local não está disponível neste navegador.')) break;
    await page.waitForTimeout(50);
  }
  assert.ok(JSON.stringify(documentTree).includes('Tradução local não está disponível neste navegador.'));
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/src/popup/popup.html`);
  await popup.locator('#enabled:enabled').waitFor();
  assert.equal(await popup.locator('#enabled').isChecked(), true);
  await popup.locator('#enabled').uncheck();
  await page.waitForFunction(() => !document.querySelector('[data-subtitleclick-ui]'));
  await popup.reload();
  await popup.locator('#enabled:enabled').waitFor();
  assert.equal(await popup.locator('#enabled').isChecked(), false);
  await popup.locator('#enabled').check();
  await page.waitForSelector('[data-subtitleclick-caption]');
  await popup.locator('#sourceLanguage:enabled').selectOption('ja');
  await popup.locator('#rewindSeconds:enabled').selectOption('5');
  await popup.reload();
  await popup.locator('#enabled:enabled').waitFor();
  assert.equal(await popup.locator('#sourceLanguage').inputValue(), 'ja');
  assert.equal(await popup.locator('#rewindSeconds').inputValue(), '5');
  assert.equal(await evaluate('SubtitleClick.Settings.load().then(s => s.sourceLanguage)'), 'ja');
  assert.ok(await popup.locator('body').evaluate(body => body.getBoundingClientRect().height <= 600), 'popup fits Chrome height limit');
  fs.mkdirSync(path.join(root, 'test-results'), { recursive: true });
  await popup.locator('body').screenshot({ path: path.join(root, 'test-results/popup.png') });
});
