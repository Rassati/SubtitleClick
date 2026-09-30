'use strict';
importScripts('build.js', 'dictionary/dictionary-provider.js', 'storage/vocabulary-store.js', 'storage/sentence-store.js');
const dictionary = new SubtitleClick.DictionaryProvider(async () => {
  // Fixed packaged resource: never a URL or text received from a page.
  const response = await fetch(chrome.runtime.getURL('data/eng-por.json'));
  const extra = await fetch(chrome.runtime.getURL('data/wikdict-en-pt.json'));
  if (!response.ok || !extra.ok) throw new Error('Não foi possível abrir as bases offline. Recarregue a extensão.');
  return Promise.all([response.json(), extra.json()]);
});
const vocabulary = new SubtitleClick.VocabularyStore(chrome.storage.local);
const sentences = new SubtitleClick.SentenceStore(chrome.storage.local);
async function restore(backup) {
  const current = await chrome.storage.local.get(null);
  const words = vocabulary.prepareRestore(backup, current);
  const cards = await sentences.prepareRestore(backup, current);
  const changes = { ...words, ...cards };
  if (Object.keys(changes).length) await chrome.storage.local.set(changes);
  return { words: Object.keys(words).length, sentences: Object.keys(cards).length };
}
// Serialize mutations across YouTube tabs and the collection page. Persistent data
// is read from storage for every operation, so worker restarts do not lose words.
let queue = Promise.resolve();
async function serialized(operation) {
  const previous = queue;
  let release;
  queue = new Promise(resolve => { release = resolve; });
  try { await previous; return await operation(); }
  finally { release(); }
}
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || message?.channel !== 'subtitleclick-vocabulary') return;
  void (async () => {
    try {
      if (message.build && (message.build !== SubtitleClick.Build.version || message.protocol !== SubtitleClick.Build.protocol)) {
        sendResponse({ ok: false, code: 'VERSION_MISMATCH', build: SubtitleClick.Build.version }); return;
      }
      const payload = message.payload ?? {};
      let data;
      switch (message.action) {
        case 'player-prepare': {
          // YouTube requires client identity (otherwise error 153). Extension
          // pages omit HTTP Referer; identify this app, never impersonate a site.
          // Only this extension's embedded-player navigation can match the rule.
          const origin = `https://subtitleclick.${chrome.runtime.id}`;
          await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [1], addRules: [{
            id: 1, priority: 1, action: { type: 'modifyHeaders', requestHeaders: [{ header: 'Referer', operation: 'set', value: origin + '/' }] },
            condition: { regexFilter: '^https://www\\.youtube-nocookie\\.com/embed/[A-Za-z0-9_-]{11}\\?',
              resourceTypes: ['sub_frame'], initiatorDomains: [chrome.runtime.id] }
          }] });
          data = { origin }; break;
        }
        case 'health': data = { version: SubtitleClick.Build.version, sentences: true }; break;
        case 'lookup': data = await dictionary.lookup(payload.word, payload.sourceLanguage, payload.targetLanguage); break;
        case 'list': data = await serialized(() => vocabulary.list()); break;
        case 'save': data = await serialized(() => vocabulary.save(payload)); break;
        case 'update': data = await serialized(() => vocabulary.update(payload)); break;
        case 'remove': data = await serialized(() => vocabulary.remove(payload)); break;
        case 'import': data = await serialized(() => restore(payload)); break;
        case 'sentences-list': data = await serialized(() => sentences.list()); break;
        case 'sentences-save': data = await serialized(() => sentences.save(payload)); break;
        case 'sentences-update': data = await serialized(() => sentences.update(payload)); break;
        case 'sentences-clip': data = await serialized(() => sentences.updateClip(payload)); break;
        case 'sentences-remove': data = await serialized(() => sentences.remove(payload)); break;
        case 'export': data = await serialized(async () => ({ format: 'subtitleclick-vocabulary', version: 2,
          exportedAt: new Date().toISOString(), words: await vocabulary.list(), sentences: await sentences.list(),
          notice: 'FreeDict: GPL-2.0-or-later (https://freedict.org/). WikDict/Wiktionary/DBnary: CC-BY-SA-3.0 (https://www.wikdict.com/). Automatic translations are identified separately.' })); break;
        default: sendResponse({ ok: false, code: 'VERSION_MISMATCH', build: SubtitleClick.Build.version }); return;
      }
      sendResponse({ ok: true, data, build: SubtitleClick.Build.version });
    } catch (error) {
      const quota = /quota/i.test(error.message ?? '');
      sendResponse({ ok: false, error: quota ? 'O armazenamento está cheio. Exporte seu dicionário e remova palavras para liberar espaço.' : error.message || 'Não foi possível salvar. Tente novamente.' });
    }
  })();
  return true;
});
