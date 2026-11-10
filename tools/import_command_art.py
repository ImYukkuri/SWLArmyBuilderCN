
#!/usr/bin/env python3
"""Attach command-card art and bilingual text to data/catalog-definitions.json.

Art comes from the LegionHelper extraction evidence (one PNG crop per card);
each crop is re-encoded to WebP under assets/command-cards/<upstreamId>.webp.
"""
import argparse
import json
import re
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
DEFS = ROOT / "data" / "catalog-definitions.json"
OUT_DIR = ROOT / "assets" / "command-cards"
DEFAULT_EVIDENCE_ROOT = ROOT.parent / "LegionHelper-trimmed-20261102-181515" / "tacticalcards"


def norm(value):
    return re.sub(r"[^a-z0-9]", "", str(value or "").lower())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--source", default=str(DEFAULT_EVIDENCE_ROOT))
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()

    src = Path(args.source)
    cards = []
    for name in ("commands.regular.bilingual.json", "commands.mandalorian.bilingual.json"):
        path = src / name
        if path.exists():
            payload = json.loads(path.read_text(encoding="utf-8"))
            cards.extend(payload.get("cards") or [])

    defs = json.loads(DEFS.read_text(encoding="utf-8"))
    by_name = {}
    for command in defs.get("commands") or []:
        by_name.setdefault(norm((command.get("name") or {}).get("en")), []).append(command)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    written, missing_crop, unmatched = 0, [], []
    for card in cards:
        targets = by_name.get(norm(card.get("name")))
        if not targets:
            unmatched.append(card.get("name"))
            continue
        provenance = (card.get("provenance") or [{}])[0]
        evidence = provenance.get("ocrEvidence") or ""
        crop = src / evidence.replace("-ocr.json", ".png") if evidence else None
        if not crop or not crop.exists():
            missing_crop.append(card.get("name"))
            continue
        for command in targets:
            rel = f"assets/command-cards/{command['id']}.webp"
            dest = ROOT / rel
            if not dest.exists() or args.apply:
                image = Image.open(crop).convert("RGB")
                image.save(dest, format="WEBP", quality=82, method=6)
            command["image"] = rel
            command["description"] = {
                "en": card.get("description") or "",
                "zh": (card.get("zh") or {}).get("description") or "",
            }
            command["orders"] = {
                "en": card.get("orders") or "",
                "zh": (card.get("zh") or {}).get("orders") or "",
            }
            command["owner"] = card.get("owner") or ""
            written += 1

    print(json.dumps({"cardsInSource": len(cards), "attached": written,
                      "noCrop": len(missing_crop), "unmatched": len(unmatched)}, ensure_ascii=False))
    for name in (missing_crop + unmatched)[:8]:
        print("  skipped:", name)
    if args.apply:
        DEFS.write_text(json.dumps(defs, ensure_ascii=False, indent=2) + chr(10), encoding="utf-8")
        print("wrote", DEFS)


if __name__ == "__main__":
    main()
