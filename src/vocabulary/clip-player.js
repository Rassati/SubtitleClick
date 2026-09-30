(() => {
  'use strict';
  const ns = globalThis.SubtitleClick;
  let active = null;
  const make = (tag, text) => { const node = document.createElement(tag); node.textContent = text ?? ''; return node; };
  class ClipPlayer {
    constructor(example, onSave) {
      this.example = example; this.revision = 0;
      const saved = example.clip;
      const time = Number.isFinite(example.time) ? example.time : 0;
      this.clip = saved ?? { start: Math.max(0, time - 2), end: time + 4, source: 'estimated' };
      this.root = make('section'); this.root.className = 'clip-player';
      this.root.setAttribute('aria-label', 'Trecho da frase');
      this.screen = make('div'); this.screen.className = 'clip-screen';
      this.screen.append(make('span', '▶ Ouça esta frase no vídeo original'));
      this.play = make('button', 'Ouvir trecho'); this.play.type = 'button'; this.play.className = 'primary';
      this.stopButton = make('button', 'Parar'); this.stopButton.type = 'button'; this.stopButton.disabled = true;
      this.play.addEventListener('click', () => { void this.start(); });
      this.stopButton.addEventListener('click', () => this.stop());
      const actions = make('div'); actions.className = 'clip-actions'; actions.append(this.play, this.stopButton);
      this.status = make('p'); this.status.className = 'clip-status'; this.status.setAttribute('role', 'status');
      this.describe();
      const details = make('details'); details.append(make('summary', 'Ajustar início e fim'));
      const form = make('form'); form.className = 'clip-range';
      this.startInput = make('input'); this.endInput = make('input');
      for (const [input, title, value] of [[this.startInput, 'Início (segundos)', this.clip.start], [this.endInput, 'Fim (segundos)', this.clip.end]]) {
        input.type = 'number'; input.min = '0'; input.max = '86400'; input.step = '.1'; input.required = true;
        input.value = String(Math.round(value * 10) / 10);
        const label = make('label', title); label.append(input); form.append(label);
      }
      const save = make('button', 'Salvar limites'); save.type = 'submit'; form.append(save); details.append(form);
      form.addEventListener('submit', async event => {
        event.preventDefault();
        const clip = this.readRange(); if (!clip) return;
        this.stop(); save.disabled = true;
        try { await onSave(clip); this.clip = clip; this.describe(); }
        catch (error) { this.status.textContent = error.message; }
        finally { save.disabled = false; }
      });
      const privacy = make('p', 'O player conecta ao YouTube somente ao ouvir.');
      privacy.className = 'source';
      this.root.append(this.screen, actions, this.status, details, privacy);
      if (/^[\w-]{11}$/.test(example.videoId)) {
        const link = make('a', '↗ Abrir este ponto no YouTube'); link.className = 'source';
        link.href = `https://www.youtube.com/watch?v=${encodeURIComponent(example.videoId)}&t=${Math.floor(this.clip.start)}s`;
        link.target = '_blank'; link.rel = 'noopener noreferrer'; this.root.append(link); this.link = link;
      }
    }
    describe() {
      this.status.textContent = `${this.clip.start.toFixed(1)}–${this.clip.end.toFixed(1)} s · ${this.clip.source === 'estimated' ? 'Trecho aproximado; ajuste se necessário.' : 'Reprodução limitada a este trecho.'}`;
      if (this.link) this.link.href = `https://www.youtube.com/watch?v=${encodeURIComponent(this.example.videoId)}&t=${Math.floor(this.clip.start)}s`;
    }
    readRange() {
      const start = this.startInput.valueAsNumber, end = this.endInput.valueAsNumber;
      if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end > 86400 || end <= start || end - start > 120) {
        this.status.textContent = 'O fim deve ser maior que o início. Escolha um trecho de até 120 segundos.'; return null;
      }
      return { start, end, source: 'manual' };
    }
    async start() {
      const clip = this.readRange(); if (!clip) return;
      if (!/^[\w-]{11}$/.test(this.example.videoId)) { this.status.textContent = 'Este vídeo não tem um identificador válido para o player. Use o link abaixo.'; return; }
      active?.stop(); this.stop(); active = this;
      const revision = ++this.revision;
      this.play.disabled = true; this.stopButton.disabled = false;
      this.status.textContent = 'Abrindo o trecho no YouTube…';
      try {
        const { origin } = await ns.VocabularyClient.request('player-prepare');
        if (revision !== this.revision || !this.root.isConnected) return;
        const url = new URL('https://www.youtube-nocookie.com/embed/' + this.example.videoId);
        // Official embed parameters are integer seconds; round outward so words
        // at a boundary are not truncated. No remote API script is loaded.
        const from = Math.floor(clip.start), to = Math.ceil(clip.end);
        for (const [key, value] of Object.entries({ start: from, end: to, autoplay: 1, rel: 0, playsinline: 1, origin })) url.searchParams.set(key, value);
        const frame = make('iframe'); frame.src = url.href;
        frame.width = '640'; frame.height = '360';
        frame.title = 'Vídeo da frase'; frame.allow = 'autoplay; encrypted-media; fullscreen'; frame.allowFullscreen = true;
        frame.referrerPolicy = 'strict-origin-when-cross-origin';
        this.screen.replaceChildren(frame);
        this.play.textContent = 'Repetir trecho';
        this.status.textContent = `Trecho ${from}–${to} s. O YouTube para ao final; se não iniciar, clique no play do vídeo.`;
      } catch (error) { if (revision === this.revision) this.status.textContent = `Não foi possível abrir o player. ${error.message}`; }
      finally { if (revision === this.revision) this.play.disabled = false; }
    }
    stop() {
      this.revision++;
      this.screen.replaceChildren(make('span', '▶ Ouça esta frase no vídeo original'));
      this.stopButton.disabled = true; this.play.disabled = false;
      if (active === this) active = null;
      this.describe();
    }
    destroy() { this.stop(); }
  }
  ns.ClipPlayer = ClipPlayer;
})();
