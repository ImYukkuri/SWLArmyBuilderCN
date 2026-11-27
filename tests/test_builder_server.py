"""The actual local server must serve every dependency referenced by the builder."""
import json
from html.parser import HTMLParser
from http.server import ThreadingHTTPServer
from pathlib import Path
import sys
import tempfile
import threading
import unittest
from urllib.request import urlopen
from urllib.error import HTTPError

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import server


class Dependencies(HTMLParser):
    def __init__(self):
        super().__init__()
        self.paths = []

    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        if tag == 'script' and values.get('src'):
            self.paths.append(values['src'])
        if tag == 'link' and values.get('rel') == 'stylesheet':
            self.paths.append(values['href'])


class BuilderServerTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.http = ThreadingHTTPServer(('127.0.0.1', 0), server.Handler)
        cls.thread = threading.Thread(target=cls.http.serve_forever, daemon=True)
        cls.thread.start()
        cls.base = f'http://127.0.0.1:{cls.http.server_port}/'

    @classmethod
    def tearDownClass(cls):
        cls.http.shutdown()
        cls.http.server_close()
        cls.thread.join()

    def test_every_builder_script_and_stylesheet_is_served(self):
        with urlopen(self.base) as response:
            parser = Dependencies()
            parser.feed(response.read().decode('utf8'))
        self.assertIn('builder-home.js', parser.paths)
        self.assertIn('builder-settings.js', parser.paths)
        for path in parser.paths:
            with self.subTest(path=path), urlopen(self.base + path) as response:
                self.assertEqual(response.status, 200)
                self.assertIn('javascript' if path.endswith('.js') else 'text/css', response.headers['Content-Type'])
                self.assertGreater(len(response.read()), 0)

    def test_maintenance_dependencies_are_served(self):
        for page in ['units.html', 'upgrades.html', 'commands.html', 'armies.html', 'rules.html', 'keywords.html', 'battleforce-editor.html']:
            with urlopen(self.base + page) as response:
                parser = Dependencies()
                parser.feed(response.read().decode('utf8'))
            self.assertIn('editor-shell.js', parser.paths)
            self.assertIn('editor.css', parser.paths)
            self.assertIn('editor-symbols.js', parser.paths)
            self.assertIn('rule-icons.js', parser.paths)
            for path in parser.paths:
                with self.subTest(page=page, path=path), urlopen(self.base + path) as response:
                    self.assertEqual(response.status, 200)
                    self.assertGreater(len(response.read()), 0)

    def test_builder_data_and_font_are_readable(self):
        for name in ['units', 'upgrades', 'catalog-definitions', 'slot-rules', 'battle-deck', 'tts-names']:
            with self.subTest(name=name), urlopen(self.base + f'data/{name}.json') as response:
                self.assertIsInstance(json.loads(response.read()), dict)
        with urlopen(self.base + 'assets/legion-icons.ttf') as response:
            self.assertGreater(len(response.read()), 0)

    def test_terrain_reference_is_served_as_a_pdf(self):
        with urlopen(self.base + 'assets/references/terrain-layout-cards-doc62.pdf') as response:
            self.assertEqual(response.status, 200)
            self.assertEqual(response.headers['Content-Type'], 'application/pdf')
            self.assertGreater(len(response.read()), 100_000)

    def test_mission_editor_saves_both_catalog_representations_and_checks_revision(self):
        with urlopen(self.base + 'missions.html') as response:
            parser = Dependencies()
            parser.feed(response.read().decode('utf8'))
        for dependency in parser.paths:
            with urlopen(self.base + dependency) as response:
                self.assertEqual(response.status, 200)
        with urlopen(self.base + 'api/missions') as response:
            current = json.load(response)
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'battle-deck.json'
            path.write_bytes(server.encoded(current['catalog']))
            item = {'id': 'first', 'name': '测试', 'points': 2, 'repeatable': False, 'globalOnce': True, 'poi': False}
            payload = {'category': 'secondary', 'id': 'objective-13', 'revision': server.digest(path.read_bytes()),
                       'scoreItems': [item], 'tokens': [{'name': '测试标记', 'quantity': 3}]}
            saved = server.save_mission_fields(path, payload)
            for key in ('secondary', 'objectives'):
                card = next(card for card in saved['catalog'][key] if card['id'] == payload['id'])
                self.assertEqual(card['scoreItems'], [item])
                self.assertEqual(card['tokens'], payload['tokens'])
            with self.assertRaises(FileExistsError):
                server.save_mission_fields(path, payload)
            self.assertEqual(server.digest(path.read_bytes()), saved['revision'])

    def test_unknown_script_remains_unavailable(self):
        with self.assertRaises(HTTPError) as error:
            urlopen(self.base + 'not-a-runtime-module.js')
        self.assertEqual(error.exception.code, 404)
        error.exception.close()


if __name__ == '__main__':
    unittest.main()
