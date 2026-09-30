(() => {
  'use strict';
  const ns = globalThis.SubtitleClick;
  const { limit, language, mergeExamples } = ns.VocabularyData;
  const prefix = 'sentences:v1:';
  async function identity(input) {
    if (typeof input?.text !== 'string' || !input.text.trim() || input.text.length > 5000 ||
        !language(input.sourceLanguage) || !language(input.targetLanguage)) throw new Error('Frase ou idioma inválido (máximo 5.000 caracteres).');
    const text = input.text.trim().normalize('NFC');
    const bytes = new TextEncoder().encode(text.replace(/\s+/g, ' '));
    const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(b => b.toString(16).padStart(2, '0')).join('');
    return { text, sourceLanguage: input.sourceLanguage, targetLanguage: input.targetLanguage,
      id: `${input.sourceLanguage}:${input.targetLanguage}:${hash}` };
  }
  class SentenceStore {
    constructor(storage) { this.storage = storage; }
    async list() {
      return Object.entries(await this.storage.get(null)).filter(([key, value]) => key.startsWith(prefix) && value?.id)
        .map(([, value]) => value).sort((a, b) => b.updatedAt - a.updatedAt);
    }
    async save(input) {
      const base = await identity(input);
      const key = prefix + base.id;
      const previous = (await this.storage.get(key))[key];
      const translation = limit(input.translation, 5000);
      const sample = { ...input.example, text: input.example?.text || base.text, translation };
      const value = { ...base, translation: previous?.translation || translation, note: previous?.note || limit(input.note, 2000),
        examples: mergeExamples(previous?.examples ?? [], [sample]), createdAt: previous?.createdAt ?? Date.now(), updatedAt: Date.now() };
      await this.storage.set({ [key]: value });
      return value;
    }
    async update(input) {
      const base = await identity(input);
      const key = prefix + base.id;
      const previous = (await this.storage.get(key))[key];
      if (!previous) throw new Error('Esta frase já foi removida.');
      const value = { ...previous, translation: limit(input.translation, 5000), note: limit(input.note, 2000), updatedAt: Date.now() };
      await this.storage.set({ [key]: value }); return value;
    }
    async updateClip(input) {
      const base = await identity(input);
      const key = prefix + base.id;
      const previous = (await this.storage.get(key))[key];
      if (!previous) throw new Error('Esta frase já foi removida.');
      const clip = ns.VocabularyData.clipOf(input.clip);
      const reference = ns.VocabularyData.example(input.example);
      if (!clip || !reference) throw new Error('Escolha um trecho entre 0 e 24 horas, com duração de até 120 segundos.');
      let found = false;
      const examples = previous.examples.map(example => {
        if (example.videoId !== reference.videoId || example.time !== reference.time || example.text !== reference.text) return example;
        found = true;
        if (input.automatic && example.clip?.source === 'manual') return example;
        return { ...example, clip: { ...clip, source: input.automatic ? clip.source : 'manual' } };
      });
      if (!found) throw new Error('Esta referência já foi removida.');
      const value = { ...previous, examples, updatedAt: Date.now() };
      await this.storage.set({ [key]: value }); return value;
    }
    async remove(input) {
      const base = await identity(input);
      await this.storage.remove(prefix + base.id); return true;
    }
    async prepareRestore(backup, current) {
      if (backup.version === 1) return {};
      if (!Array.isArray(backup.sentences) || backup.sentences.length > 50000) throw new Error('Frases inválidas no backup. Nada foi importado.');
      const changes = {};
      for (const item of backup.sentences) {
        const base = await identity(item);
        const key = prefix + base.id;
        const previous = changes[key] ?? current[key];
        changes[key] = { ...base, translation: previous?.translation || limit(item.translation, 5000),
          note: previous?.note || limit(item.note, 2000),
          examples: mergeExamples(previous?.examples ?? [], Array.isArray(item.examples) ? item.examples : []),
          createdAt: previous?.createdAt ?? (Number.isFinite(item.createdAt) ? item.createdAt : Date.now()), updatedAt: Date.now() };
      }
      return changes;
    }
  }
  ns.SentenceStore = SentenceStore;
})();
