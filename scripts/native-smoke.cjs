// Opt-in smoke test: runs the REAL Translator API. Chrome may download models.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
if (!process.env.PLAYWRIGHT_BROWSERS_PATH && fs.existsSync(path.join(root, '.browser-cache'))) {
  process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(root, '.browser-cache');
}
const { chromium } = require('playwright');
async function main() {
  const context = await chromium.launchPersistentContext('', {
    headless: true, channel: 'chromium',
    // Playwright normally disables the component updater needed for native models.
    ignoreDefaultArgs: ['--disable-component-update', '--disable-background-networking'],
    args: [`--disable-extensions-except=${root}`, `--load-extension=${root}`]
  });
  try {
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    const worlds = [];
    cdp.on('Runtime.executionContextCreated', ({ context }) => worlds.push(context));
    await cdp.send('Runtime.enable');
    await page.route('https://www.youtube.com/watch?v=fixture', route => route.fulfill({
      contentType: 'text/html', body: fs.readFileSync(path.join(root, 'tests/fixtures/youtube.html'), 'utf8')
    }));
    await page.goto('https://www.youtube.com/watch?v=fixture');
    await page.waitForSelector('[data-subtitleclick-caption]');
    const world = worlds.find(world => world.origin.startsWith('chrome-extension://'));
    const capacity = await cdp.send('Runtime.evaluate', {
      expression: 'new SubtitleClick.ChromeTranslatorProvider().availability()',
      contextId: world.id, awaitPromise: true, returnByValue: true
    });
    const availability = capacity.result.value;
    console.log(`Native availability: ${availability}`);
    await page.locator('.caption-window').click();
    function textNode(node) {
      if (node.nodeName === 'P' && node.attributes?.includes('text')) {
        return (node.children ?? []).map(child => child.nodeValue).join('');
      }
      for (const child of [...(node.children ?? []), ...(node.shadowRoots ?? [])]) {
        const value = textNode(child);
        if (value) return value;
      }
      return '';
    }
    let last = '', text = '';
    const deadline = Date.now() + 130000;
    while (Date.now() < deadline) {
      const { root: documentRoot } = await cdp.send('DOM.getDocument', { depth: -1, pierce: true });
      text = textNode(documentRoot);
      if (text && text !== last) { console.log(text); last = text; }
      if (text && !/^(Traduzindo|Preparando|Baixando)/.test(text)) break;
      await page.waitForTimeout(1000);
    }
    const failed = !text || /^(Tradução local não|O Chrome não|Feche este aviso|Não foi|A tradução demorou|Preparando|Baixando|Traduzindo)/.test(text);
    const report = { browser: context.browser().version(), availability, original: 'The best way to learn is to keep going.', text, translated: !failed };
    fs.mkdirSync(path.join(root, 'test-results'), { recursive: true });
    fs.writeFileSync(path.join(root, 'test-results/native.json'), JSON.stringify(report, null, 2));
    await page.screenshot({ path: path.join(root, 'test-results/native.png') });
    console.log(JSON.stringify(report, null, 2));
    if (failed) process.exitCode = 2;
  } finally { await context.close(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
