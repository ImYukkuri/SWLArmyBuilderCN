
#!/usr/bin/env python3
"""Import the battle deck (objectives / deployments / conditions) from upstream."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
UPSTREAM = ROOT / "references" / "upstream" / "legion.json"
OUT = ROOT / "data" / "battle-deck.json"


def main():
    data = json.loads(UPSTREAM.read_text(encoding="utf-8"))["data"]

    def pack(items, kind):
        out = []
        for item in items:
            entry = {
                "id": f"{kind}-{item['id']}",
                "upstreamId": str(item["id"]),
                "name": {"en": item.get("name") or "", "zh": ""},
                "modes": item.get("gameModes") or [],
            }
            if item.get("factions"):
                entry["armyIds"] = [int(f) for f in item["factions"] if str(f).isdigit()]
            out.append(entry)
        return out

    payload = {
        "schema": "swl-battle-deck/v1",
        "source": "references/upstream/legion.json",
        "objectives": pack(data["objectives"], "objective"),
        "deployments": pack(data["deployments"], "deployment"),
        "conditions": pack(data["conditions"], "condition"),
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + chr(10), encoding="utf-8")
    print({k: len(v) for k, v in payload.items() if isinstance(v, list)})


if __name__ == "__main__":
    main()
