# Resultado da validação

## Atualização 0.5.0 — 30/09/2026

**43 testes unitários e 28 testes de navegador aprovados (71 no total)**, mais o teste online opcional do player real. Manifest, versões e sintaxe de 22 scripts aprovados.

- Salvar a frase original solicita a tradução e só confirma depois de persistir o verso. A tradução previamente exibida é reutilizada. Testados par de idiomas, preservação do original na interface, falha de armazenamento, API indisponível e cancelamento ao trocar de legenda sem gravar um cartão vazio.
- Em MV3 real, o clique de salvar grava original e tradução no worker. A tradução é simulada nesse teste; a persistência e a troca de mensagens são reais. A geração local de verso para cartões antigos também foi testada com provedor simulado.
- Limites nativos quando disponíveis, estimativa identificada, fechamento do intervalo na mudança de legenda após retomar o vídeo, palavras progressivas, busca de outro ponto, validação de intervalo, preferência por limites manuais e preservação no backup.
- Player criado somente após clicar, parâmetros de início/fim, repetição, parada e destruição ao avançar de cartão. Ajustes persistem na referência correta. A regra de identificação é restrita a subframes de `youtube-nocookie.com/embed/` iniciados pela própria extensão.
- **Player YouTube real confirmado:** `npm run test:clip` usou o vídeo público `M7lc1UVf-VE`, num Chrome for Testing com perfil temporário. Os botões reais **Ouvir trecho** e **Repetir trecho** reproduziram o intervalo configurado de 3 a 7 segundos e o vídeo ficou pausado aproximadamente aos 7,01 segundos. Avançar removeu o iframe. O teste anterior sem identificação produziu erro 153; a regra limitada resolveu esse erro. Relatório e captura: `test-results/clip-live.json` e `clip-live.png`.

As capturas dos cartões foram inspecionadas. O teste online usa um cartão semeado para reprodução; não demonstra que os limites estimados correspondem a uma frase completa em qualquer vídeo. A busca do player usa segundos inteiros e quadros-chave. Vídeos bloqueados para incorporação, privados ou indisponíveis continuam sujeitos às restrições do YouTube; há link alternativo. A reprodução conecta ao YouTube após o clique; notas e traduções não são enviadas a ele. Nenhum perfil pessoal foi alterado e o README permaneceu intacto.

Uso, limites e permissões adicionais estritamente necessárias ao player: `docs/SENTENCE-MINING.md`. Teste online separado das fixtures offline para não tornar a suíte dependente da disponibilidade do YouTube.

## Atualização 0.4.1 — 30/09/2026

**40 testes unitários e 25 testes de navegador aprovados (65 no total)**. Checagem do Manifest V3, consistência das versões e sintaxe de 20 scripts aprovada. A única permissão permanece `storage`; somente YouTube.

Regressões verificadas:

- Salvamento pelo botão **Salvar frase** em uma extensão MV3 real, com texto, vídeo e segundo conferidos no armazenamento.
- Reprodução de interface nova com worker legado respondendo “Ação desconhecida”: diagnóstico de versão incompatível, atualização pelo popup, retomada do salvamento e preservação dos dados locais existentes. Perfil temporário com modo de desenvolvedor, separado do Chrome pessoal. A causa no perfil pessoal não foi inspecionada; essa é uma reprodução de uma causa compatível com o relato.
- Digitação de espaços em textarea no Shadow DOM fechado real, diante de atalhos do player em captura na janela. Espaço, `k` e Enter também testados na fixture: não acionam o player. Escape fecha; reabrir a mesma consulta recupera o rascunho temporário; atalhos fora do cartão continuam funcionando.
- Largura, altura e posições das linhas do texto original iguais antes/depois de traduzir e voltar, incluindo consulta de palavra no intervalo. Player estreito e tela cheia continuam cobertos. Capturas `stable-card.png` e `popup.png` inspecionadas visualmente.
- Checksum do snapshot WikDict, total de 56.350 entradas, proveniência, termo `methamphetamine → metanfetamina`, plural registrado, termos técnicos e consulta inversa. As consultas de worker/coleção continuam usando dados reais e navegador offline.
- Palavra ausente só chama a tradução local após pedido explícito, identifica o resultado como automático e salva essa procedência. Estados de indisponibilidade, download, falha, timeout e cancelamento continuam cobertos pelos testes do provedor.

A tradução nos testes de interface é simulada; a qualidade e o download do modelo nativo não foram revalidados nesta atualização. Os verbetes são dados comunitários, sem garantia de cobertura total ou de adequação ao contexto. README mantido sem alterações. Procedimento de atualização e diagnóstico: `docs/FIXES-0.4.1.md`.

## Atualização 0.4.0 — 29/09/2026

**38 testes unitários e 21 testes de navegador aprovados (59 no total)**. Checagem do Manifest V3 e da sintaxe de 18 scripts aprovada. Permissão continua sendo somente `storage`.

Novas verificações: palavras clicáveis sem menu intermediário; original primeiro sem chamada ao tradutor; tradução substituindo o texto com a mesma fonte; retorno ao original; reversão persistente pelo popup; consulta inversa PT → EN; encaminhamento do idioma de destino; salvamento de frases com ou sem tradução; falha de salvamento sem confirmação falsa; agrupamento de vídeos e sentidos por referência; preservação de referências antigas e de mais de cinco ocorrências; separação por par de idiomas; compatibilidade com backups v1 e v2.

Coleção e cartões testados com a extensão MV3 real e navegador offline: edição do verso, filtro por idiomas, revelação da resposta, avanço/fim do estudo, retorno ao vídeo, backup misto e rejeição integral de importação inválida. Capturas do cartão original, popup e flashcard inspecionadas visualmente em `test-results/`.

A tradução de frases nos testes de interface é simulada; estes testes não atestam a qualidade ou a disponibilidade de todos os pares no Chrome. O dicionário offline, o armazenamento e a coleção nos testes MV3 são reais. Não foi alterado o perfil pessoal do navegador. README mantido sem alterações.

## Atualização 0.3.0 — 29/09/2026

**31 testes unitários e 17 testes de navegador aprovados (48 no total)**. `npm run check` aprovou Manifest V3, a única permissão `storage`, recursos empacotados e sintaxe de 16 scripts. A única leitura de arquivo por `fetch` é o caminho fixo `chrome.runtime.getURL('data/eng-por.json')`.

Validado no Chrome for Testing, em perfis separados do navegador pessoal:

- Alt + clique captura exatamente a palavra sob o ponteiro, sem chamar o tradutor de frases; alternativa pelo botão Palavras.
- O fluxo com Manifest real e Shadow DOM fechado consulta o FreeDict pelo worker e salva uma palavra a partir do cartão. Translator API foi desativada nesse cenário para demonstrar independência do modelo.
- A base FreeDict real, a coleção, edições e backups funcionam com o contexto do navegador offline.
- Oito salvamentos concorrentes da mesma palavra preservam seus sentidos sem duplicar o verbete; até cinco exemplos são mantidos. Fechar e reabrir o navegador com o mesmo perfil preserva a coleção.
- Busca, edição, exclusão confirmada, exportação/importação JSON e rejeição de backup inválido; entrada HTML é exibida como texto, sem execução.
- Consultas antigas não substituem palavras novas; mudar de legenda fecha o cartão e descarta respostas pendentes; erros de armazenamento não exibem confirmação falsa.
- A consulta reconhece alguns plurais/flexões como sugestões de forma-base. Palavra desconhecida e idioma sem base têm mensagens específicas. Casos Unicode e contrações são preservados.
- Capturas do popup, cartão e coleção inspecionadas em `test-results/`. Popup dentro de 600 pixels; cartão cabe em player estreito, sem rolagem horizontal e sem cobrir a legenda quando há espaço acima.

As legendas dos testes são fixtures reproduzíveis. A consulta ao dicionário, armazenamento e troca de mensagens no teste MV3 são reais, sem simulação. A tradução de frases continua simulada nos testes de interface; a qualidade do modelo Chrome e a cobertura linguística da base FreeDict não são validadas por esses testes. O Chrome pessoal do usuário não foi alterado.

Uso, limitações e privacidade: `docs/DICTIONARY.md`. Fonte completa, licença GPL dos dados e reprodução da conversão: `THIRD_PARTY_NOTICES.md`. README mantido sem alterações.

## Atualização 0.2.0

O usuário confirmou que a versão anterior passou a funcionar no seu ambiente. As melhorias foram verificadas com **24 testes unitários e 13 testes de navegador**, todos aprovados, mais a checagem do manifest e dos 9 scripts de produção. Foram inspecionadas capturas do cartão com contexto e do popup, que cabe no limite de 600 pixels de altura do Chrome.

Os novos testes cobrem recuo explícito de 5 segundos, recuo automático somente após sucesso e em pausa pertencente à extensão, limites de busca, legendas fragmentadas, remoção de sobreposição, caracteres japoneses/cirílicos, preferências antigas, troca de idioma, persistência de seleções e encaminhamento dos pares `ja→pt`, `ru→pt` e `de→pt` ao provedor. O carregamento MV3 real continua sendo testado.

A tradução nos testes de interface é simulada: validou-se o encaminhamento do texto e dos idiomas, não a qualidade dos modelos nativos de japonês/russo/alemão. Esses modelos não foram baixados/validados nesta atualização. O roteiro manual foi ampliado em `TESTING.md`.

## Registro da versão 0.1.0

Ambiente: Windows, Node.js 24.14.1, Playwright 1.62.1 e Chrome for Testing 151.0.7922.34, instalado em pasta local e executado em perfis temporários. Nenhum perfil pessoal de navegador foi alterado.

| Verificação | Resultado |
| --- | --- |
| `npm test` | 14 testes unitários passaram. |
| `npm run check` | Manifest V3, permissões, recursos e sintaxe dos 8 scripts de produção válidos. |
| `npm run test:browser` | 8 testes de navegador passaram. |
| Carregamento MV3 real | Confirmados content scripts isolados, popup, preferências persistentes e reação nas páginas abertas. |
| UI com tradução simulada | Confirmados clique, cache, teclado, pausa/retomada, fechamento, cancelamento, múltiplas linhas, SPA e tela cheia. |
| Capability detection nativa | O Chrome retornou `downloadable` no mundo isolado da extensão. |
| Tradução nativa bem-sucedida | **Não confirmada**: a preparação do modelo excedeu 120 segundos. A interface apresentou o erro de timeout. |
| YouTube real | A extensão e o cartão oculto foram injetados em dois vídeos públicos. O próprio player informou “Não há legendas/legendas descritivas disponíveis” nessas sessões, portanto não houve legenda nativa para clicar. |

O teste nativo foi repetido permitindo atualização de componentes e rede de fundo, normalmente desativadas pelo Playwright. A preparação continuou sem concluir. Não foi demonstrada a causa externa dessa indisponibilidade, e não se alterou o Chrome do usuário para contorná-la.

As páginas públicas acessadas foram os vídeos `iG9CE55wbtY` e `H14bBuluwB8`, em perfis sem login. Esse resultado descreve as sessões de teste, não afirma que esses vídeos nunca oferecem legendas.

**Ainda precisa de validação manual:** uma tradução real de uma legenda real em um Chrome com modelo disponível, conforme `docs/TESTING.md`. Os testes com API simulada não substituem essa verificação nem medem qualidade linguística ou tempo de resposta do modelo real.

As capturas e relatórios de execução ficam em `test-results/` no ambiente local e são ignorados pelo Git. O pacote de entrega contém código, testes e documentação; não inclui navegadores baixados, caches, node_modules ou perfis de teste.
