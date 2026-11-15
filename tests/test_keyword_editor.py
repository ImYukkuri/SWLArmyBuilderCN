import copy
import json
import tempfile
import threading
import unittest
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from unittest.mock import patch

import maintenance_store as store
import server


class KeywordEditorTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        (self.root / 'data').mkdir()
        self.source = json.loads((store.ROOT / 'data/catalog-definitions.json').read_bytes())
        self.card = copy.deepcopy(next(k for k in self.source['keywords'] if k['id'] == 'noncombatant'))
        (self.root / 'data/catalog-definitions.json').write_bytes(store.encode(self.source))
        self.patcher = patch.object(store, 'ROOT', self.root)
        self.patcher.start()
        self.http = server.ThreadingHTTPServer(('127.0.0.1', 0), server.Handler)
        self.thread = threading.Thread(target=self.http.serve_forever, daemon=True)
        self.thread.start()
        self.base = f'http://127.0.0.1:{self.http.server_port}'

    def tearDown(self):
        self.http.shutdown()
        self.http.server_close()
        self.thread.join()
        self.patcher.stop()
        self.temp.cleanup()

    def request(self, path, body=None):
        request = Request(self.base + path, data=None if body is None else store.encode(body),
                          headers={'Content-Type': 'application/json', 'Origin': self.base})
        with urlopen(request) as response:
            return json.loads(response.read())

    def test_noncombatant_content_and_timings(self):
        self.assertEqual(self.card['timing'], ['defense', 'attack'])
        self.assertEqual(self.card['summary'], '该模型无法攻击，受到伤害时，如可能，伤害优先分配给队长以外的其他模型。')
        self.assertIn('不能添加任何武器到攻击池中', self.card['full'])
        self.assertIn('如果带有非战斗人员关键词的模型已经有1个或更多伤害标记', self.card['full'])
        self.assertTrue(self.card['full'].endswith('否则非战斗人员模型不能被新的单位队长模型替换。'))

    def test_save_restore_and_command_revision_conflict(self):
        before = self.request('/api/keywords')
        self.card['summary'] = '测试新简写\n保留换行'
        self.card['timing'] = ['attack', 'defense', 'activation_end']
        saved = self.request('/api/keywords/save', {'card': self.card, 'revision': before['revision']})
        after = self.request('/api/keywords')['catalog']
        self.assertEqual(next(k for k in after['keywords'] if k['id'] == self.card['id']), self.card)
        for key, value in self.source.items():
            if key not in ('keywords', 'updatedAt'):
                self.assertEqual(after[key], value, key)
        self.assertEqual([k for k in after['keywords'] if k['id'] != self.card['id']],
                         [k for k in self.source['keywords'] if k['id'] != self.card['id']])
        self.assertEqual(len(self.request('/api/keywords/history')), 1)
        command = copy.deepcopy(self.source['commands'][0])
        with self.assertRaises(HTTPError) as conflict:
            self.request('/api/commands/save', {'card': command, 'revision': before['revision']})
        self.assertEqual(conflict.exception.code, 409)
        conflict.exception.close()
        command['owner'] = 'Concurrent edit'
        command_saved = self.request('/api/commands/save', {'card': command, 'revision': saved['revision']})
        with self.assertRaises(HTTPError) as conflict:
            self.request('/api/keywords/save', {'card': self.card, 'revision': saved['revision']})
        self.assertEqual(conflict.exception.code, 409)
        conflict.exception.close()
        restored = self.request('/api/keywords/restore', {'id': self.card['id'], 'snapshot': saved['snapshot'], 'revision': command_saved['revision']})
        self.assertEqual(restored['card'], next(k for k in self.source['keywords'] if k['id'] == self.card['id']))
        self.assertEqual(self.request('/api/keywords')['catalog']['commands'][0]['owner'], 'Concurrent edit')

    def test_new_keyword_duplicate_validation_and_metadata(self):
        # All legacy statuses and mappings must remain editable.
        for keyword in self.source['keywords']:
            store.validate('keywords', keyword)
        new = {**self.card, 'id': 'editor_test', 'upstreamIds': [123], 'customMeta': {'preserve': True}}
        first = self.request('/api/keywords')
        saved = self.request('/api/keywords/save', {'card': new, 'revision': first['revision'], 'create': True})
        self.assertEqual(saved['card']['customMeta'], {'preserve': True})
        for bad in [dict(new, timing=['defence']), dict(new, timing=['attack', 'attack']), dict(new, timing=[{}]),
                    dict(new, summary=[]), dict(new, full={}), dict(new, name={'zh': '', 'en': ''}),
                    dict(new, id='../keyword'), dict(new, upstreamIds=[True])]:
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                store.validate('keywords', bad)
        with self.assertRaises(HTTPError) as duplicate:
            self.request('/api/keywords/save', {'card': new, 'revision': saved['revision'], 'create': True})
        self.assertEqual(duplicate.exception.code, 400)
        duplicate.exception.close()
        self.assertEqual(self.request('/api/keywords')['revision'], saved['revision'])


if __name__ == '__main__':
    unittest.main()
