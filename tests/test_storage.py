import copy,json,sys,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import server

class StorageTest(unittest.TestCase):
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
        self.assertEqual(len(self.catalog['units']),185);self.assertEqual(len({c['id']for c in self.catalog['units']}),185)
        for c in self.catalog['units']:
            server.validate(c);self.assertTrue((server.ROOT/c['assets']['portrait']).is_file())
            self.assertIsInstance(c['points'],int);self.assertIsInstance(c['upgradeSlots'],list)
if __name__=='__main__':unittest.main()
