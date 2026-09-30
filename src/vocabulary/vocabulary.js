(() => {
  'use strict';
  const client = globalThis.SubtitleClick.VocabularyClient;
  const $ = selector => document.querySelector(selector);
  const status = $('#status');
  let words = [], selectedId = null, shown = 50, dirty = false;
  const make = (tag, text, className) => {
    const element = document.createElement(tag);
    if (text) element.textContent = text;
    if (className) element.className = className;
    return element;
  };
  const fold = text => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  function renderList() {
    const query = fold($('#search').value.trim());
    const filtered = words.filter(word => fold([word.word, ...word.definitions, word.note].join(' ')).includes(query));
    $('#count').textContent = `${filtered.length} de ${words.length} palavras`;
    $('#export').disabled = false;
    const fragment = document.createDocumentFragment();
    for (const word of filtered.slice(0, shown)) {
      const button = make('button', '', 'word-item');
      button.setAttribute('aria-current', String(word.id === selectedId));
      button.append(make('strong', word.word), make('small', word.definitions.join(' · ') || 'Para completar'),
        make('small', `${word.sourceLanguage.toUpperCase()} → ${word.targetLanguage.toUpperCase()} · ${word.examples.length} referências`));
      button.addEventListener('click', () => {
        if (dirty && !confirm('Descartar as alterações não salvas?')) return;
        selectedId = word.id;
        renderList(); renderDetail(word);
      });
      fragment.append(button);
    }
    if (!filtered.length) fragment.append(make('p', query ? 'Nenhuma palavra encontrada.' : 'Nenhuma palavra salva ainda.', 'meta'));
    $('#list').replaceChildren(fragment);
    $('#more').hidden = filtered.length <= shown;
  }
  function renderDetail(word) {
    dirty = false;
    const detail = $('#detail');
    if (!word) {
      detail.replaceChildren(make('h2', 'Escolha uma palavra'), make('p', 'Salve palavras durante os vídeos para criar seu próprio dicionário.'));
      return;
    }
    const title = make('h2', word.word);
    const meta = make('p', `${word.sourceLanguage.toUpperCase()} → ${word.targetLanguage.toUpperCase()} · ${word.examples.length} referências · Salva em ${new Date(word.createdAt).toLocaleDateString('pt-BR')}`, 'meta');
    const form = make('form');
    const meaningsLabel = make('label', 'Significados — um por linha');
    const meanings = make('textarea'); meanings.id = 'definitions'; meanings.rows = 4; meanings.maxLength = 50000;
    meaningsLabel.htmlFor = meanings.id; meanings.value = word.definitions.join('\n');
    const noteLabel = make('label', 'Sua anotação');
    const note = make('textarea'); note.id = 'note'; note.rows = 3; note.maxLength = 2000;
    noteLabel.htmlFor = note.id; note.value = word.note;
    form.addEventListener('input', () => { dirty = true; });
    const actions = make('div', '', 'actions');
    const save = make('button', 'Salvar alterações', 'primary'); save.type = 'submit';
    const remove = make('button', 'Remover palavra', 'danger'); remove.type = 'button';
    actions.append(save, remove);
    form.append(meaningsLabel, meanings, noteLabel, note, actions);
    form.addEventListener('submit', async event => {
      event.preventDefault(); save.disabled = remove.disabled = true;
      try {
        const updated = await client.request('update', { ...word, definitions: meanings.value.split('\n'), note: note.value });
        words = words.map(value => value.id === updated.id ? updated : value);
        dirty = false; renderList(); status.textContent = 'Alterações salvas neste navegador.';
      } catch (error) { status.textContent = error.message; }
      finally { save.disabled = remove.disabled = false; }
    });
    remove.addEventListener('click', async () => {
      if (!confirm(`Remover “${word.word}” do seu dicionário?`)) return;
      save.disabled = remove.disabled = true;
      try {
        await client.request('remove', word);
        words = words.filter(value => value.id !== word.id); selectedId = null;
        renderList(); renderDetail(null); status.textContent = 'Palavra removida.';
      } catch (error) { status.textContent = error.message; save.disabled = remove.disabled = false; }
    });
    detail.replaceChildren(title, meta, form);
    if (word.examples.length) detail.append(make('h3', 'Onde você encontrou esta palavra'));
    for (const example of word.examples) {
      const quote = make('blockquote', example.text);
      if (example.definitions?.length) quote.append(make('p', `Sentidos neste trecho: ${example.definitions.join(' · ')}`, 'reference-meaning'));
      if (example.note) quote.append(make('p', example.note, 'source'));
      if (example.translation) quote.append(make('p', example.translation, 'source'));
      if (/^[\w-]{1,64}$/.test(example.videoId) && Number.isFinite(example.time)) {
        const time = Math.max(0, Math.floor(example.time));
        const link = make('a', `↗ Voltar ao vídeo · ${Math.floor(time / 60)}:${String(time % 60).padStart(2, '0')}`);
        link.href = `https://www.youtube.com/watch?v=${encodeURIComponent(example.videoId)}&t=${time}s`;
        link.target = '_blank'; link.rel = 'noopener noreferrer'; quote.append(link);
      }
      detail.append(quote);
    }
    if (word.dictionarySource) detail.append(make('p', `Consulta original: ${word.dictionarySource}. Você pode editar os significados.`, 'source'));
  }
  async function load(silent = false) {
    try {
      words = await client.request('list'); renderList();
      if (!silent) status.textContent = '';
      if (selectedId && !dirty) renderDetail(words.find(word => word.id === selectedId));
    } catch (error) { status.textContent = error.message; }
  }
  $('#search').addEventListener('input', () => { shown = 50; renderList(); });
  $('#more').addEventListener('click', () => { shown += 50; renderList(); });
  $('#export').addEventListener('click', async () => {
    try {
      const backup = await client.request('export');
      const url = URL.createObjectURL(new Blob([JSON.stringify(backup)], { type: 'application/json' }));
      const link = make('a'); link.href = url; link.download = `subtitleclick-dicionario-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      status.textContent = 'Backup exportado com palavras, frases e todas as referências.';
    } catch (error) { status.textContent = error.message; }
  });
  $('#import').addEventListener('click', () => $('#file').click());
  $('#file').addEventListener('change', async event => {
    const file = event.target.files[0]; if (!file) return;
    $('#import').disabled = true;
    try {
      if (file.size > 20_000_000) throw new Error('Arquivo muito grande. O limite é 20 MB.');
      const backup = JSON.parse(await file.text());
      const count = await client.request('import', backup);
      await load(); status.textContent = `${count.words} palavras importadas; ${count.sentences} frases importadas. Repetições foram combinadas, preservando suas notas atuais.`;
    } catch (error) { status.textContent = error instanceof SyntaxError ? 'Arquivo JSON inválido. Nada foi importado.' : error.message; }
    finally { $('#import').disabled = false; event.target.value = ''; }
  });
  window.addEventListener('beforeunload', event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && Object.keys(changes).some(key => key.startsWith('vocabulary:v1:'))) void load(true);
  });
  void load();
})();
