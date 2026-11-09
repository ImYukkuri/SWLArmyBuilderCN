/* Shared dice color / dice face enums for editors and the list-building engine.
 * Keep values in sync with dice_enums.py. */
window.SWLDice = Object.freeze({
  attackColors: Object.freeze({ RED: "red", BLACK: "black", WHITE: "white" }),
  defenseColors: Object.freeze({ RED: "red", WHITE: "white" }),
  attackFaces: Object.freeze({ BLANK: "blank", HIT: "hit", CRITICAL: "critical", SURGE: "surge" }),
  defenseFaces: Object.freeze({ BLANK: "blank", BLOCK: "block", SURGE: "surge", SURGE_BLOCK: "surge-block" }),
});
