"""Assemble the public static list builder into dist/ for GitHub Pages.

Only the read-only builder and the data it needs are copied. Editor pages,
local drafts (armies.json), history, OCR evidence and tooling stay out.
"""
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"

FILES = [
    "index.html",
    "builder.js",
    "builder-view.js",
    "builder-model.js",
    "builder-library.js",
    "builder-home.js",
    "dice-enums.js",
    "rules-core.js",
    "builder.css",
    "data/units.json",
    "data/upgrades.json",
    "data/catalog-definitions.json",
    "data/slot-rules.json",
    "data/battle-deck.json",
]
DIRS = ["assets"]


def main():
    if DIST.exists():
        shutil.rmtree(DIST)
    DIST.mkdir(parents=True)
    for rel in FILES:
        src = ROOT / rel
        dst = DIST / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)
    for rel in DIRS:
        src = ROOT / rel
        if src.is_dir():
            shutil.copytree(src, DIST / rel)
    (DIST / ".nojekyll").write_text("", encoding="utf-8")
    # Published builder must not link to the local-only data editor.
    index = DIST / "index.html"
    text = index.read_text(encoding="utf-8")
    text = text.replace('<a href="maintenance.html">数据维护</a>', '')
    index.write_text(text, encoding="utf-8")
    count = sum(1 for _ in DIST.rglob("*") if _.is_file())
    print(f"dist/ ready: {count} files")


if __name__ == "__main__":
    main()
