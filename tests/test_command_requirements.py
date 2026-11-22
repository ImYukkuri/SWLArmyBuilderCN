import copy
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import maintenance_store as store
import rules
import command_requirements as matching


class CommandRequirementsTest(unittest.TestCase):
    def test_hidden_command_does_not_count_toward_hand(self):
        army = {'armyId': 2, 'mode': 'standard', 'pointsLimit': 1000,
                'units': [], 'options': [], 'commandIds': ['3086', '3086', '8']}
        before = copy.deepcopy(army)
        issues = rules.validate_army(army)['issues']
        self.assertEqual(sum(i['code'] == 'command_hidden' for i in issues), 2)
        self.assertTrue(any(i['code'] == 'command_min' and '3 点' in i['message'] for i in issues))
        self.assertEqual(army, before)

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

    def test_new_conditions_save_restore_and_reject_incomplete_rows(self):
        defs=json.loads((store.ROOT/'data/catalog-definitions.json').read_bytes())
        card=copy.deepcopy(next(c for c in defs['commands'] if c['id']=='20052'))
        for requirements in [None, {}, {'any':[{'all':[]}]}, {'any':[{'all':[{'type':'unitNames','values':['Han Solo']}]}]},
                             {'any':[{'all':[{'type':'unit','all':[{'field':[], 'values':['x']}]}]}]}]:
            with self.subTest(requirements=requirements), self.assertRaises(ValueError):
                store.validate('commands',{**card,'requirements':requirements})
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);(root/'data').mkdir()
            (root/'data/catalog-definitions.json').write_bytes(store.encode({'commands':[card]}))
            with patch.object(store,'ROOT',root):
                changed=copy.deepcopy(card);changed['requirements']={'any':[{'all':[{'type':'battleForce','values':[28]}]}]}
                result=store.save('commands',changed,store.read('commands')['revision'])
                self.assertEqual(store.read('commands')['catalog']['commands'][0]['requirements'],changed['requirements'])
                restored=store.restore('commands',result['snapshot'],card['id'],result['revision'])
                self.assertEqual(restored['card']['requirements'],card['requirements'])

    def test_python_effective_matching_and_mounted_form(self):
        units,upgrades,defs=rules.load_cards();pkg=rules.load_package()
        def check(requirements,ids,army_id=4,equipped=None):
            army={'armyId':army_id,'units':[{'unitId':id,'upgrades':equipped or []}for id in ids]}
            return not matching.failures(requirements,matching.context(army,units,upgrades,defs,pkg,rules.apply_property_effects))
        common=next(c for c in defs['commands'] if c['id']=='51')['requirements']
        mounted=next(c for c in defs['commands'] if c['id']=='20052')['requirements']
        self.assertTrue(check(common,['new-unit-mw9obgc9']))
        self.assertTrue(check(mounted,['new-unit-mw9obgc9']))
        self.assertFalse(check(mounted,['republic-obiwan','republic-anakin-barc']))
        self.assertTrue(check({'any':[{'all':[{'type':'armyFaction','values':[8]}]}]},[],22))
        upgrade={'id':'qa-org','rules':{'replaceProperties':[[{'property':'affiliation','value':[965]}]]}}
        upgrades['qa-org']=upgrade
        req={'any':[{'all':[{'type':'unit','all':[{'field':'affiliationIds','values':['965']}]}]}]}
        self.assertFalse(check(req,['republic-obiwan']))
        self.assertTrue(check(req,['republic-obiwan'],equipped=[{'upgradeId':'qa-org'}]))


if __name__=='__main__':unittest.main()
