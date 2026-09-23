(() => {
  'use strict';
  const ns = globalThis.SubtitleClick ??= {};
  class TranslationError extends Error {
    constructor(code, cause) {
      super(code, { cause });
      this.name = 'TranslationError';
      this.code = code;
    }
  }
  const messages = Object.freeze({
    unavailable: 'Tradução local não está disponível neste navegador.',
    unsupported: 'O Chrome não disponibilizou este par de idiomas neste dispositivo.',
    activation: 'Feche este aviso e clique na legenda para ativar a tradução local.',
    download: 'Não foi possível preparar o modelo local. Verifique sua conexão e tente novamente.',
    translation: 'Não foi possível traduzir esta legenda. Feche e clique de novo para tentar.',
    timeout: 'A tradução demorou mais que o esperado. Feche e clique de novo para tentar.',
    invalid: 'Esta legenda é muito longa ou está vazia.'
  });
  class ChromeTranslatorProvider {
    constructor(scope = globalThis) {
      this.scope = scope;
      this.instance = null;
      this.pending = null;
      this.pair = null;
      this.generation = 0;
      this.creationController = null;
      this.listeners = new Set();
      this.status = { state: 'idle' };
    }
    get api() {
      const api = this.scope.Translator;
      return api && typeof api.availability === 'function' && typeof api.create === 'function' ? api : null;
    }
    async availability(sourceLanguage = 'en', targetLanguage = 'pt') {
      if (!this.api) return 'unavailable';
      try { return await this.api.availability({ sourceLanguage, targetLanguage }); }
      catch { return 'unavailable'; }
    }
    emit(status) {
      this.status = status;
      this.listeners.forEach(listener => listener(status));
    }
    // Called directly from the caption click: no awaited work before create().
    prepare(sourceLanguage, targetLanguage) {
      if (!this.api) return Promise.reject(new TranslationError('unavailable'));
      const pair = `${sourceLanguage}:${targetLanguage}`;
      if (this.pair && this.pair !== pair) this.destroy();
      this.pair = pair;
      if (this.instance) return Promise.resolve(this.instance);
      if (this.pending) return this.pending;
      const generation = this.generation;
      this.creationController = new AbortController();
      this.emit({ state: 'preparing' });
      // Availability refines failures, but must not delay user activation.
      const availability = this.availability(sourceLanguage, targetLanguage);
      let creation;
      try {
        creation = this.api.create({
          sourceLanguage, targetLanguage, signal: this.creationController.signal,
          monitor: monitor => monitor.addEventListener('downloadprogress', event => {
            if (generation !== this.generation) return;
            const progress = Number.isFinite(event.loaded) ? Math.max(0, Math.min(1, event.loaded)) : null;
            this.emit({ state: 'downloading', progress });
          })
        });
      } catch (error) { creation = Promise.reject(error); }
      this.pending = Promise.resolve(creation).then(instance => {
        if (generation !== this.generation) {
          instance.destroy();
          throw new DOMException('Canceled', 'AbortError');
        }
        this.instance = instance;
        this.emit({ state: 'ready' });
        return instance;
      }).catch(async error => {
        if (error.name === 'AbortError' && generation !== this.generation) throw error;
        if (error.name === 'NotAllowedError') throw new TranslationError('activation', error);
        if (error.name === 'NotSupportedError' || await availability === 'unavailable') {
          throw new TranslationError('unsupported', error);
        }
        throw new TranslationError('download', error);
      }).finally(() => {
        if (generation === this.generation) this.pending = null;
      });
      return this.pending;
    }
    async translate(text, sourceLanguage, targetLanguage, { signal, onStatus = () => {} } = {}) {
      if (signal?.aborted) throw new DOMException('Canceled', 'AbortError');
      let generation = this.generation;
      this.listeners.add(onStatus);
      onStatus(this.status);
      try {
        const preparation = this.prepare(sourceLanguage, targetLanguage);
        generation = this.generation;
        const instance = await new Promise((resolve, reject) => {
          const abort = () => reject(new DOMException('Canceled', 'AbortError'));
          signal?.addEventListener('abort', abort, { once: true });
          preparation.then(resolve, reject).finally(() => signal?.removeEventListener('abort', abort));
        });
        if (signal?.aborted) throw new DOMException('Canceled', 'AbortError');
        onStatus({ state: 'translating' });
        const result = await instance.translate(text, { signal });
        if (typeof result !== 'string' || !result.trim()) throw new Error('Empty translation');
        return result;
      } catch (error) {
        if (error instanceof TranslationError || (error.name === 'AbortError' &&
            (signal?.aborted || generation !== this.generation))) throw error;
        throw new TranslationError('translation', error);
      } finally { this.listeners.delete(onStatus); }
    }
    destroy() {
      this.generation++;
      this.creationController?.abort();
      this.creationController = null;
      this.instance?.destroy();
      this.instance = this.pending = this.pair = null;
      this.status = { state: 'idle' };
    }
  }
  Object.assign(ns, { ChromeTranslatorProvider, TranslationError, translationMessages: messages });
})();
