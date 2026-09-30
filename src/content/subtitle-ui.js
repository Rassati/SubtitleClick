(() => {
  'use strict';
  const ns = globalThis.SubtitleClick ??= {};
  class SubtitleUI {
    constructor(player, onClose, onReplay, onContext, onWords, onPhrase, onOriginal, onSaveSentence) {
      this.player = player;
      this.anchor = null;
      this.host = document.createElement('div');
      this.host.setAttribute('data-subtitleclick-ui', '');
      this.host.style.cssText = 'all:initial;position:absolute;inset:0;z-index:65;pointer-events:none;';
      const shadow = this.host.attachShadow({ mode: 'closed' });
      const style = document.createElement('style');
      style.textContent = `
        :host{color-scheme:dark} *{box-sizing:border-box}
        .card{position:absolute;pointer-events:auto;max-width:480px;width:460px;
          padding:14px 16px;border:1px solid #ffffff24;border-radius:12px;background:#161c20f5;
          color:#f3f6f5;box-shadow:0 8px 28px #0006;font:400 16px/1.5 system-ui,sans-serif;
          text-align:left;user-select:text;overflow:auto;overflow-wrap:anywhere}
        .card[hidden]{display:none} header{display:flex;align-items:center;gap:24px;margin-bottom:7px}
        .label{font-size:10px;font-weight:700;letter-spacing:1.4px;color:#91ddc4;text-transform:uppercase}
        button{margin-left:auto;cursor:pointer;border:0;border-radius:5px;color:#c4ccca;background:transparent;
          font:400 20px/1 system-ui;padding:2px 6px}button:hover{background:#ffffff18}
        button:focus-visible{outline:2px solid #91ddc4}.text{margin:0;white-space:pre-wrap}
        .hint{margin:9px 0 0;color:#aab5b1;font-size:11px;line-height:1.4}
        .error .text{color:#ffdcaa}
        [hidden]{display:none!important}.context-label{color:#91ddc4;font-size:11px;margin:0 0 6px}
        .actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
        .actions button{margin:0;font-size:12px;line-height:1.4;padding:6px 9px;background:#ffffff0c}
        details{margin-top:10px;font-size:12px;color:#bacbc4}summary{cursor:pointer;width:fit-content}
        .original{white-space:pre-wrap;margin:6px 0 0;max-height:100px;overflow:auto}
        .text button{font:inherit;line-height:inherit;color:inherit;margin:0;padding:0 1px;border-radius:3px;vertical-align:baseline}
        .text button:hover{background:#91ddc425;text-decoration:underline;text-underline-offset:4px}
        .notice{font-size:12px;color:#b3d9c7;margin:8px 0}.error .notice{color:#ffdcaa}
        button:disabled{opacity:.65;cursor:default}
      `;
      style.textContent += ns.WordPanel.css;
      this.wordPanel = new ns.WordPanel();
      this.card = document.createElement('section');
      this.card.className = 'card';
      this.card.hidden = true;
      this.card.setAttribute('aria-label', 'Tradução da legenda');
      const header = document.createElement('header');
      const label = document.createElement('span');
      this.label = label;
      label.className = 'label';
      label.textContent = 'SubtitleClick · PT';
      const close = document.createElement('button');
      close.type = 'button';
      close.textContent = '×';
      close.setAttribute('aria-label', 'Fechar tradução');
      close.addEventListener('click', () => onClose());
      this.text = document.createElement('p');
      this.text.className = 'text';
      this.text.setAttribute('role', 'status');
      this.text.setAttribute('aria-live', 'polite');
      this.onWord = onWords;
      this.notice = document.createElement('p');
      this.notice.className = 'notice';
      this.notice.setAttribute('role', 'status');
      this.hint = document.createElement('p');
      this.hint.className = 'hint';
      this.contextLabel = document.createElement('p');
      this.contextLabel.className = 'context-label';
      this.contextLabel.textContent = 'Legenda + contexto anterior';
      const actions = document.createElement('div');
      actions.className = 'actions';
      this.replay = document.createElement('button');
      this.replay.type = 'button';
      this.replay.textContent = '↶ Ouvir de novo · −5 s';
      this.replay.addEventListener('click', () => onReplay());
      this.context = document.createElement('button');
      this.context.type = 'button';
      this.context.addEventListener('click', () => onContext());
      this.originalButton = document.createElement('button');
      this.originalButton.type = 'button';
      this.originalButton.textContent = 'Ver original';
      this.originalButton.addEventListener('click', () => onOriginal());
      this.phrase = document.createElement('button');
      this.phrase.type = 'button';
      this.phrase.textContent = 'Traduzir frase';
      this.phrase.hidden = true;
      this.phrase.addEventListener('click', () => onPhrase());
      this.saveSentence = document.createElement('button');
      this.saveSentence.type = 'button';
      this.saveSentence.textContent = 'Salvar frase';
      this.saveSentence.addEventListener('click', () => onSaveSentence());
      actions.append(this.phrase, this.originalButton, this.saveSentence, this.replay, this.context);
      header.append(label, close);
      this.card.append(header, this.contextLabel, this.text, this.notice, this.wordPanel.root, actions, this.hint);
      shadow.append(style, this.card);
      for (const name of ['click', 'dblclick', 'pointerdown', 'mousedown', 'keydown', 'keypress', 'keyup']) {
        this.card.addEventListener(name, event => event.stopPropagation());
      }
      this.unregisterKeyboard = ns.KeyboardGuard?.register(this.host, onClose);
      player.append(this.host);
      this.reposition = () => this.position();
      this.resize = new ResizeObserver(this.reposition);
      this.resize.observe(player);
      this.resize.observe(this.card);
      window.addEventListener('resize', this.reposition);
      document.addEventListener('fullscreenchange', this.reposition);
    }
    show(text, anchor, { error = false, paused = false, original = '', withContext = false,
      canContext = false, canReplay = false, rewindSeconds = 0, sourceLanguage = 'en', targetLanguage = 'pt',
      translated = true, pending = false, notice = '', saved = false, saving = false } = {}) {
      this.anchor = anchor;
      this.wordPanel.hide();
      this.text.hidden = false;
      this.phrase.hidden = translated && !error;
      this.phrase.disabled = pending;
      this.originalButton.hidden = !translated && !pending;
      this.saveSentence.hidden = false;
      this.saveSentence.disabled = saved || saving;
      this.saveSentence.textContent = saved ? '✓ Frase salva' : saving ? 'Salvando…' : 'Salvar frase';
      this.label.textContent = `SubtitleClick · ${(translated ? targetLanguage : sourceLanguage).toUpperCase()}`;
      this.notice.textContent = notice;
      this.notice.hidden = !notice;
      this.renderWords(this.text, text, translated ? targetLanguage : sourceLanguage, translated);
      this.hint.textContent = paused ? 'Esc ou outro clique para fechar e continuar.' : 'Esc ou outro clique para fechar.';
      if (paused && rewindSeconds) this.hint.textContent = `Ao fechar, volta ${rewindSeconds} s e continua.`;
      this.contextLabel.hidden = !withContext;
      this.replay.hidden = !canReplay;
      this.context.hidden = !canContext;
      this.context.textContent = withContext ? 'Só esta legenda' : 'Incluir contexto';
      this.card.classList.toggle('error', error);
      this.card.hidden = false;
      this.position();
    }
    renderWords(node, text, language, translated) {
      node.lang = language;
      const fragment = document.createDocumentFragment();
      for (const part of ns.WordTools.segments(text, language)) {
        if (!part.isWordLike) { fragment.append(document.createTextNode(part.segment)); continue; }
        const word = document.createElement('button');
        word.type = 'button'; word.textContent = part.segment;
        word.title = 'Consultar esta palavra';
        word.addEventListener('click', () => this.onWord(part.segment, translated));
        fragment.append(word);
      }
      node.replaceChildren(fragment);
    }
    showWords(anchor, snapshot, initialWord, paused) {
      this.show('', anchor, { paused, canReplay: Number.isFinite(snapshot.time) });
      this.text.hidden = true;
      this.saveSentence.hidden = true;
      this.originalButton.hidden = false;
      this.phrase.hidden = false;
      this.label.textContent = 'SubtitleClick · Palavra';
      this.wordPanel.open(snapshot, initialWord);
      this.position();
    }
    position() {
      if (this.card.hidden || !this.anchor?.isConnected) return;
      const player = this.player.getBoundingClientRect();
      const anchor = this.anchor.getBoundingClientRect();
      const width = this.player.clientWidth;
      const height = this.player.clientHeight;
      if (!width || !height) return;
      const scaleX = player.width / width;
      const scaleY = player.height / height;
      this.card.style.width = `${Math.max(0, Math.min(460, width - 24))}px`;
      this.card.style.maxWidth = `${Math.max(0, width - 24)}px`;
      const above = (anchor.top - player.top) / scaleY - 24;
      this.card.style.maxHeight = `${Math.max(0, Math.min(height - 24, above >= 180 ? above : height - 24))}px`;
      const cardWidth = this.card.offsetWidth;
      const cardHeight = this.card.offsetHeight;
      const left = (anchor.left + anchor.width / 2 - player.left) / scaleX - cardWidth / 2;
      let top = (anchor.top - player.top) / scaleY - cardHeight - 12;
      if (top < 12) top = (anchor.bottom - player.top) / scaleY + 12;
      this.card.style.left = `${Math.max(12, Math.min(left, width - cardWidth - 12))}px`;
      this.card.style.top = `${Math.max(12, Math.min(top, height - cardHeight - 12))}px`;
    }
    hide() { this.wordPanel.hide(); this.card.hidden = true; this.anchor = null; }
    destroy() {
      this.unregisterKeyboard?.();
      this.wordPanel.destroy();
      this.resize.disconnect();
      window.removeEventListener('resize', this.reposition);
      document.removeEventListener('fullscreenchange', this.reposition);
      this.host.remove();
    }
  }
  ns.SubtitleUI = SubtitleUI;
})();
