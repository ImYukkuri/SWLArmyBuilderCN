import copy
import unittest
from unittest.mock import patch

import rules


class ImperialMarchTest(unittest.TestCase):
    def setUp(self):
        self.units, self.upgrades, self.defs = rules.load_cards()
        self.pkg = rules.load_package()
        self.card = self.upgrades['training-imperial-march']
        self.host = copy.deepcopy(self.units['empire-stormtroopers'])
        self.host.update(id='future-local-corps', name={'en': 'Future Corps', 'zh': '新核心单位'})
        self.host.pop('upstream', None)
        self.units[self.host['id']] = self.host

    def test_all_local_empire_corps_and_future_units_match_without_a_whitelist(self):
        grant = self.card['rules']['slotGrants'][0]
        self.assertNotIn('holders', grant)
        self.assertEqual(grant['condition'], self.card['restrictions']['condition'])
        for unit in self.units.values():
            if unit.get('factionId') != 2 or rules.army_rank(unit, 2, self.pkg, self.defs, self.units) != 2:
                continue
            with self.subTest(unit=unit['id']):
                candidates = {c['upgradeId']: c for c in rules.query_candidates(
                    unit['id'], self.pkg, self.units, self.upgrades, 2)}
                self.assertTrue(candidates[self.card['id']]['available'])

    def test_training_and_special_slots_candidates_and_saved_validation_agree(self):
        for has_training in [False, True]:
            with self.subTest(training=has_training):
                self.host['upgradeSlots'] = [10] if has_training else []
                inst = {'unitId': self.host['id'], 'instanceId': 'test-host', 'upgrades': []}
                slots = rules.slot_list_for(self.pkg, self.host, inst, self.upgrades, 2)
                key = 'training' if has_training else 'special:' + self.card['id']
                self.assertEqual(any(s['key'] == 'special:' + self.card['id'] for s in slots), not has_training)
                candidates = {c['upgradeId']: c for c in rules.query_candidates(
                    self.host['id'], self.pkg, self.units, self.upgrades, 2)}
                self.assertTrue(candidates[self.card['id']]['available'])
                self.assertEqual(candidates[self.card['id']]['matchedSlots'], [key])
                inst['upgrades'] = [{'upgradeId': self.card['id'], 'instanceId': 'test-card',
                                     'slotIndex': next(i for i, s in enumerate(slots) if s['key'] == key)}]
                with patch('rules.load_cards', return_value=(self.units, self.upgrades, self.defs)), \
                        patch('rules.load_package', return_value=self.pkg):
                    report = rules.validate_army({'armyId': 2, 'mode': 'standard', 'units': [inst], 'commandIds': []})
                self.assertFalse(any(i['status'] == 'invalid' and i['instanceId'] == 'test-card' for i in report['issues']))

    def test_other_factions_ranks_and_battleforce_bans_are_excluded(self):
        for faction, rank in [(1, 2), (2, 4)]:
            self.host.update(factionId=faction, rankId=rank, upgradeSlots=[])
            slots = rules.slot_list_for(self.pkg, self.host, {}, self.upgrades, 2)
            self.assertNotIn('special:' + self.card['id'], [s['key'] for s in slots])
            issues = rules.upgrade_eligibility(self.card, self.host, {'armyId': 2}, self.pkg, self.defs, {})
            self.assertTrue(any(i[0] == 'invalid' for i in issues))
        self.host.update(factionId=2, rankId=2)
        self.pkg['armyOverrides']['2'] = {'slots': [{'op': 'deny', 'slot': 'training'}]}
        self.assertNotIn('special:' + self.card['id'], [s['key'] for s in
                         rules.slot_list_for(self.pkg, self.host, {}, self.upgrades, 2)])


if __name__ == '__main__':
    unittest.main()
