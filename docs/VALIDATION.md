# Resultado da validação — 23/09/2026

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
