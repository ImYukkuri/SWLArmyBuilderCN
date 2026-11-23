import copy
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import card_numeric_ids as ids
import maintenance_store as store
import server
from unit_identity import rename_documents


class NumericIdsTest(unittest.TestCase):
    def test_catalogs_have_unique_numbers_and_only_root_numbers(self):
        for filename, key in [('units.json','units'), ('upgrades.json','cards')]:
            doc=json.loads((server.ROOT/'data'/filename).read_bytes())
            values=[c['numericId'] for c in doc[key]]
            self.assertTrue(all(ids.valid(v) for v in values))
            self.assertEqual(len(values),len(set(values)))
            self.assertGreater(doc['nextNumericId'],max(values))
            self.assertTrue(all('numericId' not in c.get('back',{}) for c in doc[key]))
            before=copy.deepcopy(doc);ids.migrate(doc,key);self.assertEqual(doc,before)

    def test_allocation_copy_delete_restore_never_reuses_numbers(self):
        catalog={'cards':[{'id':'a','numericId':1}], 'nextNumericId':2}
        b={'id':'b','numericId':1};ids.assign(catalog,'cards',b);catalog['cards'].append(b)
        self.assertEqual(b['numericId'],2)
        ids.retire(catalog,catalog['cards'].pop())
        c={'id':'c'};ids.assign(catalog,'cards',c);catalog['cards'].append(c)
        self.assertEqual(c['numericId'],3)
        with self.assertRaises(ValueError):ids.assign(catalog,'cards',{'id':'b'})
        restored={'id':'b'};ids.assign(catalog,'cards',restored,restoring=True)
        self.assertEqual(restored['numericId'],2);self.assertEqual(catalog['nextNumericId'],4)
        old={'id':'a'};ids.assign(catalog,'cards',old,catalog['cards'][0]);self.assertEqual(old['numericId'],1)
        with self.assertRaises(ValueError):ids.assign(catalog,'cards',{'id':'a','numericId':99},old)

    def test_unit_save_copy_and_history_are_stable_and_conflicts_do_not_write(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);path=root/'units.json';history=root/'history'
            path.write_bytes(server.encoded({'units':[{'id':'a','numericId':7}], 'nextNumericId':8}))
            with patch.multiple(server,DATA=path,HISTORY=history),patch.object(server,'validate'),patch.object(server,'make_portrait'),patch.object(server,'migrate_legacy',side_effect=lambda c:copy.deepcopy(c)):
                original=path.read_bytes()
                with self.assertRaises(FileExistsError):server.commit_card({'id':'copy','numericId':7},'stale',True)
                self.assertEqual(path.read_bytes(),original)
                copy_result=server.commit_card({'id':'copy','numericId':7},server.digest(original),True)
                self.assertEqual(copy_result['card']['numericId'],8)
                restored=server.commit_card({'id':'a'},copy_result['revision'],restoring=True)
                self.assertEqual(restored['card']['numericId'],7)
                with self.assertRaises(ValueError):server.commit_card({'id':'a','numericId':8},restored['revision'])
                doc=json.loads(path.read_bytes());renamed=rename_documents({'units.json':doc},'a','renamed')
                self.assertEqual(renamed['units.json']['units'][0]['numericId'],7)

    def test_upgrade_delete_restore_with_old_snapshot_and_new_cards(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);(root/'data').mkdir();path=root/'data/upgrades.json'
            path.write_bytes(store.encode({'cards':[{'id':'a','numericId':1,'name':{'en':'A'}}], 'nextNumericId':2}))
            with patch.object(store,'ROOT',root),patch.object(store,'validate'),patch.object(store,'update_card_thumbnails'):
                deleted=store.delete('upgrades','a',store.hashof(path.read_bytes()))
                created=store.save('upgrades',{'id':'b','numericId':1},deleted['revision'],create=True)
                self.assertEqual(created['card']['numericId'],2)
                # Old snapshots do not necessarily carry the new identity field.
                snap=root/'history/upgrades'/deleted['snapshot'];old=json.loads(snap.read_bytes())
                old['cards'][0].pop('numericId');snap.write_bytes(store.encode(old))
                restored=store.restore('upgrades',deleted['snapshot'],'a',created['revision'])
                self.assertEqual(restored['card']['numericId'],1)
                doc=json.loads(path.read_bytes());self.assertEqual(doc['nextNumericId'],3)
                self.assertEqual(doc['retiredNumericIds'],{})

    def test_dual_face_must_not_override_numeric_identity(self):
        card=next(c for c in json.loads((store.ROOT/'data/upgrades.json').read_bytes())['cards'] if c.get('dualSided'))
        card['back']['numericId']=99
        with self.assertRaises(ValueError):store.validate('upgrades',card)
