"""Initialize each unit's Light/Dark divisions tag from its faction.

The faction rule is only a starting point: Rebel/Republic -> Light,
Empire/Separatist/Mercenary/Criminal Syndicate -> Dark. The tag lives on the
unit so it can be edited per-unit later (e.g. a Light mercenary, or a unit
usable by both sides). Idempotent: never overwrites an existing tag.
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LIGHT = {1, 4}
DARK = {2, 3, 5, 6}


def main():
    path = ROOT / "data/units.json"
    units = json.loads(path.read_text(encoding="utf-8"))
    tagged = 0
    for u in units["units"]:
        if u.get("divisions"):
            continue
        fid = u.get("factionId")
        if fid in LIGHT:
            u["divisions"] = ["Light"]
            tagged += 1
        elif fid in DARK:
            u["divisions"] = ["Dark"]
            tagged += 1
    path.write_text(json.dumps(units, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"tagged {tagged} units with divisions")


if __name__ == "__main__":
    main()
