const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
global.window = global;
require("../upgrade-faces.js");
require("../dice-enums.js");
require("../rules-core.js");
require("../builder-library.js");
const read = (name) => JSON.parse(fs.readFileSync(path.join(__dirname, "../data", name), "utf8"));
const data = {
  defs: read("catalog-definitions.json"),
  pkg: read("slot-rules.json"),
  units: Object.fromEntries(read("units.json").units.map((u) => [u.id, u])),
  upgrades: Object.fromEntries(read("upgrades.json").cards.map((c) => [c.id, c])),
};
const library = BuilderLibrary;
test("battle decks migrate legacy single picks without changing the saved source", () => {
  const old = { primary: "deployment-13", secondary: "objective-1", advantage: "condition-1" };
  assert.deepEqual(library.normalizeDeck(old), {
    primary: ["deployment-13"], secondary: ["objective-1"], advantage: ["condition-1"],
  });
  assert.equal(old.primary, "deployment-13");
  assert.deepEqual(library.normalizeDeck({ deployment: "deployment-13" }).primary, ["deployment-13"]);
});
test("three independent battle-card categories support replacement and removal with no duplicate picks", () => {
  let deck = {};
  for (const kind of ["primary", "secondary", "advantage"]) {
    for (let i = 0; i < 3; i++) deck = library.setDeckCard(deck, kind, i, `${kind}-${i}`);
    assert.throws(() => library.setDeckCard(deck, kind, 3, "fourth"), /3/);
    assert.throws(() => library.setDeckCard(deck, kind, 1, `${kind}-0`), /重复/);
  }
  const replacement = library.setDeckCard(deck, "primary", 1, "replacement");
  assert.deepEqual(replacement.primary, ["primary-0", "replacement", "primary-2"]);
  assert.deepEqual(deck.primary, ["primary-0", "primary-1", "primary-2"]);
  assert.deepEqual(library.setDeckCard(replacement, "primary", 0, null).primary, ["replacement", "primary-2"]);
  assert.deepEqual(replacement.advantage, deck.advantage);
  assert.deepEqual(library.normalizeDeck(JSON.parse(JSON.stringify(replacement))), replacement);
});
test("faction advantages apply to their parent army and its battle forces", () => {
  const cards = read("battle-deck.json").conditions;
  const restrictions = [
    { cards: ["condition-25", "condition-28"], armies: [1, 13, 18, 29] },
    { cards: ["condition-22", "condition-29"], armies: [2, 7, 10, 17, 19, 27] },
    { cards: ["condition-24", "condition-26"], armies: [4, 12, 16, 21, 28] },
    { cards: ["condition-23", "condition-27"], armies: [5, 11, 15, 20] },
  ];
  for (const restriction of restrictions) {
    for (const id of restriction.cards) {
      const card = cards.find(card => card.id === id);
      for (const { id: armyId } of data.defs.armies) {
        assert.equal(library.deckCardAvailable(card, { armyId, mode: "standard" }, data),
          restriction.armies.includes(armyId), id + " in army " + armyId);
      }
      assert.equal(library.deckCardAvailable(card, { armyId: restriction.armies[0], mode: "recon" }, data), false);
    }
  }
  const universal = cards.find(card => card.id === "condition-13");
  assert.equal(library.deckCardAvailable(universal, { armyId: 27, mode: "standard" }, data), true);
});
let sequence = 0;
const uid = () => `saved-${++sequence}`,
  now = "2026-01-01T00:00:00.000Z";
function storage() {
  const values = new Map();
  return { getItem: (k) => values.get(k) ?? null, setItem: (k, v) => values.set(k, String(v)) };
}

test('legacy command slots recover Ace after full one-pip slots without displacing correctly placed cards', () => {
  for (const before of [
    ['7','16618','3',null,'9','16624','8','100'],
    ['100','16618','3',null,'9','16624','8'],
  ]) {
    const army = {...library.create(1,'Lando',data,uid,now).army,commandIds:[...before]};
    library.normalizeCommandSlots(army,data);
    assert.deepEqual(army.commandIds, [before[0] === '100' ? null : '7','16618','3','100','9','16624','8']);
    assert.deepEqual(army.commandIds.filter(Boolean).sort(),before.filter(Boolean).sort());
    const stable = army.commandIds;
    library.normalizeCommandSlots(army,data);
    assert.equal(army.commandIds,stable,'subsequent renders do not move cards or recreate their slots');
  }
});

test('command slot recovery preserves actual overflow, duplicate cards and missing references', () => {
  const army = {...library.create(1,'Overflow',data,uid,now).army,
    commandIds:['7','16618','3','3','9','16624','8','100','missing-command']};
  const before = structuredClone(army.commandIds);
  library.normalizeCommandSlots(army,data);
  assert.deepEqual(army.commandIds,before);
  assert(RulesCore.validateArmy(army,data).issues.some(i=>i.code==='command_max'&&i.message.startsWith('2 点')));
  army.commandIds[2]=null;
  library.normalizeCommandSlots(army,data);
  assert.deepEqual(army.commandIds,['7','16618','100','3','9','16624','8','missing-command']);
});

test("all six requested factions create base rosters at 1000 points", () => {
  assert.deepEqual(
    library.FACTIONS.map((f) => f.name),
    ["义军", "银河帝国", "银河共和国", "分离主义势力", "曼达洛人", "暗影集会"],
  );
  for (const f of library.FACTIONS) {
    const record = library.create(f.id, "", data, uid, now);
    assert.equal(record.army.armyId, f.id);
    assert.equal(record.factionId, f.id);
    assert.equal(record.army.pointsLimit, 1000);
    assert.equal(record.army.mode, "standard");
    assert.equal(record.army.units.length, 0);
  }
});
test("battleforces are restricted to the selected parent faction", () => {
  assert.deepEqual(
    library.battleforces(2, data).map((a) => a.id),
    [7, 10, 17, 19],
  );
  assert.deepEqual(
    library.battleforces(1, data).map((a) => a.id),
    [13, 18],
  );
  assert.deepEqual(
    library.battleforces(4, data).map((a) => a.id),
    [12, 16], // V2 War Grove requires the runtime (covered by its own tests).
  );
  assert.deepEqual(
    library.battleforces(5, data).map((a) => a.id),
    [11, 15, 20],
  );
  assert.deepEqual(library.battleforces(8, data).map(a => a.id), [22,23,24,25,26]);
  assert.deepEqual(library.battleforces(9, data), []);
  for (const id of [7, 10, 17, 19]) assert.equal(library.factionOf(id, data), 2);
  assert.equal(
    library.factionOf(14, data),
    14,
    "legacy independent army is not reassigned to an unrelated faction",
  );
});
test("600 boundary selects recon; larger custom budgets select standard", () => {
  for (const points of [1, 500, 600]) assert.equal(library.modeForPoints(points), "recon");
  for (const points of [601, 800, 1000, 1500])
    assert.equal(library.modeForPoints(points), "standard");
  for (const invalid of [0, -1, NaN, Infinity, 600.5, "600"])
    assert.throws(() => library.modeForPoints(invalid));
});
test("switching base, legacy and V2 forces clears equipment with units, but keeps other roster settings", () => {
  for (const [from,to] of [[4,28],[28,12],[12,4],[28,21],[8,26],[26,22]]) {
    const army={armyId:from,pointsLimit:800,mode:'standard',commandIds:['standing-orders'],
      deck:{primary:['primary-one']},units:[{instanceId:'host',unitId:'republic-barc',rankId:4,
        upgrades:[{instanceId:'upgrade',upgradeId:'gear-binoculars',slotIndex:0}]}]};
    const before=structuredClone(army),switched=library.switchBattleForce(army,to);
    assert.deepEqual(switched,{...before,armyId:to,units:[]});
    assert.deepEqual(army,before);
    assert.deepEqual(library.switchBattleForce(army,from),army,'unchanged selection must keep units');
  }
});
test("points and battleforce quotas agree with the existing rule engine", () => {
  const army = library.create(2, "", data, uid, now).army;
  const supportId = 4;
  for (const [armyId, points, expected] of [
    [2, 600, 2],
    [2, 1000, 3],
    [17, 600, 3],
    [17, 1000, 4],
  ]) {
    army.armyId = armyId;
    army.pointsLimit = points;
    const config = library.configuration(army, data);
    army.mode = config.mode;
    assert.equal(config.rules.points, points);
    assert.equal(config.rules.rankQuotas.find((q) => q.rankId === supportId).max, expected);
    const report = RulesCore.validateArmy(army, data);
    const supportMinimum = config.rules.rankQuotas.find((q) => q.rankId === supportId).min || 0;
    assert.equal(
      report.issues.some((i) => i.code === "rank_min" && i.rank === supportId),
      supportMinimum > 0,
    );
  }
});
test("Mandalorian and Shadow base choices retain their faction-specific quotas", () => {
  for (const id of [8, 9]) {
    const army = library.create(id, "", data, uid, now).army;
    assert.deepEqual(
      library.configuration(army, data).rules.rankQuotas,
      data.pkg.battleForces[id].modes.standard.rankQuotas,
    );
  }
});
test("legacy draft migrates once without changing instance IDs or source backup", () => {
  const store = storage(),
    army = library.create(2, "", data, uid, now).army;
  army.armyId = 17;
  army.units = [
    {
      instanceId: "old-unit",
      unitId: "empire-stormtroopers",
      upgrades: [{ instanceId: "old-choice", upgradeId: "stormtrooper-dlt19", slotIndex: 0 }],
    },
  ];
  const raw = JSON.stringify(army);
  store.setItem(library.LEGACY_KEY, raw);
  const first = library.migrate(store, data, uid, now),
    second = library.migrate(store, data, uid, now);
  assert.equal(first.records.length, 1);
  assert.equal(second.records.length, 1);
  assert.equal(first.records[0].factionId, 2);
  assert.deepEqual(first.records[0].army.units, army.units);
  assert.equal(store.getItem(library.LEGACY_KEY), raw);
  library.removeRecord(store, first.records[0].id);
  assert.equal(library.migrate(store, data, uid, now).records.length, 0);
});
test("saving one roster preserves all other saved records and options", () => {
  const store = storage(),
    a = library.create(1, "义军 A", data, uid, now),
    b = library.create(2, "帝国 B", data, uid, now);
  a.army.options = ["example-option"];
  a.army.deck = { primary: "example-objective" };
  library.writeRecord(store, a);
  library.writeRecord(store, b);
  a.name = "重命名";
  a.army.pointsLimit = 600;
  a.army.mode = "recon";
  library.writeRecord(store, a);
  const records = library.read(store).records;
  assert.equal(records.length, 2);
  assert.deepEqual(
    records.find((r) => r.id === b.id),
    {...b,status:"formal"},
  );
  assert.deepEqual(records.find((r) => r.id === a.id).army.options, a.army.options);
  assert.equal(records.find((r) => r.id === a.id).name, "重命名");
});
test("saved roster copies isolate units and upgrade instances", () => {
  const original = library.create(2, "A", data, uid, now);
  original.army.units = [
    {
      instanceId: uid(),
      unitId: "empire-stormtroopers",
      upgrades: [{ instanceId: uid(), upgradeId: "stormtrooper-dlt19", slotIndex: 0 }],
    },
  ];
  const duplicate = library.copy(original, uid, now);
  assert.notEqual(duplicate.id, original.id);
  assert.notEqual(duplicate.army.units[0].instanceId, original.army.units[0].instanceId);
  assert.notEqual(
    duplicate.army.units[0].upgrades[0].instanceId,
    original.army.units[0].upgrades[0].instanceId,
  );
  duplicate.army.units[0].upgrades.length = 0;
  assert.equal(original.army.units[0].upgrades.length, 1);
});
test("malformed saved data and failed writes do not overwrite existing data", () => {
  const store = storage();
  store.setItem(library.KEY, "broken");
  assert.throws(() => library.writeRecord(store, library.create(1, "A", data, uid, now)));
  assert.equal(store.getItem(library.KEY), "broken");
  const record = library.create(1, "A", data, uid, now),
    raw = JSON.stringify({ version: 1, migratedLegacy: true, records: [record] });
  store.setItem(library.KEY, raw);
  store.setItem = () => {
    throw Error("quota exceeded");
  };
  assert.throws(() => library.writeRecord(store, { ...record, name: "B" }), /quota/);
  assert.equal(store.getItem(library.KEY), raw);
});
test("deletion can restore the exact saved roster", () => {
  const store = storage(),
    record = library.create(5, "A", data, uid, now);
  library.writeRecord(store, record);
  library.removeRecord(store, record.id);
  assert.equal(library.read(store).records.length, 0);
  library.writeRecord(store, record);
  assert.deepEqual(library.read(store).records, [{...record,status:"formal"}]);
});

test("draft autosave keeps only the five newest drafts and never trims formal rosters", () => {
  const store = storage();
  const formal = library.create(1,"Permanent",data,uid,"2026-01-01T00:00:00.000Z");
  library.writeRecord(store,formal);
  let drafts=[];
  for(let i=0;i<7;i++){
    const draft={...library.create(2,"Draft "+i,data,uid,new Date(Date.UTC(2026,0,i+1)).toISOString()),status:"draft"};
    drafts.push(draft);
    library.writeDraft(store,draft);
  }
  const saved=library.read(store).records;
  assert.equal(saved.filter(r=>r.status==="formal").length,1);
  assert.equal(saved.find(r=>r.id===formal.id).name,"Permanent");
  assert.deepEqual(saved.filter(r=>r.status==="draft").map(r=>r.name).sort(),
    ["Draft 2","Draft 3","Draft 4","Draft 5","Draft 6"]);
});

test("explicitly saving a draft promotes it and updates its source formal roster", () => {
  const store=storage();
  const source=library.create(4,"Source",data,uid,now);
  library.writeRecord(store,source);
  const draft={...source,id:uid(),sourceRecordId:source.id,status:"draft",name:"Edited",updatedAt:now};
  library.writeDraft(store,draft);
  const result=library.promoteDraft(store,draft,"2026-02-01T00:00:00.000Z");
  assert.equal(result.record.id,source.id);
  assert.equal(result.record.status,"formal");
  assert.equal(result.record.name,"Edited");
  assert.equal(result.record.createdAt,source.createdAt);
  assert.equal(library.read(store).records.length,1);
});
