(() => {
  'use strict';
  const client = SubtitleClick.VocabularyClient;
  const $ = selector => document.querySelector(selector);
  const status = $('#status');
  let items = [], selected = null, dirty = false, shown = 50, deck = null, position = 0;
  const translator = new SubtitleClick.TranslationService(new SubtitleClick.ChromeTranslatorProvider());
  let players = [], renderRevision = 0;
  function clearMedia() { players.forEach(player => player.destroy()); players = []; translator.cancel(); renderRevision++; }
  const make = (tag, text, className) => {
    const node = document.createElement(tag); node.textContent = text ?? '';
    if (className) node.className = className;
    return node;
  };
  const pair = item => `${item.sourceLanguage.toUpperCase()} → ${item.targetLanguage.toUpperCase()}`;
  function matches() {
    const query = $('#search').value.trim().toLocaleLowerCase();
    return items.filter(item => (!$('#language').value || pair(item) === $('#language').value) &&
      `${item.text} ${item.translation} ${item.note}`.toLocaleLowerCase().includes(query));
  }
  function references(parent, item) {
    for (const example of item.examples) {
      const quote = make('blockquote', example.text);
      if (example.translation) quote.append(make('p', example.translation, 'source'));
      if (/^[\w-]{1,64}$/.test(example.videoId) && Number.isFinite(example.time)) {
        const time = Math.max(0, Math.floor(example.time));
        const link = make('a', `↗ Voltar ao vídeo · ${Math.floor(time / 60)}:${String(time % 60).padStart(2, '0')}`);
        link.href = `https://www.youtube.com/watch?v=${encodeURIComponent(example.videoId)}&t=${time}s`;
        link.target = '_blank'; link.rel = 'noopener noreferrer'; quote.append(link);
      }
      parent.append(quote);
    }
  }
  function media(parent, item) {
    for (const example of item.examples) {
      if (!/^[\w-]{11}$/.test(example.videoId)) continue;
      const player = new SubtitleClick.ClipPlayer(example, async clip => {
        const updated = await client.request('sentences-clip', { ...item, example, clip });
        Object.assign(item, updated);
        if (deck) deck = deck.map(value => value.id === updated.id ? updated : value);
      });
      players.push(player); parent.append(player.root);
    }
  }
  function renderList() {
    const filtered = matches();
    $('#count').textContent = `${filtered.length} de ${items.length} frases`;
    $('#study').disabled = !filtered.length;
    const fragment = document.createDocumentFragment();
    for (const item of filtered.slice(0, shown)) {
      const button = make('button', '', 'word-item');
      button.setAttribute('aria-current', String(selected === item.id));
      button.append(make('strong', item.text), make('small', `${pair(item)} · ${item.examples.length} referências`));
      button.addEventListener('click', () => {
        if (dirty && !confirm('Descartar as alterações não salvas?')) return;
        selected = item.id; renderList(); renderDetail(item);
      });
      fragment.append(button);
    }
    if (!filtered.length) fragment.append(make('p', 'Nenhuma frase encontrada.', 'meta'));
    $('#list').replaceChildren(fragment); $('#more').hidden = filtered.length <= shown;
  }
  function renderDetail(item) {
    clearMedia();
    dirty = false;
    const detail = $('#detail');
    if (!item) { detail.replaceChildren(make('h2', 'Escolha uma frase')); return; }
    const original = make('p', item.text, 'sentence-text'); original.lang = item.sourceLanguage;
    const form = make('form');
    const translationLabel = make('label', `Tradução (${item.targetLanguage.toUpperCase()}) — verso do cartão`);
    const translation = make('textarea'); translation.id = 'translation'; translation.rows = 4; translation.maxLength = 5000;
    translation.value = item.translation; translation.lang = item.targetLanguage; translationLabel.htmlFor = translation.id;
    const generate = make('button', 'Gerar tradução local'); generate.type = 'button'; generate.hidden = Boolean(item.translation);
    generate.addEventListener('click', async () => {
      const revision = renderRevision; generate.disabled = true;
      status.textContent = 'Traduzindo no dispositivo… O primeiro uso pode baixar o modelo.';
      try {
        const result = await translator.translate(item.text, item.sourceLanguage, item.targetLanguage);
        if (revision !== renderRevision) return;
        const updated = await client.request('sentences-update', { ...item, translation: result, note: note.value });
        if (revision !== renderRevision) return;
        Object.assign(item, updated); translation.value = updated.translation; generate.hidden = true; dirty = false;
        status.textContent = 'Tradução salva no cartão.';
      } catch (error) {
        if (revision === renderRevision && error.name !== 'AbortError') status.textContent = SubtitleClick.translationMessages[error.code] ?? error.message;
      } finally { if (revision === renderRevision) generate.disabled = false; }
    });
    const noteLabel = make('label', 'Sua anotação');
    const note = make('textarea'); note.id = 'note'; note.rows = 2; note.maxLength = 2000; note.value = item.note; noteLabel.htmlFor = note.id;
    const actions = make('div', '', 'actions');
    const save = make('button', 'Salvar alterações', 'primary'); save.type = 'submit';
    const remove = make('button', 'Remover frase', 'danger'); remove.type = 'button';
    actions.append(save, remove); form.append(translationLabel, translation, generate, noteLabel, note, actions);
    form.addEventListener('input', () => { dirty = true; });
    form.addEventListener('submit', async event => {
      event.preventDefault(); save.disabled = remove.disabled = true;
      try {
        const updated = await client.request('sentences-update', { ...item, translation: translation.value, note: note.value });
        items = items.map(value => value.id === updated.id ? updated : value); dirty = false; renderList();
        status.textContent = 'Frase atualizada.';
      } catch (error) { status.textContent = error.message; }
      finally { save.disabled = remove.disabled = false; }
    });
    remove.addEventListener('click', async () => {
      if (!confirm('Remover esta frase e suas referências?')) return;
      save.disabled = remove.disabled = true;
      try {
        await client.request('sentences-remove', item); items = items.filter(value => value.id !== item.id);
        selected = null; renderList(); renderDetail(null); status.textContent = 'Frase removida.';
      } catch (error) { status.textContent = error.message; save.disabled = remove.disabled = false; }
    });
    detail.replaceChildren(make('p', pair(item), 'eyebrow'), original);
    media(detail, item);
    detail.append(form, make('h3', 'Referências desta frase'));
    references(detail, item);
  }
  function review() {
    clearMedia();
    const root = $('#review'); root.replaceChildren();
    const exit = make('button', 'Voltar à coleção');
    exit.addEventListener('click', () => { clearMedia(); deck = null; root.replaceChildren(); root.hidden = true; $('#collection').hidden = false; void load(true); });
    if (position >= deck.length) {
      root.append(make('h2', 'Você chegou ao fim destas frases.'), exit); return;
    }
    const item = deck[position];
    const front = make('p', item.text, 'sentence-text'); front.lang = item.sourceLanguage;
    const back = make('div', '', 'answer'); back.hidden = true;
    const translation = make('p', item.translation || 'Cartão antigo sem tradução. Use “Gerar tradução local” na coleção.', 'sentence-text');
    translation.lang = item.targetLanguage; back.append(translation);
    if (item.note) back.append(make('p', item.note));
    references(back, item);
    const reveal = make('button', 'Mostrar tradução', 'primary');
    reveal.addEventListener('click', () => { back.hidden = false; reveal.hidden = true; });
    const next = make('button', 'Próxima frase'); next.addEventListener('click', () => { position++; review(); });
    const actions = make('div', '', 'actions'); actions.append(reveal, next, exit);
    root.append(make('p', `${position + 1} / ${deck.length} · ${pair(item)}`, 'eyebrow'), front);
    media(root, item);
    root.append(back, actions);
  }
  async function load(silent = false) {
    try {
      items = await client.request('sentences-list');
      const previous = $('#language').value;
      const options = [make('option', 'Todos os idiomas')]; options[0].value = '';
      for (const language of [...new Set(items.map(pair))].sort()) { const option = make('option', language); option.value = language; options.push(option); }
      $('#language').replaceChildren(...options); $('#language').value = [...new Set(items.map(pair))].includes(previous) ? previous : '';
      renderList(); if (!silent) status.textContent = '';
      if (selected && !dirty && !deck) renderDetail(items.find(item => item.id === selected));
    } catch (error) { status.textContent = error.message; }
  }
  $('#study').addEventListener('click', () => {
    if (dirty && !confirm('Descartar as alterações não salvas?')) return;
    dirty = false; deck = structuredClone(matches()); position = 0;
    $('#collection').hidden = true; $('#review').hidden = false; review();
  });
  $('#search').addEventListener('input', () => { shown = 50; renderList(); });
  $('#language').addEventListener('change', () => { shown = 50; renderList(); });
  $('#more').addEventListener('click', () => { shown += 50; renderList(); });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && Object.keys(changes).some(key => key.startsWith('sentences:v1:'))) void load(true);
  });
  window.addEventListener('beforeunload', event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } });
  window.addEventListener('pagehide', () => { clearMedia(); translator.destroy(); });
  void load();
})();
