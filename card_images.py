"""Deterministic card previews. Full-size sources are never modified here."""
import hashlib
import io
import os
import uuid
from pathlib import Path

from PIL import Image, ImageOps


def thumbnail(root, source):
    """Return a versioned assets path, or None when a card has no local image."""
    if not source:
        return None
    root = Path(root).resolve()
    path = (root / source).resolve()
    assets = root / 'assets'
    if not path.is_relative_to(assets) or not path.is_file():
        return None
    relative = path.relative_to(assets)
    # Upgrade artwork is shown in small slots; command/deck tiles are wider.
    width = 480 if relative.parts[0] in ('command-cards', 'battle-deck') else 360
    content = path.read_bytes()
    digest = hashlib.sha256(content + f'thumbnail-v1:{width}:82'.encode()).hexdigest()[:12]
    target = assets / 'thumbnails' / relative.parent / f'{path.stem}-{digest}.webp'
    if not target.is_file():
        with Image.open(io.BytesIO(content)) as original:
            image = ImageOps.exif_transpose(original)
            image = image.convert('RGBA' if 'A' in image.getbands() else 'RGB')
            image.thumbnail((width, width * 2), Image.Resampling.LANCZOS)
            target.parent.mkdir(parents=True, exist_ok=True)
            temporary = target.with_name('.' + target.name + '.' + uuid.uuid4().hex + '.tmp')
            try:
                image.save(temporary, format='WEBP', quality=82, method=6)
                os.replace(temporary, target)
            finally:
                temporary.unlink(missing_ok=True)
    return target.relative_to(root).as_posix()


def update_card_thumbnails(root, card, kind):
    if kind == 'upgrades':
        targets = [face.setdefault('assets', {}) for face in (card, card.get('back')) if face]
        field = 'front'
    else:
        targets, field = [card], 'image'
    for target in targets:
        preview = thumbnail(root, target.get(field))
        if preview:
            target['thumbnail'] = preview
        else:
            target.pop('thumbnail', None)
