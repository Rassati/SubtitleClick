# SubtitleClick

**Aprenda sem sair do vídeo.** Uma extensão open source para clicar nas legendas do YouTube, ver a tradução em português junto ao player e ouvir novamente o trecho. Versão 0.2.0.

MVP em JavaScript, sem framework, sem build e sem dependências em produção. Manifest V3. Licença MIT.

## Instalar localmente

1. Abra o Google Chrome desktop atualizado.
2. Acesse `chrome://extensions`.
3. Ative **Modo do desenvolvedor**.
4. Clique em **Carregar sem compactação** e selecione **a pasta deste projeto, que contém `manifest.json`**. Não selecione `src`.
5. Abra ou **recarregue** uma página do YouTube que já estivesse aberta.
6. Abra um vídeo normal (`https://www.youtube.com/watch?v=...`). Ative CC e selecione o idioma que quer estudar. No popup do SubtitleClick, escolha **o mesmo idioma da legenda** (padrão: inglês).
7. Passe o mouse sobre a legenda: uma borda verde discreta indica que ela é clicável. Clique para traduzir.

Não é preciso executar npm, criar conta, configurar chave de API ou iniciar um servidor para usar a extensão.

**Atualização de uma versão anterior:** mantenha a mesma pasta instalada, substitua seus arquivos pelos da versão 0.2.0, clique em Recarregar em `chrome://extensions` e recarregue a aba do YouTube. Se a extensão já aponta para a pasta deste projeto, basta recarregar a extensão e a aba. As preferências antigas são preservadas; as novas recebem valores padrão.

## Como funciona

- A legenda original do YouTube continua na tela. O clique traduz o texto visível e, quando habilitado e disponível, um contexto anterior curto usando o tradutor **local**.
- O cartão em português aparece acima da legenda; quando falta espaço, é reposicionado dentro do player. Funciona também no modo cinema e em tela cheia do player.
- Por padrão, clicar pausa o vídeo. Esc, outro clique na mesma legenda ou o botão × fecham o cartão e retomam **somente** um vídeo que a extensão tenha pausado.
- Legenda nova, CC desligado, anúncio, reprodução retomada, busca na linha do tempo ou navegação fecham o cartão e cancelam a resposta pendente. Nessas situações a extensão não inicia reprodução por conta própria.
- Não há temporizador de leitura: enquanto o vídeo estiver pausado, você pode ler no seu ritmo.
- O popup permite escolher o idioma da legenda, ativar/desativar a extensão, a pausa, o contexto e o recuo automático. As preferências valem para as abas abertas.
- A legenda recebe foco por Tab e pode ser acionada por Enter ou Espaço.

## Ouvir novamente

O botão **“Ouvir de novo · −5 s”** fecha a tradução, volta cinco segundos em relação ao momento do clique na legenda e reproduz o áudio original. É uma ação explícita: também funciona se você havia pausado manualmente. O recuo respeita o início do vídeo e os intervalos que o player permite buscar.

Para fazer isso automaticamente, escolha **“Voltar ao fechar” → 3, 5 ou 8 segundos** no popup. O padrão é **Não voltar**. O recuo automático acontece somente após uma tradução bem-sucedida, ao fechar com Esc, × ou outro clique, e somente se a extensão tiver pausado aquele vídeo. Falhas, mudança de legenda, busca manual e troca de vídeo não provocam recuo automático.

## Frases cortadas e contexto

**“Incluir contexto anterior”** vem ativado. A extensão mantém um buffer transitório de até 12 segundos de legendas já exibidas, apenas na memória. No clique, tenta juntar no máximo dois trechos anteriores com o atual, com limite de 700 caracteres para o texto combinado. Terminações de frase e pausas longas interrompem a junção. Sobreposições comuns de legendas automáticas são removidas, inclusive em japonês sem espaços.

Quando usado, o cartão mostra **“Legenda + contexto anterior”**, e **“Ver texto original”** revela exatamente o texto enviado ao tradutor local. **“Só esta legenda”** permite comparar com a tradução isolada; **“Incluir contexto”** volta ao trecho combinado. Não há tradução automática desse buffer.

Isso é uma heurística de junção de legendas, não uma garantia de reconstrução gramatical. O tradutor recebe e traduz o trecho combinado inteiro; não é possível separar com precisão qual parte da tradução pertence à legenda atual. **O final de uma frase ainda não exibido não está disponível.** Para mais contexto, espere o final aparecer antes de clicar. O buffer é limpo ao buscar outro ponto, trocar de vídeo/idioma, desativar a extensão, desligar CC ou entrar em anúncio.

## Outros idiomas

O seletor inclui japonês (`ja`), russo (`ru`), alemão (`de`) e os demais idiomas de origem listados na documentação do Chrome; o destino continua sendo português (`pt`). A extensão verifica a disponibilidade do par escolhido. O fato de o idioma aparecer no seletor não garante que o modelo esteja pronto ou disponível no dispositivo.

Selecione manualmente o idioma da **legenda**, que pode ser diferente do áudio. O MVP não faz detecção automática, romanização, furigana ou síntese de voz. A pronúncia vem da repetição do áudio do vídeo.

## Tradução local e compatibilidade

A integração usa a API moderna `globalThis.Translator`, com detecção de `availability` e `create`. Não usa a API experimental antiga `window.ai.translator` nem serviços externos.

A documentação do Chrome informa suporte desktop a partir do Chrome 138, mas a extensão **não toma a versão como garantia**: a disponibilidade depende também do dispositivo, políticas do navegador, contexto e modelos. Um navegador sem a API ainda pode carregar a extensão e receber a mensagem amigável de indisponibilidade.

| Situação | Comportamento |
| --- | --- |
| API ausente/incompleta | “Tradução local não está disponível neste navegador.” |
| Modelo disponível | Reutiliza a instância e traduz sob demanda. |
| Modelo baixável/em download | Mostra preparação e o progresso reportado pelo Chrome. |
| Download falha | Mostra uma mensagem para verificar a conexão e tentar novamente. |
| Par de idiomas indisponível | Informa que o par selecionado não foi disponibilizado. |
| Falta de ativação do usuário | Solicita outro clique na legenda. |
| Tradução falha | Exibe erro amigável; não guarda a falha no cache. |
| Operação excede 2 minutos | Interrompe a espera e permite nova tentativa. |

`create()` é chamado no fluxo direto do clique, sem esperar armazenamento, mensagens ou `availability()`. Isso preserva a ativação do usuário exigida para preparar o modelo. `availability()` também é consultado, sem bloquear esse gesto, para classificar falhas. O popup verifica a capacidade, mas não baixa o modelo.

O primeiro uso pode precisar de conexão para o Chrome baixar componentes/modelos. Não há promessa de tradução instantânea nessa primeira preparação. Se a legenda mudar durante o download, o cartão fecha; o preparo compartilhado pode continuar, e o próximo clique aproveita o modelo. Depois de preparado, o texto é processado no dispositivo. Não há fallback remoto.

O estado mostrado pelo popup é uma verificação no contexto da extensão. O clique faz sua própria verificação no contexto do YouTube; políticas de origem podem produzir resultados diferentes. Além disso, por privacidade, o Chrome pode reportar `downloadable` para uma origem que ainda não criou o tradutor, mesmo com pacotes já instalados.

Referências: [Translator API no Chrome](https://developer.chrome.com/docs/ai/translator-api), [IA em extensões](https://developer.chrome.com/docs/extensions/ai), [content scripts e isolamento](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts).

## Privacidade e permissões

- **Sem conta, login, backend, analytics, tracking ou histórico persistente.**
- `storage` é a única permissão de API: salva apenas as preferências `enabled`, `pauseOnClick`, `sourceLanguage`, `includeContext` e `rewindSeconds` em `chrome.storage.local`, sem sincronização na nuvem.
- O content script se limita a `https://www.youtube.com/*`. A abrangência de caminho permite entrar em um vídeo pela navegação SPA do YouTube. A interface só é ativada em `/watch?v=...`.
- Sem `<all_urls>`, `tabs`, `scripting`, service worker, código remoto, `eval`, chave de API ou acesso à transcrição completa.
- Cache de até 100 traduções apenas na memória da aba, apagado ao mudar de vídeo, desativar ou sair da página.
- Buffer de contexto de até 30 atualizações recentes (janela de 12 segundos), apenas na memória da aba. Nenhum texto de legenda é salvo em disco pela extensão.
- Nenhuma requisição de rede é feita pelo código da extensão. O **próprio Chrome** pode baixar modelos. O tráfego normal do YouTube continua existindo.
- As traduções são inseridas com `textContent` em Shadow DOM; texto da legenda não é executado como HTML.

## Estrutura e arquitetura

```text
manifest.json
src/
  content/
    content.js                 # ciclo de vida, cliques, navegação e cancelamento
    content.css                # indicação discreta nas legendas nativas
    subtitle-detector.js       # snapshot do DOM e observação do player
    caption-context.js         # buffer transitório e junção de trechos recentes
    subtitle-ui.js             # cartão em Shadow DOM dentro do player
    video-controller.js        # controle de pausa pertencente à extensão
  translation/
    translation-service.js    # validação, cache LRU, timeout, cancelamento
    chrome-translator-provider.js # toda a integração com Translator
  storage/settings.js         # preferências locais validadas
  popup/                      # interface de configurações
scripts/check.cjs
tests/
  unit/                       # API simulada, cache, concorrência, vídeo
  browser/                    # DOM, interface e carregamento real MV3
  fixtures/youtube.html       # cenário reproduzível sem rede
docs/TESTING.md
LICENSE
```

O fluxo é `content → TranslationService → ChromeTranslatorProvider`. Para um futuro provedor, implemente `translate(text, sourceLanguage, targetLanguage, { signal, onStatus })` e opcionalmente `destroy()`, e injete a instância em `TranslationService`. Credenciais, consentimento de envio e permissões remotas precisariam de um projeto próprio; nenhum desses provedores foi implementado neste MVP.

Os scripts são arquivos clássicos empacotados na ordem declarada no manifest, em um namespace privado do mundo isolado do content script. Não há bridge para scripts da página nem necessidade de expor recursos via `web_accessible_resources`. A API do tradutor é utilizada em contexto de documento, pois não está disponível em Web Workers.

## Testes

Requer Node.js 20 ou superior somente para desenvolvimento:

```sh
npm test
npm run check
npm ci
npx playwright install chromium --no-shell
npm run test:browser
```

Os testes unitários não exigem instalação de dependências. Os testes de navegador usam o Chrome for Testing baixado pelo Playwright, perfis temporários e uma página fixture interceptada. O teste MV3 carrega **o manifest real** e verifica isolamento, popup, armazenamento e o tratamento de API ausente. Os testes de tradução usam uma implementação simulada da API, separada do código de produção.

Opcional: `npm run test:native` executa o provedor **real**, com a mesma fixture e um perfil temporário. Esse comando permite que o Chrome baixe modelos e pode levar até dois minutos depois do clique. O resultado fica em `test-results/native.json`; uma preparação indisponível ou incompleta faz o comando terminar sem sucesso. Ele não é parte da suíte determinística. O executor também reconhece um navegador instalado em `.browser-cache/` dentro do projeto.

Veja [o roteiro de teste manual e as limitações da validação](docs/TESTING.md). Testes com API simulada não comprovam a disponibilidade ou qualidade do modelo nativo no seu Chrome.

## Limites deste MVP

- Apenas Chrome desktop, YouTube normal e idiomas de origem disponibilizados pela API → português (`pt`, sem garantia de variante regional).
- O usuário deve escolher o idioma correto da legenda no popup. O MVP não tenta inferir o idioma por frases curtas ou por APIs privadas do YouTube.
- Lê as legendas nativas visíveis no DOM. Legendas queimadas no vídeo, transcrições laterais, Shorts, embeds, Picture-in-Picture e outros serviços não são suportados.
- Em legendas automáticas, cada atualização do texto invalida a tradução anterior. Desativar a pausa pode fazer o cartão desaparecer rapidamente; esse comportamento evita mostrar uma tradução de outra frase.
- Mudanças futuras no DOM do YouTube podem exigir atualizar os seletores do detector.
- A tradução automática pode errar contexto, gírias e nomes. O original permanece visível para comparação.
- O projeto está pronto para carregamento local; não foi publicado na Chrome Web Store.

## Contribuir

Abra uma issue com passos de reprodução, versão do Chrome e mensagem de erro, sem compartilhar histórico de navegação. Para mudanças, execute as suítes e o roteiro manual pertinente. Não adicione provedores remotos, telemetria ou novas permissões sem documentar a mudança de privacidade. Contribuições são distribuídas sob a licença MIT.
