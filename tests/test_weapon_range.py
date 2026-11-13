import unittest
from weapon_range import parse_weapon_range


class WeaponRangeTest(unittest.TestCase):
    def test_mixed_panel_with_only_upper_number(self):
        for text, maximum in [('2', 2), ('-2', 2), ('1', 1), ('—1', 1)]:
            with self.subTest(text=text):
                self.assertEqual(parse_weapon_range(text, 220, 300), (0, maximum))

    def test_pure_ranged_single_distance_stays_ranged(self):
        self.assertEqual(parse_weapon_range('1', 0, 300), (1, 1))
        self.assertEqual(parse_weapon_range('2', 40, 300), (2, 2))

    def test_melee_and_ranged_spans(self):
        self.assertEqual(parse_weapon_range('', 300, 0), (0, 0))
        self.assertEqual(parse_weapon_range('1-3', 0, 300), (1, 3))
        self.assertEqual(parse_weapon_range('8 1-2', 230, 300), (0, 2))
        self.assertEqual(parse_weapon_range('4-2', 0, 300), (None, None))

    def test_ambiguous_text_is_not_invented(self):
        for text in ['', '?', '8', '1 2']:
            self.assertEqual(parse_weapon_range(text, 200, 300), (None, None))
