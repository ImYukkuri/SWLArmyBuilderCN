import copy,json,sys,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import server

class StorageTest(unittest.TestCase):
    def test_flier_rank_saves_on_card_and_faction_membership(self):
        self.card['rankId'] = 7
        for membership in self.card['factions']:
            membership['rankId'] = 7
        saved = server.commit_card(self.card, server.digest(self.path.read_bytes()))
        self.assertEqual(saved['card']['rankId'], 7)
        self.assertTrue(all(f['rankId'] == 7 for f in saved['card']['factions']))

    def test_free_text_keyword_parameters_survive_save_and_reload(self):
        self.card['keywords'] = [
            {'id': key, 'parameter': '瞄准 1 或闪避 1 / 自定义目标', 'value': 2, 'action': 'none'}
            for key in ['mercenary', 'aid', 'independent', 'retinue']
        ]
        result = server.commit_card(self.card, server.digest(self.path.read_bytes()))
        saved = next(u for u in json.loads(self.path.read_bytes())['units'] if u['id'] == self.card['id'])
        self.assertEqual(saved['keywords'], self.card['keywords'])
        self.assertEqual(result['card']['keywords'], saved['keywords'])
        self.card['keywords'][0]['parameter'] = None
        server.commit_card(self.card, result['revision'])
        saved = next(u for u in json.loads(self.path.read_bytes())['units'] if u['id'] == self.card['id'])
        self.assertIsNone(saved['keywords'][0]['parameter'])

    def test_all_action_types_can_be_saved_on_unit_keywords(self):
        for action in ['action','double-action','free-action','free-exhaust']:
            self.card['keywords'][0]['action']=action
            with self.subTest(action=action):
                result=server.commit_card(self.card,server.digest(self.path.read_bytes()))
                self.assertEqual(result['card']['keywords'][0]['action'],action)

    def test_equip_ids_validate_and_survive_save(self):
        self.card['equipUpgradeIds']=['upstream-131','cassian-a280-pistol']
        saved=server.commit_card(self.card,server.digest(self.path.read_bytes()))
        self.assertEqual(saved['card']['equipUpgradeIds'],self.card['equipUpgradeIds'])
        for value in ['upstream-131',[131],['missing'],['upstream-131','upstream-131'],['cassian-a280-sniper']]:
            self.card['equipUpgradeIds']=value
            with self.subTest(value=value),self.assertRaises(ValueError):server.validate(self.card)

    def test_equip_slot_ids_and_cards_survive_save_without_changing_slots(self):
        self.card['equipSlotIds']=['doctrine','armament']
        self.card['equipUpgradeIds']=['caught-in-a-web']
        slots=copy.deepcopy(self.card['upgradeSlots'])
        result=server.commit_card(self.card,server.digest(self.path.read_bytes()))
        self.assertEqual(result['card']['equipSlotIds'],['doctrine','armament'])
        self.assertEqual(result['card']['equipUpgradeIds'],['caught-in-a-web'])
        self.assertEqual(result['card']['upgradeSlots'],slots)
        for value in ['doctrine',[24],['missing'],['doctrine','doctrine'],None]:
            self.card['equipSlotIds']=value
            with self.subTest(value=value),self.assertRaises(ValueError):server.validate(self.card)
        self.card['equipSlotIds']=[]
        result=server.commit_card(self.card,result['revision'])
        self.assertEqual(result['card']['equipSlotIds'],[])

    def test_portraits_allow_custom_positions_with_fixed_ratio_and_valid_bounds(self):
        from PIL import Image
        for u in self.catalog['units']:
            with Image.open(server.ROOT/u['assets']['front']) as im:
                l,t,r,b=u['assets']['portraitCrop']
                self.assertTrue(0 <= l < r <= 1, u['id'])
                self.assertTrue(0 <= t < b <= 1, u['id'])
                self.assertAlmostEqual((r-l)*im.width/((b-t)*im.height),.8)
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.path=Path(self.tmp.name)/'units.json';self.history=Path(self.tmp.name)/'history'
        self.catalog=json.loads(server.DATA.read_bytes());self.path.write_bytes(server.encoded(self.catalog));self.card=copy.deepcopy(self.catalog['units'][0])
        self.patch=patch.multiple(server,DATA=self.path,HISTORY=self.history);self.patch.start();self.addCleanup(self.patch.stop)
    def test_save_history_and_conflict(self):
        before=self.path.read_bytes();self.card['review']['notes']='edited';r=server.commit_card(self.card,server.digest(before))
        self.assertEqual((self.history/r['snapshot']).read_bytes(),before)
        self.assertEqual(json.loads(self.path.read_bytes())['units'][0]['review']['notes'],'edited')
        self.assertEqual(r['revision'],server.digest(self.path.read_bytes()))
        with self.assertRaises(FileExistsError):server.commit_card(self.card,server.digest(before))
        self.assertEqual(len(list(self.history.glob('*.json'))),1)
    def test_new_and_copied_cards_accept_custom_ids_without_replacing_source(self):
        before=copy.deepcopy(self.catalog)
        card=copy.deepcopy(self.card);card['id']='custom-new-unit';card['assets']['front']=None
        result=server.commit_card(card,server.digest(self.path.read_bytes()),create=True)
        saved=json.loads(self.path.read_bytes())
        self.assertEqual(saved['units'][:-1],before['units'])
        self.assertEqual(saved['units'][-1]['id'],'custom-new-unit')
        with self.assertRaises(ValueError):server.commit_card(card,result['revision'],create=True)
        saved['idAliases']={'reserved-old-id':'custom-new-unit'};self.path.write_bytes(server.encoded(saved))
        card['id']='reserved-old-id'
        with self.assertRaises(ValueError):server.commit_card(card,server.digest(self.path.read_bytes()),create=True)
    def test_invalid_does_not_change_file(self):
        before=self.path.read_bytes();self.card['assets']['portraitCrop']=[.9,0,.1,1]
        with self.assertRaises(ValueError):server.commit_card(self.card,server.digest(before))
        self.assertEqual(self.path.read_bytes(),before);self.assertFalse(self.history.exists())
    def test_traversal_and_invalid_enums(self):
        self.card['assets']['front']='assets/../../server.py'
        with self.assertRaises(ValueError):server.validate(self.card)
    def test_nested_json_types_and_subpixel_crop(self):
        for key in ['review','assets']:
            card=copy.deepcopy(self.card);card[key]=[]
            with self.assertRaises(ValueError):server.validate(card)
        card=copy.deepcopy(self.card);card['assets']['portraitCrop']=[.5,0,.500001,.5]
        with self.assertRaises(ValueError):server.validate(card)
        self.card=copy.deepcopy(self.catalog['units'][0]);self.card['stats']['attackSurge']='block'
        with self.assertRaises(ValueError):server.validate(self.card)
    def test_restore_one_unit_preserves_other_edits(self):
        original=copy.deepcopy(self.card);revision=server.digest(self.path.read_bytes());self.card['review']['notes']='new'
        r=server.commit_card(self.card,revision);second=copy.deepcopy(self.catalog['units'][1]);second['review']['notes']='other unit'
        r2=server.commit_card(second,r['revision']);r3=server.commit_card(original,r2['revision'])
        result=json.loads(self.path.read_bytes());self.assertEqual(result['units'][0]['review']['notes'],original['review']['notes']);self.assertEqual(result['units'][1]['review']['notes'],'other unit');self.assertEqual(len(list(self.history.glob('*.json'))),3)
    def test_every_record_and_asset(self):
        self.assertGreaterEqual(len(self.catalog['units']),185);self.assertEqual(len({c['id']for c in self.catalog['units']}),len(self.catalog['units']))
        for c in self.catalog['units']:
            server.validate(c)
            if c['assets'].get('portrait'):self.assertTrue((server.ROOT/c['assets']['portrait']).is_file())
            self.assertIsInstance(c['points'],int);self.assertIsInstance(c['upgradeSlots'],list)
if __name__=='__main__':unittest.main()
