import unittest
import rules


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


class ValidateArmyTest(unittest.TestCase):
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
        self.assertIn("battle_force_unit_cap", codes)
        banned = {"mode": "standard", "armyId": 17, "pointsLimit": 1500, "units": [
            {"instanceId": "u1", "unitId": storm["id"], "upgrades": [
                {"instanceId": "c1", "upgradeId": "aayla", "slotIndex": 1}]}],
            "commandIds": [], "options": []}
        self.assertIn("battle_force_keyword_banned", [i["code"] for i in rules.validate_army(banned)["issues"]])

    def test_hit_the_dirt_condition_grants_qualifying_non_holder(self):
        pkg = rules.load_package()
        units = rules.load_cards()[0]
        scout = units["empire-scout"]
        self.assertEqual(scout["stats"]["defenseDie"], "white")
        grants = rules.dedicated_slot_keys(pkg, scout)
        self.assertTrue(any(g["key"] == "training_exempt" for g in grants))
        b1 = units["separatists-b1"]
        self.assertFalse(any(g["key"] == "training_exempt" for g in rules.dedicated_slot_keys(pkg, b1)))

    def test_training_exempt_slot_not_granted_when_training_slot_exists(self):
        # empire-scout already has a training slot, so no virtual training slot.
        army = {"mode": "standard", "armyId": 2, "pointsLimit": 1000, "units": [
            {"instanceId": "u1", "unitId": "empire-scout", "upgrades": []}],
            "commandIds": [], "options": []}
        report = rules.validate_army(army)
        self.assertNotIn("dedicated_grant_virtual", [i["code"] for i in report["issues"]])

    def test_shared_training_exempt_slot_accepts_one_effect_card(self):
        # Mark II's printed 23/26 collapse into ONE shared training_exempt slot.
        army = {"mode": "standard", "armyId": 1, "pointsLimit": 1000, "units": [
            {"instanceId": "u1", "unitId": "rebels-mark-2-blaster", "upgrades": [
                {"instanceId": "c1", "upgradeId": "training-dug-in", "slotIndex": 1}]}],
            "commandIds": [], "options": []}
        report = rules.validate_army(army)
        codes = [i["code"] for i in report["issues"]]
        self.assertNotIn("slot_mismatch", codes)
        self.assertIn("dedicated_grant_virtual", codes)

    def test_shared_training_exempt_slot_is_single(self):
        # A second effect card cannot use the shared slot at the same time.
        army = {"mode": "standard", "armyId": 1, "pointsLimit": 1000, "units": [
            {"instanceId": "u1", "unitId": "rebels-mark-2-blaster", "upgrades": [
                {"instanceId": "c1", "upgradeId": "training-dug-in", "slotIndex": 1},
                {"instanceId": "c2", "upgradeId": "hit-the-dirt", "slotIndex": 2}]}],
            "commandIds": [], "options": []}
        report = rules.validate_army(army)
        self.assertIn("slot_missing", [i["code"] for i in report["issues"]])

    def test_added_slot_absent_without_carrying_card(self):
        # B1 has 5 base slots; a heavy slot granted by grievous-heavy does not exist yet.
        army = {"mode": "standard", "armyId": 5, "pointsLimit": 1000, "units": [
            {"instanceId": "u1", "unitId": "separatists-b1", "upgrades": [
                {"instanceId": "c1", "upgradeId": "gear-binoculars", "slotIndex": 5}]}],
            "commandIds": [], "options": []}
        report = rules.validate_army(army)
        self.assertIn("slot_missing", [i["code"] for i in report["issues"]])

    def test_carried_upgrade_adds_slot(self):
        # carrying grievous-heavy appends one heavy_weapon slot (index 3);
        # B1's shared gear_exempt slot moves to index 4.
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
