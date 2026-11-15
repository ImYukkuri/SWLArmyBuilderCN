import copy
import io
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from PIL import Image
import maintenance_store as store


class UpgradeFacesTest(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name)
        (self.root/'data').mkdir()
        cards=json.loads((store.ROOT/'data/upgrades.json').read_bytes())['cards']
        self.card=copy.deepcopy(next(c for c in cards if c['id']=='e-11d-focused-fire'))
        self.card['assets']['front']=None;self.card['back']['assets']['front']=None
        (self.root/'data/upgrades.json').write_bytes(store.encode({'cards':[self.card,{'id':'sentinel','untouched':True}]}))
        self.patcher=patch.object(store,'ROOT',self.root);self.patcher.start()

    def tearDown(self):
        self.patcher.stop();self.temp.cleanup()

    def test_independent_text_save_conflict_history_and_restore(self):
        before=store.read('upgrades');changed=copy.deepcopy(self.card)
        changed['back']['description']['zh']=['反面第一段','反面第二段'];changed['back']['name']['zh']='背面测试'
        changed['actionTypes']=['action'];changed['back']['actionTypes']=['free-exhaust']
        result=store.save('upgrades',changed,before['revision'])
        loaded=store.read('upgrades')['catalog']['cards'][0]
        self.assertEqual(loaded['actionTypes'],['action'])
        self.assertEqual(loaded['back']['actionTypes'],['free-exhaust'])
        self.assertEqual(result['card']['description'],self.card['description'])
        self.assertEqual(store.read('upgrades')['catalog']['cards'][1],{'id':'sentinel','untouched':True})
        with self.assertRaises(FileExistsError):store.save('upgrades',self.card,before['revision'])
        restored=store.restore('upgrades',result['snapshot'],self.card['id'],result['revision'])
        self.assertEqual(restored['card'],self.card)

    def test_back_image_does_not_overwrite_front_or_previous_image(self):
        buf=io.BytesIO();Image.new('RGB',(10,16),'red').save(buf,format='PNG')
        first=store.save_image('upgrades',self.card['id'],buf.getvalue(),store.read('upgrades')['revision'],'back')
        self.assertIsNone(first['card']['assets']['front'])
        self.assertEqual(first['card']['back']['assets']['front'],first['front'])
        old=(self.root/first['front']).read_bytes()
        buf=io.BytesIO();Image.new('RGB',(10,16),'blue').save(buf,format='PNG')
        second=store.save_image('upgrades',self.card['id'],buf.getvalue(),first['revision'],'back')
        self.assertNotEqual(first['front'],second['front']);self.assertEqual((self.root/first['front']).read_bytes(),old)
        restored=store.restore('upgrades',second['snapshot'],self.card['id'],second['revision'])
        self.assertEqual(restored['card']['back']['assets']['front'],first['front'])

    def test_disabled_back_can_keep_an_unfinished_draft(self):
        card=copy.deepcopy(self.card);card['dualSided']=False;card['back']['name']={'en':'','zh':''}
        saved=store.save('upgrades',card,store.read('upgrades')['revision'])
        self.assertEqual(saved['card']['back']['name']['en'],'')
        self.assertFalse(saved['card']['dualSided'])

    def test_both_state_survives_roster_save(self):
        (self.root/'data/catalog-definitions.json').write_bytes(store.encode({'armies':[{'id':2}]}))
        (self.root/'data/armies.json').write_bytes(store.encode({'armies':[]}))
        army={'id':'both-test','name':'双面测试','armyId':2,'mode':'standard','pointsLimit':1000,
              'units':[{'unitId':'empire-death-troopers','instanceId':'unit','upgrades':[
                  {'upgradeId':self.card['id'],'instanceId':'upgrade','slotIndex':0,'face':'both'}]}],
              'commandIds':[],'options':[]}
        result=store.save('armies',army,store.read('armies')['revision'],create=True)
        self.assertEqual(result['card']['units'][0]['upgrades'][0]['face'],'both')
        self.assertEqual(store.read('armies')['catalog']['armies'][0],army)
        army['units'][0]['upgrades'][0]['face']='invalid'
        with self.assertRaises(ValueError):store.validate('armies',army)

    def test_invalid_back_never_writes(self):
        before=store.read('upgrades')['revision']
        for back in [None,{},dict(self.card['back'],points=100),dict(self.card['back'],keywords='x')]:
            bad=copy.deepcopy(self.card);bad['back']=back
            with self.subTest(back=back),self.assertRaises(ValueError):store.save('upgrades',bad,before)
        self.assertEqual(store.read('upgrades')['revision'],before)


if __name__=='__main__':unittest.main()
