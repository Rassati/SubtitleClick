# Dados e referências de terceiros

## FreeDict English–Portuguese 0.3

A base `data/eng-por.json` é derivada de **English-Portuguese FreeDict Dictionary**, edição 0.3, copyright 1999–2017 dos autores identificados no cabeçalho TEI. Mantenedor: Raul Fernandes; outros contribuidores e histórico estão no arquivo-fonte.

- Projeto: https://freedict.org/
- Fonte consultada em 29/09/2026: https://raw.githubusercontent.com/freedict/fd-dictionaries/master/eng-por/eng-por.tei
- Fonte completa distribuída neste projeto: `vendor/freedict/eng-por.tei`.
- SHA-256 da fonte: `59a47b5ccfc787a3fe6f3ef2d81a53d0623f041430f4ba0a22626255205f6ef7`.
- Licença dos dados e de sua conversão: **GNU GPL versão 2 ou posterior**, incluída integralmente em `vendor/freedict/COPYING`.
- Conversão: `scripts/build-dictionary.py`, usando apenas a biblioteca padrão do Python 3. Executar `python scripts/build-dictionary.py` na raiz. Preserva verbetes, pronúncias, classe gramatical e agrupamentos de traduções; normaliza espaços e agrupa chaves sem distinção de maiúsculas. Não acrescenta traduções geradas.
- Resultado: 15.773 entradas, agrupadas em 15.770 chaves de consulta. O cabeçalho histórico da fonte declara 15.766 verbetes; a contagem acima é a do XML efetivamente incluído.

Conserve o fonte, esta atribuição e a licença ao redistribuir os dados. A licença MIT em `LICENSE` cobre o código original do SubtitleClick; não substitui a licença GPL dos dados FreeDict. Os significados provenientes dessa base mantêm sua procedência nos backups exportados. A base contém termos antigos, lacunas e possíveis erros; não é uma lista exaustiva de traduções e não determina sozinha o sentido de uma palavra em uma frase.

## WikDict English–Portuguese 2025.11.21

`data/wikdict-en-pt.json` deriva do **WikDict**, de Karl Bartel, a partir de contribuições do **Wiktionary** extraídas pelo **DBnary**. A atribuição original e o histórico de geração estão no cabeçalho TEI distribuído.

- Projeto e créditos: https://www.wikdict.com/page/about e https://www.wikdict.com/page/download.
- Projetos de origem: https://www.wiktionary.org/ e https://kaiko.getalp.org/about-dbnary/.
- Fonte baixada em 30/09/2026: https://download.wikdict.com/dictionaries/tei/recommended/eng-por.tei.
- Snapshot distribuído integralmente, apenas comprimido: `vendor/wikdict/eng-por.tei.gz`.
- SHA-256 do XML descomprimido: `78d3665f7502ea102daf83c5d4f0ff5395144727342f1da9495317b43c069c14`.
- Licença dos dados e da conversão: **Creative Commons Attribution-ShareAlike 3.0 Unported**, conforme o cabeçalho deste snapshot, incluída em `vendor/wikdict/CC-BY-SA-3.0.txt`: https://creativecommons.org/licenses/by-sa/3.0/.
- Conversão realizada pelo SubtitleClick: `python scripts/build-wikdict.py`. Normaliza espaços/chaves, conserva os grupos de traduções, a primeira pronúncia e a classe gramatical, e indexa as flexões registradas. Não acrescenta significados gerados nem incorpora definições intermediárias em inglês como traduções.
- Resultado: 56.350 entradas em 51.504 chaves, mais 44.746 chaves de formas flexionadas. O conjunto FreeDict + WikDict possui 55.725 chaves principais distintas; entradas sobrepostas conservam a identificação da fonte na consulta.

Conserve esta atribuição, a indicação das alterações e a licença ao redistribuir. Os dados WikDict derivados permanecem sob CC BY-SA 3.0; a licença MIT do código não substitui essa licença nem a GPL dos dados FreeDict. Os dois conjuntos são arquivos separados. Traduções automáticas opcionais do Chrome são identificadas separadamente, sem atribuí-las a estas bases. Não se promete cobertura exaustiva ou ausência de erros nos dados comunitários.

## Referências de implementação (sem código copiado)

- Skill pública GoogleChrome/modern-web-guidance, `chrome-extensions`: https://github.com/GoogleChrome/modern-web-guidance/blob/main/skills/chrome-extensions/SKILL.md — Manifest V3, mensagens assíncronas, armazenamento persistente e ciclo de vida do worker.
- Yomitan: https://yomitan.wiki/getting-started/ — consulta explícita por palavra e dicionários instalados.
- asbplayer: https://github.com/asbplayer/asbplayer — sentence mining com contexto de legendas.
- Documentação Chrome Storage: https://developer.chrome.com/docs/extensions/reference/api/storage — armazenamento local e notificações de mudanças.

O código destes projetos não foi incorporado. Não há integração Anki, contas, serviços desses projetos, telemetria ou downloads de dicionário em tempo de execução.
