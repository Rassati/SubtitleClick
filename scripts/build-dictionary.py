"""Rebuild the bundled data with Python 3; no network or third-party packages."""
from pathlib import Path
import hashlib
import json
import xml.etree.ElementTree as ET

root = Path(__file__).resolve().parent.parent
source = root / 'vendor/freedict/eng-por.tei'
ns = {'t': 'http://www.tei-c.org/ns/1.0'}
document = ET.parse(source)
entries = {}
def text(element):
    return ' '.join(''.join(element.itertext()).split()) if element is not None else ''
for entry in document.findall('.//t:body/t:entry', ns):
    word = text(entry.find('t:form/t:orth', ns))
    senses = []
    for sense in entry.findall('t:sense', ns):
        translations = list(dict.fromkeys(text(q) for q in sense.findall('.//t:cit[@type="trans"]/t:quote', ns)))
        if translations:
            senses.append(translations)
    if word and senses:
        item = {'word': word, 'pronunciation': text(entry.find('t:form/t:pron', ns)),
                'partOfSpeech': text(entry.find('t:gramGrp/t:pos', ns)), 'senses': senses}
        entries.setdefault(word.lower().replace('’', "'"), []).append(item)
result = {'source': 'FreeDict English–Portuguese 0.3', 'license': 'GPL-2.0-or-later',
          'sha256': hashlib.sha256(source.read_bytes()).hexdigest(), 'entries': entries}
output = root / 'data/eng-por.json'
output.write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
print(f'{len(entries)} keys; {sum(len(v) for v in entries.values())} entries; {output.stat().st_size} bytes')
