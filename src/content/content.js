(() => {
  'use strict';
  const ns = globalThis.SubtitleClick;
  if (ns.app) return;
  const service = new ns.TranslationService(new ns.ChromeTranslatorProvider());
  const context = new ns.CaptionContext();
  const timing = new ns.CaptionTiming();
  let settings = ns.Settings.defaults;
  let player = null, detector = null, ui = null, video = null;
  let active = null, serial = 0, videoId = null, navigating = false;
  let disposed = false;

  function close(resume = true, allowRewind = true) {
    const rewind = allowRewind && active?.translated ? settings.rewindSeconds : 0;
    serial++;
    active = null;
    service.cancel();
    ui?.hide();
    video?.release(resume, rewind);
  }
  function detach() {
    close(false);
    detector?.destroy();
    ui?.destroy();
    player?.removeEventListener('play', onPlayback, true);
    player?.removeEventListener('seeking', onPlayback, true);
    context.clear();
    timing.clear();
    detector = ui = video = player = null;
  }
  function onPlayback(event) {
    if (event.target.tagName !== 'VIDEO') return;
    if (event.type === 'seeking') { context.clear(); timing.clear(); }
    close(false);
  }
  function remember(snapshot) {
    if (player.matches('.ad-showing, .ad-interrupting') ||
        player.querySelector('.ytp-subtitles-button')?.getAttribute('aria-pressed') === 'false') {
      context.clear();
      timing.clear();
      return;
    }
    if (!video.element?.seeking) {
      context.observe(snapshot.text, video.element?.currentTime);
      timing.observe(snapshot.text, video.element?.currentTime);
    }
  }
  function replay() {
    const bookmark = active?.bookmark;
    const controller = video;
    close(false);
    context.clear();
    controller?.replay(bookmark, 5);
  }
  function toggleContext() {
    if (!active) return;
    active.includeContext = !active.includeContext;
    active.translation = '';
    active.saved = false;
    if (settings.originalFirst) showOriginal();
    else void translateActive();
  }
  function originalText(request = active) {
    return request.includeContext ? request.contextText : request.text;
  }
  function showSentence(request, translated = false, notice = '', error = false, pending = false) {
    if (request !== active) return;
    request.view = translated ? 'translated' : 'original';
    ui.show(translated ? request.translation : originalText(request), request.anchor, {
      error, pending, notice, translated, paused: Boolean(video.owned),
      sourceLanguage: request.sourceLanguage, targetLanguage: request.targetLanguage,
      withContext: originalText(request) !== request.text, canContext: request.contextText !== request.text,
      canReplay: Boolean(request.bookmark), rewindSeconds: request.translated ? settings.rewindSeconds : 0,
      saved: request.saved, saving: request.saving });
  }
  function showOriginal() {
    if (!active) return;
    serial++;
    service.cancel();
    showSentence(active);
  }
  async function saveSentence() {
    const request = active;
    if (!request || request.saving || request.saved) return;
    const text = originalText(request);
    let translation = request.translationOriginal === text ? request.translation : '';
    const viewSerial = ++serial;
    const translatedView = request.view === 'translated';
    service.cancel();
    request.saving = true;
    showSentence(request, translatedView, translation ? 'Salvando cartão…' : 'Traduzindo para salvar o cartão completo…');
    try {
      if (!translation) {
        translation = await service.translate(text, request.sourceLanguage, request.targetLanguage, {
          onStatus: status => { if (active === request && serial === viewSerial) showSentence(request, translatedView, statusMessage(status)); }
        });
      }
      if (active !== request || serial !== viewSerial || originalText(request) !== text) return;
      request.translation = translation;
      request.translationOriginal = text;
      request.translated = true;
      const capture = timing.capture(request.text, text, request.bookmark?.time, request.contextStart, video.element);
      const reference = { text, videoId: request.videoId, time: request.bookmark?.time, ...(capture ? { clip: capture.clip } : {}) };
      await ns.VocabularyClient.request('sentences-save', { text, translation,
        sourceLanguage: request.sourceLanguage, targetLanguage: request.targetLanguage,
        example: reference });
      if (videoId === request.videoId) timing.track(capture, clip => {
        void ns.VocabularyClient.request('sentences-clip', { text, sourceLanguage: request.sourceLanguage,
          targetLanguage: request.targetLanguage, example: reference, clip, automatic: true }).catch(() => {});
      });
      if (active !== request || originalText(request) !== text) return;
      request.saved = (request.translationOriginal === text ? request.translation : '') === translation;
      if (viewSerial === serial) showSentence(request, translatedView, 'Frase salva como cartão, com tradução e trecho do vídeo.');
    } catch (error) {
      if (active === request && viewSerial === serial && error.name !== 'AbortError') {
        showSentence(request, translatedView, translation ? error.message :
          `Não foi possível salvar com tradução. ${ns.translationMessages[error.code] ?? error.message} Tente salvar novamente.`, true);
      }
    } finally {
      request.saving = false;
      if (active === request) {
        ui.saveSentence.disabled = Boolean(request.saved);
        ui.saveSentence.textContent = request.saved ? '✓ Frase salva' : 'Salvar frase';
      }
    }
  }
  function showWords(word = '', translated = false) {
    if (!active) return;
    serial++;
    service.cancel();
    active.view = 'word';
    ui.showWords(active.anchor, { text: translated ? active.translation : originalText(),
      referenceText: originalText(), translation: active.translation || '',
      sourceLanguage: translated ? active.targetLanguage : active.sourceLanguage,
      targetLanguage: translated ? active.sourceLanguage : active.targetLanguage,
      videoId, time: active.bookmark?.time }, word, Boolean(video.owned));
  }
  function watchId() {
    const url = new URL(location.href);
    return url.pathname === '/watch' ? url.searchParams.get('v') : null;
  }
  function reconcile() {
    if (disposed || navigating) return;
    const nextId = watchId();
    const nextPlayer = settings.enabled && nextId ? document.querySelector('#movie_player') : null;
    if (player === nextPlayer && videoId === nextId) {
      if (detector) remember(detector.refresh());
      ui?.position();
      return;
    }
    detach();
    service.clear();
    videoId = nextId;
    if (!nextPlayer) return;
    player = nextPlayer;
    video = new ns.VideoController(player);
    ui = new ns.SubtitleUI(player, () => close(true), replay, toggleContext,
      showWords, () => { if (active) void translateActive(); }, showOriginal, saveSentence);
    detector = new ns.SubtitleDetector(player, next => {
      remember(next);
      if (active && next.text !== active.text) close(false);
    });
    player.addEventListener('play', onPlayback, true);
    player.addEventListener('seeking', onPlayback, true);
  }
  function statusMessage(status) {
    if (status.state === 'downloading') return status.progress === null
      ? 'Baixando modelo local… A primeira tradução pode demorar.'
      : `Preparando modelo local… ${Math.round(status.progress * 100)}%`;
    if (status.state === 'preparing') return 'Preparando tradução local… O Chrome pode baixar o modelo na primeira vez.';
    return 'Traduzindo no seu dispositivo…';
  }
  function activate(anchor, wordsOnly = false, word = '') {
    // Re-read the DOM at click time, never translate an earlier observer snapshot.
    const snapshot = detector.refresh();
    if (!snapshot.text) return;
    if (active?.text === snapshot.text) {
      if (wordsOnly) showWords(word);
      else close(true);
      return;
    }
    close(true, false);
    const bookmark = video.bookmark();
    const nearby = context.snapshot(snapshot.text, bookmark?.time);
    active = { text: snapshot.text, anchor, bookmark, videoId,
      contextText: nearby.text, contextStart: nearby.start,
      includeContext: settings.includeContext, sourceLanguage: settings.sourceLanguage, targetLanguage: settings.targetLanguage,
      translated: false, translation: '', saved: false, saving: false };
    video.pause(settings.pauseOnClick);
    if (wordsOnly) showWords(word);
    else if (settings.originalFirst) showOriginal();
    else void translateActive();
  }
  async function translateActive() {
    const request = active;
    const id = ++serial;
    request.translated = false;
    const original = originalText(request);
    const show = (message, error = false) => {
      if (id === serial) showSentence(request, false, message, error, !error);
    };
    show('Traduzindo no seu dispositivo…');
    try {
      const result = await service.translate(original, request.sourceLanguage, request.targetLanguage, {
        onStatus: status => show(statusMessage(status))
      });
      if (id !== serial) return;
      if (detector.snapshot().text !== request.text) { close(false); return; }
      request.translated = true;
      request.translation = result;
      request.translationOriginal = original;
      request.saved = false;
      showSentence(request, true);
    } catch (error) {
      if (id !== serial || error.name === 'AbortError') return;
      show(ns.translationMessages[error.code] ?? ns.translationMessages.translation, true);
    }
  }
  function intercept(event) {
    const anchor = detector?.target(event.target);
    if (!anchor || event.button > 0) return;
    if (event.type === 'keydown' && !['Enter', ' '].includes(event.key)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.type === 'click' || (event.type === 'keydown' && !event.repeat)) {
      const word = event.altKey && event.type === 'click'
        ? ns.WordTools.atPoint(anchor, event.clientX, event.clientY, settings.sourceLanguage) : '';
      activate(anchor, event.altKey, word);
    }
  }
  function onKey(event) {
    if (event.key === 'Escape' && active) {
      event.preventDefault();
      event.stopImmediatePropagation();
      close(true);
    }
  }
  function onNavigateStart() { navigating = true; detach(); service.clear(); }
  function onNavigateFinish() { navigating = false; reconcile(); }
  for (const name of ['pointerdown', 'mousedown', 'click', 'dblclick', 'keydown']) {
    document.addEventListener(name, intercept, true);
  }
  document.addEventListener('keydown', onKey, true);
  document.addEventListener('yt-navigate-start', onNavigateStart);
  document.addEventListener('yt-navigate-finish', onNavigateFinish);
  window.addEventListener('popstate', onNavigateFinish);
  // A low-frequency fallback discovers a replaced player without observing the entire YouTube DOM.
  const timer = setInterval(reconcile, 1000);
  const unsubscribe = ns.Settings.subscribe(next => {
    if (!next.enabled || next.sourceLanguage !== settings.sourceLanguage || next.targetLanguage !== settings.targetLanguage ||
        next.includeContext !== settings.includeContext || next.originalFirst !== settings.originalFirst) {
      close(true, false);
      context.clear();
      timing.clear();
    }
    if (next.sourceLanguage !== settings.sourceLanguage || next.targetLanguage !== settings.targetLanguage) service.destroy();
    settings = next;
    reconcile();
  });
  ns.app = {
    destroy() {
      disposed = true;
      clearInterval(timer);
      unsubscribe();
      detach();
      service.destroy();
      for (const name of ['pointerdown', 'mousedown', 'click', 'dblclick', 'keydown']) {
        document.removeEventListener(name, intercept, true);
      }
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('yt-navigate-start', onNavigateStart);
      document.removeEventListener('yt-navigate-finish', onNavigateFinish);
      window.removeEventListener('popstate', onNavigateFinish);
      window.removeEventListener('pagehide', onPageHide);
      delete ns.app;
    }
  };
  function onPageHide(event) { if (!event.persisted) ns.app?.destroy(); }
  window.addEventListener('pagehide', onPageHide);
  ns.Settings.load().then(value => {
    if (!disposed) { settings = value; reconcile(); }
  }).catch(() => { if (!disposed) reconcile(); });
})();
