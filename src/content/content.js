(() => {
  'use strict';
  const ns = globalThis.SubtitleClick;
  if (ns.app) return;
  const service = new ns.TranslationService(new ns.ChromeTranslatorProvider());
  const context = new ns.CaptionContext();
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
    detector = ui = video = player = null;
  }
  function onPlayback(event) {
    if (event.target.tagName !== 'VIDEO') return;
    if (event.type === 'seeking') context.clear();
    close(false);
  }
  function remember(snapshot) {
    if (player.matches('.ad-showing, .ad-interrupting') ||
        player.querySelector('.ytp-subtitles-button')?.getAttribute('aria-pressed') === 'false') {
      context.clear();
      return;
    }
    if (!video.element?.seeking) context.observe(snapshot.text, video.element?.currentTime);
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
    void translateActive();
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
    ui = new ns.SubtitleUI(player, () => close(true), replay, toggleContext);
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
  function activate(anchor) {
    // Re-read the DOM at click time, never translate an earlier observer snapshot.
    const snapshot = detector.refresh();
    if (!snapshot.text) return;
    if (active?.text === snapshot.text) { close(true); return; }
    close(true, false);
    const bookmark = video.bookmark();
    active = { text: snapshot.text, anchor, bookmark,
      contextText: context.get(snapshot.text, bookmark?.time),
      includeContext: settings.includeContext, sourceLanguage: settings.sourceLanguage, translated: false };
    video.pause(settings.pauseOnClick);
    void translateActive();
  }
  async function translateActive() {
    const request = active;
    const id = ++serial;
    request.translated = false;
    const withContext = request.includeContext && request.contextText !== request.text;
    const original = withContext ? request.contextText : request.text;
    const show = (text, error = false) => {
      if (id === serial) ui.show(text, request.anchor, { error, paused: Boolean(video.owned),
        original, withContext, canContext: request.contextText !== request.text,
        canReplay: Boolean(request.bookmark), rewindSeconds: request.translated ? settings.rewindSeconds : 0 });
    };
    show('Traduzindo no seu dispositivo…');
    try {
      const result = await service.translate(original, request.sourceLanguage, 'pt', {
        onStatus: status => show(statusMessage(status))
      });
      if (id !== serial) return;
      if (detector.snapshot().text !== request.text) { close(false); return; }
      request.translated = true;
      show(result);
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
    if (event.type === 'click' || (event.type === 'keydown' && !event.repeat)) void activate(anchor);
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
    if (!next.enabled || next.sourceLanguage !== settings.sourceLanguage || next.includeContext !== settings.includeContext) {
      close(true, false);
      context.clear();
    }
    if (next.sourceLanguage !== settings.sourceLanguage) service.destroy();
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
