const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../..');
const manifest = require('../../manifest.json');
require('../../src/dictionary/dictionary-provider.js');
require('../../src/storage/vocabulary-store.js');
require('../../src/storage/sentence-store.js');
let browser;
before(async () => {
  browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || 'chromium' });
});
after(async () => { await browser?.close(); });
async function setup(t, { api = true, delay = 0, pauseOnClick = true, sourceLanguage = 'en', rewindSeconds = 0, originalFirst = false, targetLanguage = 'pt' } = {}) {
  const page = await browser.newPage({ viewport: { width: 1100, height: 760 } });
  t.after(() => page.close());
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(() => assert.deepEqual(errors, []));
  for (const script of manifest.content_scripts.filter(entry => entry.run_at === 'document_start').flatMap(entry => entry.js)) {
    await page.addInitScript({ path: path.join(root, script) });
  }
  await page.route('**/*', route => route.fulfill({ contentType: 'text/html', body: fs.readFileSync(path.join(root, 'tests/fixtures/youtube.html'), 'utf8') }));
  await page.goto('https://www.youtube.com/watch?v=fixture');
  await page.evaluate(({ api, delay, pauseOnClick, sourceLanguage, rewindSeconds, originalFirst, targetLanguage }) => {
    // The production shadow root stays closed. Expose it only in this test harness.
    const attach = Element.prototype.attachShadow;
    Element.prototype.attachShadow = function(options) { return attach.call(this, { ...options, mode: 'open' }); };
    window.calls = [];
    window.pairs = [];
    window.settings = { enabled: true, pauseOnClick, sourceLanguage, rewindSeconds, includeContext: true, originalFirst, targetLanguage };
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
  }, { api, delay, pauseOnClick, sourceLanguage, rewindSeconds, originalFirst, targetLanguage });
  await page.addStyleTag({ path: path.join(root, manifest.content_scripts[0].css[0]) });
  for (const file of manifest.content_scripts[0].js) await page.addScriptTag({ path: path.join(root, file) });
  await page.waitForSelector('[data-subtitleclick-caption]');
  return page;
}
const card = page => page.locator('[data-subtitleclick-ui]').locator('.card');
const caption = page => page.locator('.caption-window');

test('typing spaces, k and Enter inside notes never reaches YouTube capture shortcuts; draft survives close', async t => {
  const page = await setup(t, { originalFirst: true });
  await dictionaryBackend(page);
  await page.evaluate(() => {
    window.playerKeys = [];
    for (const type of ['keydown', 'keypress', 'keyup']) window.addEventListener(type, event => {
      if ([' ', 'k', 'Enter'].includes(event.key)) {
        window.playerKeys.push(type + ':' + event.key);
        document.querySelector('video').play();
      }
    }, true);
    document.querySelector('.ytp-caption-segment').textContent = 'We learn every day.';
  });
  await caption(page).click(); await page.locator('.card .text').getByRole('button', { name: 'learn', exact: true }).click();
  await page.getByText('Marque os significados que deseja guardar.', { exact: true }).waitFor();
  await page.getByText('Adicionar anotação', { exact: true }).click();
  const note = page.getByLabel('Sua anotação (opcional)');
  await note.pressSequentially('quero lembrar esta palavra k');
  await note.press('Enter'); await note.pressSequentially('outra linha');
  const expected = 'quero lembrar esta palavra k\noutra linha';
  assert.equal(await note.inputValue(), expected);
  assert.deepEqual(await page.evaluate(() => window.playerKeys), []);
  assert.equal(await page.locator('video').evaluate(v => v.paused), true);
  assert.equal(await card(page).isVisible(), true);
  await note.press('Escape'); assert.equal(await card(page).isVisible(), false);
  await caption(page).click(); await page.locator('.card .text').getByRole('button', { name: 'learn', exact: true }).click();
  await page.getByText('Marque os significados que deseja guardar.', { exact: true }).waitFor();
  assert.equal(await note.inputValue(), expected);
  await page.keyboard.press('Escape');
  await page.evaluate(() => { document.body.tabIndex = 0; document.body.focus(); });
  await page.keyboard.press('Space');
  assert.ok(await page.evaluate(() => window.playerKeys.length > 0), 'ordinary player shortcuts stay available outside the card');
});

test('sentence width and original line layout are stable across translation, back, and word lookup', async t => {
  const page = await setup(t, { originalFirst: true }); await dictionaryBackend(page);
  const source = 'We learn something new every day because there is always more to understand.';
  await page.evaluate(text => { document.querySelector('.ytp-caption-segment').textContent = text; }, source);
  await caption(page).click();
  const metrics = () => page.locator('.card .text').evaluate(element => ({
    width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height,
    positions: [...element.querySelectorAll('button')].map(button => Math.round(button.getBoundingClientRect().top - element.getBoundingClientRect().top))
  }));
  const initial = await metrics();
  assert.ok(new Set(initial.positions).size > 1, 'original wraps over multiple lines');
  await page.getByRole('button', { name: 'Traduzir frase', exact: true }).click();
  await page.getByText('A melhor forma de aprender é continuar.', { exact: true }).waitFor();
  assert.equal((await metrics()).width, initial.width);
  await page.getByRole('button', { name: 'Ver original', exact: true }).click();
  assert.deepEqual(await metrics(), initial);
  await page.locator('.card .text').getByRole('button', { name: 'learn', exact: true }).click();
  await page.getByText('Marque os significados que deseja guardar.', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Ver original', exact: true }).click();
  assert.deepEqual(await metrics(), initial);
  await page.screenshot({ path: path.join(root, 'test-results/stable-card.png') });
});

test('missing entry offers explicit local translation, labels it honestly and saves its result', async t => {
  const page = await setup(t, { originalFirst: true }); const store = await dictionaryBackend(page);
  await page.evaluate(() => { document.querySelector('.ytp-caption-segment').textContent = 'zzzzunknownword'; });
  await caption(page).click(); await page.locator('.card .text button').click();
  await page.getByRole('button', { name: 'Tentar tradução local' }).waitFor();
  assert.deepEqual(await page.evaluate(() => window.calls), []);
  await page.getByRole('button', { name: 'Tentar tradução local' }).click();
  await page.getByText('Tradução automática local — não é uma lista de sentidos de dicionário.', { exact: true }).waitFor();
  assert.deepEqual(await page.evaluate(() => window.calls), ['zzzzunknownword']);
  await page.getByRole('button', { name: 'Salvar no meu dicionário' }).click();
  await page.getByRole('button', { name: '✓ Palavra salva' }).waitFor();
  assert.match((await store.list())[0].dictionarySource, /tradução automática local/);
});

test('original-first opens clickable words immediately, translation replaces the same type and is reversible', async t => {
  const page = await setup(t, { originalFirst: true });
  await dictionaryBackend(page);
  await page.evaluate(() => { document.querySelector('.ytp-caption-segment').textContent = 'We learn every day.'; });
  await caption(page).click();
  const text = page.locator('.card .text');
  assert.equal(await text.innerText(), 'We learn every day.');
  assert.deepEqual(await page.evaluate(() => window.calls), []);
  assert.equal(await page.getByRole('button', { name: 'Palavras', exact: true }).count(), 0);
  const font = await text.evaluate(el => getComputedStyle(el).font);
  await text.getByRole('button', { name: 'learn', exact: true }).click();
  await page.getByText('Marque os significados que deseja guardar.', { exact: true }).waitFor();
  assert.deepEqual(await page.evaluate(() => window.calls), []);
  await page.getByRole('button', { name: 'Ver original', exact: true }).click();
  await page.screenshot({ path: path.join(root, 'test-results/original-first.png') });
  await page.getByRole('button', { name: 'Traduzir frase', exact: true }).click();
  await page.getByText('A melhor forma de aprender é continuar.', { exact: true }).waitFor();
  assert.equal(await text.evaluate(el => getComputedStyle(el).font), font);
  await text.getByRole('button', { name: 'forma', exact: true }).click();
  await page.getByText('Consulta PT → EN', { exact: true }).waitFor();
  await page.getByText('Marque os significados que deseja guardar.', { exact: true }).waitFor();
  await page.keyboard.press('Escape');
  await page.evaluate(() => chrome.storage.local.set({ settings: { ...window.settings, originalFirst: false } }));
  await caption(page).click();
  await page.getByText('A melhor forma de aprender é continuar.', { exact: true }).waitFor();
});

test('save whole sentence with translation, selected language and a reference per video', async t => {
  const page = await setup(t, { originalFirst: true, targetLanguage: 'de' });
  const store = await dictionaryBackend(page);
  await page.evaluate(() => { document.querySelector('.ytp-caption-segment').textContent = 'We learn every day.'; });
  await caption(page).click();
  await page.getByRole('button', { name: 'Salvar frase', exact: true }).click();
  await page.getByRole('button', { name: '✓ Frase salva', exact: true }).waitFor();
  assert.equal((await store.sentences.list())[0].translation, 'A melhor forma de aprender é continuar.');
  assert.equal(await page.locator('.card .text').innerText(), 'We learn every day.', 'saving keeps the original visible');
  assert.equal((await store.sentences.list())[0].examples[0].clip.source, 'estimated');
  await page.getByRole('button', { name: 'Traduzir frase', exact: true }).click();
  await page.getByText('A melhor forma de aprender é continuar.', { exact: true }).waitFor();
  assert.deepEqual(await page.evaluate(() => window.pairs), [['en', 'de']]);
  await page.getByRole('button', { name: 'Salvar frase', exact: true }).click();
  await page.getByRole('button', { name: '✓ Frase salva', exact: true }).waitFor();
  let saved = (await store.sentences.list())[0];
  assert.equal(saved.text, 'We learn every day.'); assert.equal(saved.targetLanguage, 'de');
  assert.equal(saved.translation, 'A melhor forma de aprender é continuar.', 'translator output is mocked in this UI test');
  await page.evaluate(() => {
    document.dispatchEvent(new Event('yt-navigate-start'));
    history.pushState({}, '', '/watch?v=otherVideo');
    document.dispatchEvent(new Event('yt-navigate-finish'));
  });
  await caption(page).click(); await page.getByRole('button', { name: 'Salvar frase', exact: true }).click();
  await page.getByRole('button', { name: '✓ Frase salva', exact: true }).waitFor();
  saved = (await store.sentences.list())[0];
  assert.equal(saved.examples.length, 2); assert.equal(saved.examples[1].videoId, 'otherVideo');
  assert.equal((await store.sentences.list()).length, 1);
});

test('save requires automatic translation; unavailable model and canceled requests never save an empty card', async t => {
  const unavailable = await setup(t, { originalFirst: true, api: false });
  const first = await dictionaryBackend(unavailable);
  await caption(unavailable).click();
  await unavailable.getByRole('button', { name: 'Salvar frase', exact: true }).click();
  await unavailable.getByText(/Não foi possível salvar com tradução/).waitFor();
  assert.equal((await first.sentences.list()).length, 0);
  assert.equal(await unavailable.getByRole('button', { name: 'Salvar frase', exact: true }).isEnabled(), true);
  const delayed = await setup(t, { originalFirst: true, delay: 180 });
  const second = await dictionaryBackend(delayed);
  await caption(delayed).click(); await delayed.getByRole('button', { name: 'Salvar frase', exact: true }).click();
  await delayed.evaluate(() => { document.querySelector('.ytp-caption-segment').textContent = 'Next sentence.'; });
  await delayed.waitForTimeout(230);
  assert.equal((await second.sentences.list()).length, 0);
});

test('failed sentence save restores the save action and never claims success', async t => {
  const page = await setup(t, { originalFirst: true });
  await dictionaryBackend(page, { failSave: true });
  await caption(page).click();
  await page.getByRole('button', { name: 'Salvar frase', exact: true }).click();
  await page.getByText('Armazenamento cheio.', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Salvar frase', exact: true }).isEnabled(), true);
  assert.equal(await page.getByRole('button', { name: '✓ Frase salva', exact: true }).count(), 0);
});

test('saved sentence range finishes on the next observed caption after playback resumes', async t => {
  const page = await setup(t, { originalFirst: true }); const store = await dictionaryBackend(page);
  await page.evaluate(() => { document.querySelector('.ytp-caption-segment').textContent = 'We learn.'; });
  await caption(page).click(); await page.getByRole('button', { name: 'Salvar frase', exact: true }).click();
  await page.getByRole('button', { name: '✓ Frase salva', exact: true }).waitFor();
  await page.keyboard.press('Escape');
  await page.evaluate(() => {
    document.querySelector('video').currentTime = 22.5;
    document.querySelector('.ytp-caption-segment').textContent = 'Another thought.';
  });
  for (let i = 0; i < 30 && (await store.sentences.list())[0].examples[0].clip.end !== 22.5; i++) await page.waitForTimeout(20);
  assert.equal((await store.sentences.list())[0].examples[0].clip.end, 22.5);
});

test('Alt-click hits the exact word without translating a sentence; chosen meanings and context are saved', async t => {
  const page = await setup(t, { api: false });
  const store = await dictionaryBackend(page);
  await page.evaluate(() => { document.querySelector('.ytp-caption-segment').textContent = 'We sat on the bank.'; });
  const point = await page.evaluate(() => {
    const text = document.querySelector('.ytp-caption-segment').firstChild;
    const range = document.createRange(); range.setStart(text, 14); range.setEnd(text, 18);
    const rect = range.getBoundingClientRect(); return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  });
  await page.keyboard.down('Alt'); await page.mouse.click(point.x, point.y); await page.keyboard.up('Alt');
  await page.getByText('Marque os significados que deseja guardar.', { exact: true }).waitFor();
  assert.equal(await page.getByRole('searchbox', { name: 'Palavra ou expressão' }).inputValue(), 'bank');
  assert.deepEqual(await page.evaluate(() => window.calls), []);
  assert.equal(await page.locator('video').evaluate(v => v.paused), true);
  const senses = page.locator('.word-sense input');
  const count = await senses.count(); assert.ok(count > 1);
  for (let i = 1; i < count; i++) await senses.nth(i).uncheck();
  const chosen = await senses.first().inputValue();
  await page.getByText('Adicionar anotação', { exact: true }).click();
  await page.getByLabel('Sua anotação (opcional)').fill('Sentido na frase: margem de um rio.');
  await page.getByRole('button', { name: 'Salvar no meu dicionário' }).click();
  await page.getByRole('button', { name: '✓ Palavra salva' }).waitFor();
  const words = await store.list();
  assert.equal(words.length, 1); assert.equal(words[0].word, 'bank');
  assert.deepEqual(words[0].definitions, [chosen]);
  assert.equal(words[0].examples[0].text, 'We sat on the bank.');
  assert.equal(words[0].examples[0].time, 20); assert.equal(words[0].examples[0].videoId, 'fixture');
  await page.screenshot({ path: path.join(root, 'test-results/word-lookup.png') });
  await page.keyboard.press('Escape'); assert.equal(await card(page).isVisible(), false);
  assert.equal(await page.locator('video').evaluate(v => v.paused), false);
});

test('word mode cancels pending sentence output; switching word or captions discards stale dictionary output', async t => {
  const page = await setup(t, { delay: 200 });
  await dictionaryBackend(page, { delay: 150 });
  await caption(page).click();
  await page.locator('.card .text button').first().click();
  const input = page.getByRole('searchbox', { name: 'Palavra ou expressão' });
  await input.fill('bank'); await input.press('Enter');
  await input.fill('run'); await input.press('Enter');
  await page.getByText('Marque os significados que deseja guardar.', { exact: true }).waitFor();
  assert.equal(await page.locator('.word-results').innerText().then(s => s.includes('bank')), false);
  assert.equal(await page.locator('.word-panel').isVisible(), true);
  assert.equal(await page.locator('.card .text').isVisible(), false);
  await input.fill('bank'); await input.press('Enter');
  await page.evaluate(() => { document.querySelector('.ytp-caption-segment').textContent = 'Next caption.'; });
  await page.waitForTimeout(220); assert.equal(await card(page).isVisible(), false);
});

test('missing words can be saved for later; failures never display saved confirmation; narrow card fits', async t => {
  const page = await setup(t, { api: false });
  await dictionaryBackend(page, { failSave: true });
  await caption(page).click(); await page.locator('.card .text button').first().click();
  const input = page.getByRole('searchbox', { name: 'Palavra ou expressão' });
  await input.fill('zzzzunknownword'); await input.press('Enter');
  await page.getByText('Palavra não encontrada nesta base. Você pode salvá-la e completar depois.', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Salvar no meu dicionário' }).click();
  await page.getByText('Armazenamento cheio.', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: '✓ Palavra salva' }).count(), 0);
  await page.evaluate(() => { const p = document.querySelector('#movie_player'); p.style.width = '320px'; p.style.height = '240px'; });
  await page.waitForTimeout(80);
  const bounds = await card(page).boundingBox(), player = await page.locator('#movie_player').boundingBox();
  assert.ok(bounds.x >= player.x && bounds.x + bounds.width <= player.x + player.width + 1);
  assert.ok(bounds.y >= player.y && bounds.y + bounds.height <= player.y + player.height + 1);
  assert.ok(await card(page).evaluate(el => el.scrollWidth <= el.clientWidth + 1), 'word controls do not overflow horizontally');
});
async function dictionaryBackend(page, { delay = 0, failSave = false } = {}) {
  const entries = {};
  const dictionary = new SubtitleClick.DictionaryProvider(async () => require('../../data/eng-por.json'));
  const storage = {
    get: async key => structuredClone(key === null ? entries : { [key]: entries[key] }),
    set: async values => { if (failSave) throw Error('Armazenamento cheio.'); Object.assign(entries, structuredClone(values)); }
  };
  const store = new SubtitleClick.VocabularyStore(storage);
  const sentences = new SubtitleClick.SentenceStore(storage);
  store.sentences = sentences;
  await page.exposeFunction('vocabularyRequest', async message => {
    try {
      const data = message.action === 'lookup'
        ? await dictionary.lookup(message.payload.word, message.payload.sourceLanguage, message.payload.targetLanguage)
        : message.action === 'sentences-save' ? await sentences.save(message.payload)
        : message.action === 'sentences-clip' ? await sentences.updateClip(message.payload) : await store.save(message.payload);
      if (message.action === 'lookup') await new Promise(resolve => setTimeout(resolve, delay));
      return { ok: true, data };
    } catch (error) { return { ok: false, error: error.message }; }
  });
  await page.evaluate(() => { chrome.runtime = { sendMessage: message => window.vocabularyRequest(message) }; });
  return store;
}

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
  await page.getByRole('button', { name: 'Ver original', exact: true }).click();
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
