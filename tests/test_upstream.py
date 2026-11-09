import copy,json,sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from catalog_schema import ROOT,migrate_legacy
from server import validate

class UpstreamTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.catalog=json.loads((ROOT/'data/units.json').read_bytes());cls.units={u['id']:u for u in cls.catalog['units']}
        cls.defs=json.loads((ROOT/'data/catalog-definitions.json').read_bytes())
        cls.source=json.loads((ROOT/'references/upstream/legion.json').read_bytes())['data']
    def test_every_cost_matches_selected_version(self):
        for u in self.units.values():
            source=next(s for s in self.source[u['upstream']['collection']]if str(s['id'])==u['upstream']['id'])
            self.assertEqual(u['points'],source['points']);self.assertTrue(u['name']['zh']);validate(u)
    def test_cross_faction_variants_and_arf_identity(self):
        expected={'rebels-at-rt-rebel':'1','republic-at-rt-gar':'70','empire-laat-empire':'773','republic-laat-gar':'771','republic-arf-troopers':'28861','republic-arc-troopers':'62','republic-bad-batch-gar':'23655','mercenary-rogue-bad-batch':'25086','republic-delta-squad':'24084'}
        for uid,source in expected.items():self.assertEqual(self.units[uid]['upstream']['id'],source)
        self.assertEqual(self.units['republic-arf-troopers']['name']['en'],'ARF Troopers')
    def test_duplicate_slots_required_and_unlocks(self):
        vader=self.units['empire-darth-vader-lord'];self.assertEqual(vader['upgradeSlots'].count(5),3)
        storm=self.units['empire-stormtroopers'];self.assertFalse(any(isinstance(s,dict)and'unlockedBy'in s for s in storm['upgradeSlots']))
        self.assertTrue(storm['conditionalUpgradeSlots'])
        dwarf=self.units['separatists-dsd1-dwarf'];self.assertIn({'id':18,'required':True},dwarf['upgradeSlots'])
        commander=self.units['republic-jedi-knight-general'];self.assertIn({'id':24,'required':True},commander['upgradeSlots'])
    def test_card_values_and_evidence_preserved(self):
        evidence=json.loads((ROOT/'data/extraction-evidence.json').read_bytes())['units'];self.assertEqual(len(evidence),185)
        self.assertEqual(self.units['republic-yoda']['stats']['speed'],1)
        self.assertEqual(self.units['rebels-1-4-fd-laser-cannon-team']['stats']['speed'],0)
        self.assertEqual(self.units['republic-wookiee-noble']['unitTypeId'],'local:wookiee_trooper')
        for u in self.units.values():
            self.assertNotIn('source',u);self.assertNotIn('mapping',u)
            for w in u['weapons']:self.assertNotIn('source',w)
            for k in u['keywords']:
                self.assertNotIn('label',k);self.assertNotIn('summary',k);self.assertNotIn('raw',k)
    def test_reject_dangling_ids_and_wrong_namespaces(self):
        for field,value in [('factionId',999),('unitTypeId','unknown'),('rankId',99)]:
            c=copy.deepcopy(next(iter(self.units.values())));c[field]=value
            with self.assertRaises(ValueError):validate(c)
        c=copy.deepcopy(next(iter(self.units.values())));c['keywords'][0]['id']='unregistered'
        with self.assertRaises(ValueError):validate(c)
    def test_legacy_history_migrates_without_reimporting_cost(self):
        evidence=json.loads((ROOT/'data/extraction-evidence.json').read_bytes())['units']
        current=copy.deepcopy(next(iter(self.units.values())))
        legacy={**current,'factions':['separatists'],'affiliations':[],'rank':'commander','unitType':{'en':'Trooper','zh':'士兵'},'source':evidence[current['id']]['source'],'keywords':evidence[current['id']]['keywords']}
        legacy.pop('factionId');legacy['points']=None
        migrated=migrate_legacy(legacy);self.assertIsNone(migrated['points']);self.assertEqual(migrated['factionId'],5);validate(migrated)
    def test_special_declarations_are_separate_from_base_fields(self):
        forbidden={'ignoreMinimum','quantityLimitedBy','tierCounting','unavailableWith','requiredChildren'}
        def walk(v):
            if isinstance(v,dict):
                self.assertFalse(forbidden&v.keys())
                for key,value in v.items():
                    if key not in ('rules','factions'):walk(value)
            elif isinstance(v,list):
                for item in v:walk(item)
        walk(self.catalog)
if __name__=='__main__':unittest.main()
