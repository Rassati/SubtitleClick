(() => {
  'use strict';
  const ns = globalThis.SubtitleClick ??= {};
  class TranslationService {
    constructor(provider, { cacheLimit = 100, timeoutMs = 120000 } = {}) {
      this.provider = provider;
      this.cacheLimit = cacheLimit;
      this.timeoutMs = timeoutMs;
      this.cache = new Map();
      this.active = null;
      this.epoch = 0;
    }
    async translate(text, sourceLanguage = 'en', targetLanguage = 'pt', options = {}) {
      this.cancel();
      if (typeof text !== 'string' || !text.trim() || text.length > 5000) {
        throw new ns.TranslationError('invalid');
      }
      const key = JSON.stringify([sourceLanguage, targetLanguage, text]);
      if (this.cache.has(key)) {
        const value = this.cache.get(key);
        this.cache.delete(key);
        this.cache.set(key, value);
        return value;
      }
      const epoch = this.epoch;
      const controller = new AbortController();
      this.active = controller;
      let timeout;
      let abortListener;
      const aborted = new Promise((_, reject) => {
        abortListener = () => reject(controller.signal.reason ?? new DOMException('Canceled', 'AbortError'));
        controller.signal.addEventListener('abort', abortListener, { once: true });
        timeout = setTimeout(() => controller.abort(new ns.TranslationError('timeout')), this.timeoutMs);
      });
      try {
        const result = await Promise.race([
          this.provider.translate(text, sourceLanguage, targetLanguage, { ...options, signal: controller.signal }),
          aborted
        ]);
        if (controller.signal.aborted || epoch !== this.epoch) throw new DOMException('Canceled', 'AbortError');
        this.cache.set(key, result);
        if (this.cache.size > this.cacheLimit) this.cache.delete(this.cache.keys().next().value);
        return result;
      } catch (error) {
        if (error.code === 'timeout') this.provider.destroy?.();
        throw error;
      } finally {
        clearTimeout(timeout);
        controller.signal.removeEventListener('abort', abortListener);
        if (this.active === controller) this.active = null;
      }
    }
    cancel() { this.active?.abort(); this.active = null; }
    clear() { this.epoch++; this.cancel(); this.cache.clear(); }
    destroy() { this.clear(); this.provider.destroy?.(); }
  }
  ns.TranslationService = TranslationService;
})();
