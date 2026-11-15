import copy
import json
import unittest

import maintenance_store as store


class ActionTypesTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.keywords = {k['id']: k for k in json.loads(
            (store.ROOT / 'data/catalog-definitions.json').read_bytes())['keywords']}
        cls.upgrades = {c['id']: c for c in json.loads(
            (store.ROOT / 'data/upgrades.json').read_bytes())['cards']}

    def test_every_record_and_printed_face_has_a_valid_explicit_classification(self):
        for kind, records in [('keywords', self.keywords), ('upgrades', self.upgrades)]:
            for record in records.values():
                with self.subTest(kind=kind, id=record['id']):
                    self.assertIn('actionTypes', record)
                    store.validate(kind, record)
                    if record.get('dualSided'):
                        self.assertIn('actionTypes', record['back'])
                        store.validate_action_types(record['back'])

    def test_costs_counterparts_and_unknown_records_are_distinct(self):
        expected = {
            'gear-binoculars': ['action'],
            'armament-din-djarin-rifle': ['double-action'],
            '21b-medical-droid': ['free-action'],
            'force-push': ['free-exhaust'],
            'imperial-probe-droid': ['free-exhaust'],
            'grenade-smoke': ['free-action'],
            'upstream-131': ['action', 'free-action'],
            'upstream-167': ['free-action'],
            'upstream-23984': None,
        }
        for key, types in expected.items():
            with self.subTest(id=key):
                self.assertEqual(self.upgrades[key]['actionTypes'], types)
        self.assertEqual(self.keywords['jump']['actionTypes'], ['action', 'free-action'])
        self.assertEqual(self.keywords['observe']['actionTypes'], ['action', 'free-action', 'free-exhaust'])
        self.assertIsNone(self.keywords['pending_forrce']['actionTypes'])

    def test_reactive_effects_and_ordinary_weapons_do_not_become_card_actions(self):
        for key in ['helping-hand', 'logistical-prowess', 'training-strike-and-fade',
                    'force-barrier', 'clone-rex', 'aa5-heavy-laser']:
            with self.subTest(upgrade=key):
                self.assertEqual(self.upgrades[key]['actionTypes'], [])
        for key in ['charge', 'relentless', 'tactical', 'scout', 'noncombatant', 'reconfigure']:
            with self.subTest(keyword=key):
                self.assertEqual(self.keywords[key]['actionTypes'], [])
        for card in self.upgrades.values():
            if card.get('dualSided'):
                self.assertEqual(card['actionTypes'], [])
                self.assertEqual(card['back']['actionTypes'], [])

    def test_invalid_fields_are_rejected_on_keywords_and_both_upgrade_faces(self):
        for kind, source in [('keywords', self.keywords['jump']),
                             ('upgrades', self.upgrades['e-11d-focused-fire'])]:
            for side in ['front'] + (['back'] if kind == 'upgrades' else []):
                for value in [True, 'action', {}, ['unknown'], ['action', 'action'], [None], [{}]]:
                    with self.subTest(kind=kind, side=side, value=value):
                        record = copy.deepcopy(source)
                        target = record if side == 'front' else record['back']
                        target['actionTypes'] = value
                        with self.assertRaisesRegex(ValueError, 'actionTypes'):
                            store.validate(kind, record)
                for value in [None, [], ['action', 'free-action']]:
                    record = copy.deepcopy(source)
                    target = record if side == 'front' else record['back']
                    target['actionTypes'] = value
                    store.validate(kind, record)
                    del target['actionTypes']  # Old snapshots remain restorable.
                    store.validate(kind, record)


if __name__ == '__main__':
    unittest.main()
