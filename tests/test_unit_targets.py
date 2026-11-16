import copy,json,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
import server,rules
from catalog_schema import validate_keyword_targets,migrate_legacy

class UnitTargetStorageTest(unittest.TestCase):
    def setUp(self):
        self.catalog=json.loads(server.DATA.read_bytes())
        self.definitions=json.loads(server.DEFINITIONS.read_bytes())
        self.card=copy.deepcopy(self.catalog['units'][0])

    def test_types_and_targets_round_trip_without_altering_other_units(self):
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/'units.json';path.write_bytes(server.encoded(self.catalog))
            self.card.update(unitCategoryId='vehicle',unitSubtypeId='flying_vehicle',unitTypeId='local:flying_vehicle')
            refs=[{'kind':'unitCategory','id':'trooper'},{'kind':'unitSubtype','id':'droid_trooper'},
                  {'kind':'nameIdentity','id':'ig-100-magnaguard'},{'kind':'unit','id':'rebels-solo'}]
            self.card['keywords']=[{'id':'detachment','parameterRefs':refs,'parameter':'任一目标'}]
            with patch.multiple(server,DATA=path,HISTORY=Path(folder)/'history'):
                result=server.commit_card(self.card,server.digest(path.read_bytes()))
            saved=json.loads(path.read_bytes())
            self.assertEqual(saved['units'][0],result['card'])
            self.assertEqual(saved['units'][0]['keywords'][0]['parameterRefs'],refs)
            self.assertEqual(saved['units'][1:],self.catalog['units'][1:])

    def test_invalid_cross_category_and_stale_references_are_rejected(self):
        card=copy.deepcopy(self.card);card['unitSubtypeId']='ground_vehicle'
        with self.assertRaisesRegex(ValueError,'子类型'):server.validate(card)
        card=copy.deepcopy(self.card);card['unitTypeId']=6
        with self.assertRaisesRegex(ValueError,'新旧'):server.validate(card)
        for refs in [[],[{'kind':'unit','id':'missing'}],[{'kind':'unitType','id':'6'}],
                     [{'kind':'nameIdentity','id':'unknown'}],[{'kind':'unitCategory','id':'trooper'}]*2]:
            with self.subTest(refs=refs),self.assertRaises(ValueError):
                validate_keyword_targets({'parameterRefs':refs},self.definitions,self.catalog['units'])

    def test_legacy_history_gets_hierarchy_without_overwriting_present_identity(self):
        old=copy.deepcopy(self.card)
        for key in ['unitCategoryId','unitSubtypeId','nameIdentityId']:old.pop(key)
        migrated=migrate_legacy(old)
        self.assertEqual(migrated['unitCategoryId'],'trooper')
        self.assertEqual(migrated['unitSubtypeId'],None)
        current=copy.deepcopy(self.card);current['nameIdentityId']='my-stable-identity'
        self.assertEqual(migrate_legacy(current)['nameIdentityId'],'my-stable-identity')

    def test_new_condition_fields_reach_the_rules_context(self):
        context=rules._unit_context(self.card,rules.load_package())
        for field in ['unitCategoryId','unitSubtypeId','nameIdentityId']:
            self.assertTrue(rules.evaluate({'field':'unit.'+field,'value':self.card[field]},context))

    def test_last_member_cannot_leave_a_referenced_name_identity_empty(self):
        kraken=copy.deepcopy(next(u for u in self.catalog['units'] if u['id']=='separatists-kraken'))
        kraken['nameIdentityId']='new-kraken-group'
        with self.assertRaisesRegex(ValueError,'名称标识仍被'):server.validate(kraken)
        # A group with another member stays valid when one variant leaves.
        magna=copy.deepcopy(next(u for u in self.catalog['units'] if u['id']=='separatists-magna'))
        magna['nameIdentityId']='new-magna-group'
        server.validate(magna)
