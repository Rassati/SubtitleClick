# Correções 0.4.1

## Aplicar na instalação local

1. Abra `chrome://extensions`, mantenha o **Modo do desenvolvedor** ativo e clique em **Recarregar** no SubtitleClick.
2. Recarregue as abas do YouTube que estavam abertas.
3. Abra o ícone do SubtitleClick. O rodapé deve indicar **Versão 0.4.1 · armazenamento pronto.**

Se a interface nova detectar um worker antigo, ela explica a incompatibilidade. O botão **Aplicar atualização** no popup recarrega a extensão; depois recarregue o YouTube. Não é necessário remover/reinstalar a extensão, e o recarregamento preserva os dados salvos. Rascunhos ainda não salvos ficam somente na memória da aba e não sobrevivem ao recarregamento.

## O que foi corrigido

- **Salvar frase / “Ação desconhecida”:** os arquivos anteriores já tinham a ação `sentences-save`. Uma causa compatível com o erro é o Chrome manter o worker antigo enquanto a interface usa arquivos novos. Essa combinação foi reproduzida em um perfil de teste: agora recebe uma orientação de atualização, e o recarregamento permite salvar mantendo os dados existentes. A versão efetivamente executada é verificada nas mensagens. Não foi inspecionado o perfil pessoal para comprovar essa causa no episódio relatado.
- **Quebras de linha ao voltar:** a largura antes dependia do conteúdo e dos botões visíveis. O cartão agora usa largura estável de 460 px, limitada pelo espaço do player. Voltar ao mesmo original na mesma dimensão do player restaura o mesmo formato; textos de idiomas diferentes ainda podem ter quantidades diferentes de linhas.
- **Espaço na anotação:** a proteção anterior não cobria todas as fases/eventos usados pelos atalhos do player. Uma proteção no início do carregamento da página intercepta `keydown`, `keypress` e `keyup` originados no cartão sem impedir a digitação. Rascunhos temporários permitem também reabrir uma consulta fechada acidentalmente na mesma aba.
- **Palavras ausentes:** adicionado WikDict offline ao FreeDict, incluindo `methamphetamine → metanfetamina` e flexões registradas. Se não houver verbete, **Tentar tradução local** pode produzir uma tradução automática pelo Chrome, explicitamente identificada. Isso não garante todos os sentidos nem todas as palavras.

As consultas continuam locais, sem contas, tracking, servidor próprio ou APIs pagas. Os dados comunitários têm licenças próprias e são distribuídos com atribuição e fonte: `THIRD_PARTY_NOTICES.md`.
