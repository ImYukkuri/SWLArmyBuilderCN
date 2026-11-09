"""Merge the upstream (legion.json) fields the rule engine needs into our own
card JSON files (data/upgrades.json, data/units.json), so the runtime never
needs to read the upstream snapshot again.

This only ADDS missing machine-rule fields; it never overwrites existing
values (human edits win). Idempotent.
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
UPSTREAM = ROOT / "references/upstream/legion.json"

UPGRADE_FIELDS = [
    "availableIn", "unavailableWith", "factions", "requiredProperties",
    "poolBonuses", "modifiedPointsWith", "chooseOneKey", "requiredDivisions",
]
UNIT_RULE_FIELDS = ["tierCounting", "quantityLimitedBy", "requiredChildren"]


def main():
    full = json.loads(UPSTREAM.read_text(encoding="utf-8"))
    up_upgrades = {str(x["id"]): x for x in full["data"]["upgrades"]}
    up_units = {str(x["id"]): x for x in full["data"]["units"]}

    # ---- upgrades ----
    upgrades = json.loads((ROOT / "data/upgrades.json").read_text(encoding="utf-8"))
    merged_up = 0
    for card in upgrades["cards"]:
        uid = str((card.get("upstream") or {}).get("id", ""))
        rec = up_upgrades.get(uid)
        if not rec:
            continue
        rules = card.setdefault("rules", {})
        for k in UPGRADE_FIELDS:
            if rules.get(k) not in (None, [], {}) and k != "unavailableWith":
                continue
            if rec.get(k) in (None, [], {}):
                continue
            if k == "unavailableWith" and rules.get("unavailableWith"):
                # keep local name-based conflicts; store upstream object form separately
                rules.setdefault("unavailableWithIds", rec[k])
                merged_up += 1
                continue
            rules[k] = json.loads(json.dumps(rec[k]))
            merged_up += 1
    (ROOT / "data/upgrades.json").write_text(
        json.dumps(upgrades, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    # ---- units ----
    units = json.loads((ROOT / "data/units.json").read_text(encoding="utf-8"))
    merged_unit = 0
    for unit in units["units"]:
        uid = str((unit.get("upstream") or {}).get("id", ""))
        rec = up_units.get(uid)
        if not rec:
            continue
        rules = unit.setdefault("rules", {})
        for k in UNIT_RULE_FIELDS:
            if rules.get(k) in (None, [], {}):
                if rec.get(k) not in (None, [], {}):
                    rules[k] = json.loads(json.dumps(rec[k]))
                    merged_unit += 1
        # faction-level tierPools / tierCounting -> local factions entries
        for local_f in unit.get("factions", []):
            for up_f in rec.get("factions", []):
                if up_f.get("id") == local_f.get("id"):
                    if up_f.get("tierPools"):
                        local_f["tierPools"] = up_f["tierPools"]
                        merged_unit += 1
                    if up_f.get("tierCounting"):
                        local_f["tierCounting"] = up_f["tierCounting"]
                        merged_unit += 1
    (ROOT / "data/units.json").write_text(
        json.dumps(units, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    print(f"merged: upgrades={merged_up} field writes, units={merged_unit} field writes")


if __name__ == "__main__":
    main()
