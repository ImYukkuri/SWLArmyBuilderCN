"""Prepare a reviewed local release. Does not run Git, upload or deploy."""
import argparse
import json
import re
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ENTRY = re.compile(r'^## \[(\d+\.\d+\.\d+)\] - (\d{4}-\d{2}-\d{2})$', re.M)


def run(root, command, bump=None):
    log_path = root / 'CHANGELOG.md'
    log = log_path.read_text(encoding='utf-8')
    package_path = root / 'package.json'
    package = json.loads(package_path.read_text(encoding='utf-8'))
    entries = list(ENTRY.finditer(log))
    marker = '## [未发布]'
    if marker not in log:
        raise ValueError('更新日志缺少未发布区域')
    start = log.index(marker) + len(marker)
    end = entries[0].start() if entries else len(log)
    pending = log[start:end].strip()
    if command == 'check':
        if not entries or entries[0].group(1) != package['version']:
            raise ValueError('请先整理更新内容并运行 python tools/release.py prepare')
        if pending:
            raise ValueError('仍有未发布内容，请先完成版本准备')
        lock = root / 'package-lock.json'
        if lock.exists():
            data = json.loads(lock.read_text(encoding='utf-8'))
            if data.get('version') != package['version'] or data.get('packages',{}).get('',{}).get('version') != package['version']:
                raise ValueError('package-lock.json 版本不一致')
        return package['version']
    if not pending or not re.search(r'^- \S', pending, re.M):
        if entries:
            return run(root, 'check')
        raise ValueError('先填写此次发布的更新内容')
    if not entries:
        version = '0.8.0'
    else:
        major, minor, patch = map(int, entries[0].group(1).split('.'))
        level = bump or ('minor' if '### 新增' in pending else 'patch')
        version = f'{major}.{minor + 1}.0' if level == 'minor' else f'{major}.{minor}.{patch + 1}'
    pending = pending.replace('- 本轮改动仅在本地，未上传。', '').strip()
    header = log[:log.index(marker)]
    header = re.sub(r'当前计划版本：.*?。', '发布记录按新到旧排列。', header, count=1)
    log = header + marker + '\n\n' + f'## [{version}] - {date.today().isoformat()}\n\n' + pending + '\n\n' + log[end:]
    entries = list(ENTRY.finditer(log))
    if len(entries) > 10:
        for i in reversed(range(10, len(entries))):
            item = entries[i]
            stop = entries[i + 1].start() if i + 1 < len(entries) else len(log)
            archive = root / 'docs/changelog' / (item.group(2)[:4] + '.md')
            archive.parent.mkdir(parents=True, exist_ok=True)
            existing = archive.read_text(encoding='utf-8') if archive.exists() else ''
            archive.write_text(log[item.start():stop].strip() + '\n\n' + existing, encoding='utf-8')
        log = log[:entries[10].start()]
    package['version'] = version
    package_path.write_text(json.dumps(package, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    lock = root / 'package-lock.json'
    if lock.exists():
        data = json.loads(lock.read_text(encoding='utf-8'))
        data['version'] = version
        if '' in data.get('packages', {}):
            data['packages']['']['version'] = version
        lock.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    log_path.write_text(log.rstrip() + '\n', encoding='utf-8')
    return version


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=['prepare', 'check'])
    parser.add_argument('--bump', choices=['patch', 'minor'])
    args = parser.parse_args()
    try:
        print(run(ROOT, args.command, args.bump))
    except ValueError as error:
        parser.exit(1, str(error) + '\n')
