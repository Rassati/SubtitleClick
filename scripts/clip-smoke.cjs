// Optional online smoke test. Uses a temporary profile, never the user's Chrome.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
process.env.PLAYWRIGHT_BROWSERS_PATH ||= path.join(root, '.browser-cache');
const { chromium } = require('playwright');
(async () => {
  const context = await chromium.launchPersistentContext('', { headless: true, channel: process.env.BROWSER_CHANNEL || 'chromium',
    args: ['--disable-extensions-except=' + root, '--load-extension=' + root] });
  try {
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
    const page = await context.newPage();
    await page.goto('chrome-extension://' + new URL(worker.url()).host + '/src/vocabulary/sentences.html');
    await page.evaluate(() => SubtitleClick.VocabularyClient.request('sentences-save', {
      text: 'Teste de reprodução de trecho · YouTube Developers', translation: 'Cartão de teste; não valida tradução.',
      sourceLanguage: 'en', targetLanguage: 'pt', example: { text: 'Teste de reprodução de trecho',
        videoId: 'M7lc1UVf-VE', time: 4, clip: { start: 3, end: 7, source: 'manual' } }
    }));
    await page.reload(); await page.getByRole('button', { name: 'Estudar frases' }).click();
    const attempts = [];
    for (const label of ['Ouvir trecho', 'Repetir trecho']) {
      await page.getByRole('button', { name: label, exact: true }).click();
      let playing = false, result = null, screenshot = false;
      const samples = [];
      const deadline = Date.now() + 45000;
      while (Date.now() < deadline) {
        const frame = page.frames().find(frame => frame.url().startsWith('https://www.youtube-nocookie.com/embed/'));
        if (frame) {
          const state = await frame.evaluate(() => {
            const video = document.querySelector('video');
            return { time: video?.currentTime, paused: video?.paused, error: document.querySelector('.ytp-error-content-wrap')?.textContent };
          }).catch(() => null);
          if (state?.error?.trim()) throw new Error(state.error);
          if (Number.isFinite(state?.time)) {
            samples.push(state);
            if (!state.paused && state.time >= 2.5 && state.time < 7) playing = true;
            if (playing && !screenshot) {
              fs.mkdirSync(path.join(root, 'test-results'), { recursive: true });
              await page.screenshot({ path: path.join(root, 'test-results/clip-live.png'), fullPage: true }); screenshot = true;
            }
            if (playing && state.paused && state.time >= 6.9) { result = state; break; }
          }
        }
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      assert.ok(playing, 'real video must play from the requested interval');
      assert.ok(result?.paused && result.time <= 7.7, 'real YouTube must stop at the configured end');
      attempts.push({ action: label, firstPlaying: samples.find(sample => !sample.paused && sample.time >= 2.5 && sample.time < 7), stopped: result });
    }
    await page.getByRole('button', { name: 'Próxima frase' }).click();
    assert.equal(await page.locator('iframe').count(), 0);
    fs.writeFileSync(path.join(root, 'test-results/clip-live.json'), JSON.stringify({ date: new Date().toISOString(), videoId: 'M7lc1UVf-VE', start: 3, end: 7, attempts }, null, 2));
    console.log(JSON.stringify({ realYouTubeClip: 'PASS', start: 3, end: 7, attempts }));
  } finally { await context.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
