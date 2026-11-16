"""Rule text and affiliation metadata roundtrip without changing machine rules."""
import copy
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import server
import maintenance_store


class BattleForceTextTest(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name)
        (self.root/'data').mkdir()
        for name in ['slot-rules.json','catalog-definitions.json','upgrades.json']:
            (self.root/'data'/name).write_bytes((server.ROOT/'data'/name).read_bytes())
        self.patch=patch.multiple(server,ROOT=self.root)
        self.patch.start();self.addCleanup(self.patch.stop)
        self.store_patch=patch.multiple(maintenance_store,ROOT=self.root)
        self.store_patch.start();self.addCleanup(self.store_patch.stop)

    def test_rule_text_and_option_text_save_keep_machine_configuration(self):
        path=self.root/'data/slot-rules.json';before=path.read_bytes();pkg=json.loads(before)
        original=copy.deepcopy(pkg['battleForces']['26']['mandalorian'])
        pkg['battleForces']['26']['textRulesZh']=['校订规则一','校订规则二']
        pkg['battleForces']['26']['unitLimitsText']=['载具最多 1 个']
        pkg['battleForces']['26']['options'][0]['text']='校订自定义规则'
        result=server.commit_rules(pkg,server.digest(before))
        saved=json.loads(path.read_bytes())['battleForces']['26']
        self.assertEqual(saved['mandalorian'],original)
        self.assertEqual(saved['textRulesZh'],['校订规则一','校订规则二'])
        self.assertEqual(saved['options'][0]['text'],'校订自定义规则')
        self.assertEqual((self.root/'history/slot-rules'/result['snapshot']).read_bytes(),before)
        pkg['battleForces']['26']['unitLimitsText']='not an array'
        with self.assertRaises(ValueError):server.commit_rules(pkg,result['revision'])
        self.assertEqual(json.loads(path.read_bytes())['battleForces']['26'],saved)

    def test_personnel_affiliation_metadata_save_and_validation(self):
        path=self.root/'data/upgrades.json';before=path.read_bytes()
        card=next(c for c in json.loads(before)['cards'] if c['id']=='gar-saxon')
        card['assets']['front']=None
        card['affiliationIds']=['1083'];card['review']['notes']='组织核对'
        result=maintenance_store.save('upgrades',card,maintenance_store.hashof(before))
        self.assertEqual(result['card']['affiliationIds'],['1083'])
        for bad in [['missing'],['1083','1083'],'1083']:
            card['affiliationIds']=bad
            with self.assertRaises(ValueError):maintenance_store.validate('upgrades',card)

if __name__=='__main__':unittest.main()
