import copy
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import rules
import maintenance_store as store
from battleforce_bridge import call_js
from rule_schema import validate_rules


class NamedExclusionTest(unittest.TestCase):
    def test_optional_rule_validation_and_saved_round_trip(self):
        for value in ({}, {'exclusion': None}, {'exclusion': {'name': '', 'scope': 'unit'}},
                      {'exclusion': {'name': '姿态', 'scope': 'army'}}):
            validate_rules(value)
        for value in ('name', [], {}, {'name': 1, 'scope': 'unit'}, {'name': 'a'},
                      {'name': 'a', 'scope': 'all'}, {'name': 'a', 'scope': None}):
            with self.subTest(value=value), self.assertRaises(ValueError):
                validate_rules({'exclusion': value})
        _, upgrades, _ = rules.load_cards()
        card = copy.deepcopy(upgrades['training-stance-b'])
        card['assets']['front'] = None
        card['back']['assets']['front'] = None
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / 'data').mkdir()
            (root / 'data/catalog-definitions.json').write_bytes((store.ROOT / 'data/catalog-definitions.json').read_bytes())
            (root / 'data/upgrades.json').write_bytes(store.encode({'cards': [card]}))
            with patch.object(store, 'ROOT', root):
                card['rules']['exclusion'] = {'name': '姿态', 'scope': 'unit'}
                saved = store.save('upgrades', card, store.read('upgrades')['revision'])
                self.assertEqual(saved['card']['rules']['exclusion'], card['rules']['exclusion'])
                del card['rules']['exclusion']
                saved = store.save('upgrades', card, saved['revision'])
                self.assertNotIn('exclusion', saved['card']['rules'])

    def test_browser_and_server_agree_on_scopes_units_and_old_saved_faces(self):
        units, upgrades, defs = rules.load_cards()
        pkg = rules.load_package()
        a, b = upgrades['training-stance-b'], upgrades['gear-binoculars']
        host = units['empire-stormtroopers']
        army = {'armyId': 2, 'mode': 'standard', 'commandIds': [], 'units': [
            {'unitId': host['id'], 'instanceId': 'host-a', 'upgrades': [
                {'upgradeId': 'training-stance-a', 'instanceId': 'old-back', 'slotIndex': 0}]},
            {'unitId': host['id'], 'instanceId': 'host-b', 'upgrades': [
                {'upgradeId': b['id'], 'instanceId': 'binoculars', 'slotIndex': 2}]}]}
        for left, right, same_host, on_host, expected in [
            ('unit', 'unit', False, False, 0), ('army', 'unit', False, False, 2),
            ('unit', 'army', False, False, 2), ('unit', 'unit', True, False, 2),
            ('unit', 'unit', False, True, 4)]:
            with self.subTest(left=left, right=right, same_host=same_host, on_host=on_host):
                a['rules']['exclusion'] = {'name': ' 姿态 ', 'scope': left}
                b['rules']['exclusion'] = {'name': '姿态', 'scope': right}
                host['rules'].pop('exclusion', None)
                if on_host:
                    host['rules']['exclusion'] = {'name': '姿态', 'scope': 'unit'}
                roster = copy.deepcopy(army)
                if same_host:
                    roster['units'][0]['upgrades'] += roster['units'].pop()['upgrades']
                with patch('rules.load_cards', return_value=(units, upgrades, defs)), patch('rules.load_package', return_value=pkg):
                    py = rules.validate_army(roster)
                js = call_js('validateArmy', army=roster, data={'units': units, 'upgrades': upgrades, 'defs': defs, 'pkg': pkg})
                selected = lambda report: [i for i in report['issues'] if i['code'] == 'named_exclusion']
                self.assertEqual(len(selected(py)), expected)
                self.assertEqual(selected(py), selected(js))
