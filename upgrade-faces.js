/* A physical upgrade has one identity/cost and independent printed faces. */
window.UpgradeFaces = (() => {
  const fields = ['name', 'description', 'keywords', 'weapons', 'assets'];
  const isDual = card => card?.dualSided === true && !!card.back;
  function view(card, face = card?._face || 'front') {
    if (!isDual(card)) return card;
    const base = card._base || card;
    const side = face === 'back' ? 'back' : 'front';
    const printed = side === 'back' ? base.back : base;
    return {...base, ...Object.fromEntries(fields.map(k => [k, printed[k]])), _base: base, _face: side};
  }
  const variants = card => isDual(card) ? [view(card, 'front'), view(card, 'back')] : [card];
  function index(cards) {
    const result = Object.fromEntries(cards.map(c => [c.id, c]));
    for (const card of cards) if (isDual(card) && card.back.legacyId && !result[card.back.legacyId]) {
      Object.defineProperty(result, card.back.legacyId, {value: view(card, 'back'), enumerable: false});
    }
    return result;
  }
  // Migrate only recognized old back IDs. Never drop unknown selections.
  function normalizeArmy(army, data) {
    for (const inst of army.units || []) for (const choice of inst.upgrades || []) {
      const card = data.upgrades[choice.upgradeId];
      if (!card) continue;
      if (card.id !== choice.upgradeId) {
        choice.upgradeId = card.id;
        choice.face = 'back';
        // Older DC-17m backs were incorrectly assigned to Gear instead of Configuration.
        const unit = data.units?.[inst.unitId];
        const slots = unit?.upgradeSlots || [];
        const source = s => typeof s === 'object' ? s.id : s;
        if (unit && !card.slotIds.includes(source(slots[choice.slotIndex]))) {
          const replacement = slots.findIndex((s, i) => card.slotIds.includes(source(s)) &&
            !inst.upgrades.some(c => c !== choice && c.slotIndex === i));
          if (replacement >= 0) choice.slotIndex = replacement;
        }
      }
      if (isDual(card)) choice.face = choice.face === 'back' ? 'back' : 'front';
      else delete choice.face;
    }
    return army;
  }
  return {fields, isDual, view, variants, index, normalizeArmy};
})();
