"""Upgrade deletion is reversible and cannot overwrite concurrent catalog edits."""
import copy
import json
from http.server import ThreadingHTTPServer
from pathlib import Path
import tempfile
import threading
import unittest
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from PIL import Image

import maintenance_store as store
import server
from card_images import update_card_thumbnails


class UpgradeDeletionTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / 'data').mkdir()
        (self.root / 'assets').mkdir()
        Image.new('RGB', (64, 96), '#345678').save(self.root / 'assets/card.webp')
        self.artwork = (self.root / 'assets/card.webp').read_bytes()
        self.card = {
            'id': 'test-upgrade', 'numericId': 17, 'name': {'en': 'Test Upgrade', 'zh': '测试升级'},
            'points': 5, 'slotIds': [1, 10], 'usage': 'unit_upgrade',
            'rules': {'slotTypes': [1, 10]}, 'assets': {'front': 'assets/card.webp'},
            'description': {'en': [], 'zh': []}, 'keywords': [], 'weapons': [],
            'requirementsText': [], 'review': {'status': 'reviewed'}, 'dualSided': True,
            'back': {'name': {'en': 'Back', 'zh': '反面'}, 'assets': {'front': 'assets/card.webp'},
                     'description': {'en': ['Back effect'], 'zh': ['反面效果']}, 'keywords': [], 'weapons': []},
        }
        update_card_thumbnails(self.root, self.card, 'upgrades')
        self.other = {'id': 'other-upgrade', 'sentinel': 'unchanged'}
        self.path = self.root / 'data/upgrades.json'
        self.path.write_bytes(store.encode({'cards': [self.card, self.other]}))
        self.related = {
            'data/units.json': {'units': [{'id': 'host', 'equipUpgradeIds': [self.card['id']]}]},
            'data/armies.json': {'armies': [{'units': [{'upgrades': [{'upgradeId': self.card['id']}]}]}]},
        }
        for name, value in self.related.items():
            (self.root / name).write_bytes(store.encode(value))
        patcher = patch.object(store, 'ROOT', self.root)
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_delete_and_restore_both_faces_preserves_art_and_related_documents(self):
        before = self.path.read_bytes()
        result = store.delete('upgrades', self.card['id'], store.read('upgrades')['revision'])
        self.assertEqual(store.read('upgrades')['catalog']['cards'], [self.other])
        self.assertEqual((self.root / 'history/upgrades' / result['snapshot']).read_bytes(), before)
        self.assertEqual((self.root / 'assets/card.webp').read_bytes(), self.artwork)
        for name, value in self.related.items():
            self.assertEqual((self.root / name).read_bytes(), store.encode(value))
        restored = store.restore('upgrades', result['snapshot'], self.card['id'], result['revision'])
        self.assertEqual(restored['card'], self.card)
        self.assertEqual(store.read('upgrades')['catalog']['cards'], [self.other, self.card])

    def test_stale_and_missing_deletions_leave_catalog_and_history_untouched(self):
        before = self.path.read_bytes()
        with self.assertRaises(FileExistsError):
            store.delete('upgrades', self.card['id'], 'stale')
        with self.assertRaises(ValueError):
            store.delete('upgrades', 'missing', store.hashof(before))
        self.assertEqual(self.path.read_bytes(), before)
        self.assertEqual(store.history('upgrades'), [])

    def test_restore_does_not_overwrite_a_later_edit(self):
        result = store.delete('upgrades', self.card['id'], store.read('upgrades')['revision'])
        latest = store.read('upgrades')['catalog']
        latest['cards'][0]['sentinel'] = 'newer edit'
        self.path.write_bytes(store.encode(latest))
        with self.assertRaises(FileExistsError):
            store.restore('upgrades', result['snapshot'], self.card['id'], result['revision'])
        self.assertEqual(store.read('upgrades')['catalog'], latest)
        self.assertEqual(len(store.history('upgrades')), 1)

    def test_removing_all_candidate_slots_saves_both_fields_and_retains_faces(self):
        changed = copy.deepcopy(self.card)
        changed['slotIds'] = []
        changed['rules']['slotTypes'] = []
        result = store.save('upgrades', changed, store.read('upgrades')['revision'])
        self.assertEqual(result['card']['slotIds'], [])
        self.assertEqual(result['card']['back'], self.card['back'])
        inconsistent = copy.deepcopy(self.card)
        inconsistent['slotIds'] = []
        with self.assertRaises(ValueError):
            store.save('upgrades', inconsistent, result['revision'])

    def test_local_http_delete_and_restore_obey_revision_and_origin(self):
        http = ThreadingHTTPServer(('127.0.0.1', 0), server.Handler)
        worker = threading.Thread(target=http.serve_forever, daemon=True)
        worker.start()
        base = f'http://127.0.0.1:{http.server_port}'

        def post(action, body, origin=base):
            request = Request(base + '/api/upgrades/' + action, data=store.encode(body),
                              headers={'Origin': origin, 'Content-Type': 'application/json'})
            with urlopen(request) as response:
                return json.load(response)

        try:
            payload = {'id': self.card['id'], 'revision': store.read('upgrades')['revision']}
            with self.assertRaises(HTTPError) as rejected:
                post('delete', payload, origin='https://other.invalid')
            self.assertEqual(rejected.exception.code, 403)
            rejected.exception.close()
            deleted = post('delete', payload)
            with self.assertRaises(HTTPError) as conflict:
                post('delete', payload)
            self.assertEqual(conflict.exception.code, 409)
            conflict.exception.close()
            restored = post('restore', {'id': self.card['id'], **deleted})
            self.assertEqual(restored['card'], self.card)
        finally:
            http.shutdown()
            http.server_close()
            worker.join()


if __name__ == '__main__':
    unittest.main()
