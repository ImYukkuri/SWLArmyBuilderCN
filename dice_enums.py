"""Dice color / dice face enums shared by editor and engine references.

Values match the strings used in data files:
- unit.stats.defenseDie: "red" | "white"
- weapon.dice: { "red": n, "black": n, "white": n }
- card text icons: {@icon.hit} {@icon.critical} {@icon.surge} {@icon.block} {@icon.surge-block}
"""
from enum import Enum


class AttackDieColor(str, Enum):
    RED = "red"
    BLACK = "black"
    WHITE = "white"


class DefenseDieColor(str, Enum):
    RED = "red"
    WHITE = "white"


class AttackDieFace(str, Enum):
    BLANK = "blank"
    HIT = "hit"
    CRITICAL = "critical"
    SURGE = "surge"


class DefenseDieFace(str, Enum):
    BLANK = "blank"
    BLOCK = "block"
    SURGE = "surge"
    SURGE_BLOCK = "surge-block"


DICE = {
    "attackColors": [c.value for c in AttackDieColor],
    "defenseColors": [c.value for c in DefenseDieColor],
    "attackFaces": [f.value for f in AttackDieFace],
    "defenseFaces": [f.value for f in DefenseDieFace],
}
