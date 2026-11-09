#!/usr/bin/env python3
"""Migrate rules.requiredProperties into the unified expression condition.

Unified condition: card.restrictions.condition, expression language
({all/any/not/field/op/value/ref}). requiredProperties is converted mechanically:

  {property:"unitType", value:8}     -> {field:"unit.unitTypeId", op:"eq", value:"local:wookiee_trooper"}
  {property:"faction", value:2}      -> {field:"unit.factionId", op:"eq", value:2}
  {property:"affiliation", value:3}  -> {field:"unit.affiliationIds", op:"contains", value:3}
  {property:"keywords", value:<upstream>} -> {field:"unit.keywords", op:"contains", value:<local>}

Groups are OR of ANDs. When a card already has restrictions.condition, the
converted expression is AND-merged with it.

Usage:
  python tools/migrate_conditions.py --dry-run   (default, prints report)
  python tools/migrate_conditions.py --apply
"""
import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
UPGRADES = ROOT / "data/upgrades.json"
DEFS = ROOT / "data/catalog-definitions.json"

UT_MAP = {1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: "local:wookiee_trooper", 9: 9}


def load_keyword_map():
    defs = json.loads(DEFS.read_text(encoding="utf-8"))
    kw_map = {}
    for k in defs.get("keywords", []):
        for uid in k.get("upstreamIds") or []:
            kw_map[str(uid)] = k["id"]
    return kw_map


def atom_to_expr(atom, kw_map):
    prop = atom.get("property")
    value = atom.get("value")
    vals = value if isinstance(value, list) else [value]
    if prop == "unitType":
        local = [UT_MAP.get(v, v) for v in vals]
        return ({"field": "unit.unitTypeId", "op": "in", "value": local}
                if len(local) > 1 else {"field": "unit.unitTypeId", "op": "eq", "value": local[0]})
    if prop == "faction":
        return ({"field": "unit.factionId", "op": "in", "value": vals}
                if len(vals) > 1 else {"field": "unit.factionId", "op": "eq", "value": vals[0]})
    if prop == "affiliation":
        parts = [{"field": "unit.affiliationIds", "op": "contains", "value": v} for v in vals]
        return parts[0] if len(parts) == 1 else {"any": parts}
    if prop == "keywords":
        local = [kw_map.get(str(v), v) for v in vals]
        parts = [{"field": "unit.keywords", "op": "contains", "value": v} for v in local]
        return parts[0] if len(parts) == 1 else {"any": parts}
    return None


def contains_expr(node, expr):
    if node == expr:
        return True
    if isinstance(node, dict):
        return any(contains_expr(v, expr) for v in node.values())
    if isinstance(node, list):
        return any(contains_expr(v, expr) for v in node)
    return False


def rp_to_expr(rp, kw_map):
    groups = rp if isinstance(rp, list) and rp and isinstance(rp[0], list) else [rp]
    converted = []
    for group in groups:
        atoms = []
        for atom in group:
            if not isinstance(atom, dict):
                return None, "非对象条件原子"
            expr = atom_to_expr(atom, kw_map)
            if expr is None:
                return None, f"未知 property: {atom.get('property')}"
            atoms.append(expr)
        converted.append(atoms[0] if len(atoms) == 1 else {"all": atoms})
    return (converted[0] if len(converted) == 1 else {"any": converted}), None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--dry-run", action="store_true", help="print report only (default)")
    args = ap.parse_args()
    kw_map = load_keyword_map()
    data = json.loads(UPGRADES.read_text(encoding="utf-8"))
    cards = data["cards"]
    stats = {"total": len(cards), "with_rp": 0, "with_cond": 0, "merged_both": 0,
             "converted_only": 0, "already_implied": 0, "failed": [], "samples": []}
    for card in cards:
        rules = card.setdefault("rules", {})
        rest = card.setdefault("restrictions", {})
        rp = rules.get("requiredProperties")
        cond = rest.get("condition")
        if rp not in (None, [], {}):
            stats["with_rp"] += 1
        if cond:
            stats["with_cond"] += 1
        if rp in (None, [], {}):
            continue
        expr, err = rp_to_expr(rp, kw_map)
        if expr is None:
            stats["failed"].append((card["id"], err))
            continue
        if cond and contains_expr(cond, expr):
            stats["already_implied"] += 1
            if args.apply:
                rules.pop("requiredProperties", None)
                card["rules"] = rules
            continue
        merged = {"all": [cond, expr]} if cond else expr
        if cond:
            stats["merged_both"] += 1
        else:
            stats["converted_only"] += 1
        if len(stats["samples"]) < 5:
            stats["samples"].append({"id": card["id"], "old": rp, "new": merged})
        if args.apply:
            rest["condition"] = merged
            card["restrictions"] = rest
            rules.pop("requiredProperties", None)
            card["rules"] = rules
    print(json.dumps({k: v for k, v in stats.items() if k != "failed"}, ensure_ascii=False, indent=1))
    if stats["failed"]:
        print("FAILED:", stats["failed"][:20])
    if args.apply:
        UPGRADES.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print("applied")
    else:
        print("dry-run only (use --apply to write)")


if __name__ == "__main__":
    main()
