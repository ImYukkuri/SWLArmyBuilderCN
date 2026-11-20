"""V2 saves are atomic; Python delegates new semantics to the shared JS module."""
import copy
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import battleforce_bridge
import rules
import server


def v2_force(source):
    force = copy.deepcopy(source)
    force['engineVersion'] = 2
    force['status'] = 'draft'
    force['v2'] = {
        'common': {'textRulesZh': ['测试共通规则']},
        'ruleGroups': [{'id': option['id'], 'name': {'en': option['name'], 'zh': option['nameZh']},
                        'textRulesZh': [option['text']]} for option in source['options']],
        'selectionSchemes': [{'id': 'clone-traits', 'name': {'en': 'Clone traits', 'zh': '克隆人营特质'},
            'groups': [{'id': group['id'], 'name': {'en': group['id'], 'zh': group['nameZh']},
                'min': 1, 'max': 1, 'ruleGroupIds': [option['id'] for option in source['options']
                                                   if option['chooseOneKey'] == group['id']]}
                       for group in source['draftSpec']['optionGroups']]}],
    }
    return force


class BattleForceV2Test(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / 'data').mkdir()
        for name in ['slot-rules.json', 'catalog-definitions.json']:
            (self.root / 'data' / name).write_bytes((server.ROOT / 'data' / name).read_bytes())
        patcher = patch.object(server, 'ROOT', self.root)
        patcher.start(); self.addCleanup(patcher.stop)
        self.path = self.root / 'data/slot-rules.json'
        self.original = self.path.read_bytes()
        self.package = json.loads(self.original)
        self.package['battleForces']['28'] = v2_force(self.package['battleForces']['28'])

    def test_valid_draft_save_roundtrips_and_preserves_all_legacy_battleforces(self):
        result = server.commit_rules(self.package, server.digest(self.original))
        saved = json.loads(self.path.read_bytes())
        self.assertEqual(saved['battleForces']['28'], self.package['battleForces']['28'])
        old = json.loads(self.original)
        for key, force in old['battleForces'].items():
            if key != '28': self.assertEqual(saved['battleForces'][key], force)
        self.assertEqual((self.root / 'history/slot-rules' / result['snapshot']).read_bytes(), self.original)

    def test_bad_reference_rejects_save_before_any_file_or_history_changes(self):
        self.package['battleForces']['28']['v2']['selectionSchemes'][0]['groups'][0]['ruleGroupIds'].append('missing')
        # A pending rename must not partially save the definitions either.
        self.package['battleForces']['28']['nameZh'] = '改名'
        definitions = self.root / 'data/catalog-definitions.json'
        original_definitions = definitions.read_bytes()
        with self.assertRaisesRegex(ValueError, '规则组不存在'):
            server.commit_rules(self.package, server.digest(self.original), server.digest(original_definitions))
        self.assertEqual(self.path.read_bytes(), self.original)
        self.assertEqual(definitions.read_bytes(), original_definitions)
        self.assertFalse((self.root / 'history').exists())

    def test_visual_editor_effects_roundtrip_without_touching_other_forces(self):
        package = json.loads(self.original)
        common = package['battleForces']['28']['v2']['common']
        common.setdefault('modifiers', []).append({
            'id': 'editor-test-discount', 'card': 'unit', 'field': 'points', 'op': 'add', 'value': -5,
            'target': {'field': 'unit.id', 'op': 'eq', 'value': 'republic-barc'},
        })
        common.setdefault('entries', []).append({
            'id': 'editor-test-entry', 'name': {'zh': '测试词条', 'en': 'Test Entry'},
            'summary': '人工简写', 'full': '完整规则', 'fullEn': 'Full rule', 'timing': ['army_building'],
        })
        server.commit_rules(package, server.digest(self.original))
        self.assertEqual(json.loads(self.path.read_bytes()), package)

    def test_draft_cannot_be_activated_before_effects_are_supported(self):
        self.package['battleForces']['28']['status'] = 'active'
        with self.assertRaisesRegex(ValueError, '所属势力'):
            server.commit_rules(self.package, server.digest(self.original))
        self.assertEqual(self.path.read_bytes(), self.original)

    def test_legacy_saves_do_not_require_node(self):
        package = json.loads(self.original)
        package['battleForces']['12']['engineVersion'] = 1
        for force in package['battleForces'].values():
            force.pop('v2', None)
            force.pop('engineVersion', None)
        with patch.object(battleforce_bridge.subprocess, 'run', side_effect=AssertionError('legacy must not spawn Node')):
            server.commit_rules(package, server.digest(self.original))

    def test_missing_node_fails_without_saving_or_silently_using_legacy(self):
        with patch.object(battleforce_bridge.subprocess, 'run', side_effect=FileNotFoundError):
            with self.assertRaisesRegex(ValueError, 'Node.js'):
                server.commit_rules(self.package, server.digest(self.original))
        self.assertEqual(self.path.read_bytes(), self.original)
        self.assertFalse((self.root / 'history').exists())

    def test_revision_conflict_is_checked_before_calling_node(self):
        with patch.object(battleforce_bridge.subprocess, 'run', side_effect=AssertionError('must check revision first')):
            with self.assertRaises(FileExistsError):
                server.commit_rules(self.package, 'stale-revision')
        self.assertEqual(self.path.read_bytes(), self.original)

    def test_python_preview_uses_js_and_does_not_enter_legacy_calculation(self):
        army = {'armyId': 28, 'mode': 'standard', 'pointsLimit': 1000, 'units': [], 'commandIds': [], 'options': []}
        units, upgrades, definitions = rules.load_cards()
        expected = battleforce_bridge.call_js('validateArmy', army=army,
            data={'units': units, 'upgrades': upgrades, 'defs': definitions, 'pkg': self.package})
        with patch.object(rules, 'load_package', return_value=self.package), \
             patch.object(rules, 'prepare_data', side_effect=AssertionError('legacy calculation used')):
            actual = rules.validate_army(army)
        self.assertEqual(actual, expected)
        self.assertEqual(sum(i['code'] == 'battle_force_selection_min' for i in actual['issues']), 3)
        self.assertTrue(any(i['code'] == 'battle_force_draft' for i in actual['issues']))

    def test_unknown_versions_are_rejected_in_save_and_preview(self):
        for version in [1, 3, '2', None, False, True]:
            with self.subTest(version=version):
                package = copy.deepcopy(self.package)
                package['battleForces']['28']['engineVersion'] = version
                with self.assertRaises(ValueError): server.commit_rules(package, server.digest(self.original))
                with patch.object(rules, 'load_package', return_value=package):
                    result = rules.validate_army({'armyId': 28, 'units': []})
                self.assertEqual(result['status'], 'invalid')
                self.assertEqual(result['issues'][0]['code'], 'battle_force_version')
        self.assertEqual(self.path.read_bytes(), self.original)


if __name__ == '__main__':
    unittest.main()
