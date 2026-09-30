(() => {
  'use strict';
  const ns = globalThis.SubtitleClick ??= {};
  const updateMessage = 'O Chrome ainda está executando uma versão antiga da extensão. Abra o ícone do SubtitleClick, aplique a atualização e depois recarregue o YouTube. Seus dados salvos serão mantidos.';
  ns.VocabularyClient = {
    async request(action, payload = {}) {
      let response;
      try { response = await chrome.runtime.sendMessage({ channel: 'subtitleclick-vocabulary', action, payload,
        build: ns.Build?.version, protocol: ns.Build?.protocol }); }
      catch { throw new Error('Não foi possível acessar o dicionário. Recarregue esta página após atualizar a extensão.'); }
      if (response?.code === 'VERSION_MISMATCH' || response?.error === 'Ação desconhecida.' ||
          (response?.build && ns.Build && response.build !== ns.Build.version)) {
        const error = new Error(updateMessage); error.code = 'UPDATE_REQUIRED'; throw error;
      }
      if (!response?.ok) throw new Error(response?.error || 'Não foi possível acessar o dicionário.');
      return response.data;
    }
  };
})();
