import copy
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import maintenance_store as store
import rules


class CommandRequirementsTest(unittest.TestCase):
    def test_both_characters_and_all_versions(self):
        hans=['rebels-solo','rebels-han-solo-tauntaun']
        lukes=['rebels-luke-skywalker-hero','rebels-luke-skywalker-jedi','rebels-luke-tauntaun']
        cases=[([],False)]+[([u],False)for u in hans+lukes]+[([h,l],True)for h in hans for l in lukes]
        for ids,expected in cases:
            with self.subTest(units=ids):
                army={'armyId':1,'mode':'standard','pointsLimit':1000,'units':[{'unitId':uid,'instanceId':str(i),'upgrades':[]}for i,uid in enumerate(ids)],'commandIds':['18903'],'options':[]}
                before=copy.deepcopy(army)
                found=any(i['code']=='command_required_units'for i in rules.validate_army(army)['issues'])
                self.assertEqual(found,not expected)
                self.assertEqual(army,before)

    def test_groups_validate_and_survive_save_reload(self):
        defs=json.loads((store.ROOT/'data/catalog-definitions.json').read_bytes())
        card=copy.deepcopy(next(c for c in defs['commands']if c['id']=='18903'))
        store.validate('commands',card)
        for groups in [None,{},[[]],[[True]],[[15,15]],[[0]],[[{'id':15}]]]:
            with self.subTest(groups=groups),self.assertRaises(ValueError):
                store.validate('commands',{**card,'requiredUnitGroups':groups})
        with tempfile.TemporaryDirectory()as temp:
            root=Path(temp);(root/'data').mkdir()
            (root/'data/catalog-definitions.json').write_bytes(store.encode({'commands':[card]}))
            with patch.object(store,'ROOT',root):
                before=store.read('commands')
                card['requiredUnitGroups']=[[15,32594],[4,46,32593]]
                saved=store.save('commands',card,before['revision'])
                self.assertEqual(store.read('commands')['catalog']['commands'][0]['requiredUnitGroups'],card['requiredUnitGroups'])
                with self.assertRaises(FileExistsError):store.save('commands',card,before['revision'])
                self.assertTrue(saved['snapshot'])


if __name__=='__main__':unittest.main()
