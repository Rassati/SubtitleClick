(() => {
  'use strict';
  const ns = globalThis.SubtitleClick ??= {};
  const prefix = 'vocabulary:v1:';
  const limit = (value, max) => typeof value === 'string' ? value.trim().slice(0, max) : '';
  const language = value => typeof value === 'string' && /^[a-z]{2,3}(?:-[A-Za-z]{2,8})?$/.test(value);
  const definitionsOf = value => Array.isArray(value) ? [...new Set(value.map(s => limit(s, 500)).filter(Boolean))].slice(0, 100) : [];
  function clipOf(value) {
    if (!value || !Number.isFinite(value.start) || !Number.isFinite(value.end) || value.start < 0 ||
        value.end > 86400 || value.end <= value.start || value.end - value.start > 120) return null;
    const start = Math.round(value.start * 100) / 100, end = Math.round(value.end * 100) / 100;
    if (end <= start) return null;
    return { start, end,
      source: ['cue', 'observed', 'manual'].includes(value.source) ? value.source : 'estimated' };
  }
  function identity(item) {
    const word = ns.normalizeWord(item?.word);
    const sourceLanguage = item?.sourceLanguage;
    if (!word || word.length > 100 || !language(sourceLanguage) || !language(item.targetLanguage)) {
      throw new Error('Palavra ou idioma inválido.');
    }
    return { word, sourceLanguage, targetLanguage: item.targetLanguage, id: `${sourceLanguage}:${item.targetLanguage}:${encodeURIComponent(word)}` };
  }
  function example(value) {
    const text = limit(value?.text, 1500);
    const videoId = /^[\w-]{1,64}$/.test(value?.videoId ?? '') ? value.videoId : '';
    const time = Number.isFinite(value?.time) ? Math.max(0, Math.min(86400, Math.floor(value.time))) : 0;
    return text ? { text, videoId, time, definitions: definitionsOf(value.definitions), note: limit(value.note, 2000),
      translation: limit(value.translation, 5000), ...(clipOf(value.clip) ? { clip: clipOf(value.clip) } : {}) } : null;
  }
  function mergeExamples(...groups) {
    const result = new Map();
    for (const item of groups.flat()) {
      const value = example(item);
      if (!value) continue;
      const key = JSON.stringify([value.text, value.videoId, value.time]);
      const previous = result.get(key);
      if (previous) {
        value.definitions = [...new Set([...previous.definitions, ...value.definitions])];
        value.note = [...new Set([previous.note, value.note].filter(Boolean))].join('\n');
        value.translation ||= previous.translation;
        const rank = { estimated: 0, observed: 1, cue: 2, manual: 3 };
        if (previous.clip && (!value.clip || rank[previous.clip.source] > rank[value.clip.source])) value.clip = previous.clip;
      }
      result.set(key, value);
    }
    return [...result.values()];
  }
  class VocabularyStore {
    constructor(storage) { this.storage = storage; }
    async list() {
      const values = await this.storage.get(null);
      return Object.entries(values).filter(([key, value]) => key.startsWith(prefix) && value?.id)
        .map(([, value]) => value).sort((a, b) => b.updatedAt - a.updatedAt);
    }
    async save(input) {
      const base = identity(input);
      const key = prefix + base.id;
      const previous = (await this.storage.get(key))[key];
      const definitions = Array.isArray(input.definitions) ? [...new Set(input.definitions.map(s => limit(s, 500)).filter(Boolean))].slice(0, 100) : [];
      const now = Date.now();
      const incomingNote = limit(input.note, 2000);
      const note = previous?.note && incomingNote && previous.note !== incomingNote
        ? limit(`${previous.note}\n${incomingNote}`, 2000) : incomingNote || previous?.note || '';
      const sample = example({ ...input.example, definitions, note: incomingNote });
      const examples = mergeExamples(previous?.examples ?? [], sample ? [sample] : []);
      const value = { ...base, definitions: [...new Set([...(previous?.definitions ?? []), ...definitions])].slice(0, 100),
        note, examples,
        dictionarySource: limit(input.dictionarySource, 120) || previous?.dictionarySource || '',
        createdAt: previous?.createdAt ?? now, updatedAt: now };
      await this.storage.set({ [key]: value });
      return value;
    }
    async update(input) {
      const { id } = identity(input);
      const key = prefix + id;
      const previous = (await this.storage.get(key))[key];
      if (!previous) throw new Error('Esta palavra já foi removida.');
      if (!Array.isArray(input.definitions)) throw new Error('Significados inválidos.');
      const value = { ...previous, definitions: [...new Set(input.definitions.map(s => limit(s, 500)).filter(Boolean))].slice(0, 100),
        note: limit(input.note, 2000), updatedAt: Date.now() };
      await this.storage.set({ [key]: value });
      return value;
    }
    async remove(input) {
      const { id } = identity(input);
      await this.storage.remove(prefix + id);
      return true;
    }
    prepareRestore(backup, current) {
      if (backup?.format !== 'subtitleclick-vocabulary' || ![1, 2].includes(backup.version) || !Array.isArray(backup.words) ||
          backup.words.length > 50000 || JSON.stringify(backup).length > 20_000_000) throw new Error('Backup inválido ou muito grande (máximo 20 MB).');
      const changes = {};
      // Validate the entire file before writing anything. Imports merge with existing words.
      for (const item of backup.words) {
        const base = identity(item);
        if (!Array.isArray(item.definitions) || item.definitions.some(s => typeof s !== 'string')) throw new Error('O backup contém significados inválidos. Nada foi importado.');
        const key = prefix + base.id;
        const previous = changes[key] ?? current[key];
        const examples = mergeExamples(previous?.examples ?? [], Array.isArray(item.examples) ? item.examples : []);
        changes[key] = { ...base, definitions: [...new Set([...(previous?.definitions ?? []), ...item.definitions.map(s => limit(s, 500)).filter(Boolean)])].slice(0, 100),
          note: previous?.note ?? limit(item.note, 2000), dictionarySource: previous?.dictionarySource || limit(item.dictionarySource, 120),
          examples,
          createdAt: previous?.createdAt ?? (Number.isFinite(item.createdAt) ? item.createdAt : Date.now()), updatedAt: Date.now() };
      }
      return changes;
    }
    async restore(backup) {
      const changes = this.prepareRestore(backup, await this.storage.get(null));
      if (Object.keys(changes).length) await this.storage.set(changes);
      return Object.keys(changes).length;
    }
  }
  ns.VocabularyStore = VocabularyStore;
  ns.VocabularyData = { limit, language, example, mergeExamples, clipOf };
})();
