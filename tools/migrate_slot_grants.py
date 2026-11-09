#!/usr/bin/env python3
"""Merge the two slot-grant mechanisms into one card-level field.

Before:
  * data/slot-rules.json dedicatedGrants  -> unit-qualification grants (7 cards)
  * card.rules.slotEffects                -> equipped-card grants (26 cards)

After:
  * card.rules.slotGrants: [{trigger:"unitQualifies"|"equipped", slot, ...}]

Usage: python tools/migrate_slot_grants.py --apply
"""
import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
UPGRADES = ROOT / "data/upgrades.json"
SLOTRULES = ROOT / "data/slot-rules.json"

# dedicatedGrants key -> owning card id
OWNER = {
    "electrobinoculars": "gear-binoculars",
    "portable_scanner": "gear-portable",
    "strike_and_fade": "training-strike-and-fade",
    "door_gunners": "crew-door-gunner",
    "imperial_march": "training-imperial-march",
    "dug_in": "training-dug-in",
    "hit_the_dirt": "hit-the-dirt",
}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()
    up = json.loads(UPGRADES.read_text(encoding="utf-8"))
    pkg = json.loads(SLOTRULES.read_text(encoding="utf-8"))
    cards = {c["id"]: c for c in up["cards"]}

    moved = 0
    for key, grant in (pkg.get("dedicatedGrants") or {}).items():
        card_id = OWNER.get(key)
        if not card_id or card_id not in cards:
            print("SKIP unknown grant owner:", key, "->", card_id)
            continue
        entry = {"trigger": "unitQualifies", "slot": grant.get("grants") or key}
        if grant.get("condition") is not None:
            entry["condition"] = grant["condition"]
        if grant.get("holders"):
            entry["holders"] = grant["holders"]
        if grant.get("ifAbsentAny"):
            entry["ifAbsentAny"] = grant["ifAbsentAny"]
        if grant.get("note"):
            entry["note"] = grant["note"]
        rules = cards[card_id].setdefault("rules", {})
        grants = rules.setdefault("slotGrants", [])
        grants.append(entry)
        moved += 1

    converted = 0
    for card in up["cards"]:
        rules = card.setdefault("rules", {})
        effects = rules.pop("slotEffects", None)
        if not effects:
            continue
        grants = rules.setdefault("slotGrants", [])
        for eff in effects:
            if not isinstance(eff, dict) or eff.get("type") != "addSlot" or not eff.get("slot"):
                continue
            entry = {"trigger": "equipped", "slot": eff["slot"]}
            if eff.get("when") is not None:
                entry["when"] = eff["when"]
            grants.append(entry)
            converted += 1

    cards_with_grants = sum(1 for c in up["cards"] if (c.get("rules") or {}).get("slotGrants"))
    print(json.dumps({"moved_dedicated": moved, "converted_effects": converted,
                      "cards_with_grants": cards_with_grants,
                      "dedicatedGrants_left": len(pkg.get("dedicatedGrants") or {})},
                     ensure_ascii=False))
    if args.apply:
        pkg.pop("dedicatedGrants", None)
        UPGRADES.write_text(json.dumps(up, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        SLOTRULES.write_text(json.dumps(pkg, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print("applied")


if __name__ == "__main__":
    main()
