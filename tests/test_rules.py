import copy
import unittest
from unittest.mock import patch
import rules


class FlexibleResponseTest(unittest.TestCase):
    def setUp(self):
        self.units, self.upgrades, self.defs = rules.load_cards()
        self.pkg = rules.load_package()

    def test_minimum_preserves_printed_slots_and_ordinary_modifiers(self):
        unit = self.units['rebels-guerilla-troopers']
        grant = {'id': 'test-grant', 'slotIds': [4], 'rules': {'slotTypes': [4], 'slotGrants': [
            {'trigger': 'equipped', 'slot': 'heavy_weapon'},
            {'trigger': 'equipped', 'slot': 'heavy_weapon'},
            {'trigger': 'equipped', 'slot': 'force'},
            {'trigger': 'unitQualifies', 'slot': 'heavy_weapon',
             'condition': {'field': 'unit.id', 'value': unit['id']}},
        ]}}
        self.upgrades[grant['id']] = grant
        inst = {'unitId': unit['id'], 'instanceId': 'flex', 'upgrades': []}
        slots = lambda: rules.slot_list_for(self.pkg, unit, inst, self.upgrades, 1)
        for count, base in [(0,[4,4,2]), (1,[4,4,2]), (2,[2]), (2,[4,10,4,2,4]), (3,[4,2])]:
            with self.subTest(count=count, base=base):
                unit['keywords'] = [{'id': 'flexible_response', 'value': count}]
                unit['upgradeSlots'] = base
                inst['upgrades'] = []
                self.pkg['armyOverrides']['1'] = {}
                before = slots()
                self.assertEqual(sum(s['key'] == 'heavy_weapon' for s in before), max(count, base.count(4)))
                self.assertEqual(sum(bool(s.get('required')) for s in before), count)
                inst['upgrades'] = [{'upgradeId': grant['id'], 'slotIndex': 0}]
                after = slots()
                heavy = [s for s in after if s['key'] == 'heavy_weapon']
                granted, qualified = rules.slot_grants_for(self.pkg, unit, inst, self.upgrades)
                self.assertEqual(sum(s['key'] == 'heavy_weapon' for s in granted), 2)
                self.assertEqual(sum(s['key'] == 'heavy_weapon' for s in qualified), 1)
                self.assertEqual(len(heavy), max(count, base.count(4)) + 2)
                self.assertEqual(sum(bool(s.get('required')) for s in heavy), count)
                self.assertEqual(after[:len(before)], before)
                self.assertEqual(after[-1]['key'], 'force')
                self.pkg['armyOverrides']['1'] = {'slots': [
                    {'op': 'deny', 'slot': 'heavy_weapon'}, {'op': 'add', 'slot': 'heavy_weapon'}]}
                self.assertEqual(sum(s['key'] == 'heavy_weapon' for s in slots()), 1)
                self.pkg['armyOverrides']['1']['slots'].pop()
                self.assertFalse(any(s['key'] == 'heavy_weapon' for s in slots()))
        unit['keywords'] = []
        granted, qualified = rules.slot_grants_for(self.pkg, unit, inst, self.upgrades)
        self.assertEqual(sum(s['key'] == 'heavy_weapon' for s in granted), 2)
        self.assertEqual(sum(s['key'] == 'heavy_weapon' for s in qualified), 1)

    def test_jyn_adds_third_slot_without_moving_training_and_any_two_suffice(self):
        unit = self.units['rebels-guerilla-troopers']
        inst = {'unitId': unit['id'], 'instanceId': 'jyn-flex', 'upgrades': []}
        slots = lambda: rules.slot_list_for(self.pkg, unit, inst, self.upgrades, 1)
        before = slots()
        for index, card in [(2,'training-offensive'), (0,'jyn-erso'), (len(before),'upstream-23948')]:
            inst['upgrades'].append({'upgradeId': card, 'slotIndex': index, 'instanceId': card})
        self.assertEqual(len(slots()), len(before) + 1)
        self.assertEqual(slots()[-1]['addedBy'], 'jyn-erso')
        self.assertFalse(slots()[1]['required'])
        self.assertTrue(slots()[-1]['required'])
        self.assertEqual(slots()[2], before[2])
        army = {'armyId': 1, 'mode': 'standard', 'pointsLimit': 1000,
                'units': [inst], 'commandIds': [], 'options': []}
        self.assertFalse(any(i['code'].startswith('slot_') or i['code'] == 'required_slot'
                             for i in rules.validate_army(army)['issues']))
        inst['upgrades'] = [c for c in inst['upgrades'] if c['upgradeId'] != 'jyn-erso']
        self.assertEqual(slots(), before)
        codes = [i['code'] for i in rules.validate_army(army)['issues']]
        self.assertIn('required_slot', codes)
        self.assertIn('slot_missing', codes)

    def test_missing_upgrades_extra_legal_upgrade_invalid_import_and_invalid_x(self):
        unit = self.units['empire-stormtroopers']
        unit['keywords'].append({'id': 'flexible_response', 'value': 2})
        unit['upgradeSlots'] = [4,4,1,2]
        grant = self.upgrades['stormtrooper-squad']
        grant['rules']['slotGrants'] = [{'trigger': 'equipped', 'slot': 'heavy_weapon'}]
        inst = {'unitId': unit['id'], 'instanceId': 'flex', 'upgrades': []}
        army = {'armyId': 2, 'mode': 'standard', 'pointsLimit': 1000,
                'units': [inst], 'commandIds': [], 'options': []}
        with patch.object(rules, 'load_cards', return_value=(self.units, self.upgrades, self.defs)), \
                patch.object(rules, 'load_package', return_value=self.pkg):
            report = lambda: rules.validate_army(army)
            for index, card in enumerate(['stormtrooper-dlt19','stormtrooper-hh12','stormtrooper-squad']):
                self.assertEqual(sum(i['code'] == 'required_slot' for i in report()['issues']), max(2-index,0))
                inst['upgrades'].append({'instanceId': str(index), 'upgradeId': card, 'slotIndex': index})
            self.assertFalse(any(i['code'].startswith(('slot_', 'flexible_response')) for i in report()['issues']))
            inst['upgrades'].append({'instanceId': 'extra', 'upgradeId': 'del-meeko', 'slotIndex': 4})
            self.assertFalse(any(i['code'].startswith(('slot_', 'flexible_response', 'required_slot')) for i in report()['issues']))
            inst['upgrades'][-1]['slotIndex'] = 99
            before = copy.deepcopy(army)
            codes = [i['code'] for i in report()['issues']]
            self.assertNotIn('flexible_response_limit', codes)
            self.assertIn('slot_missing', codes)
            self.assertEqual(army, before)
            self.pkg['armyOverrides']['2'] = {'slots': [{'op': 'deny', 'slot': 'heavy_weapon'}]}
            self.assertTrue(any(i['code'] == 'required_slot' and '可用槽位不足' in i['message'] for i in report()['issues']))
            for value in [None, '2', -1, 1.5, True]:
                unit['keywords'][-1]['value'] = value
                self.assertIn('flexible_response_value', [i['code'] for i in report()['issues']])


class EvaluateTest(unittest.TestCase):
    def test_all_and_any_three_valued(self):
        ctx = {"unit": {"defenseDie": "white", "unitTypeId": 1}}
        self.assertIs(rules.evaluate({"all": [{"field": "unit.defenseDie", "op": "eq", "value": "white"},
                                             {"field": "unit.unitTypeId", "op": "in", "value": [1, 4]}]}, ctx), True)
        self.assertIs(rules.evaluate({"all": [{"field": "unit.defenseDie", "op": "eq", "value": "white"},
                                             {"field": "unit.missing", "op": "eq", "value": 1}]}, ctx), None)
        self.assertIs(rules.evaluate({"any": [{"field": "unit.defenseDie", "op": "eq", "value": "red"},
                                             {"field": "unit.unitTypeId", "op": "eq", "value": 1}]}, ctx), True)
        self.assertIs(rules.evaluate({"not": {"field": "unit.defenseDie", "op": "eq", "value": "red"}}, ctx), True)


class SlotRegistryTest(unittest.TestCase):
    def setUp(self):
        self.pkg = rules.load_package()

    def test_semantic_registry(self):
        self.assertEqual(self.pkg["schema"], "swl-rules/v1")
        self.assertEqual(len(self.pkg["slots"]), 29)
        kinds = {s["kind"] for s in self.pkg["slots"]}
        self.assertEqual(kinds, {"category", "counterpart", "dedicated"})
        self.assertEqual(rules.slot_key(self.pkg, 2), "gear")
        self.assertEqual(rules.slot_key(self.pkg, 16), "electrobinoculars")
        self.assertEqual(rules.slot_key(self.pkg, 26), "hit_the_dirt")

    def test_dedicated_grants_present(self):
        _, upgrades, _ = rules.load_cards()
        hit = upgrades["hit-the-dirt"]["rules"]["slotGrants"]
        self.assertTrue(any(g.get("trigger") == "unitQualifies" for g in hit))
        binoc = upgrades["gear-binoculars"]["rules"]["slotGrants"]
        self.assertTrue(any(g.get("trigger") == "unitQualifies" for g in binoc))

    def test_kallus_grants_heavy_weapon_including_flexible_response_hosts(self):
        units, upgrades, _ = rules.load_cards()
        fixed = next(u for u in units.values() if u.get('factionId') == 2 and
                     any(k.get('id') == 'flexible_response' for k in u.get('keywords', [])))
        for unit in [units['empire-death-troopers'], units['empire-stormtroopers'], fixed]:
            with self.subTest(unit=unit['id']):
                inst = {'unitId': unit['id'], 'upgrades': []}
                before = rules.slot_list_for(self.pkg, unit, inst, upgrades, 2)
                slot = next(i for i, s in enumerate(before) if s['key'] == 'heavy_weapon')
                inst['upgrades'] = [{'upgradeId': 'kallus', 'slotIndex': slot}]
                after = rules.slot_list_for(self.pkg, unit, inst, upgrades, 2)
                self.assertEqual(len(after), len(before) + 1)
                self.assertEqual([s for s in after if s.get('addedBy') == 'kallus'],
                                 [{'key': 'heavy_weapon', 'addedBy': 'kallus'}])


class ValidateArmyTest(unittest.TestCase):
    def test_equip_slot_targets_accept_either_duplicate_slot_and_report_removal(self):
        units,upgrades,defs=rules.load_cards();package=rules.load_package()
        unit=units['empire-stormtroopers'];unit['upgradeSlots']=[2,2,10]
        unit['equipSlotIds']=['gear','training'];unit['equipUpgradeIds']=[]
        inst={'unitId':unit['id'],'instanceId':'slot-equip','upgrades':[]}
        army={'mode':'standard','armyId':2,'pointsLimit':1000,'units':[inst],'commandIds':[],'options':[]}
        with patch('rules.load_cards',return_value=(units,upgrades,defs)),patch('rules.load_package',return_value=package):
            missing=lambda:[i for i in rules.validate_army(army)['issues'] if i['code']=='required_slot']
            self.assertEqual(len(missing()),2)
            inst['upgrades']=[{'instanceId':'g','upgradeId':'gear-binoculars','slotIndex':1}]
            self.assertEqual(len(missing()),1)
            slots=rules.slot_list_for(package,unit,inst,upgrades,2)
            self.assertFalse(slots[0]['required']);self.assertTrue(slots[1]['equipRequired'])
            inst['upgrades'].append({'instanceId':'t','upgradeId':'training-tenacity','slotIndex':2})
            self.assertEqual(len(missing()),0)
            inst['upgrades']=[];self.assertEqual(len(missing()),2)
            package['armyOverrides']['2']={'slots':[{'op':'deny','slot':'training'}]}
            self.assertTrue(any('没有可用' in i['message'] for i in missing()))

    def test_equip_legacy_text_refs_and_explicit_empty_targets(self):
        pkg=rules.load_package()
        for parameter in ['Equip: Doctrine，Armament','学说、武装','doctrine; armament']:
            self.assertEqual(rules.equip_slot_keys({'keywords':[{'id':'equip','parameter':parameter}]},pkg),['doctrine','armament'])
        self.assertEqual(rules.equip_slot_keys({'keywords':[{'id':'equip','parameterRef':{'kind':'slot','id':24}}]},pkg),['doctrine'])
        self.assertEqual(rules.equip_slot_keys({'equipSlotIds':[],'keywords':[{'id':'equip','parameter':'Doctrine'}]},pkg),[])

    def test_missing_equip_is_reported_once_per_card(self):
        units, _, _ = rules.load_cards()
        for unit in units.values():
            ids = unit.get('equipUpgradeIds', [])
            if not ids:
                continue
            army = {'mode': 'standard', 'armyId': unit['factions'][0]['id'], 'pointsLimit': 1000,
                    'units': [{'instanceId': 'equip', 'unitId': unit['id'], 'upgrades': []}],
                    'commandIds': [], 'options': []}
            with self.subTest(unit=unit['id']):
                missing = [i for i in rules.validate_army(army)['issues'] if i['code'] == 'required_child_missing']
                self.assertEqual(len(missing), len(ids))

    def test_b1_electrobinoculars_matches_slot(self):
        army = {"mode": "standard", "armyId": 5, "pointsLimit": 1000, "units": [
            {"instanceId": "u1", "unitId": "separatists-b1", "upgrades": [
                {"instanceId": "c1", "upgradeId": "gear-binoculars", "slotIndex": 3}]}],
            "commandIds": [], "options": []}
        report = rules.validate_army(army)
        codes = [i["code"] for i in report["issues"]]
        self.assertNotIn("slot_mismatch", codes)

    def test_b1_hit_the_dirt_rejected(self):
        army = {"mode": "standard", "armyId": 5, "pointsLimit": 1000, "units": [
            {"instanceId": "u1", "unitId": "separatists-b1", "upgrades": [
                {"instanceId": "c1", "upgradeId": "hit-the-dirt", "slotIndex": 0}]}],
            "commandIds": [], "options": []}
        report = rules.validate_army(army)
        self.assertIn("slot_mismatch", [i["code"] for i in report["issues"]])

    def test_allowed_units_override_by_rank(self):
        import copy
        units, _, defs = rules.load_cards()
        pkg = copy.deepcopy(rules.load_package())
        self.assertEqual(rules.army_rank(units["empire-stormtroopers"], 7, pkg, defs, units), 2)
        pkg.setdefault("battleForces", {}).setdefault("7", {})["allowedUnits"] = {"2": ["Stormtroopers"]}
        self.assertEqual(rules.army_rank(units["empire-stormtroopers"], 7, pkg, defs, units), 2)
        self.assertIsNone(rules.army_rank(units["empire-shoretroopers"], 7, pkg, defs, units))

    def test_slot_host_relaxation_respects_variants(self):
        import copy
        units, upgrades, defs = rules.load_cards()
        pkg = copy.deepcopy(rules.load_package())
        name_index = rules.build_name_index(upgrades, defs)

        def codes(card_id, unit_id, army_id):
            issues = rules.upgrade_eligibility(upgrades[card_id], units[unit_id],
                                               {"armyId": army_id}, pkg, defs, name_index)
            return {c for status, c, _ in issues if status == "invalid"}

        # "Scout Troopers, Strike Team Only" must stay locked to the variant
        self.assertIn("host_restriction", codes("dlt19x-scout", "empire-stormtroopers", 7))
        self.assertNotIn("host_restriction", codes("dlt19x-scout", "empire-scout-strike", 7))
        # Imperial Remnant relaxes the four plain host requirements only
        self.assertNotIn("host_restriction", codes("shore-t21b", "empire-stormtroopers", 7))
        self.assertNotIn("host_restriction", codes("dlt-19d", "empire-stormtroopers", 7))
        # ...and only inside that battle force
        self.assertIn("host_restriction", codes("shore-t21b", "empire-stormtroopers", 2))

    def test_bo_katan_darksaber_host_ok(self):
        army = {"mode": "standard", "armyId": 8, "pointsLimit": 1000, "units": [
            {"instanceId": "u1", "unitId": "mercenary-clan-kryze-bo-katan-kryze", "upgrades": [
                {"instanceId": "c1", "upgradeId": "bo-katan-darksaber", "slotIndex": 5}]}],
            "commandIds": [], "options": []}
        report = rules.validate_army(army)
        codes = [i["code"] for i in report["issues"]]
        self.assertNotIn("host_restriction", codes)
        self.assertNotIn("slot_mismatch", codes)

    def test_rank_minimum_reported_for_incomplete_army(self):
        army = {"mode": "standard", "armyId": 1, "pointsLimit": 1000, "units": [], "commandIds": [], "options": []}
        report = rules.validate_army(army)
        self.assertEqual(report["status"], "invalid")
        self.assertIn("rank_min", [i["code"] for i in report["issues"]])

    def test_battle_force_applies_own_quotas(self):
        pkg = rules.load_package()
        self.assertIn("battleForces", pkg)
        self.assertIn("7", pkg["battleForces"])
        army = {"mode": "standard", "armyId": 7, "pointsLimit": 1000, "units": [], "commandIds": [], "options": []}
        report = rules.validate_army(army)
        codes = [i["code"] for i in report["issues"]]
        self.assertIn("rank_min", codes)
        # unknown note only when the battle force still has unparsed rule text
        bf = pkg["battleForces"]["7"]
        self.assertEqual("battle_force_rules" in codes, bool(bf.get("unparsedRules")))

    def test_battle_force_machine_rules(self):
        units = rules.load_cards()[0]
        storm = next(u for u in units.values() if (u.get("name") or {}).get("en") == "Stormtroopers")
        army = {"mode": "standard", "armyId": 17, "pointsLimit": 1500, "units": [
            {"instanceId": f"s{i}", "unitId": storm["id"], "upgrades": []} for i in range(3)],
            "commandIds": [], "options": []}
        codes = [i["code"] for i in rules.validate_army(army)["issues"]]
        self.assertIn("unit_limit_exceeded", codes)
        banned = {"mode": "standard", "armyId": 17, "pointsLimit": 1500, "units": [
            {"instanceId": "u1", "unitId": storm["id"], "upgrades": [
                {"instanceId": "c1", "upgradeId": "aayla", "slotIndex": 1}]}],
            "commandIds": [], "options": []}
        self.assertIn("army_keyword_banned", [i["code"] for i in rules.validate_army(banned)["issues"]])

    def test_hit_the_dirt_condition_grants_qualifying_non_holder(self):
        pkg = rules.load_package()
        units = rules.load_cards()[0]
        scout = units["empire-scout"]
        self.assertEqual(scout["stats"]["defenseDie"], "white")
        grants = rules.dedicated_slot_keys(pkg, scout)
        self.assertTrue(any(g["key"] == "training_exempt" for g in grants))
        b1 = units["separatists-b1"]
        self.assertFalse(any(g["key"] == "training_exempt" for g in rules.dedicated_slot_keys(pkg, b1)))

    def test_dug_in_eligibility_and_slots_follow_printed_or_condition(self):
        pkg = rules.load_package()
        units, upgrades, defs = rules.load_cards()
        card = upgrades['training-dug-in']
        name_index = rules.build_name_index(upgrades, defs)
        for unit in units.values():
            expected = unit.get('unitSubtypeId') == 'emplacement_trooper' or (
                unit.get('unitCategoryId') == 'trooper' and
                any(k['id'] == 'prepared_position' for k in unit.get('keywords', [])))
            army_id = (unit.get('factions') or [{}])[0].get('id', unit.get('factionId'))
            with self.subTest(unit=unit['id']):
                issues = rules.upgrade_eligibility(card, unit, {'armyId': army_id}, pkg, defs, name_index)
                self.assertEqual(not any(i[0] == 'invalid' for i in issues), expected)
                slots = rules.slot_list_for(pkg, unit, {'upgrades': []}, upgrades, army_id)
                self.assertEqual(any(s['key'] == 'special:training-dug-in' for s in slots),
                                 expected and not any(s['key'] == 'training' for s in slots))
        host = copy.deepcopy(units['rebels-rebel-veterans'])
        host['upgradeSlots'] = [s for s in host['upgradeSlots']
                                if (s.get('id') if isinstance(s, dict) else s) != 10]
        slots = rules.slot_list_for(pkg, host, {'upgrades': []}, upgrades, 1)
        self.assertTrue(any(s['key'] == 'special:training-dug-in' for s in slots))
        host['keywords'] = [k for k in host['keywords'] if k['id'] != 'prepared_position']
        slots = rules.slot_list_for(pkg, host, {'upgrades': []}, upgrades, 1)
        self.assertFalse(any(s['key'] == 'special:training-dug-in' for s in slots))

    def test_ordinary_candidates_use_exempt_category_when_legacy_access_omits_it(self):
        pkg = rules.load_package()
        units, upgrades, defs = rules.load_cards()
        card = upgrades['training-dug-in']
        card['slotIds'] = [23, 27]
        for override in [False, True]:
            with self.subTest(override=override):
                if override:
                    pkg['upgradeRules'][card['upstream']['id']] = {'access': [{'slot': 'training_exempt'}]}
                for unit_id, available in [('rebels-rebel-veterans', True), ('empire-scout', False)]:
                    candidates = {c['upgradeId']: c for c in rules.query_candidates(unit_id, pkg, units, upgrades)}
                    self.assertEqual(candidates[card['id']]['matchedSlots'], ['training'])
                    self.assertEqual(candidates[card['id']]['available'], available)
                host = units['rebels-rebel-veterans']
                inst = {'unitId': host['id'], 'instanceId': 'veterans', 'upgrades': []}
                slots = rules.slot_list_for(pkg, host, inst, upgrades, 1)
                self.assertFalse(any(s['key'] == 'special:' + card['id'] for s in slots))
                inst['upgrades'] = [{'upgradeId': card['id'], 'instanceId': 'dug-in',
                                     'slotIndex': next(i for i, s in enumerate(slots) if s['key'] == 'training')}]
                army = {'armyId': 1, 'mode': 'standard', 'units': [inst], 'commandIds': []}
                with patch('rules.load_cards', return_value=(units, upgrades, defs)), \
                        patch('rules.load_package', return_value=pkg):
                    self.assertNotIn('slot_mismatch', [i['code'] for i in rules.validate_army(army)['issues']])

    def test_training_exempt_slot_not_granted_when_training_slot_exists(self):
        # empire-scout already has a training slot, so no virtual training slot.
        army = {"mode": "standard", "armyId": 2, "pointsLimit": 1000, "units": [
            {"instanceId": "u1", "unitId": "empire-scout", "upgrades": []}],
            "commandIds": [], "options": []}
        report = rules.validate_army(army)
        self.assertNotIn("dedicated_grant_virtual", [i["code"] for i in report["issues"]])

    def test_independent_training_special_slots_accept_both_effect_cards(self):
        army = {"mode": "standard", "armyId": 1, "pointsLimit": 1000, "units": [
            {"instanceId": "u1", "unitId": "rebels-mark-2-blaster", "upgrades": [
                {"instanceId": "c1", "upgradeId": "hit-the-dirt", "slotIndex": 1},
                {"instanceId": "c2", "upgradeId": "training-dug-in", "slotIndex": 2}]}],
            "commandIds": [], "options": []}
        report = rules.validate_army(army)
        codes = [i["code"] for i in report["issues"]]
        self.assertNotIn("slot_mismatch", codes)
        self.assertNotIn("slot_missing", codes)
        self.assertNotIn("slot_occupied", codes)
        self.assertNotIn("dedicated_grant_virtual", codes)

    def test_special_slot_cannot_accept_a_different_effect_card(self):
        army = {"mode": "standard", "armyId": 1, "pointsLimit": 1000, "units": [
            {"instanceId": "u1", "unitId": "rebels-mark-2-blaster", "upgrades": [
                {"instanceId": "c1", "upgradeId": "training-dug-in", "slotIndex": 1},
                {"instanceId": "c2", "upgradeId": "hit-the-dirt", "slotIndex": 2}]}],
            "commandIds": [], "options": []}
        report = rules.validate_army(army)
        self.assertEqual(2, [i["code"] for i in report["issues"]].count("slot_mismatch"))

    def test_b1_independent_special_slots_and_candidate_query_agree(self):
        units, upgrades, _ = rules.load_cards()
        pkg = rules.load_package()
        unit = units['separatists-b1']
        slots = rules.slot_list_for(pkg, unit, {'upgrades': []}, upgrades, 5)
        self.assertEqual(['special:gear-binoculars', 'special:gear-portable'],
                         [s['key'] for s in slots if s.get('virtual')])
        candidates = {c['upgradeId']: c for c in rules.query_candidates(unit['id'], pkg, units, upgrades, 5)}
        for card in ['gear-binoculars', 'gear-portable']:
            self.assertTrue(candidates[card]['available'])
            self.assertEqual(['special:' + card], candidates[card]['matchedSlots'])
        unit['upgradeSlots'].append(2)
        occupied = {'upgrades': [{'upgradeId': 'gear-portable', 'slotIndex': 3}]}
        self.assertFalse(any(s.get('virtual') for s in rules.slot_list_for(pkg, unit, occupied, upgrades, 5)))
        candidates = {c['upgradeId']: c for c in rules.query_candidates(unit['id'], pkg, units, upgrades, 5)}
        for card in ['gear-binoculars', 'gear-portable']:
            self.assertEqual(['gear'], candidates[card]['matchedSlots'])

    def test_special_slots_honor_restrictions_and_battleforce_categories(self):
        units, upgrades, _ = rules.load_cards()
        pkg = rules.load_package()
        unit = units['separatists-b1']
        slots = lambda: rules.slot_list_for(pkg, unit, {'upgrades': []}, upgrades, 5)
        upgrades['gear-binoculars']['restrictions']['condition'] = {'field': 'unit.factionId', 'value': 1}
        self.assertEqual(['special:gear-portable'], [s['key'] for s in slots() if s.get('virtual')])
        for operation in ['deny', 'add']:
            pkg['armyOverrides']['5'] = {'slots': [{'op': operation, 'slot': 'gear'}]}
            self.assertFalse(any(s.get('virtual') for s in slots()))

    def test_added_slot_absent_without_carrying_card(self):
        # B1 has 3 ordinary and 2 per-card slots; index 5 does not exist yet.
        army = {"mode": "standard", "armyId": 5, "pointsLimit": 1000, "units": [
            {"instanceId": "u1", "unitId": "separatists-b1", "upgrades": [
                {"instanceId": "c1", "upgradeId": "gear-binoculars", "slotIndex": 5}]}],
            "commandIds": [], "options": []}
        report = rules.validate_army(army)
        self.assertIn("slot_missing", [i["code"] for i in report["issues"]])

    def test_carried_upgrade_adds_slot(self):
        # carrying grievous-heavy appends one heavy_weapon slot (index 3);
        # B1's special Electrobinoculars slot moves to index 4.
        army = {"mode": "standard", "armyId": 5, "pointsLimit": 1000, "units": [
            {"instanceId": "u1", "unitId": "separatists-b1", "upgrades": [
                {"instanceId": "c0", "upgradeId": "grievous-heavy", "slotIndex": 0},
                {"instanceId": "c1", "upgradeId": "gear-binoculars", "slotIndex": 4}]}],
            "commandIds": [], "options": []}
        report = rules.validate_army(army)
        codes = [i["code"] for i in report["issues"]]
        self.assertNotIn("slot_missing", codes)
        self.assertNotIn("slot_mismatch", codes)

    def test_same_name_upgrade_not_twice_on_unit(self):
        # A unit may equip only one card of a given name, across all local versions.
        army = {"mode": "standard", "armyId": 2, "pointsLimit": 1000, "units": [
            {"instanceId": "u1", "unitId": "empire-scout", "upgrades": [
                {"instanceId": "c1", "upgradeId": "training-imperial-march", "slotIndex": 1},
                {"instanceId": "c2", "upgradeId": "upstream-19896", "slotIndex": 2}]}],
            "commandIds": [], "options": []}
        report = rules.validate_army(army)
        self.assertIn("local_duplicate_name", [i["code"] for i in report["issues"]])

    def test_eligibility_single_source_of_truth(self):
        # Candidate filtering (S2), validation (S1) and query_candidates (S8) must agree.
        pkg = rules.load_package()
        units, upgrades, defs = rules.load_cards()
        name_index = rules.build_name_index(upgrades, defs)
        elig_codes = {"host_restriction", "upgrade_faction", "unavailable_faction",
                      "required_properties", "restriction_condition", "division_restriction",
                      "requires_tier"}
        pairs = [
            ("empire-scout", "training-dug-in", 2),
            ("rebels-rebel-troopers", "axe-woves", 1),
            ("mercenary-clan-kryze-bo-katan-kryze", "axe-woves", 8),
            ("separatists-b1", "adaptive-combat-network", 5),
        ]
        for uid, cid, army_id in pairs:
            unit = units[uid]
            card = upgrades[cid]
            elig = {i[1] for i in rules.upgrade_eligibility(
                card, unit, {"armyId": army_id}, pkg, defs, name_index) if i[0] == "invalid"}
            army = {"mode": "standard", "armyId": army_id, "pointsLimit": 1000, "units": [
                {"instanceId": "u1", "unitId": uid,
                 "upgrades": [{"instanceId": "c1", "upgradeId": cid, "slotIndex": 0}]}],
                "commandIds": [], "options": []}
            got = {i["code"] for i in rules.validate_army(army)["issues"] if i["code"] in elig_codes}
            self.assertEqual(got, elig, (uid, cid))
            qc = {q["upgradeId"]: q for q in rules.query_candidates(uid, pkg, units, upgrades, army_id)}
            if elig:
                self.assertFalse(qc[cid]["available"], (uid, cid))

    def test_apply_property_effects(self):
        _, upgrades, defs = rules.load_cards()
        unit = {"keywords": [{"id": "trooper"}], "affiliationIds": ["1"]}
        aayla = upgrades["aayla"]
        eff = rules.apply_property_effects(unit, [aayla], defs)
        ids = {k["id"] for k in eff["keywords"]}
        self.assertIn("inspire", ids)
        self.assertIn("field_commander", ids)
        self.assertIn("trooper", ids)
        champ = upgrades["champion-of-the-watch"]
        eff2 = rules.apply_property_effects(unit, [champ], defs)
        self.assertEqual(eff2["affiliationIds"], ["965"])

    def test_battle_force_host_alias(self):
        # Imperial Remnant: non-Droid Trooper units may ignore the four named unit requirements on heavy weapons.
        def codes(army_id, unit_id, card_id):
            army = {"mode": "standard", "armyId": army_id, "pointsLimit": 1500, "units": [
                {"instanceId": "u1", "unitId": unit_id,
                 "upgrades": [{"instanceId": "c1", "upgradeId": card_id, "slotIndex": 0}]}],
                "commandIds": [], "options": []}
            return [i["code"] for i in rules.validate_army(army)["issues"]]
        self.assertNotIn("host_restriction", codes(7, "empire-stormtroopers", "shore-t21b"))
        self.assertNotIn("host_restriction", codes(7, "empire-shoretroopers", "stormtrooper-t21"))
        self.assertIn("host_restriction", codes(7, "empire-dark-troopers", "shore-t21b"))
        self.assertIn("host_restriction", codes(2, "empire-stormtroopers", "shore-t21b"))

    def test_battle_force_membership_by_name_and_rank(self):
        # Same-name variants share membership only when they sit at the same rank in the battle force parent faction.
        pkg = rules.load_package()
        units, _, defs = rules.load_cards()
        rank = lambda uid, fid: rules.army_rank(units[uid], fid, pkg, defs, units)
        self.assertEqual(rank("empire-darth-vader-lord", 17), 1)
        self.assertIsNone(rank("empire-darth-vader-apprentice", 17))
        self.assertEqual(rank("empire-stormtroopers-hwu", 17), 2)
        self.assertEqual(rank("empire-stormtroopers", 17), 2)
        self.assertIsNone(rank("rebels-ahsoka", 16))
        self.assertEqual(rank("republic-ahsoka-padawan-commander", 16), 1)
        self.assertIsNone(rank("rebels-luke-skywalker-jedi", 13))
        self.assertEqual(rank("rebels-luke-skywalker-hero", 13), 1)

    def test_unique_upgrade_by_name_across_versions(self):
        army = {"mode": "standard", "armyId": 5, "pointsLimit": 2000, "units": [
            {"instanceId": "u1", "unitId": "separatists-b1",
             "upgrades": [{"instanceId": "c1", "upgradeId": "cassian-andor", "slotIndex": 0}]},
            {"instanceId": "u2", "unitId": "separatists-b1",
             "upgrades": [{"instanceId": "c2", "upgradeId": "cassian-andor-2", "slotIndex": 0}]}],
            "commandIds": [], "options": []}
        self.assertIn("unique_duplicate", [i["code"] for i in rules.validate_army(army)["issues"]])

    def test_unit_conflict_from_unavailable_with(self):
        army = {"mode": "standard", "armyId": 5, "pointsLimit": 2000, "units": [
            {"instanceId": "u1", "unitId": "separatists-grievous-wheelbike", "upgrades": []},
            {"instanceId": "u2", "unitId": "separatists-grievous", "upgrades": []}],
            "commandIds": [], "options": []}
        self.assertIn("unit_conflict", [i["code"] for i in rules.validate_army(army)["issues"]])

    def test_cross_type_duplicate_by_name(self):
        # Unique unit and unique upgrade sharing a name cannot share an army (Rex unit + Rex upgrade).
        army = {"mode": "standard", "armyId": 4, "pointsLimit": 2000, "units": [
            {"instanceId": "u1", "unitId": "republic-rex", "upgrades": []},
            {"instanceId": "u2", "unitId": "republic-clone-trooper",
             "upgrades": [{"instanceId": "c1", "upgradeId": "clone-rex", "slotIndex": 0}]}],
            "commandIds": [], "options": []}
        self.assertIn("cross_type_duplicate", [i["code"] for i in rules.validate_army(army)["issues"]])

    def test_two_darksaber_versions_conflict(self):
        army = {"mode": "standard", "armyId": 8, "pointsLimit": 1000, "units": [
            {"instanceId": "u1", "unitId": "mercenary-clan-kryze-bo-katan-kryze", "upgrades": [
                {"instanceId": "c1", "upgradeId": "bo-katan-darksaber", "slotIndex": 5}]}],
            "commandIds": [], "options": []}
        # add a second conflicting Darksaber on another valid host unit (Gar Saxon)
        army["units"].append({"instanceId": "u2", "unitId": "mercenary-clan-saxon-gar-saxon-leader", "upgrades": [
            {"instanceId": "c2", "upgradeId": "saxon-darksaber", "slotIndex": 5}]})
        report = rules.validate_army(army)
        codes = [i["code"] for i in report["issues"]]
        self.assertIn("conflict_group", codes)

    def test_requires_tier_rejects_wrong_rank(self):
        # clone-comms requiresTier [2] (Corps); a rank-1 Commander host must be rejected.
        army = {"mode": "standard", "armyId": 4, "pointsLimit": 1000, "units": [
            {"instanceId": "u1", "unitId": "republic-clone-commander-leadership", "upgrades": [
                {"instanceId": "c1", "upgradeId": "clone-comms", "slotIndex": 0}]}],
            "commandIds": [], "options": []}
        report = rules.validate_army(army)
        codes = [i["code"] for i in report["issues"]]
        self.assertIn("requires_tier", codes)

    def test_unavailable_faction_excludes_army(self):
        # imperial-hammers unavailableWithIds=[{id:8, propertyName:'factions'}] -> cannot join Mandalorian Clans.
        army = {"mode": "standard", "armyId": 8, "pointsLimit": 1000, "units": [
            {"instanceId": "u1", "unitId": "mercenary-creedless-mandalorian-leader", "upgrades": [
                {"instanceId": "c1", "upgradeId": "imperial-hammers", "slotIndex": 0}]}],
            "commandIds": [], "options": []}
        report = rules.validate_army(army)
        codes = [i["code"] for i in report["issues"]]
        self.assertIn("unavailable_faction", codes)

    def test_clan_conflict_via_unavailable_ids(self):
        # Champion of the Watch lists 'clanWren' as unavailable; selecting Clan Wren must conflict.
        army = {"mode": "standard", "armyId": 8, "pointsLimit": 1000, "units": [
            {"instanceId": "u1", "unitId": "mercenary-creedless-mandalorian-warriors-corps", "upgrades": [
                {"instanceId": "c1", "upgradeId": "champion-of-the-watch", "slotIndex": 6},
                {"instanceId": "c2", "upgradeId": "clan-wren", "slotIndex": 6}]}],
            "commandIds": [], "options": []}
        report = rules.validate_army(army)
        codes = [i["code"] for i in report["issues"]]
        self.assertIn("upgrade_conflict", codes)

    def test_replace_tier_counts_as_commander(self):
        # The Darksaber (Maul) has replaceTier 1: Maul (rank 6 Operative) counts as rank 1 Commander.
        army = {"mode": "standard", "armyId": 9, "pointsLimit": 1000, "units": [
            {"instanceId": "u1", "unitId": "mercenary-maul-loyalists-maul-rival", "upgrades": [
                {"instanceId": "c1", "upgradeId": "armament-maul-darksaber", "slotIndex": 4}]}],
            "commandIds": [], "options": []}
        report = rules.validate_army(army)
        self.assertEqual(report["rankCounts"], {1: 1})


if __name__ == "__main__":
    unittest.main()
