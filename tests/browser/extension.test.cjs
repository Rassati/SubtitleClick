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
    contentType: 'text/html', body: fs.readFileSync(path.join(root, 'tests/fixtures/youtube.html'), 'utf8').replace('</head>', `<script>
      window.playerKeys = [];
      for (const name of ['keydown', 'keypress', 'keyup']) window.addEventListener(name, event => {
        if (event.key === ' ') { window.playerKeys.push(name); document.querySelector('video')?.dispatchEvent(new Event('play')); }
      }, true);
    </script></head>`)
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
  // The reversible original-first mode is the new default. Request translation explicitly.
  const { root: originalDom } = await cdp.send('DOM.getDocument', { depth: -1, pierce: true });
  const translateNode = flatten(originalDom).find(node => node.nodeName === 'BUTTON' && node.children?.some(child => child.nodeValue === 'Traduzir frase'));
  const translateObject = await cdp.send('DOM.resolveNode', { nodeId: translateNode.nodeId });
  await cdp.send('Runtime.callFunctionOn', { objectId: translateObject.object.objectId, functionDeclaration: 'function() { this.click(); }', userGesture: true });
  // CDP can inspect closed shadow roots without changing production encapsulation.
  let documentTree;
  for (let attempt = 0; attempt < 20; attempt++) {
    documentTree = await cdp.send('DOM.getDocument', { depth: -1, pierce: true });
    if (JSON.stringify(documentTree).includes('Tradução local não está disponível neste navegador.')) break;
    await page.waitForTimeout(50);
  }
  assert.ok(JSON.stringify(documentTree).includes('Tradução local não está disponível neste navegador.'));
  async function clickCardButton(label) {
    const { root: dom } = await cdp.send('DOM.getDocument', { depth: -1, pierce: true });
    const node = flatten(dom).find(node => ['BUTTON', 'SUMMARY'].includes(node.nodeName) && node.children?.some(child => child.nodeValue === label));
    assert.ok(node, label);
    const { object } = await cdp.send('DOM.resolveNode', { nodeId: node.nodeId });
    await cdp.send('Runtime.callFunctionOn', { objectId: object.objectId, functionDeclaration: 'function() { this.click(); }', userGesture: true });
  }
  // An unavailable translator must not silently create a blank flashcard.
  await clickCardButton('Salvar frase');
  await page.waitForTimeout(80);
  assert.equal((await evaluate('SubtitleClick.VocabularyClient.request("sentences-list")')).length, 0);
  // Translation is mocked here; messaging, UI and persistent storage remain real.
  await evaluate(`Object.defineProperty(globalThis, 'Translator', { configurable: true, value: {
    availability: async () => 'available', create: async () => ({ translate: async () => 'A melhor forma de aprender é continuar.', destroy() {} })
  } }); true`);
  await clickCardButton('Salvar frase');
  let sentenceList;
  for (let attempt = 0; attempt < 20; attempt++) {
    sentenceList = await evaluate('SubtitleClick.VocabularyClient.request("sentences-list")');
    if (sentenceList.length) break;
    await page.waitForTimeout(50);
  }
  assert.equal(sentenceList[0].text, 'The best way to learn is to keep going.');
  assert.equal(sentenceList[0].examples[0].videoId, 'fixture');
  assert.equal(sentenceList[0].translation, 'A melhor forma de aprender é continuar.');
  await evaluate("Object.defineProperty(globalThis, 'Translator', { configurable: true, value: undefined }); true");
  // Exercise the full real content-script -> worker -> packaged dictionary -> storage path.
  await page.keyboard.press('Escape');
  await page.evaluate(() => { document.querySelector('.ytp-caption-segment').textContent = 'I run.'; });
  const point = await page.evaluate(() => {
    const text = document.querySelector('.ytp-caption-segment').firstChild;
    const range = document.createRange(); range.setStart(text, 2); range.setEnd(text, 5);
    const rect = range.getBoundingClientRect(); return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  });
  await page.keyboard.down('Alt'); await page.mouse.click(point.x, point.y); await page.keyboard.up('Alt');
  function flatten(node) { return [node, ...(node.children ?? []).flatMap(flatten), ...(node.shadowRoots ?? []).flatMap(flatten)]; }
  let saveNode;
  for (let attempt = 0; attempt < 50; attempt++) {
    const { root: dom } = await cdp.send('DOM.getDocument', { depth: -1, pierce: true });
    if (JSON.stringify(dom).includes('Marque os significados que deseja guardar.')) {
      saveNode = flatten(dom).find(node => node.nodeName === 'BUTTON' && node.children?.some(child => child.nodeValue === 'Salvar no meu dicionário'));
      if (saveNode) break;
    }
    await page.waitForTimeout(50);
  }
  assert.ok(saveNode, 'real offline dictionary is visible without Translator API');
  await clickCardButton('Adicionar anotação');
  const { root: noteDom } = await cdp.send('DOM.getDocument', { depth: -1, pierce: true });
  const noteNode = flatten(noteDom).find(node => node.nodeName === 'TEXTAREA');
  const { object: noteObject } = await cdp.send('DOM.resolveNode', { nodeId: noteNode.nodeId });
  await cdp.send('Runtime.callFunctionOn', { objectId: noteObject.objectId, functionDeclaration: 'function() { this.focus(); }' });
  await page.keyboard.type('anotacao com varios espacos');
  const noteValue = await cdp.send('Runtime.callFunctionOn', { objectId: noteObject.objectId, functionDeclaration: 'function() { return this.value; }', returnByValue: true });
  assert.equal(noteValue.result.value, 'anotacao com varios espacos');
  assert.deepEqual(await page.evaluate(() => window.playerKeys), []);
  // Re-resolve the save button after DOM inspection, without opening the shadow root.
  const { root: updatedDom } = await cdp.send('DOM.getDocument', { depth: -1, pierce: true });
  saveNode = flatten(updatedDom).find(node => node.nodeName === 'BUTTON' && node.children?.some(child => child.nodeValue === 'Salvar no meu dicionário'));
  const { object } = await cdp.send('DOM.resolveNode', { nodeId: saveNode.nodeId });
  await cdp.send('Runtime.callFunctionOn', { objectId: object.objectId, functionDeclaration: 'function() { this.click(); }' });
  let vocabulary;
  for (let attempt = 0; attempt < 20; attempt++) {
    vocabulary = await evaluate('SubtitleClick.VocabularyClient.request("list")');
    if (vocabulary.length) break;
    await page.waitForTimeout(50);
  }
  assert.equal(vocabulary[0].word, 'run');
  assert.equal(vocabulary[0].examples[0].text, 'I run.');
  assert.ok(vocabulary[0].definitions.length);
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
  await popup.getByText('Reprodução e contexto', { exact: true }).click();
  await popup.locator('#rewindSeconds:enabled').selectOption('5');
  await popup.reload();
  await popup.locator('#enabled:enabled').waitFor();
  assert.equal(await popup.locator('#sourceLanguage').inputValue(), 'ja');
  assert.equal(await popup.locator('#rewindSeconds').inputValue(), '5');
  assert.equal(await popup.locator('#originalFirst').isChecked(), true);
  await popup.locator('#originalFirst').uncheck();
  await popup.locator('#targetLanguage:enabled').selectOption('en');
  await popup.reload();
  await popup.locator('#originalFirst:enabled').waitFor();
  assert.equal(await popup.locator('#originalFirst').isChecked(), false);
  assert.equal(await popup.locator('#targetLanguage').inputValue(), 'en');
  assert.equal(await evaluate('SubtitleClick.Settings.load().then(s => s.sourceLanguage)'), 'ja');
  assert.ok(await popup.locator('body').evaluate(body => body.getBoundingClientRect().height <= 600), 'popup fits Chrome height limit');
  fs.mkdirSync(path.join(root, 'test-results'), { recursive: true });
  await popup.locator('body').screenshot({ path: path.join(root, 'test-results/popup.png') });
  const opened = context.waitForEvent('page');
  await popup.getByRole('link', { name: /Meu dicionário/ }).click();
  const collection = await opened;
  await collection.waitForURL(`chrome-extension://${extensionId}/src/vocabulary/vocabulary.html`);
  await collection.getByRole('button', { name: /run/ }).waitFor();
});
