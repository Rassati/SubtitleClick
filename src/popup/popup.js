(() => {
  'use strict';
  const { Settings, ChromeTranslatorProvider } = globalThis.SubtitleClick;
  const storageStatus = document.querySelector('#storage-status');
  const reload = document.querySelector('#reload-extension');
  reload.addEventListener('click', () => chrome.runtime.reload());
  void (async () => {
    try {
      const health = await SubtitleClick.VocabularyClient.request('health');
      storageStatus.textContent = `Versão ${health.version} · armazenamento pronto.`;
    } catch (error) {
      storageStatus.textContent = error.message;
      reload.hidden = false;
    }
  })();
  const status = document.querySelector('#status');
  const saveStatus = document.querySelector('#save-status');
  const source = document.querySelector('#sourceLanguage');
  const target = document.querySelector('#targetLanguage');
  for (const [code, label] of Object.entries(Settings.languages)) {
    const option = document.createElement('option');
    option.value = code;
    option.textContent = label;
    source.append(option);
    target.append(option.cloneNode(true));
  }
  const provider = new ChromeTranslatorProvider();
  let revision = 0;
  async function check(language, targetLanguage) {
    const id = ++revision;
    document.querySelector('#source-code').textContent = language.toUpperCase();
    document.querySelector('#target-code').textContent = targetLanguage.toUpperCase();
    status.textContent = 'Verificando tradução local…';
    const state = await provider.availability(language, targetLanguage);
    if (id !== revision) return;
    const messages = {
      available: 'Modelo local disponível para este idioma.',
      downloadable: 'O Chrome poderá baixar o modelo no primeiro clique. A tradução acontece no dispositivo.',
      downloading: 'O Chrome está preparando o modelo de tradução local.',
      unavailable: 'Tradução local indisponível para este idioma ou navegador.'
    };
    status.textContent = messages[state] ?? messages.unavailable;
  }
  Settings.load().then(settings => {
    for (const key of Object.keys(Settings.defaults)) {
      const input = document.getElementById(key);
      const checkbox = input.type === 'checkbox';
      if (checkbox) input.checked = settings[key];
      else input.value = String(settings[key]);
      input.disabled = false;
      input.addEventListener('change', async () => {
        // Serialize read-modify-write saves from this popup.
        const inputs = [...document.querySelectorAll('input,select')];
        inputs.forEach(input => { input.disabled = true; });
        const value = checkbox ? input.checked : key === 'rewindSeconds' ? Number(input.value) : input.value;
        try {
          await Settings.set(key, value);
          settings[key] = value;
          saveStatus.textContent = '';
          if (key === 'sourceLanguage' || key === 'targetLanguage') void check(settings.sourceLanguage, settings.targetLanguage);
        } catch {
          if (checkbox) input.checked = settings[key];
          else input.value = String(settings[key]);
          saveStatus.textContent = 'Não foi possível salvar. Tente novamente.';
        } finally { inputs.forEach(input => { input.disabled = false; }); }
      });
    }
    void check(settings.sourceLanguage, settings.targetLanguage);
  }).catch(() => { saveStatus.textContent = 'Não foi possível carregar as preferências. Reabra a extensão.'; });
})();
