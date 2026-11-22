"""Compress battlefield PNGs and build card thumbnails; keep backups outside the repo.

Usage: python tools/prepare_card_images.py --backup-dir <external-directory>
Requires Pillow. Generated assets are checked in; Pages builds need no Pillow.
Reruns reuse thumbnails and never recompress existing battlefield WebP files.
"""
import argparse
import hashlib
import json
import shutil
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from card_images import update_card_thumbnails


def encode(value):
    return (json.dumps(value, ensure_ascii=False, indent=2) + '\n').encode('utf-8')


def source_hashes():
    return {p.relative_to(ROOT).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest()
            for folder in ('upgrade-cards', 'command-cards')
            for p in (ROOT / 'assets' / folder).rglob('*') if p.is_file()}


def prepare(backup):
    backup = backup.resolve()
    if backup == ROOT or backup.is_relative_to(ROOT):
        raise ValueError('Backups must be outside the repository')
    backup.mkdir(parents=True, exist_ok=True)
    before = source_hashes()
    names = ('battle-deck', 'upgrades', 'catalog-definitions')
    catalogs = {}
    for name in names:
        path = ROOT / 'data' / f'{name}.json'
        destination = backup / 'data' / path.name
        destination.parent.mkdir(parents=True, exist_ok=True)
        if not destination.exists():
            shutil.copy2(path, destination)
        catalogs[name] = json.loads(path.read_bytes())
    battlefield = [c for value in catalogs['battle-deck'].values()
                   if isinstance(value, list) for c in value]
    sources = sorted({c['image'] for c in battlefield if c.get('image')})
    original_size = sum((ROOT / rel).stat().st_size for rel in sources)
    replacements = {}
    for rel in sources:
        path = ROOT / rel
        if path.suffix.lower() != '.png':
            continue
        destination = backup / rel
        destination.parent.mkdir(parents=True, exist_ok=True)
        if destination.exists() and destination.read_bytes() != path.read_bytes():
            raise ValueError(f'Backup differs; choose a new backup directory: {rel}')
        if not destination.exists():
            shutil.copy2(path, destination)
        compressed = path.with_suffix('.webp')
        if compressed.exists():
            raise ValueError(f'Refusing to overwrite an existing source: {compressed.name}')
        with Image.open(path) as image:
            image.save(compressed, format='WEBP', quality=92, method=6)
        replacements[rel] = compressed.relative_to(ROOT).as_posix()
    for card in battlefield:
        if card.get('image') in replacements:
            card['image'] = replacements[card['image']]
        update_card_thumbnails(ROOT, card, 'battle-deck')
    for card in catalogs['upgrades']['cards']:
        update_card_thumbnails(ROOT, card, 'upgrades')
    for card in catalogs['catalog-definitions']['commands']:
        update_card_thumbnails(ROOT, card, 'commands')
    # Write references before removing backed-up PNGs from the public assets.
    for name, catalog in catalogs.items():
        path = ROOT / 'data' / f'{name}.json'
        content = encode(catalog)
        if path.read_bytes() != content:
            path.write_bytes(content)
    for rel in replacements:
        (ROOT / rel).unlink()
    if source_hashes() != before:
        raise RuntimeError('Upgrade or command source images changed')
    previews = sorted((ROOT / 'assets/thumbnails').rglob('*.webp'))
    report = {
        'battlefieldImages': len(sources), 'battlefieldBeforeBytes': original_size,
        'battlefieldAfterBytes': sum((ROOT / replacements.get(rel, rel)).stat().st_size for rel in sources),
        'thumbnails': len(previews), 'thumbnailBytes': sum(p.stat().st_size for p in previews),
        'originalUpgradeCommandImagesUnchanged': len(before),
    }
    (backup / 'image-report.json').write_bytes(encode(report))
    (backup / 'original-image-hashes.json').write_bytes(encode(before))
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--backup-dir', type=Path, required=True)
    prepare(parser.parse_args().backup_dir)
