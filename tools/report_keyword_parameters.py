#!/usr/bin/env python3
"""Report retinue/entourage keyword parameters and their resolution status.

A keyword parameter (e.g. "ENTOURAGE: Kraken") is a unit NAME. This script
normalizes the name and matches it against local unit names (en/zh), so garbled
OCR values show up as unresolved instead of silently doing nothing.

Usage: python tools/report_keyword_parameters.py [--json]
"""
import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))


def norm(value):
    return re.sub(r"[^a-z0-9]", "", str(value or "").lower())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()
    units = json.loads((ROOT / "data/units.json").read_text(encoding="utf-8"))["units"]
    index = {}
    for u in units:
        for value in ((u.get("name") or {}).get("en"), (u.get("name") or {}).get("zh")):
            if value:
                index.setdefault(norm(value), []).append(u["id"])
    rows = []
    for u in units:
        for kw in u.get("keywords") or []:
            if kw.get("id") not in ("retinue", "entourage", "detachment"):
                continue
            param = kw.get("parameter") or ""
            hits = index.get(norm(param), [])
            rows.append({
                "unitId": u["id"],
                "unitEn": (u.get("name") or {}).get("en"),
                "keyword": kw["id"],
                "parameter": param,
                "resolved": bool(hits),
                "candidates": hits,
            })
    if args.json:
        print(json.dumps(rows, ensure_ascii=False, indent=2))
        return
    width = max((len(r["parameter"]) for r in rows), default=8)
    print(f"{'unit':44} {'keyword':10} {'parameter':{width}}  status")
    for r in rows:
        status = "OK -> " + "/".join(r["candidates"]) if r["resolved"] else "未解析"
        print(f"{r['unitId']:44} {r['keyword']:10} {r['parameter']:{width}}  {status}")
    resolved = sum(1 for r in rows if r["resolved"])
    print(f"\n{resolved}/{len(rows)} resolved")


if __name__ == "__main__":
    main()
