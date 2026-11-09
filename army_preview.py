"""Thin server wrapper over the semantic rule engine."""
from rules import validate_army


def preview(army):
    return validate_army(army)
