# Frases, referências e cartões — 0.5.0

## Guardar uma frase

1. Clique na legenda do YouTube. O cartão abre com o original e suas palavras já clicáveis.
2. Se quiser, clique **Traduzir frase**. O texto muda no mesmo lugar, sem uma versão menor/apagada. **Ver original** permite voltar.
3. Clique **Salvar frase**. A extensão gera a tradução local automaticamente antes de guardar o cartão, ou reutiliza a tradução já feita daquele mesmo texto. Você não precisa digitar o verso. O original continua visível. Falhas do tradutor ou do armazenamento não exibem confirmação falsa; tente salvar novamente. Trocar de legenda ou fechar durante a tradução cancela a operação pendente.
4. No ícone da extensão, abra **Meu dicionário e frases** → **Frases e cartões**. A tradução e a anotação podem ser editadas. Cartões antigos sem tradução têm **Gerar tradução local**, que também salva o resultado.
5. **Estudar frases** abre os cartões da busca e do filtro de idiomas atuais. Veja o original, ouça o trecho, tente lembrar o sentido, pressione **Mostrar tradução** e depois **Próxima frase**. O player fica na frente do cartão; não é preciso revelar a resposta para ouvir. Os links para o vídeo continuam disponíveis.

O original salvo é o texto exibido no cartão: a legenda atual, acrescida do contexto anterior se essa opção estiver ativa. Isso não garante uma oração gramaticalmente completa quando o vídeo fragmenta a legenda. A extensão não captura legendas futuras nem baixa a transcrição completa.

## Ouvir somente o trecho

Cada referência válida tem um player do YouTube. **Ouvir trecho** carrega o vídeo com início e fim delimitados; **Repetir trecho** reinicia esse intervalo; **Parar**, trocar de cartão ou voltar à coleção remove o player e encerra a reprodução. Só um player pode ficar ativo por vez. Nada é carregado do YouTube ao simplesmente abrir a coleção.

Os limites vêm de uma legenda nativa com tempos, quando exposta pelo navegador. Como o YouTube normalmente só expõe o texto visual, o SubtitleClick também acompanha as mudanças de legenda. Depois de salvar e continuar assistindo, a próxima mudança observada pode completar o fim do trecho. O acompanhamento é temporário, limitado e descartado ao navegar ou buscar outro ponto do vídeo.

Enquanto faltam tempos confiáveis, o cartão usa um **trecho aproximado**, identificado na interface. Cartões antigos, que guardavam somente o instante clicado, usam inicialmente os dois segundos anteriores e os quatro seguintes. **Ajustar início e fim** permite ouvir e corrigir o intervalo e **Salvar limites** persiste o ajuste para aquela referência. Ajustes manuais não são substituídos por observações posteriores.

O player oficial aceita os parâmetros `start` e `end` em segundos inteiros. O início é arredondado para baixo e o fim para cima para evitar cortar uma palavra; a busca também depende dos quadros-chave do vídeo. Portanto não se promete recorte exato por fonema ou ausência de uma pequena margem. Máximo de 120 segundos por trecho. Referência: [parâmetros oficiais do YouTube](https://developers.google.com/youtube/player_parameters).

Vídeos privados, removidos, bloqueados para incorporação, restrições de idade/região ou falta de rede podem impedir o player. O link **Abrir este ponto no YouTube** continua disponível; nesse link externo não há parada automática no fim. Não há download, extração de áudio, cópia do vídeo nem serviço de hospedagem próprio.

## Player, privacidade e permissões

O player usa o domínio `www.youtube-nocookie.com` e só é criado após o pedido de ouvir. Ao reproduzir, há comunicação direta com o YouTube e aplicam-se as políticas dele; o SubtitleClick não acrescenta analytics e não envia suas notas ou traduções. A consulta lexical e a gravação dos cartões continuam locais.

Além de `storage`, o manifest agora declara `declarativeNetRequestWithHostAccess` e acesso apenas a `https://www.youtube-nocookie.com/*`. Isso é necessário para identificar o aplicativo na requisição inicial do player: páginas de extensão omitem o cabeçalho HTTP Referer, causando **erro 153** no YouTube. A regra de sessão só altera esse cabeçalho em `/embed/ID`, em subframes iniciados pela própria extensão. Identificação usada: `https://subtitleclick.<ID-da-extensão>/`, sem se passar por outro site. Não intercepta o YouTube normal nem outros sites. Não usa `webRequest`, `tabs`, `<all_urls>` ou JavaScript remoto na extensão.

Fontes: [identificação exigida pelo YouTube](https://developers.google.com/youtube/terms/required-minimum-functionality#api-client-identity-and-credentials) e [regras declarativas do Chrome](https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest). O CSP mantém os scripts locais e permite somente o iframe desse domínio. Nenhuma chave de API é necessária.

## Vários vídeos e sentidos

Cada novo salvamento da mesma palavra acrescenta uma referência ao mesmo verbete, com os sentidos escolhidos naquele momento. Assim, `bank` pode guardar um trecho associado a `banco` e outro a `margem`. A associação é escolhida pelo usuário; o dicionário não decide automaticamente o sentido contextual.

Salvar a mesma frase no mesmo par de idiomas reúne as referências no mesmo cartão. Vídeos e segundos diferentes permanecem associados. Salvar com outro idioma de destino cria um cartão separado. O verso editado pelo usuário é preservado; traduções por ocorrência ficam nas referências. Não há mais limite de cinco referências nem exclusão automática das antigas. O limite efetivo é o espaço local do Chrome.

## Reverter o experimento

Desligue **Mostrar original primeiro** no popup. Isso restaura a tradução imediata ao clicar na legenda. A consulta direta por palavra, o dicionário, as frases salvas e as referências continuam funcionando. Não é necessário reinstalar, remover dados ou trocar arquivos.

A configuração persistida é `settings.originalFirst`; `false` reverte o comportamento. O fluxo fica concentrado em `activate()` / `showOriginal()` em `src/content/content.js`, e o layout em `SubtitleUI`. O pacote anterior `dist/SubtitleClick-0.3.0.zip` permanece como cópia do código, mas a opção acima é a forma de reverter a experiência sem perder as funcionalidades novas.

## Idiomas e limites

O popup permite escolher idioma de origem e destino. A disponibilidade e o download de cada par de tradução dependem da Translator API do Chrome. Sem modelo disponível, **Salvar frase** informa o problema e permite tentar novamente; não cria silenciosamente um cartão sem tradução. Os cartões e backups antigos sem verso continuam aceitos, com geração local opcional na coleção. O dicionário lexical continua limitado a EN ↔ PT.

Esta é uma revisão manual por cartões: não há agendamento por repetição espaçada, pontuação, integração Anki, sincronização ou captura de áudio. A coleção fica em `chrome.storage.local`; exporte um backup antes de remover a extensão ou trocar de perfil.

## Dados e backups

`SentenceStore` usa chaves `sentences:v1:` separadas das chaves `vocabulary:v1:` existentes. A identidade é um hash local do original normalizado, mais o par de idiomas. O original exibido não é traduzido nem sobrescrito pela normalização. Salvar/editar/remover e importar são serializados no worker junto com as operações de palavras.

Backups v2 incluem as duas coleções e todos os trechos, agora com `clip: { start, end, source }` opcional por referência. Importar v1 continua funcionando. Um backup inválido de frases impede também a gravação das palavras daquele arquivo. Não há chamada externa para salvar, consultar verbetes ou importar/exportar; ouvir o vídeo requer conexão ao YouTube.

Para atualizar: recarregue o SubtitleClick em `chrome://extensions` e recarregue YouTube e coleção. O popup deve indicar **0.5.0**. Se o Chrome solicitar confirmação das novas permissões do player, elas têm o escopo descrito acima. Não desinstale: a atualização mantém os dados. `npm run test:clip` executa um teste online opcional em perfil temporário; os demais testes usam fixtures para o player.
