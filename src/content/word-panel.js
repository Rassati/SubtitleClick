(() => {
  'use strict';
  const ns = globalThis.SubtitleClick;
  // Temporary drafts live only in this tab and never write a browsing history.
  const drafts = new Map();
  const make = (tag, text, className) => {
    const node = document.createElement(tag);
    if (text) node.textContent = text;
    if (className) node.className = className;
    return node;
  };
  class WordPanel {
    constructor() {
      this.revision = 0;
      this.root = make('div', '', 'word-panel');
      this.root.hidden = true;
      const tip = make('p', 'Escolha uma palavra da legenda ou digite uma expressão.', 'word-tip');
      this.tokens = make('p', '', 'word-tokens');
      this.tokens.setAttribute('aria-label', 'Palavras da legenda');
      const form = make('form', '', 'word-search');
      this.input = make('input');
      this.input.type = 'search';
      this.input.maxLength = 100;
      this.input.required = true;
      this.input.setAttribute('aria-label', 'Palavra ou expressão');
      this.input.placeholder = 'Palavra ou expressão';
      const search = make('button', 'Consultar');
      search.type = 'submit';
      form.append(this.input, search);
      form.addEventListener('submit', event => { event.preventDefault(); void this.lookup(this.input.value); });
      this.status = make('p', '', 'word-status');
      this.status.setAttribute('role', 'status');
      this.status.setAttribute('aria-live', 'polite');
      this.results = make('div', '', 'word-results');
      this.editor = make('div', '', 'word-editor');
      const noteLabel = make('label', 'Sua anotação (opcional)');
      this.note = make('textarea');
      this.note.rows = 2;
      this.note.maxLength = 2000;
      this.note.placeholder = 'O sentido nesta frase, uma dica…';
      this.note.addEventListener('input', () => this.keepDraft());
      noteLabel.append(this.note);
      this.save = make('button', 'Salvar no meu dicionário', 'word-save');
      this.save.type = 'button';
      this.save.addEventListener('click', () => { void this.saveWord(); });
      this.editor.append(noteLabel, this.save);
      this.editor.hidden = true;
      const attribution = make('p', 'Bases offline: FreeDict (GPL-2.0+) e WikDict/Wiktionary (CC BY-SA 3.0). Os verbetes não cobrem todos os usos possíveis.', 'word-credit');
      this.fallback = make('button', 'Tentar tradução local', 'word-fallback');
      this.fallback.type = 'button'; this.fallback.hidden = true;
      this.fallback.addEventListener('click', () => { void this.translateMissing(); });
      this.direction = make('p', '', 'word-tip');
      this.tokenDetails = make('details', '', 'word-choices');
      this.tokenDetails.append(make('summary', 'Escolher outra palavra da legenda'), tip, this.tokens);
      this.noteDetails = make('details');
      this.noteDetails.append(make('summary', 'Adicionar anotação'), noteLabel);
      this.editor.replaceChildren(this.noteDetails, this.save);
      this.root.append(this.direction, this.tokenDetails, form, this.status, this.fallback, this.results, this.editor, attribution);
    }
    open(snapshot, initialWord = '') {
      this.hide();
      this.snapshot = snapshot;
      this.direction.textContent = `Consulta ${snapshot.sourceLanguage.toUpperCase()} → ${(snapshot.targetLanguage ?? 'pt').toUpperCase()}`;
      this.root.hidden = false;
      this.input.value = '';
      this.tokenDetails.open = !initialWord;
      this.noteDetails.open = false;
      this.tokens.replaceChildren();
      const fragment = document.createDocumentFragment();
      for (const part of ns.WordTools.segments(snapshot.text.slice(0, 1500), snapshot.sourceLanguage)) {
        if (part.isWordLike) {
          const button = make('button', part.segment);
          button.type = 'button';
          button.addEventListener('click', () => { void this.lookup(part.segment); });
          fragment.append(button);
        } else fragment.append(document.createTextNode(part.segment));
      }
      this.tokens.append(fragment);
      this.status.textContent = 'A consulta não envia palavras para a internet.';
      if (initialWord) void this.lookup(initialWord);
    }
    async lookup(word) {
      this.keepDraft();
      this.localService?.cancel();
      const revision = ++this.revision;
      this.input.value = word;
      this.selected = null;
      this.saved = false;
      this.fallback.hidden = true;
      this.results.replaceChildren();
      this.editor.hidden = true;
      this.note.value = '';
      this.status.textContent = 'Consultando dicionário offline…';
      try {
        const result = await ns.VocabularyClient.request('lookup', { word, sourceLanguage: this.snapshot.sourceLanguage, targetLanguage: this.snapshot.targetLanguage ?? 'pt' });
        if (revision !== this.revision) return;
        this.displayResult(result);
      } catch (error) {
        if (revision === this.revision) this.status.textContent = error.message;
      }
    }
    displayResult(result) {
        this.results.replaceChildren();
        this.selected = result;
        this.saved = false;
        this.fallback.hidden = result.entries.length > 0 || this.snapshot.sourceLanguage === this.snapshot.targetLanguage;
        this.fallback.disabled = false;
        this.tokenDetails.open = false;
        this.status.textContent = result.status === 'machine' ? 'Tradução automática local — não é uma lista de sentidos de dicionário.' : result.status === 'unsupported'
          ? 'A base de significados é inglês ↔ português. Você pode salvar esta palavra e anotar sua tradução.'
          : result.status === 'missing' ? 'Palavra não encontrada nesta base. Você pode salvá-la e completar depois.'
          : 'Marque os significados que deseja guardar.';
        for (const entry of result.entries) {
          const group = make('fieldset');
          const pos = { s: 'substantivo', n: 'substantivo', v: 'verbo', adj: 'adjetivo', adv: 'advérbio', art: 'artigo', prep: 'preposição', pron: 'pronome', conj: 'conjunção', interj: 'interjeição' }[entry.partOfSpeech] ?? entry.partOfSpeech;
          const heading = `${entry.word}${entry.pronunciation ? ' /' + entry.pronunciation + '/' : ''}${pos ? ' · ' + pos : ''}`;
          group.append(make('legend', heading));
          if (entry.source) group.append(make('p', entry.source, 'word-tip'));
          if (entry.match === 'related') group.append(make('p', 'Possível forma-base — confira o sentido na frase.', 'word-tip'));
          if (entry.match === 'inflected') group.append(make('p', 'Forma flexionada registrada no dicionário.', 'word-tip'));
          for (const sense of entry.senses) {
            const label = make('label', '', 'word-sense');
            const checkbox = make('input');
            checkbox.type = 'checkbox';
            checkbox.checked = true;
            checkbox.value = sense.join('; ');
            checkbox.addEventListener('change', () => this.keepDraft());
            label.append(checkbox, make('span', checkbox.value));
            group.append(label);
          }
          this.results.append(group);
        }
        this.editor.hidden = false;
        this.save.disabled = false;
        this.save.textContent = 'Salvar no meu dicionário';
        const draft = drafts.get(this.draftKey());
        if (draft) {
          this.note.value = draft.note;
          this.noteDetails.open = Boolean(draft.note);
          if (result.status !== 'machine') for (const input of this.results.querySelectorAll('input')) input.checked = draft.senses.includes(input.value);
        }
    }
    draftKey() {
      return this.selected && this.snapshot ? JSON.stringify([this.selected.word, this.snapshot.sourceLanguage,
        this.snapshot.targetLanguage, this.snapshot.videoId, this.snapshot.referenceText ?? this.snapshot.text]) : null;
    }
    keepDraft() {
      const key = this.draftKey();
      if (!key || this.saved) return;
      drafts.delete(key);
      drafts.set(key, { note: this.note.value, senses: [...this.results.querySelectorAll('input:checked')].map(input => input.value) });
      if (drafts.size > 50) drafts.delete(drafts.keys().next().value);
    }
    async translateMissing() {
      if (!this.selected || this.fallback.disabled) return;
      const revision = this.revision, word = this.selected.word;
      this.fallback.disabled = this.save.disabled = true;
      this.status.textContent = 'Traduzindo a palavra no dispositivo…';
      this.localService ??= new ns.TranslationService(new ns.ChromeTranslatorProvider());
      try {
        const translation = await this.localService.translate(word, this.snapshot.sourceLanguage, this.snapshot.targetLanguage ?? 'pt', {
          onStatus: status => {
            if (revision === this.revision && ['preparing', 'downloading'].includes(status.state)) {
              this.status.textContent = 'Preparando modelo local… O primeiro uso pode precisar baixar o modelo.';
            }
          }
        });
        if (revision !== this.revision) return;
        this.keepDraft();
        this.displayResult({ word, status: 'machine', source: 'Chrome Translator — tradução automática local',
          entries: [{ word, pronunciation: '', partOfSpeech: '', match: 'machine', senses: [[translation]] }] });
      } catch (error) {
        if (revision === this.revision && error.name !== 'AbortError') this.status.textContent = ns.translationMessages[error.code] ?? error.message;
      } finally {
        if (revision === this.revision) this.fallback.disabled = this.save.disabled = false;
      }
    }
    async saveWord() {
      if (!this.selected || this.save.disabled) return;
      const revision = this.revision;
      this.save.disabled = true;
      const payload = { word: this.selected.word, sourceLanguage: this.snapshot.sourceLanguage, targetLanguage: this.snapshot.targetLanguage ?? 'pt',
        definitions: [...this.results.querySelectorAll('input:checked')].map(input => input.value),
        dictionarySource: this.selected.source ?? '', note: this.note.value,
        example: { text: this.snapshot.referenceText ?? this.snapshot.text, translation: this.snapshot.translation ?? '', videoId: this.snapshot.videoId, time: this.snapshot.time } };
      try {
        await ns.VocabularyClient.request('save', payload);
        if (revision !== this.revision) return;
        this.saved = true;
        drafts.delete(this.draftKey());
        this.save.textContent = '✓ Palavra salva';
        this.status.textContent = 'Salva no seu dicionário, com este trecho do vídeo.';
      } catch (error) {
        if (revision !== this.revision) return;
        this.save.disabled = false;
        this.status.textContent = error.message;
      }
    }
    hide() {
      this.keepDraft();
      this.localService?.cancel();
      this.revision++;
      this.root.hidden = true;
      this.results.replaceChildren();
      this.tokens.replaceChildren();
      this.editor.hidden = true;
      this.selected = null;
    }
    destroy() { this.hide(); this.localService?.destroy(); }
  }
  WordPanel.css = `
    .word-panel{min-width:0;max-width:100%;font-size:13px;width:350px}
    .word-choices{margin:0 0 10px}.word-panel details{font-size:11px}
    .word-tip,.word-credit{color:#aab5b1;font-size:11px;margin:6px 0;line-height:1.5}
    .word-tokens{white-space:pre-wrap;line-height:2;margin:8px 0;max-height:100px;overflow:auto}
    .word-tokens button{margin:1px 0;padding:3px 4px;background:#ffffff0a;color:#d8f8e9;font-size:14px;line-height:1.4}
    .word-search{display:flex;gap:6px}.word-search input{min-width:0;flex:1}
    .word-panel input[type=search],.word-panel textarea{border:1px solid #ffffff30;border-radius:6px;background:#0e1517;color:#f3f6f5;padding:8px;font:13px/1.4 system-ui}
    .word-panel textarea{display:block;width:100%;resize:vertical;margin-top:5px}
    .word-panel button{font-size:12px;line-height:1.4}.word-search button{background:#ffffff12;margin:0}
    .word-status{font-size:12px;color:#c3d9cd;margin:10px 0}
    .word-results fieldset{min-width:0;margin:9px 0;padding:8px;border:1px solid #ffffff24;border-radius:8px}
    .word-results legend{color:#9fe4c9;font-size:13px;padding:0 4px}
    .word-sense{display:flex;gap:8px;align-items:baseline;padding:4px 0;cursor:pointer}
    .word-sense input{accent-color:#91ddc4;flex:none}.word-editor label{font-size:11px;color:#b7cbc1}
    button.word-save{display:block;background:#b4f1d6;color:#14251e;padding:8px 12px;margin:10px 0}
    .word-panel button:disabled{opacity:.65;cursor:default}.word-panel :focus-visible{outline:2px solid #91ddc4;outline-offset:2px}
  `;
  ns.WordPanel = WordPanel;
})();
