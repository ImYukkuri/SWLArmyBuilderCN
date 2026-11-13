import copy,json,sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from enrich_catalog import fill_names,apply_actions
from action_icons import ROOT,detect_lines

class EnrichmentTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.units=json.loads((ROOT/'data/units.json').read_bytes())['units']
        cls.jobs=json.loads((ROOT/'work/weapon-jobs.json').read_bytes())
    def test_same_keyword_different_printed_actions(self):
        expected=[('rebels-luke-skywalker-hero','jump','action'),('separatists-geonosian','jump','free-action'),('separatists-geonosian-engineer','jump','free-action'),('empire-id10-seeker','observe','free-action'),('republic-c3po','calculate_odds','action'),('republic-c3po','pending_distract','free-action')]
        for uid,key,action in expected:
            card=next(c for c in self.units if c['id']==uid)
            rule=next(k for k in card['keywords']if k.get('id')==key or k.get('id')=='pending_'+key.lower())
            self.assertEqual(rule['action'],action)
        byid={c['id']:c for c in self.units}
        for uid in ['rebels-luke-skywalker-hero','empire-id10-seeker']:
            card=byid[uid];job=next(j for j in self.jobs if j['image']==card['assets']['front'])
            lines=detect_lines(job);self.assertEqual(lines[0]['action'],'action'if uid.startswith('rebels')else'free-action')
            self.assertTrue(all(l['action']=='none'for l in lines[1:]))
    def test_missing_names_filled_existing_edits_preserved(self):
        card={'name':{'en':'STORMTROOPERS','zh':''},'title':{'en':'New title','zh':''}}
        mapping={'units':[{'name':{'en':'Stormtroopers','zh':'冲锋队'},'title':{'en':'','zh':''}}]}
        fill_names(card,mapping,{'names':{},'titles':{'New title':'新称号'}})
        self.assertEqual(card['name']['zh'],'冲锋队');self.assertEqual(card['title']['zh'],'新称号')
        card['name']['zh']='用户校订名';fill_names(card,mapping,{'names':{},'titles':{}});self.assertEqual(card['name']['zh'],'用户校订名')
    def test_actions_preserve_manual_changes_and_separate_line_terms(self):
        card={'keywords':[{'raw':'Jump 2','action':'free-action'},{'raw':'Mercenary','action':None}]}
        lines=[{'text':'Jump 2. Mercenary','action':'action','bbox':[1,2,3,4],'score':0}]
        apply_actions(card,lines);self.assertEqual(card['keywords'][0]['action'],'free-action');self.assertEqual(card['keywords'][1]['action'],'none')
    def test_all_current_names_and_titles_present(self):
        self.assertTrue(all(u['name']['zh']for u in self.units));self.assertTrue(all(not u['title']['en']or u['title']['zh']for u in self.units))
        original=json.loads((ROOT.parent/'LegionHelper/mappings/unit-names.zh.json').read_bytes())['units']
        names=json.loads((ROOT/'references/unit-names.zh.json').read_bytes())['units']
        self.assertEqual(names[:len(original)],original)
if __name__=='__main__':unittest.main()
