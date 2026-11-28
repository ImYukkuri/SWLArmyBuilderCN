(function (root, factory) {
  if (typeof module === "object") module.exports = factory(require("./play-match.js"));
  else root.PlayStore = factory(root.PlayMatch);
})(globalThis, PlayMatch => {
  "use strict";

  const schemaVersion = 1;
  const key = id => "swl.play.archive:" + id;
  const legacyKey = id => "swl.play.match.v1:" + id;
  const stages = ["import", "setup", "bp", "playing", "finished"];
  const object = value => !!value && typeof value === "object" && !Array.isArray(value);
  const list = (value, test) => Array.isArray(value) && value.every(test);
  const validId = value => (typeof value === "string" && value.length > 0) || Number.isSafeInteger(value);
  const validRound = round => Number.isInteger(round) && round >= 1 && round <= PlayMatch.maxRounds;
  const validChoice = choice => choice === null || (object(choice) && validId(choice.id) &&
    (choice.player === null || PlayMatch.players.includes(choice.player)));

  function validArmy(record) {
    const army = record?.army;
    return typeof record?.name === "string" && object(army) &&
      Number.isSafeInteger(army.armyId) && object(army.deck) &&
      PlayMatch.categories.every(kind => list(army.deck[kind], validId)) &&
      list(army.commandIds, id => id === null || validId(id)) &&
      list(army.units, unit => validId(unit?.unitId) && validId(unit.instanceId) &&
        list(unit.upgrades, upgrade => validId(upgrade?.upgradeId) && validId(upgrade.instanceId)));
  }

  function validBP(bp, stage) {
    if (!bp) return stage !== "bp";
    return PlayMatch.players.includes(bp.turn) && list(bp.history, event => object(event) &&
      PlayMatch.players.includes(event.player) && typeof event.move === "string") &&
      (bp.startingBlue === undefined || PlayMatch.players.includes(bp.startingBlue)) &&
      (bp.stepIndex === undefined || (Number.isInteger(bp.stepIndex) && bp.stepIndex >= 0 && bp.stepIndex <= 6)) &&
      (bp.complete === undefined || typeof bp.complete === "boolean") &&
      PlayMatch.players.every(player => PlayMatch.categories.every(category => {
        const pile = bp.piles?.[player]?.[category];
        return pile && list(pile.cards, validId) && list(pile.discard, validId);
      }));
  }

  function validateMatch(match) {
    const validScore = event => object(event) && validId(event.id) && PlayMatch.players.includes(event.player) &&
      validRound(event.round) && PlayMatch.phases.includes(event.phase) && PlayMatch.scoreCategories.includes(event.category) &&
      Number.isSafeInteger(event.points) && (event.revisions === undefined || list(event.revisions, object));
    const validToken = token => object(token) && Number.isSafeInteger(token.id) && token.id >= 1 &&
      typeof token.label === "string" && (token.quantity === undefined || (Number.isSafeInteger(token.quantity) && token.quantity >= 1));
    const terrainLayout = match?.setup?.terrainLayout;
    const validTerrainLayout = terrainLayout === undefined ||
      (list(terrainLayout, card => PlayMatch.terrainCards.includes(card?.id) && typeof card.rotated === "boolean") &&
        terrainLayout.length === 2 && terrainLayout[0].id !== terrainLayout[1].id);
    const mission = match?.mission;
    if (match?.version !== 1 || typeof match.rosterId !== "string" || !match.rosterId ||
        !validArmy(match.armies?.self) || !(match.armies.opponent === null || validArmy(match.armies.opponent)) ||
        !stages.includes(match.stage) || !validRound(match.round) || !PlayMatch.phases.includes(match.phase) ||
        !PlayMatch.players.includes(match.blue) || !object(match.setup) || !validTerrainLayout ||
        !mission || !validChoice(mission.primary) || !validChoice(mission.secondary) ||
        !PlayMatch.players.every(player => validChoice(mission.advantage?.[player])) || !validBP(match.bp, match.stage) ||
        (match.taskDecks !== undefined && (!object(match.taskDecks) || !PlayMatch.players.every(player =>
          match.taskDecks[player] === null || object(match.taskDecks[player]) && PlayMatch.categories.every(category =>
            match.taskDecks[player][category] === undefined || list(match.taskDecks[player][category], validId))))) ||
        (match.missionMode !== undefined && !["bp", "manual"].includes(match.missionMode)) ||
        !list(match.scoreEvents, validScore) || !list(match.tokens, validToken) ||
        !["unitStates", "upgradeStates", "commands"].every(field => object(match[field])) ||
        !["upgradeFaces", "reminderStates", "activationVisits"].every(field => match[field] === undefined || object(match[field])) ||
        !["activityLog", "reminderNotes"].every(field => match[field] === undefined || list(match[field], object))) {
      throw new Error("对局存档格式不兼容或数据不完整。");
    }
    return match;
  }

  function restoreBPProgress(match) {
    const bp = match.bp;
    if (!bp || !Array.isArray(bp.history)) return match;
    // Earlier matches recorded only the four adjustments after both opening draws.
    if (bp.stepIndex === undefined) {
      bp.stepIndex = Math.min(6, 2 + bp.history.length);
      bp.complete = bp.stepIndex === 6 || match.stage !== "bp";
    }
    bp.startingBlue ??= PlayMatch.bpPlayer(match, 0);
    if (!bp.complete) bp.turn = PlayMatch.bpPlayer(match);
    return match;
  }

  function read(storage, rosterId) {
    const raw = storage.getItem(key(rosterId));
    if (raw !== null) {
      const archive = JSON.parse(raw);
      if (archive?.schemaVersion !== schemaVersion || !list(archive.entries, entry =>
        typeof entry?.id === "string" && entry.id && entry.match?.version === 1 && entry.match.rosterId === rosterId) ||
        new Set(archive.entries.map(entry => entry.id)).size !== archive.entries.length) {
        throw new Error("对局档案格式不兼容。");
      }
      for (const entry of archive.entries) restoreBPProgress(entry.match);
      return archive;
    }

    const legacy = storage.getItem(legacyKey(rosterId));
    const archive = { schemaVersion, entries: [] };
    if (legacy !== null) {
      const match = restoreBPProgress(validateMatch(JSON.parse(legacy)));
      if (match.rosterId !== rosterId) throw new Error("旧存档的军表 ID 不匹配。");
      archive.entries.push({ id: "legacy", createdAt: null, updatedAt: null, match });
    }
    return archive;
  }

  function write(storage, rosterId, archive) {
    storage.setItem(key(rosterId), JSON.stringify(archive));
  }

  function open(storage, rosterId) {
    const archive = read(storage, rosterId);
    if (archive.entries.length && storage.getItem(key(rosterId)) === null) write(storage, rosterId, archive);
    return archive;
  }

  function add(storage, rosterId, match, createdAt = new Date().toISOString()) {
    const archive = read(storage, rosterId);
    const now = new Date().toISOString();
    const entry = { id: globalThis.crypto.randomUUID(), createdAt, updatedAt: now, match };
    archive.entries.push(entry);
    write(storage, rosterId, archive);
    return entry;
  }

  function entryFor(archive, id) {
    if (id) return archive.entries.find(entry => entry.id === id) || null;
    return archive.entries.findLast(entry => entry.match.stage !== "finished") || archive.entries.at(-1) || null;
  }

  function start(storage, record) {
    return add(storage, record.id, PlayMatch.create(record));
  }

  function save(storage, rosterId, id, match) {
    const archive = read(storage, rosterId);
    const entry = entryFor(archive, id);
    if (!entry || match.rosterId !== rosterId) throw new Error("这个对局已不存在。");
    entry.match = match;
    entry.updatedAt = new Date().toISOString();
    write(storage, rosterId, archive);
  }

  function saveSession(storage, entry) {
    const { rosterId } = entry.match;
    const archive = read(storage, rosterId);
    const index = archive.entries.findIndex(item => item.id === entry.id);
    const saved = { ...entry, updatedAt: new Date().toISOString() };
    if (index < 0) archive.entries.push(saved);
    else archive.entries[index] = saved;
    write(storage, rosterId, archive);
  }

  function remove(storage, rosterId, id) {
    const archive = read(storage, rosterId);
    archive.entries = archive.entries.filter(entry => entry.id !== id);
    write(storage, rosterId, archive);
    if (id === "legacy") storage.removeItem(legacyKey(rosterId));
    return entryFor(archive);
  }

  function exportJSON(entry) {
    return JSON.stringify({ schema: "swl.play.backup", schemaVersion, createdAt: entry.createdAt, match: entry.match }, null, 2);
  }

  function restore(storage, rosterId, text) {
    let backup;
    try { backup = JSON.parse(text); }
    catch { throw new Error("无法读取对局 JSON。"); }
    if (backup?.schema !== "swl.play.backup" || backup.schemaVersion !== schemaVersion) {
      throw new Error("请选择兼容的对局助手备份。");
    }
    const match = restoreBPProgress(validateMatch(backup.match));
    const createdAt = Number.isFinite(Date.parse(backup.createdAt)) ? backup.createdAt : null;
    return add(storage, rosterId, { ...match, rosterId }, createdAt);
  }

  const lock = (rosterId, run) => globalThis.navigator?.locks
    ? navigator.locks.request("swl-play:" + rosterId, run) : run();

  return { read, open, entryFor, start, save, saveSession, remove, exportJSON, restore, lock, storageKey: key };
});
