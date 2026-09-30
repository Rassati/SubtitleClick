(() => {
  'use strict';
  const ns = globalThis.SubtitleClick ??= {};
  const normalize = value => typeof value === 'string'
    ? value.normalize('NFC').trim().replace(/’/g, "'").replace(/\s+/g, ' ').toLowerCase() : '';
  const irregular = {
    am: 'be', is: 'be', are: 'be', was: 'be', were: 'be', been: 'be', being: 'be',
    has: 'have', had: 'have', does: 'do', did: 'do', done: 'do', went: 'go', gone: 'go',
    saw: 'see', seen: 'see', took: 'take', taken: 'take', made: 'make', said: 'say',
    got: 'get', gotten: 'get', came: 'come', knew: 'know', known: 'know', thought: 'think',
    bought: 'buy', brought: 'bring', gave: 'give', given: 'give', found: 'find',
    felt: 'feel', left: 'leave', told: 'tell', wrote: 'write', written: 'write',
    ran: 'run', ate: 'eat', eaten: 'eat', spoke: 'speak', spoken: 'speak',
    children: 'child', men: 'man', women: 'woman', people: 'person', feet: 'foot', teeth: 'tooth'
  };
  function candidates(word) {
    const forms = new Set();
    if (Object.hasOwn(irregular, word)) forms.add(irregular[word]);
    if (word.endsWith("'s")) forms.add(word.slice(0, -2));
    if (word.endsWith('ies') || word.endsWith('ied')) forms.add(word.slice(0, -3) + 'y');
    if (word.endsWith('s') && !word.endsWith('ss')) forms.add(word.slice(0, -1));
    if (word.endsWith('es')) forms.add(word.slice(0, -2));
    for (const suffix of ['ing', 'ed']) {
      if (!word.endsWith(suffix)) continue;
      const stem = word.slice(0, -suffix.length);
      forms.add(stem); forms.add(stem + 'e');
      if (/(.)\1$/.test(stem)) forms.add(stem.slice(0, -1));
    }
    return [...forms].filter(form => form.length > 1);
  }
  class DictionaryProvider {
    constructor(load) { this.load = load; this.data = null; }
    async lookup(value, sourceLanguage = 'en', targetLanguage = 'pt') {
      const word = normalize(value);
      if (!word || word.length > 100) throw new Error('Escolha uma palavra ou expressão de até 100 caracteres.');
      const reverse = sourceLanguage === 'pt' && targetLanguage === 'en';
      if (!reverse && (sourceLanguage !== 'en' || targetLanguage !== 'pt')) return { word, entries: [], status: 'unsupported' };
      // This cache contains only bundled public data, never saved user information.
      if (!this.data) {
        const loaded = await this.load();
        this.data = Array.isArray(loaded) ? combineDictionaries(loaded) : loaded;
      }
      if (reverse) {
        // Reverse lookup of exact translation equivalents, not alignment of a sentence.
        if (!this.reverse) {
          this.reverse = new Map();
          for (const group of Object.values(this.data.entries)) for (const entry of group) {
            for (const sense of entry.senses) for (const translation of sense) {
              const key = normalize(translation);
              if (!this.reverse.has(key)) this.reverse.set(key, new Set());
              this.reverse.get(key).add(entry.word);
            }
          }
        }
        const meanings = this.reverse.get(word);
        return { word, status: meanings ? 'found' : 'missing', source: this.data.source + ' (consulta inversa)',
          entries: meanings ? [{ word, senses: [...meanings].map(meaning => [meaning]), match: 'reverse', partOfSpeech: '', pronunciation: '' }] : [] };
      }
      const entries = this.data.entries;
      const exact = Object.hasOwn(entries, word) ? entries[word] : [];
      const aliases = this.data.aliases;
      const known = aliases && Object.hasOwn(aliases, word) ? aliases[word] : [];
      const matches = [...exact.map(entry => ({ ...entry, match: 'exact' })),
        ...known.flatMap(form => Object.hasOwn(entries, form) ? entries[form].map(entry => ({ ...entry, match: 'inflected' })) : [])];
      if (!matches.length) matches.push(...candidates(word).flatMap(form => Object.hasOwn(entries, form)
        ? entries[form].map(entry => ({ ...entry, match: 'related' })) : []));
      return { word, entries: matches, status: matches.length ? 'found' : 'missing', source: this.data.source };
    }
  }
  function combineDictionaries(dictionaries) {
    const entries = Object.create(null), aliases = Object.create(null);
    for (const dictionary of dictionaries) {
      for (const [word, group] of Object.entries(dictionary.entries)) {
        entries[word] ??= [];
        for (const entry of group) entries[word].push({ ...entry, source: dictionary.source, license: dictionary.license });
      }
      for (const [form, words] of Object.entries(dictionary.aliases ?? {})) {
        aliases[form] = [...new Set([...(aliases[form] ?? []), ...words])];
      }
    }
    return { source: dictionaries.map(d => d.source).join(' + '), entries, aliases };
  }
  ns.combineDictionaries = combineDictionaries;
  ns.DictionaryProvider = DictionaryProvider;
  ns.normalizeWord = normalize;
})();
