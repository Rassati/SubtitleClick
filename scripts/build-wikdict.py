"""Convert the bundled WikDict TEI snapshot. Python standard library only; offline."""
from pathlib import Path
import gzip
import hashlib
import json
import xml.etree.ElementTree as ET

root = Path(__file__).resolve().parent.parent
source = root / 'vendor/wikdict/eng-por.tei.gz'
raw = gzip.decompress(source.read_bytes())
document = ET.fromstring(raw)
ns = {'t': 'http://www.tei-c.org/ns/1.0'}
def text(node):
    return ' '.join(''.join(node.itertext()).split()) if node is not None else ''
def key(word):
    return word.lower().replace('’', "'").strip()
entries, aliases = {}, {}
for entry in document.findall('.//t:body/t:entry', ns):
    word = text(entry.find('t:form/t:orth', ns))
    senses = []
    for sense in entry.findall('t:sense', ns):
        translations = list(dict.fromkeys(text(q) for q in sense.findall('t:cit[@type="trans"]/t:quote', ns) if text(q)))
        if translations:
            senses.append(translations)
    if not word or not senses:
        continue
    item = {'word': word, 'pronunciation': text(entry.find('t:form/t:pron', ns)).strip('/'),
            'partOfSpeech': text(entry.find('t:gramGrp/t:pos', ns)), 'senses': senses}
    entries.setdefault(key(word), []).append(item)
    for form in entry.findall('.//t:form[@type="infl"]/t:orth', ns):
        value = key(text(form))
        if value and value != key(word) and len(value) <= 100:
            aliases.setdefault(value, set()).add(key(word))
result = {'source': 'WikDict 2025.11.21 (Wiktionary / DBnary)', 'license': 'CC-BY-SA-3.0',
          'sha256': hashlib.sha256(raw).hexdigest(), 'entries': entries,
          'aliases': {key: sorted(value) for key, value in sorted(aliases.items())}}
output = root / 'data/wikdict-en-pt.json'
output.write_bytes((json.dumps(result, ensure_ascii=False, separators=(',', ':')) + '\n').encode('utf-8'))
print(json.dumps({'keys': len(entries), 'entries': sum(map(len, entries.values())), 'forms': len(aliases),
                  'bytes': output.stat().st_size, 'sha256': result['sha256'],
                  'methamphetamine': entries.get('methamphetamine')}, ensure_ascii=True))
