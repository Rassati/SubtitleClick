# Validação do SubtitleClick

## Automação

`npm test` cobre detecção de API ausente/incompleta, todos os estados modernos de disponibilidade, progresso de preparação, falhas de inicialização e tradução, nova tentativa, compartilhamento de download, cancelamento, timeout, destruição tardia, cache por par de idiomas e retomada segura do vídeo.

`npm run check` verifica o manifest, os caminhos dos recursos, a sintaxe dos scripts e a ausência de chamadas de rede/eval no código de produção.

`npm run test:browser` usa uma fixture que reproduz os elementos nativos de legenda, sem conexão ao YouTube e sem baixar modelos de tradução. Verifica cliques, teclado, múltiplas linhas/spans, legendas ocultas, atualização durante tradução, CC, anúncios, preferências, SPA, Shorts, substituição do player, tela cheia e limites de posicionamento. A tradução bem-sucedida nessa suíte é simulada.

O teste `extension.test.cjs` carrega a extensão real em um perfil temporário do Chrome for Testing, confirma que o namespace não vaza para a página, lê a capacidade nativa no mundo isolado, testa indisponibilidade com uma simulação e verifica que as preferências do popup chegam ao content script e persistem ao reabrir.

Capturas dos testes ficam em `test-results/`, fora do controle de versão.

`npm run test:native` é opcional: usa a API nativa, permite o download de modelos pelo Chrome e grava `test-results/native.json`. Esse teste pode não concluir em um dispositivo sem modelo disponível. Ele não substitui o roteiro com o YouTube real.

## Roteiro manual com Chrome e YouTube reais

1. Carregue a raiz em `chrome://extensions`. Confirme que não há erros de carregamento.
2. Recarregue uma aba do YouTube. Abra um vídeo normal que ofereça legendas em inglês e selecione esse idioma.
3. Sem clicar, assista a várias legendas: nenhuma tradução deve aparecer.
4. Passe o mouse sobre uma legenda e confirme a borda discreta. Clique: a legenda capturada deve ser exatamente a que estava visível, preservando pontuação e linhas.
5. No primeiro uso, acompanhe o progresso do modelo. Se indisponível, confirme a mensagem amigável, sem abertura de abas ou fallback remoto.
6. Com modelo pronto, confirme a tradução real em português. Feche com Esc: o vídeo deve continuar se estava rodando antes do clique.
7. Pause manualmente antes de clicar. Feche a tradução: o vídeo deve continuar pausado.
8. Abra novamente e feche pelo × e pelo segundo clique. Teste também Tab, Enter e Espaço.
9. Desative “Pausar ao clicar” no popup. Clique; uma legenda nova deve fechar o cartão, inclusive durante uma tradução pendente.
10. Teste legendas automáticas, duas linhas, modo cinema, tela cheia e redimensionamento. O cartão deve permanecer no player.
11. Desligue CC, busque outro ponto do vídeo e retome reprodução. Não deve restar tradução antiga.
12. Navegue para outro vídeo usando sugestões do próprio YouTube, sem recarregar. Confirme que a extensão funciona e não duplica cartões.
13. Navegue para a página inicial ou Shorts: não deve haver legendas marcadas pela extensão. Volte a um vídeo normal.
14. Desative a extensão pelo popup: o cartão e a marcação devem desaparecer. Reative e confirme o funcionamento.
15. Com o modelo já preparado, use o modo offline das ferramentas de desenvolvimento e clique em uma legenda já carregada no player. O tradutor deve depender apenas da disponibilidade local; a reprodução e novos dados do próprio YouTube podem parar.

Não confunda “funciona no teste simulado” com “modelo disponível neste dispositivo”. A etapa 6 precisa de Chrome com o modelo real; o hardware, as políticas e a rede inicial podem impedir a preparação.

## Roteiro das melhorias da versão 0.2.0

1. Com a tradução aberta, clique em “Ouvir de novo · −5 s”: o cartão deve fechar e o áudio recomeçar cinco segundos antes do clique original, sem tempo negativo perto do início.
2. Escolha “Voltar ao fechar → 3 segundos”. Clique numa legenda com o vídeo rodando, espere a tradução e feche com Esc: deve voltar três segundos e continuar. Faça o mesmo com o vídeo pausado manualmente: deve permanecer pausado sem recuar.
3. Compare duas legendas consecutivas que dividem uma frase. Quando houver contexto recente, confirme a indicação “Legenda + contexto anterior”. Abra “Ver texto original” e confira a junção. Use “Só esta legenda” para comparar.
4. Busque outro ponto do vídeo e confirme que as legendas anteriores à busca não entram no contexto novo. Repita ao trocar de vídeo e ao desligar/religar CC.
5. Selecione japonês, russo ou alemão no popup e selecione o mesmo idioma nas legendas do YouTube. Confira a preparação do par correto e a tradução real para português. Esses pares podem precisar de novos downloads.
6. Confirme que frases em japonês/cirílico aparecem intactas em “Ver texto original”. A ausência de romanização é esperada; “Ouvir de novo” usa o áudio original.

## Diagnóstico

- **Nada acontece:** recarregue a aba depois de instalar/atualizar a extensão; confira se está ativada, em `/watch`, com CC ligado. Escolha no popup o mesmo idioma das legendas do YouTube. Legenda que faz parte da imagem do vídeo não é clicável.
- **API indisponível:** confira a versão do Chrome, políticas da organização e disponibilidade do recurso no dispositivo. O MVP não habilita flags nem muda configurações do navegador.
- **Falha de modelo:** confira conexão e espaço disponível. Feche o cartão e clique de novo. A primeira preparação pode levar mais tempo.
- **Após editar arquivos:** recarregue a extensão em `chrome://extensions` e recarregue a aba do YouTube.
- **Erro da extensão:** abra os detalhes em `chrome://extensions`. Para inspeção técnica, o console do DevTools precisa estar no contexto do content script SubtitleClick; a página não acessa seu namespace isolado.

## Registro desta entrega

Consulte `docs/VALIDATION.md` para os resultados efetivamente executados no ambiente de desenvolvimento, separados das verificações manuais pendentes.
