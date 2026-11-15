import json
from pathlib import Path
import tempfile
import unittest
from tools.release import run


class ReleaseTest(unittest.TestCase):
    def test_prepare_retry_bump_archive_and_gate(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            (root/'package.json').write_text('{"version":"0.8.0"}',encoding='utf-8')
            (root/'CHANGELOG.md').write_text('# 更新日志\n\n## [未发布]\n\n### 新增\n\n- 双面卡\n',encoding='utf-8')
            with self.assertRaises(ValueError):run(root,'check')
            self.assertEqual(run(root,'prepare'),'0.8.0')
            self.assertEqual(run(root,'prepare'),'0.8.0')
            for i in range(1,12):
                p=root/'CHANGELOG.md';p.write_text(p.read_text(encoding='utf-8').replace('## [未发布]','## [未发布]\n\n### 修复\n\n- 修复 '+str(i),1),encoding='utf-8')
                self.assertEqual(run(root,'prepare'),f'0.8.{i}')
            self.assertEqual(run(root,'check'),'0.8.11')
            text=(root/'CHANGELOG.md').read_text(encoding='utf-8')
            self.assertEqual(text.count('## [0.8.'),10)
            archived=''.join(p.read_text(encoding='utf-8') for p in (root/'docs/changelog').glob('*.md'))
            self.assertIn('## [0.8.0]',archived);self.assertIn('## [0.8.1]',archived)
            self.assertEqual(json.loads((root/'package.json').read_text())['version'],'0.8.11')


if __name__=='__main__':unittest.main()
