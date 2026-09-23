const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../..');
const manifest = require('../../manifest.json');
let browser;
before(async () => {
  browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || 'chromium' });
});
after(async () => { await browser?.close(); });
async function setup(t, { api = true, delay = 0, pauseOnClick = true, sourceLanguage = 'en', rewindSeconds = 0 } = {}) {
  const page = await browser.newPage({ viewport: { width: 1100, height: 760 } });
  t.after(() => page.close());
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(() => assert.deepEqual(errors, []));
  await page.route('**/*', route => route.fulfill({ contentType: 'text/html', body: fs.readFileSync(path.join(root, 'tests/fixtures/youtube.html'), 'utf8') }));
  await page.goto('https://www.youtube.com/watch?v=fixture');
  await page.evaluate(({ api, delay, pauseOnClick, sourceLanguage, rewindSeconds }) => {
    // The production shadow root stays closed. Expose it only in this test harness.
    const attach = Element.prototype.attachShadow;
    Element.prototype.attachShadow = function(options) { return attach.call(this, { ...options, mode: 'open' }); };
    window.calls = [];
    window.pairs = [];
    window.settings = { enabled: true, pauseOnClick, sourceLanguage, rewindSeconds, includeContext: true };
    const listeners = new Set();
    window.chrome = { storage: { local: {
      get: async () => ({ settings: window.settings }),
      set: async ({ settings }) => { window.settings = settings; listeners.forEach(fn => fn({ settings: { newValue: settings } }, 'local')); }
    }, onChanged: { addListener: fn => listeners.add(fn), removeListener: fn => listeners.delete(fn) } } };
    Object.defineProperty(window, 'Translator', { configurable: true, value: api ? {
      availability: async () => 'available',
      create: async ({ sourceLanguage, targetLanguage }) => {
        window.pairs.push([sourceLanguage, targetLanguage]);
        return {
        translate: async text => { window.calls.push(text); await new Promise(r => setTimeout(r, delay)); return 'A melhor forma de aprender é continuar.'; },
        destroy() {}
        };
      }
    } : undefined });
    const video = document.querySelector('video');
    let paused = false;
    let currentTime = 20;
    Object.defineProperty(video, 'currentTime', { get: () => currentTime, set: value => { currentTime = value; } });
    Object.defineProperty(video, 'paused', { get: () => paused });
    video.pause = () => { paused = true; video.dispatchEvent(new Event('pause')); };
    video.play = () => { paused = false; video.dispatchEvent(new Event('play')); return Promise.resolve(); };
  }, { api, delay, pauseOnClick, sourceLanguage, rewindSeconds });
  await page.addStyleTag({ path: path.join(root, manifest.content_scripts[0].css[0]) });
  for (const file of manifest.content_scripts[0].js) await page.addScriptTag({ path: path.join(root, file) });
  await page.waitForSelector('[data-subtitleclick-caption]');
  return page;
}
const card = page => page.locator('[data-subtitleclick-ui]').locator('.card');
const caption = page => page.locator('.caption-window');

test('click translates only requested caption; Esc resumes owned pause; cache is used', async t => {
  const page = await setup(t);
  assert.deepEqual(await page.evaluate(() => window.calls), []);
  await caption(page).click();
  await page.waitForFunction(() => window.calls.length === 1);
  await page.getByText('A melhor forma de aprender é continuar.', { exact: true }).waitFor();
  assert.equal(await page.locator('video').evaluate(video => video.paused), true);
  await page.keyboard.press('Escape');
  assert.equal(await card(page).isVisible(), false);
  assert.equal(await page.locator('video').evaluate(video => video.paused), false);
  await caption(page).click();
  await page.getByText('A melhor forma de aprender é continuar.', { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.calls.length), 1);
  fs.mkdirSync(path.join(root, 'test-results'), { recursive: true });
  await page.screenshot({ path: path.join(root, 'test-results/subtitleclick.png') });
  await caption(page).click();
  assert.equal(await card(page).isVisible(), false);
});
test('caption changes cancel pending translation and never show stale result', async t => {
  const page = await setup(t, { delay: 120, pauseOnClick: false });
  await caption(page).click();
  await page.evaluate(() => { document.querySelector('.ytp-caption-segment').textContent = 'A different sentence.'; });
  await page.waitForTimeout(200);
  assert.equal(await card(page).isVisible(), false);
});
test('multiline captions preserve segment boundaries and exclude hidden captions', async t => {
  const page = await setup(t);
  await page.evaluate(() => {
    const caption = document.querySelector('.caption-window');
    caption.innerHTML = '<span class="caption-visual-line"><span class="ytp-caption-segment">Don</span><span class="ytp-caption-segment">’t stop!</span></span><span class="caption-visual-line"><span class="ytp-caption-segment">Keep going.</span></span>';
    const hidden = caption.cloneNode(true);
    hidden.style.display = 'none';
    caption.parentElement.append(hidden);
  });
  await caption(page).first().click();
  await page.waitForFunction(() => window.calls.length === 1);
  assert.deepEqual(await page.evaluate(() => window.calls), ['Don’t stop!\nKeep going.']);
});
test('unavailable API shows friendly local-only fallback', async t => {
  const page = await setup(t, { api: false });
  await caption(page).click();
  await page.getByText('Tradução local não está disponível neste navegador.', { exact: true }).waitFor();
  assert.deepEqual(await page.evaluate(() => window.calls), []);
  await page.getByRole('button', { name: 'Fechar tradução' }).click();
  assert.equal(await card(page).isVisible(), false);
});
test('keyboard, subtitles off, ads and settings are respected', async t => {
  const page = await setup(t);
  await caption(page).focus();
  await page.keyboard.press('Enter');
  await page.getByText('A melhor forma de aprender é continuar.', { exact: true }).waitFor();
  await page.evaluate(() => document.querySelector('.ytp-subtitles-button').setAttribute('aria-pressed', 'false'));
  await page.waitForFunction(() => !document.querySelector('[data-subtitleclick-caption]'));
  assert.equal(await card(page).isVisible(), false);
  await page.evaluate(() => {
    document.querySelector('.ytp-subtitles-button').setAttribute('aria-pressed', 'true');
    document.querySelector('#movie_player').classList.add('ad-showing');
  });
  assert.equal(await page.locator('[data-subtitleclick-caption]').count(), 0);
  await page.evaluate(() => document.querySelector('#movie_player').classList.remove('ad-showing'));
  await page.waitForSelector('[data-subtitleclick-caption]');
  await page.evaluate(() => chrome.storage.local.set({ settings: { enabled: false, pauseOnClick: true } }));
  assert.equal(await page.locator('[data-subtitleclick-ui]').count(), 0);
  assert.equal(await caption(page).getAttribute('role'), null);
});
test('SPA navigation, Shorts and replaced players clean up and reattach once', async t => {
  const page = await setup(t);
  await caption(page).click();
  await page.evaluate(() => {
    document.dispatchEvent(new Event('yt-navigate-start'));
    history.pushState({}, '', '/shorts/fixture');
    document.dispatchEvent(new Event('yt-navigate-finish'));
  });
  assert.equal(await page.locator('[data-subtitleclick-ui]').count(), 0);
  await page.evaluate(() => {
    history.pushState({}, '', '/watch?v=second');
    document.dispatchEvent(new Event('yt-navigate-finish'));
  });
  await page.waitForSelector('[data-subtitleclick-caption]');
  assert.equal(await page.locator('[data-subtitleclick-ui]').count(), 1);
  await page.evaluate(() => {
    const player = document.querySelector('#movie_player');
    const copy = player.cloneNode(true);
    copy.querySelector('[data-subtitleclick-ui]').remove();
    player.replaceWith(copy);
  });
  await page.waitForSelector('#movie_player [data-subtitleclick-ui]');
  assert.equal(await page.locator('[data-subtitleclick-ui]').count(), 1);
});
test('translation remains inside fullscreen player and narrow resized bounds', async t => {
  const page = await setup(t);
  await caption(page).click();
  await page.getByText('A melhor forma de aprender é continuar.', { exact: true }).waitFor();
  await page.evaluate(() => document.querySelector('#movie_player').requestFullscreen());
  await page.waitForFunction(() => document.fullscreenElement);
  assert.ok(await page.locator('#movie_player [data-subtitleclick-ui]').count());
  assert.equal(await card(page).isVisible(), true);
  await page.evaluate(() => document.exitFullscreen());
  await page.evaluate(() => {
    document.querySelector('#movie_player').style.width = '360px';
    document.querySelector('.caption-window').style.left = '20px';
  });
  await page.waitForTimeout(100);
  const bounds = await card(page).boundingBox();
  const playerBounds = await page.locator('#movie_player').boundingBox();
  assert.ok(bounds.x >= playerBounds.x && bounds.x + bounds.width <= playerBounds.x + playerBounds.width);
});

test('replay button seeks five seconds before click, closes card and plays', async t => {
  const page = await setup(t);
  await caption(page).click();
  await page.getByText('A melhor forma de aprender é continuar.', { exact: true }).waitFor();
  await page.getByRole('button', { name: /Ouvir de novo/ }).click();
  assert.equal(await card(page).isVisible(), false);
  assert.equal(await page.locator('video').evaluate(video => video.currentTime), 15);
  assert.equal(await page.locator('video').evaluate(video => video.paused), false);
});
test('closing rewinds only after successful translation of an owned pause', async t => {
  const page = await setup(t, { rewindSeconds: 3 });
  await caption(page).click();
  await page.getByText('A melhor forma de aprender é continuar.', { exact: true }).waitFor();
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('video').evaluate(video => video.currentTime), 17);
  await page.locator('video').evaluate(video => video.pause());
  await caption(page).click();
  await page.getByText('A melhor forma de aprender é continuar.', { exact: true }).waitFor();
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('video').evaluate(video => video.currentTime), 17);
  assert.equal(await page.locator('video').evaluate(video => video.paused), true);
});
test('failed translations do not trigger automatic rewind', async t => {
  const page = await setup(t, { api: false, rewindSeconds: 5 });
  await caption(page).click();
  await page.getByText('Tradução local não está disponível neste navegador.', { exact: true }).waitFor();
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('video').evaluate(video => video.currentTime), 20);
});
test('previous incomplete caption enriches translation and can be toggled off', async t => {
  const page = await setup(t);
  await page.evaluate(() => { document.querySelector('.ytp-caption-segment').textContent = 'I was thinking about'; });
  await page.waitForFunction(() => SubtitleClick.app && document.querySelector('.ytp-caption-segment').textContent === 'I was thinking about');
  await page.evaluate(() => {
    document.querySelector('video').currentTime = 21;
    document.querySelector('.ytp-caption-segment').textContent = 'learning Japanese.';
  });
  await caption(page).click();
  await page.getByText('A melhor forma de aprender é continuar.', { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.calls.at(-1)), 'I was thinking about learning Japanese.');
  await page.getByText('Ver texto original', { exact: true }).click();
  await page.getByText('I was thinking about learning Japanese.', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Só esta legenda', exact: true }).click();
  await page.waitForFunction(() => window.calls.length === 2);
  assert.equal(await page.evaluate(() => window.calls.at(-1)), 'learning Japanese.');
  await page.getByRole('button', { name: 'Incluir contexto', exact: true }).click();
  await page.getByText('Legenda + contexto anterior', { exact: true }).waitFor();
  fs.mkdirSync(path.join(root, 'test-results'), { recursive: true });
  await page.screenshot({ path: path.join(root, 'test-results/context.png') });
});
test('Japanese, Russian and German reach the provider unchanged with the selected language', async t => {
  const page = await setup(t, { sourceLanguage: 'ja' });
  for (const [language, text] of [['ja', '日本語を勉強しています。'], ['ru', 'Я изучаю русский.'], ['de', 'Ich lerne Deutsch.']]) {
    await page.evaluate(async ({ language, text }) => {
      await chrome.storage.local.set({ settings: { ...window.settings, sourceLanguage: language } });
      document.querySelector('.ytp-caption-segment').textContent = text;
    }, { language, text });
    await caption(page).click();
    await page.getByText('A melhor forma de aprender é continuar.', { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.calls.at(-1)), text);
    assert.deepEqual(await page.evaluate(() => window.pairs.at(-1)), [language, 'pt']);
    await page.keyboard.press('Escape');
  }
});
