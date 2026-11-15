"""Report names-only TTS mapping coverage; never guess or rewrite card data."""
import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def audit():
    read = lambda name: json.loads((ROOT / 'data' / name).read_bytes())
    mapping = read('tts-names.json')
    deck = read('battle-deck.json')
    collections = {
        'units': read('units.json')['units'],
        'upgrades': read('upgrades.json')['cards'],
        'commands': read('catalog-definitions.json')['commands'],
        'battle': list({c['id']: c for v in deck.values() if isinstance(v, list) for c in v}.values()),
    }
    report = {}
    for kind, cards in collections.items():
        known = mapping[kind]
        ids = {str(c['id']) for c in cards}
        report[kind] = {
            'total': len(cards),
            'verified': sum(str(c['id']) in known for c in cards),
            'missing': [{'id': c['id'], 'name': c['name']['en']} for c in cards if str(c['id']) not in known],
            'staleIds': sorted(set(known) - ids),
        }
    return report


if __name__ == '__main__':
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument('--json', action='store_true')
    args = cli.parse_args()
    report = audit()
    if args.json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    else:
        for kind, row in report.items():
            print(f"{kind}: {row['verified']}/{row['total']} verified")
            for card in row['missing']:
                print(f"  未校对 {card['id']}: {card['name']}")
            for key in row['staleIds']:
                print(f"  失效 ID {key}")
    raise SystemExit(1 if any(row['staleIds'] for row in report.values()) else 0)
