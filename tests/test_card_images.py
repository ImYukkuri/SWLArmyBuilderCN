import copy
import io
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from PIL import Image

import maintenance_store as store
from card_images import thumbnail


class CardImageTest(unittest.TestCase):
    def test_thumbnail_preserves_source_and_changes_when_source_changes(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source = root / 'assets/upgrade-cards/sample.png'
            source.parent.mkdir(parents=True)
            Image.new('RGBA', (725, 1040), (20, 40, 80, 128)).save(source)
            original = source.read_bytes()
            relative = thumbnail(root, source.relative_to(root).as_posix())
            self.assertEqual(source.read_bytes(), original)
            with Image.open(root / relative) as preview:
                self.assertEqual(preview.width, 360)
                self.assertLess(abs(preview.width / preview.height - 725 / 1040), .002)
                self.assertIn('A', preview.getbands())
            stamp = (root / relative).stat().st_mtime_ns
            self.assertEqual(thumbnail(root, source.relative_to(root).as_posix()), relative)
            self.assertEqual((root / relative).stat().st_mtime_ns, stamp)
            Image.new('RGB', (725, 1040), 'green').save(source)
            self.assertNotEqual(thumbnail(root, source.relative_to(root).as_posix()), relative)

    def test_command_upload_refreshes_thumbnail_and_direct_source_edits_follow_it(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / 'data').mkdir()
            card = {'id': 'test-command', 'name': {'en': 'Test'}, 'pips': 1}
            (root / 'data/catalog-definitions.json').write_bytes(store.encode({'commands': [card]}))
            with patch.object(store, 'ROOT', root):
                results = []
                for color in ('red', 'blue'):
                    buffer = io.BytesIO()
                    Image.new('RGB', (726, 1039), color).save(buffer, format='PNG')
                    results.append(store.save_image('commands', card['id'], buffer.getvalue(), store.read('commands')['revision']))
                first, second = results
                self.assertNotEqual(first['card']['thumbnail'], second['card']['thumbnail'])
                self.assertTrue((root / second['card']['thumbnail']).is_file())
                stale = copy.deepcopy(second['card'])
                stale['thumbnail'] = first['card']['thumbnail']
                saved = store.save('commands', stale, second['revision'])
                self.assertEqual(saved['card']['thumbnail'], second['card']['thumbnail'])
                changed = copy.deepcopy(second['card'])
                changed['image'] = None
                result = store.save('commands', changed, saved['revision'])
                self.assertNotIn('thumbnail', result['card'])

    def test_every_referenced_full_card_has_a_valid_preview(self):
        root = Path(__file__).resolve().parents[1]
        upgrades = json.loads((root / 'data/upgrades.json').read_bytes())['cards']
        pairs = []
        for card in upgrades:
            for face in (card, card.get('back')):
                if face and face.get('assets', {}).get('front'):
                    pairs.append((face['assets']['front'], face['assets'].get('thumbnail')))
        definitions = json.loads((root / 'data/catalog-definitions.json').read_bytes())
        deck = json.loads((root / 'data/battle-deck.json').read_bytes())
        cards = definitions['commands'] + [c for value in deck.values() if isinstance(value, list) for c in value]
        pairs.extend((c['image'], c.get('thumbnail')) for c in cards if c.get('image'))
        for source, preview in pairs:
            with self.subTest(source=source):
                self.assertTrue(preview and preview.startswith('assets/thumbnails/'))
                self.assertTrue((root / source).is_file())
                self.assertTrue((root / preview).is_file())


if __name__ == '__main__':
    unittest.main()
