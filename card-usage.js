/* Personal card preferences. Candidate queries only consult these in-memory maps. */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CardUsage = api;
})(globalThis, root => {
  const STORAGE_KEY = 'legion-user-preferences';
  const kinds = ['units', 'upgrades'];
  // Small starting weights; personal counters remain actual successful uses.
  const preferredUpgrades = new Set([
    'training-fray', 'training-tenacity', 'training-upclose',
    'superior-equipment', 'gear-supplies', 'gear-scopes',
    'comms-linked-targeting', 'comms-onboard', 'comms-hacked', 'comms-jammer', 'squadron-leader',
    'force-burst', 'force-guidance', 'battlemind', 'force-reflexes',
    'fire-control', 'command-improvised', 'command-vigilance', 'command-underworld',
  ]);
  const initialWeight = (kind, card) => kind === 'upgrades' &&
    (preferredUpgrades.has(card.id) || (card.slotIds?.includes(5) &&
      card.rules?.requiredDivisions?.some(side => side === 'Light' || side === 'Dark'))) ? 1 : 0;
  const keyOf = card => !card ? null : card.runtimeVariant
    ? 'variant:' + card.id
    : Number.isSafeInteger(card.numericId) && card.numericId > 0
      ? String(card.numericId) : 'id:' + card.id;
  const finite = value => Number.isSafeInteger(value) && value >= 0;
  const name = card => card.name?.zh || card.name?.en || card.id || '';
  function create({getStorage = () => root.localStorage, events = root,
    document = root.document, now = Date.now, setTimer = root.setTimeout.bind(root),
    clearTimer = root.clearTimeout.bind(root)} = {}) {
    const usage = {units:new Map(), upgrades:new Map()};
    const favorites = {units:new Set(), upgrades:new Set()};
    let storage, loaded = false, dirty = false, timer = null;
    function init() {
      if (loaded) return;
      loaded = true;
      let saved;
      try {
        storage = getStorage();
        saved = JSON.parse(storage?.getItem(STORAGE_KEY) || 'null');
      } catch { return; }
      if (!saved || saved.version !== 1) return;
      for (const kind of kinds) {
        for (const [id, value] of Object.entries(saved[kind] || {})) {
          if (value && finite(value.count) && finite(value.lastUsedAt))
            usage[kind].set(id, {count:value.count, lastUsedAt:value.lastUsedAt});
        }
        const ids = saved.favorites?.[kind];
        if (Array.isArray(ids)) for (const id of ids) if (typeof id === 'string') favorites[kind].add(id);
      }
    }
    function flush() {
      if (timer !== null) clearTimer(timer);
      timer = null;
      if (!dirty) return true;
      try {
        if (!storage) return false;
        storage.setItem(STORAGE_KEY, JSON.stringify({version:1,
          units:Object.fromEntries(usage.units), upgrades:Object.fromEntries(usage.upgrades),
          favorites:Object.fromEntries(kinds.map(kind => [kind, [...favorites[kind]]]))}));
        dirty = false;
        return true;
      } catch { return false; } // Keep the working session usable; retry on the next change/exit.
    }
    function schedule() {
      dirty = true;
      if (timer !== null) clearTimer(timer);
      timer = setTimer(flush, 800);
    }
    function recordMany(items) {
      let changed = false;
      const timestamp = now();
      for (const {kind, card, count = 1} of items) {
        const id = keyOf(card);
        if (!usage[kind] || !id || !Number.isSafeInteger(count) || count <= 0) continue;
        const old = usage[kind].get(id);
        usage[kind].set(id, {count:Math.min(Number.MAX_SAFE_INTEGER, (old?.count || 0) + count), lastUsedAt:timestamp});
        changed = true;
      }
      if (changed) schedule();
    }
    const stats = (kind, card) => ({...(usage[kind]?.get(keyOf(card)) || {count:0,lastUsedAt:0})});
    const isFavorite = (kind, card) => favorites[kind]?.has(keyOf(card)) || false;
    function toggleFavorite(kind, card) {
      const id = keyOf(card), set = favorites[kind];
      if (!set || !id) return false;
      if (set.has(id)) set.delete(id); else set.add(id);
      schedule();
      return set.has(id);
    }
    function compare(kind, mode, a, b) {
      const left = usage[kind]?.get(keyOf(a)), right = usage[kind]?.get(keyOf(b));
      let delta = 0;
      if (mode === 'favorites') delta = Number(isFavorite(kind,b)) - Number(isFavorite(kind,a));
      if (!delta && ['usage','favorites'].includes(mode)) delta =
        (right?.count || 0) + initialWeight(kind,b) - (left?.count || 0) - initialWeight(kind,a);
      if (!delta && ['usage','favorites','recent'].includes(mode)) delta = (right?.lastUsedAt || 0) - (left?.lastUsedAt || 0);
      if (mode === 'points') delta = (a.points ?? a.pips ?? Infinity) - (b.points ?? b.pips ?? Infinity);
      return delta || name(a).localeCompare(name(b),'zh') || String(a.id).localeCompare(String(b.id)) ||
        Number(a._face === 'back') - Number(b._face === 'back');
    }
    const onHidden = () => { if (document?.visibilityState === 'hidden') flush(); };
    events?.addEventListener?.('pagehide', flush);
    events?.addEventListener?.('beforeunload', flush);
    document?.addEventListener?.('visibilitychange', onHidden);
    init();
    return {init, recordMany, stats, isFavorite, toggleFavorite, compare, flush};
  }
  return {create, keyOf, initialWeight, STORAGE_KEY};
});
