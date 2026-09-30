(() => {
  'use strict';
  const ns = globalThis.SubtitleClick ??= {};
  const languages = Object.freeze({
    en: 'Inglês', pt: 'Português', ja: 'Japonês', ru: 'Russo', de: 'Alemão', es: 'Espanhol', fr: 'Francês',
    it: 'Italiano', ko: 'Coreano', zh: 'Chinês simplificado', 'zh-Hant': 'Chinês tradicional',
    ar: 'Árabe', bg: 'Búlgaro', bn: 'Bengali', cs: 'Tcheco', da: 'Dinamarquês', el: 'Grego',
    fi: 'Finlandês', he: 'Hebraico', hi: 'Hindi', hr: 'Croata', hu: 'Húngaro', id: 'Indonésio',
    kn: 'Canarês', lt: 'Lituano', mr: 'Marata', nl: 'Holandês', no: 'Norueguês', pl: 'Polonês',
    ro: 'Romeno', sk: 'Eslovaco', sl: 'Esloveno', sv: 'Sueco', ta: 'Tâmil', te: 'Telugu',
    th: 'Tailandês', tr: 'Turco', uk: 'Ucraniano', vi: 'Vietnamita'
  });
  const defaults = Object.freeze({ enabled: true, pauseOnClick: true, sourceLanguage: 'en',
    includeContext: true, rewindSeconds: 0, originalFirst: true, targetLanguage: 'pt' });
  function valid(key, value) {
    if (key === 'sourceLanguage' || key === 'targetLanguage') return typeof value === 'string' && Object.hasOwn(languages, value);
    if (key === 'rewindSeconds') return [0, 3, 5, 8].includes(value);
    return Object.hasOwn(defaults, key) && typeof value === 'boolean';
  }
  function sanitize(value = {}) {
    return Object.fromEntries(Object.entries(defaults).map(([key, fallback]) =>
      [key, valid(key, value?.[key]) ? value[key] : fallback]));
  }
  ns.Settings = {
    defaults,
    languages,
    sanitize,
    async load() {
      const result = await chrome.storage.local.get('settings');
      return sanitize(result.settings);
    },
    async set(key, value) {
      if (!valid(key, value)) throw new TypeError('Preferência inválida');
      const current = await this.load();
      await chrome.storage.local.set({ settings: { ...current, [key]: value } });
    },
    subscribe(callback) {
      const listener = (changes, area) => {
        if (area === 'local' && changes.settings) callback(sanitize(changes.settings.newValue));
      };
      chrome.storage.onChanged.addListener(listener);
      return () => chrome.storage.onChanged.removeListener(listener);
    }
  };
})();
