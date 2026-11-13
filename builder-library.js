/* Browser-local roster collection and configuration; runtime catalogs stay read-only. */
window.BuilderLibrary = (() => {
  const KEY = "swl-army-library";
  const LEGACY_KEY = "swl-army-draft";
  const FACTIONS = [
    { id: 1, name: "义军", en: "Rebel Alliance", color: "#9c493f" },
    { id: 2, name: "银河帝国", en: "Galactic Empire", color: "#72577e" },
    { id: 4, name: "银河共和国", en: "Galactic Republic", color: "#85683f" },
    { id: 5, name: "分离主义势力", en: "Separatist Alliance", color: "#386482" },
    { id: 8, name: "曼达洛人", en: "Mandalorians", color: "#4e7169" },
    { id: 9, name: "暗影集会", en: "Shadow Collective", color: "#76554e" },
  ];
  function factionOf(armyId, data) {
    const id = Number(armyId);
    if (FACTIONS.some((f) => f.id === id)) return id;
    const definition = data.defs.armies.find((a) => a.id === id);
    const parent = definition?.parentName || data.pkg.battleForces?.[id]?.parentFaction;
    return (
      data.defs.armies.find((a) => parent && (a.name.en === parent || a.name.zh === parent))?.id ||
      id
    );
  }
  function faction(id, data) {
    return (
      FACTIONS.find((f) => f.id === Number(id)) || {
        id: Number(id),
        name: data.defs.armies.find((a) => a.id === Number(id))?.name?.zh || "未识别军队",
        en: data.defs.armies.find((a) => a.id === Number(id))?.name?.en || "",
        color: "#607481",
      }
    );
  }
  function battleforces(factionId, data) {
    const base = data.defs.armies.find((a) => a.id === Number(factionId));
    if (!base) return [];
    return data.defs.armies.filter(
      (a) =>
        a.id !== base.id &&
        [a.parentName, data.pkg.battleForces?.[a.id]?.parentFaction].some(
          (parent) => parent && [base.name.en, base.name.zh].includes(parent),
        ),
    );
  }
  function modeForPoints(points) {
    if (!Number.isSafeInteger(points) || points <= 0) throw Error("分数必须为大于 0 的整数。");
    return points <= 600 ? "recon" : "standard";
  }
  function configuration(army, data) {
    const mode = modeForPoints(army.pointsLimit);
    return {
      mode,
      rules: {
        ...(data.pkg.modes?.[mode] || {}),
        ...(data.pkg.battleForces?.[army.armyId]?.modes?.[mode] || {}),
        points: army.pointsLimit,
      },
    };
  }
  function normalize(army) {
    if (!army || !Array.isArray(army.units) || !Number.isInteger(Number(army.armyId)))
      throw Error("军表格式不正确。");
    const value = structuredClone(army);
    value.armyId = Number(value.armyId);
    value.pointsLimit = Number(value.pointsLimit ?? (value.mode === "recon" ? 600 : 1000));
    value.mode = modeForPoints(value.pointsLimit);
    value.commandIds ||= [];
    value.options ||= [];
    value.deck = normalizeDeck(value.deck);
    for (const inst of value.units) inst.upgrades ||= [];
    return value;
  }
  const DECK_KINDS = ["primary", "secondary", "advantage"];
  function normalizeDeck(deck = {}) {
    const result = { ...(deck || {}) };
    for (const kind of DECK_KINDS) {
      const selected = result[kind] ?? (kind === "primary" ? result.deployment : null);
      result[kind] = [...new Set((Array.isArray(selected) ? selected : [selected])
        .filter((id) => typeof id === "string" || typeof id === "number").map(String))];
    }
    return result;
  }
  function setDeckCard(deck, kind, index, id) {
    if (!DECK_KINDS.includes(kind)) throw Error("未知任务卡类别。");
    const result = normalizeDeck(deck), selected = result[kind];
    if (!Number.isInteger(index) || index < 0 || index > selected.length)
      throw Error("任务卡槽位已变化，请重新选择。");
    if (id == null) selected.splice(index, 1);
    else {
      if (index >= 3) throw Error("每类最多选择 3 张卡。");
      if (selected.some((value, i) => i !== index && value === String(id)))
        throw Error("同一类别不能重复选择同一张卡。");
      selected[index] = String(id);
    }
    return result;
  }
  function create(factionId, name, data, makeId, now) {
    if (!FACTIONS.some((f) => f.id === Number(factionId))) throw Error("请选择一个势力。");
    const army = {
      mode: "standard",
      armyId: Number(factionId),
      pointsLimit: 1000,
      units: [],
      commandIds: [],
      options: [],
      deck: normalizeDeck(),
    };
    const hand = configuration(army, data).rules.commandHand || [];
    const pips = hand.flatMap((r) => Array(r.min || 0).fill(r.pips));
    army.commandIds = pips.map(() => null);
    const standing = data.defs.commands.find((c) => String(c.id) === "8");
    if (standing && pips.lastIndexOf(4) >= 0) army.commandIds[pips.lastIndexOf(4)] = "8";
    return {
      id: makeId(),
      name: name.trim() || faction(factionId, data).name + "军表",
      factionId: Number(factionId),
      createdAt: now,
      updatedAt: now,
      army,
    };
  }
  function read(storage) {
    const raw = storage.getItem(KEY);
    if (!raw) return { version: 1, migratedLegacy: false, records: [] };
    const collection = JSON.parse(raw);
    if (collection?.version !== 1 || !Array.isArray(collection.records))
      throw Error("已保存军表的格式无法读取。");
    for (const r of collection.records) {
      if (!r.id || typeof r.name !== "string") throw Error("已保存军表的记录不完整。");
      normalize(r.army);
    }
    return collection;
  }
  function writeRecord(storage, record) {
    const collection = read(storage);
    const index = collection.records.findIndex((r) => r.id === record.id);
    if (index >= 0) collection.records[index] = structuredClone(record);
    else collection.records.push(structuredClone(record));
    storage.setItem(KEY, JSON.stringify(collection));
    return collection;
  }
  function removeRecord(storage, id) {
    const collection = read(storage);
    collection.records = collection.records.filter((r) => r.id !== id);
    storage.setItem(KEY, JSON.stringify(collection));
    return collection;
  }
  function migrate(storage, data, makeId, now) {
    const collection = read(storage);
    if (collection.migratedLegacy) return collection;
    const raw = storage.getItem(LEGACY_KEY);
    if (raw) {
      const army = normalize(JSON.parse(raw));
      const factionId = factionOf(army.armyId, data);
      collection.records.push({
        id: makeId(),
        name: army.name || faction(factionId, data).name + " · 恢复的军表",
        factionId,
        createdAt: now,
        updatedAt: now,
        army,
      });
    }
    collection.migratedLegacy = true;
    storage.setItem(KEY, JSON.stringify(collection));
    return collection;
  }
  function copy(record, makeId, now) {
    const duplicate = structuredClone(record);
    duplicate.id = makeId();
    duplicate.name += " · 副本";
    duplicate.createdAt = duplicate.updatedAt = now;
    for (const unit of duplicate.army.units) {
      unit.instanceId = makeId();
      for (const choice of unit.upgrades) choice.instanceId = makeId();
    }
    return duplicate;
  }
  return {
    KEY,
    LEGACY_KEY,
    FACTIONS,
    factionOf,
    faction,
    battleforces,
    modeForPoints,
    configuration,
    normalize,
    normalizeDeck,
    setDeckCard,
    create,
    read,
    writeRecord,
    removeRecord,
    migrate,
    copy,
  };
})();
