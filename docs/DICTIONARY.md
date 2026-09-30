# Consulta de palavras e dicionário pessoal — 0.5.0

## Uso

1. Atualize a extensão em `chrome://extensions` usando **Recarregar**; recarregue também as abas do YouTube abertas anteriormente.
2. Em um vídeo normal, escolha no popup o mesmo idioma das legendas e o idioma de destino em **Traduzir para**. As bases de verbetes são inglês–português; outros pares permitem tradução local quando suportados pelo Chrome e anotações manuais de palavras.
3. Clique na legenda e diretamente em uma palavra do cartão. Não existe mais o passo intermediário **Palavras**. **Alt + clique** na legenda também continua funcionando; se o clique cair entre palavras, o seletor permite escolher uma delas. A consulta de verbetes funciona mesmo sem a API de tradução de frases.
4. Marque os sentidos que quer guardar, acrescente uma anotação opcional e clique **Salvar no meu dicionário**. Palavras sem verbete oferecem **Tentar tradução local**, usando o Chrome somente após o clique. O resultado é marcado como tradução automática, não como uma lista de sentidos de dicionário. Se o modelo não estiver disponível, aparece uma explicação; a anotação manual continua disponível. O campo de busca aceita expressões presentes nas bases.
5. Clique no ícone da extensão → **Meu dicionário e frases**. Busque palavras, edite significados/notas ou retorne ao vídeo no ponto salvo. Cada referência nova guarda os significados selecionados e a anotação daquele trecho. A remoção pede confirmação.
6. Exporte/importe backups JSON pelos botões da coleção. O formato v2 inclui palavras, frases e referências. Backups v1 continuam aceitos. Importar valida o conjunto antes de gravar, combina referências e preserva notas já existentes. Limite do arquivo: 20 MB.

O clique normal mostra primeiro a frase original com palavras clicáveis. **Traduzir frase** substitui o texto no mesmo bloco, com a mesma fonte e contraste; **Ver original** volta ao original. Para reverter somente essa experiência, desligue **Mostrar original primeiro** no popup. A tradução volta a aparecer ao clicar, mas as palavras continuam clicáveis e os dados são preservados. Esc, reprodução, troca de legenda e navegação fecham o cartão; o botão de ouvir de novo mantém a repetição de 5 segundos.

O cartão mantém a mesma largura ao traduzir e voltar ao original, preservando suas quebras de linha na mesma dimensão de player. Os atalhos do YouTube são isolados durante a edição, inclusive espaço. Rascunhos de até 50 consultas permanecem temporariamente na memória da aba ao fechar/reabrir a mesma palavra e trecho; desaparecem ao recarregar ou fechar a aba. Use **Salvar no meu dicionário** para persistir.

Ao clicar em uma palavra traduzida, a consulta inverte o par de idiomas. PT → EN usa um índice inverso dos equivalentes completos presentes nas duas bases, sem inventar sentidos. Não há alinhamento automático entre palavras da tradução e do original.

## Escopo e privacidade

- As bases contêm 15.773 entradas FreeDict e 56.350 entradas WikDict EN → PT, com 55.725 chaves principais distintas no conjunto e consulta inversa PT → EN. O WikDict acrescenta, por exemplo, `methamphetamine → metanfetamina`. A tradução de frases usa o provedor Chrome e o par selecionado.
- A consulta aos verbetes funciona sem Translator API ou modelo baixado, inclusive offline. A alternativa de tradução automática precisa da API e de um modelo disponível no Chrome; o primeiro uso pode requerer download. Palavras não são enviadas a um serviço de tradução externo.
- A consulta devolve os sentidos presentes nos verbetes incluídos, identificando a fonte. Não promete todas as traduções possíveis, frequência de uso ou adequação contextual. Há 44.746 chaves de flexões registradas no WikDict; formas não registradas podem receber sugestões heurísticas explicitamente marcadas como **possível forma-base**. Nem todas são reconhecidas.
- Nada é guardado por simplesmente consultar. Somente salvar persiste a palavra, sentidos escolhidos, anotação, idiomas, datas e referências (texto, ID do vídeo, segundo, sentidos/anotação daquele trecho e tradução disponível). A mesma palavra reúne vários vídeos no mesmo verbete por par de idiomas. Não há mais descarte automático ao ultrapassar cinco referências: acumula até a quota local do Chrome, com erro visível se não houver espaço. Repetir o mesmo trecho combina os sentidos sem duplicar a referência. Nenhum áudio ou vídeo é gravado.
- Referências antigas permanecem. Não é possível reconstruir os sentidos por trecho que a versão 0.3 não guardava, nem recuperar referências que já haviam sido descartadas por ela.
- `chrome.storage.local`, sem sincronização, conta ou servidor. Remover a extensão ou o perfil pode apagar os dados; use backup. O backup contém os trechos salvos, inclusive seus links.
- O worker lê dois JSONs que já acompanham a extensão; não há busca externa de verbetes nem código remoto na extensão. O download de modelos é gerenciado pelo próprio Chrome. A versão 0.5 adiciona permissão limitada para identificar o player de trechos no YouTube; ele só conecta após o pedido de ouvir. Escopo e privacidade: `docs/SENTENCE-MINING.md`.
- O arquivo grande fica fora do content script. Carregamento e consulta ocorrem no worker sob demanda. Dados pessoais são relidos do armazenamento em cada operação. Escritas são serializadas entre abas, e erros de quota aparecem na interface.

## Arquitetura e reprodução

`WordPanel` → `VocabularyClient` → worker → `DictionaryProvider` / `VocabularyStore`.

Frases e cartões usam `SentenceStore`, separado das palavras. Guia: `docs/SENTENCE-MINING.md`.

O provedor combina as duas bases e suas formas registradas sob demanda. É separado do serviço de tradução: a alternativa para palavras ausentes reutiliza `TranslationService` e `ChromeTranslatorProvider`, com cancelamento e identificação explícita de tradução automática. Outros fornecedores de dicionário podem implementar `lookup` futuramente sem alterar o tradutor.

`python scripts/build-dictionary.py` e `python scripts/build-wikdict.py` regeneram os JSONs locais a partir dos TEIs distribuídos. Fontes, checksums, licenças e referências: `THIRD_PARTY_NOTICES.md`.

O popup verifica se a interface e o worker executam a mesma versão. Incompatibilidade recebe instruções e o botão **Aplicar atualização**; depois recarregue o YouTube. Procedimento e diagnóstico de “Ação desconhecida”: `docs/FIXES-0.4.1.md`.

Verificações: `npm run check`, `npm test`, `npm run test:browser`. Os testes de navegador usam fixtures locais de legendas para reprodução estável; testes de worker/coleção carregam o Manifest V3 real. Nenhuma consulta online de palavra é necessária.
