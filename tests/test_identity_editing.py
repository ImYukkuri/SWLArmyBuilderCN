import copy
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import server
from unit_identity import rename_documents, resolve_id


class IdentityEditingTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / 'data').mkdir()
        self.docs = {
            'units.json': {'units': [
                {'id': 'old-unit', 'nameIdentityId': 'old-unit', 'upstream': {'id': '42'},
                 'name': {'en': 'Old unit', 'zh': '旧单位'}, 'assets': {'front': 'assets/old-unit.webp'}},
                {'id': 'other', 'keywords': [{'id': 'detachment', 'parameterRefs': [
                    {'kind': 'unit', 'id': 'old-unit'}, {'kind': 'nameIdentity', 'id': 'old-unit'}]}]}],
                'idAliases': {'older-unit': 'old-unit'}},
            'upgrades.json': {'cards': [{'id': 'old-unit', 'description': {'zh': 'old-unit'},
                'back': {'keywords': [{'id': 'entourage', 'parameterRef': {'kind': 'unit', 'id': 'old-unit'}}]}}]},
            'catalog-definitions.json': {'armies': [{'id': 12, 'name': {'en': '212th Attack Battalion', 'zh': '212攻击营'}}],
                                         'commands': [{'id': '42', 'description': {'zh': '保留校订'}}]},
            'slot-rules.json': {'schema': 'swl-rules/v1', 'slots': [{'id': 'gear', 'sourceId': 2, 'kind': 'category'}],
                'predicates': {'custom': {'field': 'unit.id', 'op': 'in', 'value': ['old-unit', 'other']}},
                'battleForces': {'12': {'name': '212th Attack Battalion', 'modes': {'standard': {'rankQuotas': []}}}}},
            'tts-names.json': {'units': {'old-unit': {'name': 'Original HQ Name', 'hqIds': ['a1']}},
                               'upgrades': {'old-unit': {'name': 'Different Upgrade'}}},
            'armies.json': {'armies': [{'id': 'list', 'units': [{'unitId': 'old-unit', 'instanceId': 'keep', 'upgrades': []}]}]},
        }
        for name, doc in self.docs.items():self.path(name).write_bytes(server.encoded(doc))
        self.patches = patch.multiple(server, ROOT=self.root, DATA=self.path('units.json'), HISTORY=self.root/'history')
        self.patches.start();self.addCleanup(self.patches.stop)

    def path(self, name):return self.root/'data'/name
    def read(self, name):return json.loads(self.path(name).read_bytes())
    def revision(self, name):return server.digest(self.path(name).read_bytes())

    def test_unit_rename_updates_only_local_references_and_preserves_old_lists(self):
        before = copy.deepcopy(self.docs)
        result = server.rename_unit('old-unit', 'new-unit', self.revision('units.json'))
        self.assertEqual(result['card']['id'], 'new-unit')
        self.assertEqual(result['card']['nameIdentityId'], 'old-unit')
        self.assertEqual(result['card']['upstream']['id'], '42')
        self.assertEqual(result['card']['assets']['front'], 'assets/old-unit.webp')
        units = self.read('units.json')
        self.assertEqual(units['units'][1]['keywords'][0]['parameterRefs'], [
            {'kind': 'unit', 'id': 'new-unit'}, {'kind': 'nameIdentity', 'id': 'old-unit'}])
        self.assertEqual(units['idAliases'], {'older-unit': 'new-unit', 'old-unit': 'new-unit'})
        self.assertEqual(resolve_id('older-unit', units['idAliases']), 'new-unit')
        up = self.read('upgrades.json')['cards'][0]
        self.assertEqual(up['id'], 'old-unit');self.assertEqual(up['description']['zh'], 'old-unit')
        self.assertEqual(up['back']['keywords'][0]['parameterRef']['id'], 'new-unit')
        self.assertEqual(self.read('tts-names.json')['units']['new-unit']['name'], 'Original HQ Name')
        self.assertEqual(self.read('tts-names.json')['upgrades'], before['tts-names.json']['upgrades'])
        self.assertEqual(self.read('armies.json')['armies'][0]['units'][0]['unitId'], 'new-unit')
        self.assertEqual(self.read('slot-rules.json')['predicates']['custom']['value'], ['new-unit', 'other'])
        self.assertEqual(json.loads((self.root/'history'/result['snapshot']).read_bytes()), before['units.json'])
        server.rename_unit('new-unit', 'final-unit', self.revision('units.json'))
        self.assertEqual(set(self.read('units.json')['idAliases'].values()), {'final-unit'})

    def test_invalid_duplicate_reserved_and_stale_rename_never_write(self):
        baseline = {n:self.path(n).read_bytes() for n in self.docs}
        for value in ['other', 'older-unit', 'old-unit', '../bad', '', 'MixedCase', None]:
            with self.subTest(value=value),self.assertRaises(ValueError):
                server.rename_unit('old-unit', value, self.revision('units.json'))
        with self.assertRaises(FileExistsError):server.rename_unit('old-unit','new-unit','stale')
        self.assertEqual({n:self.path(n).read_bytes() for n in self.docs}, baseline)

    def test_write_failure_restores_every_changed_file(self):
        real = server.atomic
        def fail(path, content):
            if path == self.path('tts-names.json') and b'new-unit' in content:raise OSError('test write failure')
            real(path, content)
        with patch.object(server,'atomic',side_effect=fail),self.assertRaises(OSError):
            server.rename_unit('old-unit','new-unit',self.revision('units.json'))
        for name, doc in self.docs.items():self.assertEqual(self.read(name),doc,name)

    def test_battleforce_name_save_syncs_dictionary_and_preserves_canonical_mapping(self):
        pkg = self.read('slot-rules.json')
        pkg['battleForces']['12'].update(name='212th Test Name', nameZh='测试营')
        result = server.commit_rules(pkg,self.revision('slot-rules.json'),self.revision('catalog-definitions.json'))
        self.assertEqual(self.read('catalog-definitions.json')['armies'][0]['name'], {'en':'212th Test Name','zh':'测试营'})
        self.assertEqual(result['rules']['battleForces']['12']['nameAliases'], ['212th Attack Battalion'])
        self.assertEqual(self.read('catalog-definitions.json')['commands'], self.docs['catalog-definitions.json']['commands'])
        self.assertEqual(self.read('tts-names.json'),self.docs['tts-names.json'])
        self.assertEqual(result['definitionsRevision'],self.revision('catalog-definitions.json'))
        self.assertEqual(pkg['battleForces']['12'].get('nameAliases'),None,'input must not be mutated')

    def test_battleforce_conflict_or_invalid_name_leaves_both_files_unchanged(self):
        pkg = self.read('slot-rules.json');pkg['battleForces']['12']['name']='Renamed'
        with self.assertRaises(FileExistsError):server.commit_rules(pkg,self.revision('slot-rules.json'),'stale')
        pkg['battleForces']['12']['name']=' '
        with self.assertRaises(ValueError):server.commit_rules(pkg,self.revision('slot-rules.json'),self.revision('catalog-definitions.json'))
        self.assertEqual(self.read('slot-rules.json'),self.docs['slot-rules.json'])
        self.assertEqual(self.read('catalog-definitions.json'),self.docs['catalog-definitions.json'])


if __name__ == '__main__':unittest.main()
