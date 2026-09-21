#!/usr/bin/env python3
"""Offline validation. Does not replace an Android build or a device test."""
from html.parser import HTMLParser
from pathlib import Path
import json
import re
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
class Inspector(HTMLParser):
    def __init__(self):
        super().__init__(); self.ids=[]; self.active=None; self.data={}; self.sources=[]
    def handle_starttag(self, tag, attrs):
        a=dict(attrs)
        if 'id' in a: self.ids.append(a['id'])
        assert not any(k.lower().startswith('on') for k in a), 'Inline JavaScript handler found'
        if tag=='script':
            if a.get('type')=='application/json': self.active=a.get('id');self.data[self.active]=''
            elif a.get('src'): self.sources.append(a['src'])
            else: raise AssertionError('Unexpected inline executable script')
    def handle_endtag(self, tag):
        if tag=='script': self.active=None
    def handle_data(self, data):
        if self.active: self.data[self.active]+=data

site=ROOT/'app/src/main/assets/site'
p=Inspector();p.feed((site/'index.html').read_text())
assert len(p.ids)==len(set(p.ids)), 'Duplicated HTML IDs'
seed=json.loads(p.data['app-data'])
assert len(seed['clients'])==335, 'Expected the 335 embedded client records'
assert len(seed['days'])==20, 'Expected the 20 embedded journeys'
ids=[str(c['id']) for c in seed['clients']]
assert len(ids)==len(set(ids)), 'Duplicated client IDs in embedded base'
assert seed.get('hoursChecked')==335, 'All client records must have a public-hours search status'
assert seed.get('hoursKnown')==248 and seed.get('hoursUnknown')==86 and seed.get('temporarilyClosed')==1, 'Unexpected hours audit counts'
assert all(c.get('hoursSearchPerformed') is True for c in seed['clients']), 'Every client must record that the hours search was performed'
assert json.loads(p.data['saved-state']) is None, 'Do not upload private snapshots'
assert p.sources==['app.js']
for src in p.sources: assert (site/src).is_file()
for f in (ROOT/'app/src/main').rglob('*.xml'): ET.parse(f)
manifest=ET.parse(ROOT/'app/src/main/AndroidManifest.xml').getroot()
ns='{http://schemas.android.com/apk/res/android}'
perms={x.get(ns+'name') for x in manifest.findall('uses-permission')}
assert perms=={'android.permission.INTERNET','android.permission.ACCESS_NETWORK_STATE'}
assert manifest.find('application').get(ns+'allowBackup')=='false'
assert manifest.find('application').get(ns+'usesCleartextTraffic')=='false'
for filename in ['build.gradle','settings.gradle','app/build.gradle','.github/workflows/android-apk.yml']:
    assert (ROOT/filename).is_file(), 'Missing '+filename
for f in ROOT.rglob('*'):
    if not f.is_file() or '.git' in f.parts or 'build' in f.parts or '.gradle' in f.parts: continue
    assert f.suffix not in {'.p12','.jks','.keystore','.pfx'}, 'Private signing key in project'
    assert f.name not in {'CLIENTES_MDS.json','MDS_Firma_Privada.txt'}, 'Private file in project'
print('OK: Android structure, XML, 335 embedded clients, 20 journeys, hours audit, no signing keys, safe permissions.')
