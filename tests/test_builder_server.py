"""The actual local server must serve every dependency referenced by the builder."""
import json
from html.parser import HTMLParser
from http.server import ThreadingHTTPServer
from pathlib import Path
import sys
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
        for path in parser.paths:
            with self.subTest(path=path), urlopen(self.base + path) as response:
                self.assertEqual(response.status, 200)
                self.assertIn('javascript' if path.endswith('.js') else 'text/css', response.headers['Content-Type'])
                self.assertGreater(len(response.read()), 0)

    def test_maintenance_dependencies_are_served(self):
        for page in ['units.html', 'upgrades.html', 'commands.html', 'armies.html', 'rules.html']:
            with urlopen(self.base + page) as response:
                parser = Dependencies()
                parser.feed(response.read().decode('utf8'))
            self.assertIn('editor-shell.js', parser.paths)
            self.assertIn('editor.css', parser.paths)
            for path in parser.paths:
                with self.subTest(page=page, path=path), urlopen(self.base + path) as response:
                    self.assertEqual(response.status, 200)
                    self.assertGreater(len(response.read()), 0)

    def test_builder_data_and_font_are_readable(self):
        for name in ['units', 'upgrades', 'catalog-definitions', 'slot-rules', 'battle-deck']:
            with self.subTest(name=name), urlopen(self.base + f'data/{name}.json') as response:
                self.assertIsInstance(json.loads(response.read()), dict)
        with urlopen(self.base + 'assets/legion-icons.ttf') as response:
            self.assertGreater(len(response.read()), 0)

    def test_unknown_script_remains_unavailable(self):
        with self.assertRaises(HTTPError) as error:
            urlopen(self.base + 'not-a-runtime-module.js')
        self.assertEqual(error.exception.code, 404)
        error.exception.close()


if __name__ == '__main__':
    unittest.main()
