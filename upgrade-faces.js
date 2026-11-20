/* A physical upgrade has one identity/cost and independent printed faces. */
window.UpgradeFaces = (() => {
  const fields = ['name', 'description', 'keywords', 'weapons', 'assets', 'actionTypes'];
  const isDual = card => card?.dualSided === true && !!card.back;
  const mode = face => ['front', 'back', 'both'].includes(face) ? face : 'front';
  const indexedCatalogs = new WeakSet();
  function view(card, face = card?._face || 'front') {
    if (!isDual(card)) return card;
    const base = card._base || card;
    const side = mode(face);
    const printed = side === 'back' ? base.back : base;
    return {...base, ...Object.fromEntries(fields.map(k => [k, printed[k]])),
      ...(card._choiceId ? {_choiceId: card._choiceId, _unitId: card._unitId} : {}),
      _base: base, _face: side};
  }
  const variants = card => isDual(card) ? [view(card, 'front'), view(card, 'back')] : [card];
  // Keep each printed face intact, including weapon keywords and source labels.
  const visible = card => isDual(card) && card._face === 'both' ? variants(card) : [card];
  function index(cards) {
    const result = Object.fromEntries(cards.map(c => [c.id, c]));
    for (const card of cards) if (isDual(card) && card.back.legacyId && !result[card.back.legacyId]) {
      Object.defineProperty(result, card.back.legacyId, {value: view(card, 'back'), enumerable: false});
    }
    indexedCatalogs.add(result);
    return result;
  }
  // Mutable/editor catalogs must be indexed afresh: a face or legacy ID may
  // have changed. Only our own completed, frozen runtime catalogs are reusable.
  const forCatalog = cards => Object.isFrozen(cards) && indexedCatalogs.has(cards)
    ? cards : index(Object.values(cards));
  // Migrate only recognized old back IDs. Never drop unknown selections.
  function normalizeArmy(army, data) {
    for (const inst of army.units || []) {
      const aliases=data.unitIdAliases||{},seen=new Set();
      while(Object.hasOwn(aliases,inst.unitId)&&!seen.has(inst.unitId)) {
        seen.add(inst.unitId);inst.unitId=aliases[inst.unitId];
      }
    }
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
      if (isDual(card)) choice.face = mode(choice.face);
      else delete choice.face;
    }
    return army;
  }
  return {fields, isDual, mode, view, variants, visible, index, forCatalog, normalizeArmy};
})();
