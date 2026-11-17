import copy
import unittest
from unittest.mock import patch

import rules
from rule_schema import validate_rules
from unit_identity import rewrite_references


class LocalUpgradeHostsTest(unittest.TestCase):
    def setUp(self):
        self.units, self.upgrades, self.defs = rules.load_cards()
        self.pkg = rules.load_package()
        self.base = self.units['empire-stormtroopers']
        self.host = copy.deepcopy(self.base)
        self.host['id'] = 'test-local-mudtroopers'
        self.host.pop('upstream', None)
        self.units[self.host['id']] = self.host
        self.card = self.upgrades['gear-binoculars']
        self.card['rules']['availableIn'] = [{'kind': 'unit', 'id': self.host['id']}]

    def allowed(self, host):
        return not any(status == 'invalid' for status, _, _ in rules.upgrade_eligibility(
            self.card, host, {'armyId': 2}, self.pkg, self.defs,
            rules.build_name_index(self.upgrades, self.defs)))

    def test_local_ids_work_in_candidates_and_saved_roster_validation(self):
        candidates = {c['upgradeId']: c for c in rules.query_candidates(
            self.host['id'], self.pkg, self.units, self.upgrades, 2)}
        self.assertTrue(candidates[self.card['id']]['available'])
        inst = {'unitId': self.host['id'], 'instanceId': 'local-host', 'upgrades': []}
        slots = rules.slot_list_for(self.pkg, self.host, inst, self.upgrades, 2)
        inst['upgrades'] = [{'upgradeId': self.card['id'], 'instanceId': 'selected-card',
                             'slotIndex': next(i for i, s in enumerate(slots) if s['key'] == 'gear')}]
        with patch('rules.load_cards', return_value=(self.units, self.upgrades, self.defs)), \
                patch('rules.load_package', return_value=self.pkg):
            report = rules.validate_army({'armyId': 2, 'mode': 'standard', 'units': [inst], 'commandIds': []})
        self.assertFalse(any(i['status'] == 'invalid' and i['instanceId'] == 'selected-card' for i in report['issues']))

    def test_explicit_local_targets_override_legacy_hosts_and_cannot_be_bypassed(self):
        self.pkg['upgradeRules'][self.card['upstream']['id']] = {'host': [self.base['upstream']['id']]}
        self.card['restrictions']['condition'] = {'field': 'unit.unitTypeId', 'op': 'eq', 'value': self.base['unitTypeId']}
        self.assertTrue(self.allowed(self.host))
        self.assertFalse(self.allowed(self.base))
        self.assertFalse(self.allowed({**self.host, 'id': 'other-local-id'}))
        self.card['rules']['availableIn'].append(self.base['upstream']['id'])
        self.assertTrue(self.allowed(self.base))
        self.pkg['upgradeRules'].pop(self.card['upstream']['id'])
        self.card['rules']['availableIn'] = [self.base['upstream']['id']]
        self.card['restrictions']['condition'] = None
        self.assertFalse(self.allowed(self.host))
        self.assertTrue(self.allowed(self.base))
        self.card['rules']['availableIn'] = []
        self.assertTrue(self.allowed(self.host))

    def test_local_refs_validate_and_follow_unit_id_renames(self):
        validate_rules(self.card['rules'])
        renamed = rewrite_references(self.card, self.host['id'], 'renamed-host')
        self.assertEqual(renamed['rules']['availableIn'], [{'kind': 'unit', 'id': 'renamed-host'}])
        for target in [{'kind': 'source', 'id': '12'}, {'kind': 'unit', 'id': 12}, {'kind': 'unit'}, None]:
            with self.subTest(target=target), self.assertRaises(ValueError):
                validate_rules({'availableIn': [target]})

    def test_slot_grant_local_hosts_and_legacy_ids_share_or_semantics(self):
        card = self.upgrades['training-imperial-march']
        grant = card['rules']['slotGrants'][0]
        grant.pop('condition', None)
        grant['holders'] = [{'kind': 'unit', 'id': self.host['id']}, self.base['upstream']['id']]
        validate_rules(card['rules'])
        granted = lambda host: any(g['upgradeId'] == card['id'] for g in
                                  rules.slot_grants_for(self.pkg, host, {}, self.upgrades)[1])
        self.assertTrue(granted(self.host))
        self.assertTrue(granted(self.base))
        self.assertFalse(granted({**self.host, 'id': 'unlisted-local'}))
        renamed = rewrite_references(card, self.host['id'], 'renamed-host')
        self.assertEqual(renamed['rules']['slotGrants'][0]['holders'][0]['id'], 'renamed-host')
        grant['condition'] = {'field': 'unit.factionId', 'op': 'eq', 'value': 1}
        self.assertFalse(granted(self.host), 'an explicit condition still takes precedence')
        with self.assertRaises(ValueError):
            validate_rules({'slotGrants': [{'holders': [{'kind': 'unit'}]}]})

    def test_legacy_source_groups_are_preserved_by_validation(self):
        validate_rules({'availableIn': [5, {'all': [{'in': 7, 'propertyName': 'factions'}]},
                                       {'kind': 'unit', 'id': self.host['id']}]})


if __name__ == '__main__':
    unittest.main()
