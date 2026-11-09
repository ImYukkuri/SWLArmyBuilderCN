import copy,json,sys,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import maintenance_store as store
from rule_schema import validate_rules
from army_preview import preview
class MaintenanceTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.cards=json.loads((store.ROOT/'data/upgrades.json').read_bytes())['cards'];cls.units=json.loads((store.ROOT/'data/units.json').read_bytes())['units']
    def test_all_records_and_images(self):
        self.assertEqual(len(self.cards),539)
        fronts=[c['assets']['front'] for c in self.cards if c['assets'].get('front')]
        self.assertGreaterEqual(len(fronts),503)
        for f in fronts:self.assertTrue((store.ROOT/f).is_file(),f)
        for c in self.cards:store.validate('upgrades',c)
        self.assertEqual({c['upstream']['id']for c in self.cards if c.get('upstream')},{str(c['id'])for c in json.loads((store.ROOT/'references/upstream/legion.json').read_bytes())['data']['upgrades']})
    def test_shared_keyword_references(self):
        definitions=json.loads((store.ROOT/'data/catalog-definitions.json').read_bytes());known={k['id']for k in definitions['keywords']}
        for c in self.cards:
            for w in c['weapons']:
                self.assertEqual(set(w['name']),{'en','zh'});self.assertNotIn('zh',w)
            for k in c['keywords']+[k for w in c['weapons']for k in w['keywords']]:
                self.assertIn(k['id'],known);self.assertNotIn('full',k);self.assertNotIn('summary',k)
    def test_deleted_army_can_be_recovered(self):
        with tempfile.TemporaryDirectory()as tmp:
            root=Path(tmp);(root/'data').mkdir();(root/'data/catalog-definitions.json').write_bytes(store.encode({'armies':[{'id':1}]}));(root/'data/armies.json').write_bytes(store.encode({'armies':[]}))
            with patch.object(store,'ROOT',root):
                c={'id':'army-test','name':'test','armyId':1,'mode':'standard','pointsLimit':1000,'units':[],'commandIds':[],'options':[],'rules':{}}
                created=store.save('armies',c,store.read('armies')['revision'],create=True);deleted=store.delete_army(c['id'],created['revision']);self.assertEqual(store.read('armies')['catalog']['armies'],[])
                recovered=store.restore('armies',deleted['snapshot'],c['id'],deleted['revision']);self.assertEqual(recovered['card'],c);self.assertEqual(len(store.history('armies')),3)
    def test_darksaber_versions_and_special_slots(self):
        cards={c['id']:c for c in self.cards}
        self.assertEqual(cards['bo-katan-darksaber']['upstream']['id'],'22612')
        self.assertEqual(cards['saxon-darksaber']['upstream']['id'],'22610')
        e=next(c for c in self.cards if c['name']['en']=='Electrobinoculars');self.assertEqual(e['slotIds'],[2,16,28])
        h=next(c for c in self.cards if c['name']['en']=='Hit the Dirt');self.assertEqual(h['slotIds'],[10,26,27]);self.assertTrue(h['rules']['unavailableIn'])
    def test_rules_and_validation(self):
        validate_rules({'requiredProperties':[[{'property':'unitType','value':[1,4]}]],'unique':False,'modifiedPointsWith':[]})
        for bad in [{'requiredProperties':[{'property':'unitType','value':1}]},{'unique':'true'},{'limit':-1},{'tierCounting':[]}]:
            with self.assertRaises(ValueError):validate_rules(bad)
    def test_isolated_upgrade_history_conflict_restore(self):
        with tempfile.TemporaryDirectory()as tmp:
            root=Path(tmp);(root/'data').mkdir();(root/'assets').mkdir();c=copy.deepcopy(self.cards[0]);c['assets']['front']=None
            (root/'data/upgrades.json').write_bytes(store.encode({'cards':[c]}));other=(root/'data/armies.json');other.write_bytes(store.encode({'armies':[]}));before=other.read_bytes()
            with patch.object(store,'ROOT',root):
                r=store.read('upgrades');old=copy.deepcopy(c);c['points']+=1;s=store.save('upgrades',c,r['revision']);self.assertEqual(other.read_bytes(),before)
                with self.assertRaises(FileExistsError):store.save('upgrades',c,r['revision'])
                restored=store.restore('upgrades',s['snapshot'],c['id'],s['revision']);self.assertEqual(restored['card'],old);self.assertEqual(len(store.history('upgrades')),2)
    def test_preview_does_not_claim_complete_validity(self):
        base={'id':'army-test','name':'test','armyId':5,'mode':'standard','pointsLimit':1000,'units':[],'commandIds':[],'options':[],'rules':{}}
        result=preview(base)
        self.assertNotEqual(result['status'],'valid')
        self.assertTrue(any(i['code']=='rank_min'for i in result['issues']))
        unit=next(u for u in self.units if u['id']=='separatists-b1');base['units']=[{'instanceId':'u1','unitId':unit['id'],'upgrades':[{'instanceId':'c1','upgradeId':self.cards[0]['id'],'slotIndex':999}]}]
        result=preview(base);self.assertEqual(result['status'],'invalid');self.assertTrue(any(i['code']=='slot_missing'for i in result['issues']));self.assertEqual(base['units'][0]['upgrades'][0]['slotIndex'],999)
if __name__=='__main__':unittest.main()
