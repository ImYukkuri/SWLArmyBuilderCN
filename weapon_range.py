"""Interpret OCR range text with the already-measured card-panel colors."""
import re


def parse_weapon_range(raw, red, blue):
    if red > 100 and blue < 100:
        return 0, 0
    span = re.search(r'([0-6])\s*-\s*([1-6])', raw)
    if span:
        minimum, maximum = map(int, span.groups())
        minimum = 0 if red > 100 else minimum
        return (minimum, maximum) if minimum <= maximum else (None, None)
    numbers = [int(n) for n in re.findall(r'\d+', raw)]
    if len(numbers) == 1 and numbers[0] <= 6:
        # A melee glyph followed by "-2" is often OCR'd as just "2".
        # The red panel still identifies melee eligibility.
        return (0 if red > 100 else numbers[0]), numbers[0]
    return None, None
