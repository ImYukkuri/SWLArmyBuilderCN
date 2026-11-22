"""Per-rank mercenary budgets must agree in Python and browser validation."""
import copy
import unittest
from unittest.mock import patch

import rules
from battleforce_bridge import call_js


class MercenaryPoolTest(unittest.TestCase):
    def setUp(self):
        self.units, self.upgrades, self.defs = rules.load_cards()
        self.pkg = rules.load_package()

    def check(self, ids, army_id=2, expected=0, upgrades=None):
        army = {'armyId': army_id, 'mode': 'standard', 'commandIds': [], 'options': [],
                'units': [{'unitId': uid, 'instanceId': str(i), 'upgrades': (upgrades or {}).get(i, [])}
                          for i, uid in enumerate(ids)]}
        before = copy.deepcopy(army)
        with patch('rules.load_cards', return_value=(self.units, self.upgrades, self.defs)), \
                patch('rules.load_package', return_value=self.pkg):
            py = rules.validate_army(army)
        js = call_js('validateArmy', army=army, data={'units': self.units, 'upgrades': self.upgrades,
                     'defs': self.defs, 'pkg': self.pkg})
        relevant = lambda report: [i for i in report['issues'] if i['code'].startswith('mercenary_pool')]
        self.assertEqual(relevant(py), relevant(js))
        self.assertEqual(len(relevant(py)), expected)
        self.assertEqual(army, before)
        return py

    def test_rank_allowances_and_unit_or_upgrade_bonus_with_no_stacking(self):
        corps = 'mercenary-pyke-syndicate-pyke-syndicate-footsoldier'
        support = 'mercenary-raiders-swoop-bike'
        operative = 'mercenary-rogue-cad-bane'
        host = 'rebels-lando'
        self.check([corps, corps, support, operative], 1)
        self.check([corps, corps, corps], 1, expected=1)
        self.check([host, corps, corps, corps], 1)
        self.check([host, corps, corps, corps, support, support], 1, expected=1)
        upgrade = {'upgradeId': 'command-underworld', 'instanceId': 'uc', 'slotIndex': 0}
        self.check([host, corps, corps, corps, support, support], 1, expected=1, upgrades={0: [upgrade]})
        self.check(['empire-veers', corps, corps, corps], upgrades={0: [upgrade]})
        self.check(['empire-veers', 'empire-imperial-officer', corps, corps, corps, corps], expected=1,
                   upgrades={0: [upgrade], 1: [{**upgrade, 'instanceId': 'uc2'}]})
        self.check(['republic-shaak-ti', corps, corps, corps], 4)

    def test_bonus_keeps_normal_rank_limits_and_minimums(self):
        operative = 'mercenary-rogue-cad-bane'
        report = self.check(['republic-shaak-ti', operative, 'mercenary-raiders-hondo-ohnaka'], 4)
        self.assertTrue(any(i['code'] == 'rank_max' and i['rank'] == 6 for i in report['issues']))
        report = self.check(['mercenary-pyke-syndicate-pyke-syndicate-capo'])
        self.assertTrue(any(i['code'] == 'rank_min' and i['rank'] == 1 for i in report['issues']))

    def test_battleforce_memberships_override_parent_and_inherited_flags_still_apply(self):
        unit = self.units['mercenary-pyke-syndicate-pyke-syndicate-footsoldier']
        self.pkg['battleForces']['7']['allowedUnits'] = {'2': [unit['name']['en']]}
        self.check([unit['id']] * 3, 7, expected=1)
        unit['factions'].append({'id': 7, 'rankId': 2})
        self.check([unit['id']] * 3, 7)
        self.check(['mercenary-ewoks-ewok-skirmishers'] * 3, 18)
        self.check(['mercenary-pyke-syndicate-pyke-syndicate-footsoldier'] * 3, 9)

    def test_property_and_keyword_sources_without_legacy_pool_bonus(self):
        host = 'empire-veers'
        corps = 'mercenary-pyke-syndicate-pyke-syndicate-footsoldier'
        upgrade = self.upgrades['command-underworld']
        for value in [
            {'keywords': [{'id': 'allies_of_convenience'}], 'rules': {}},
            {'keywords': [], 'rules': {'addProperties': [[{'property': 'keywords', 'value': [118]}]]}},
            {'keywords': [], 'rules': {'poolBonuses': ['extraMercenary']}},
        ]:
            with self.subTest(value=value):
                upgrade.update(value)
                self.check([host, corps, corps, corps], upgrades={0: [
                    {'upgradeId': upgrade['id'], 'instanceId': 'uc', 'slotIndex': 0}]})
                self.check([host, corps, corps, corps], expected=1)


if __name__ == '__main__':
    unittest.main()
