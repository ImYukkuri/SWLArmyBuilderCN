const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
global.window = global;
require("../dice-enums.js");
require("../rules-core.js");
require("../builder-model.js");
const read = (name) => JSON.parse(fs.readFileSync(path.join(root, "data", name), "utf8"));
const data = {
  units: Object.fromEntries(read("units.json").units.map((u) => [u.id, u])),
  upgrades: Object.fromEntries(read("upgrades.json").cards.map((c) => [c.id, c])),
  defs: read("catalog-definitions.json"),
  pkg: read("slot-rules.json"),
};
data.nameIndex = RulesCore.buildNameIndex(data.upgrades, data.defs);
test("every counterpart has persisted art, effects, and resolved summaries/full rules", () => {
  const cards = Object.values(data.upgrades).filter(c=>c.usage === 'counterpart');
  assert.equal(cards.length, 5);
  for (const card of cards) {
    assert(card.name.zh, card.id);
    assert(card.description.zh.join('').length > 20, card.id);
    assert(fs.existsSync(path.join(root,card.assets.front)), card.id);
    assert(fs.existsSync(path.join(root,card.assets.portrait)), card.id);
    for (const host of [{factionId:1},{factionId:4}]) {
      const view=BuilderModel.upgradePresentation(card,data,host);
      assert.equal(view.keywords.length, new Set(view.keywords.map(k=>JSON.stringify(k))).size);
      for (const k of view.keywords) {
        const ref=data.defs.keywords.find(d=>d.id===k.id);
        assert(ref?.name.zh && ref.summary && ref.full, card.id+' / '+k.id);
      }
    }
  }
});
test("counterpart upgrades display existing unit art and abilities while retaining upgrade identity and rules", () => {
  const before = JSON.stringify(data);
  for (const id of ["upstream-167", "upstream-131", "upstream-15628", "upstream-22586", "upstream-3649"]) {
    const raw = data.upgrades[id];
    const view = BuilderModel.upgradePresentation(raw, data, { factionId: 1 });
    assert.equal(view.id, raw.id);
    assert.equal(view.points, raw.points);
    assert.deepEqual(view.rules, raw.rules);
    assert(view.assets.front);
    assert(view.keywords.length > 0);
    assert(view.counterpart);
  }
  const rebel = BuilderModel.upgradePresentation(data.upgrades['upstream-131'], data, { factionId: 1 });
  assert.equal(rebel.counterpart.id, 'rebels-c-3po-cyborg');
  const empire = BuilderModel.upgradePresentation(data.upgrades['upstream-167'], data);
  assert.equal(empire.weapons[0].range.min, 0);
  assert.equal(JSON.stringify(data), before);
});
test("counterpart presentation keeps explicit upgrade content and never links an unreferenced namesake", () => {
  const raw = data.upgrades['upstream-167'];
  const card = {...raw, description:{zh:['Original effect']}, assets:{front:'original.webp'}, keywords:[{id:'shielded',value:1}]};
  const view = BuilderModel.upgradePresentation(card, data);
  assert.deepEqual(view.description, card.description);
  assert.equal(view.assets.front,'original.webp');
  assert.equal(view.keywords.filter(k=>k.id==='shielded').length,1);
  const unknown = {...raw, upstream:{collection:'upgrades',id:'unmatched'}};
  assert.equal(BuilderModel.upgradePresentation(unknown,data),unknown);
});
let sequence = 0;
const uid = () => `instance-${++sequence}`;
const unit = (id = "empire-stormtroopers") => ({ instanceId: uid(), unitId: id, upgrades: [] });
const armyOf = (...units) => ({
  armyId: 2,
  mode: "standard",
  pointsLimit: 1000,
  units,
  commandIds: [],
  options: [],
});
const slotContext = (army, key) => ({
  unitInstanceId: army.units[0].instanceId,
  slotIndex: RulesCore.slotListFor(
    data.pkg,
    data.units[army.units[0].unitId],
    army.units[0],
    data.upgrades,
    army.armyId,
  ).findIndex((s) => s.key === key),
  slotKey: key,
  groupIds: army.units.map((i) => i.instanceId),
});

test("groups ignore instance IDs and selection order but preserve configuration and unit version", () => {
  const a = unit(),
    b = unit();
  a.upgrades = [
    { instanceId: uid(), upgradeId: "stormtrooper-dlt19", slotIndex: 0 },
    { instanceId: uid(), upgradeId: "test", slotIndex: 2 },
  ];
  b.upgrades = a.upgrades.toReversed().map((ch) => ({ ...ch, instanceId: uid() }));
  const roster = armyOf(a, b),
    snapshot = JSON.stringify(roster);
  assert.equal(BuilderModel.groups(roster, data).length, 1);
  assert.equal(JSON.stringify(roster), snapshot);
  b.upgrades[0].slotIndex = 3;
  assert.equal(BuilderModel.groups(roster, data).length, 2);
  b.upgrades = structuredClone(a.upgrades);
  b.unitId = "empire-scout-troopers";
  assert.equal(BuilderModel.groups(roster, data).length, 2);
});
test("copy duplicates all upgrades with independent IDs and leaves the input untouched", () => {
  const roster = armyOf(unit());
  roster.units[0].upgrades = [{ instanceId: uid(), upgradeId: "stormtrooper-dlt19", slotIndex: 0 }];
  const snapshot = JSON.stringify(roster),
    result = BuilderModel.duplicate(roster, data, roster.units[0].instanceId, uid);
  assert.equal(result.ok, true, result.reason);
  assert.equal(JSON.stringify(roster), snapshot);
  assert.equal(BuilderModel.groups(result.draft, data).length, 1);
  assert.notEqual(result.draft.units[0].instanceId, result.draft.units[1].instanceId);
  assert.notEqual(
    result.draft.units[0].upgrades[0].instanceId,
    result.draft.units[1].upgrades[0].instanceId,
  );
  result.draft.units[1].upgrades.length = 0;
  assert.equal(result.draft.units[0].upgrades.length, 1);
});
test("unique unit or equipped unique upgrade prevents copying", () => {
  assert.equal(BuilderModel.copyable(unit("empire-darth-vader-lord"), data), false);
  const u = unit();
  u.upgrades = [{ instanceId: uid(), upgradeId: "del-meeko", slotIndex: 0 }];
  const roster = armyOf(u);
  assert.equal(BuilderModel.duplicate(roster, data, u.instanceId, uid).ok, false);
  assert.equal(roster.units.length, 1);
});
test("default equipment affects one group member and splits the presentation", () => {
  const roster = armyOf(unit(), unit()),
    snapshot = JSON.stringify(roster);
  const result = BuilderModel.equip(
    roster,
    data,
    slotContext(roster, "heavy_weapon"),
    "stormtrooper-dlt19",
    false,
    uid,
  );
  assert.equal(result.ok, true, result.reason);
  assert.equal(result.count, 1);
  assert.equal(JSON.stringify(roster), snapshot);
  assert.equal(result.draft.units[1].upgrades.length, 0);
  assert.equal(BuilderModel.groups(result.draft, data).length, 2);
});
test("batch equipment commits independent selections for every merged unit", () => {
  const roster = armyOf(unit(), unit());
  const result = BuilderModel.equip(
    roster,
    data,
    slotContext(roster, "heavy_weapon"),
    "stormtrooper-dlt19",
    true,
    uid,
  );
  assert.equal(result.ok, true, result.reason);
  assert.equal(result.count, 2);
  assert.equal(BuilderModel.groups(result.draft, data).length, 1);
  assert.equal(
    new Set(result.draft.units.flatMap((u) => u.upgrades.map((c) => c.instanceId))).size,
    2,
  );
  assert.equal(RulesCore.validateArmy(result.draft, data).basePoints, 124);
});
test("unique batch failure is atomic; replacing a slot ignores its removed selection", () => {
  const roster = armyOf(unit(), unit()),
    ctx = slotContext(roster, "heavy_weapon"),
    snapshot = JSON.stringify(roster);
  const failed = BuilderModel.equip(roster, data, ctx, "del-meeko", true, uid);
  assert.equal(failed.ok, false);
  assert.match(failed.reason, /独特|互斥|上限/);
  assert.equal(JSON.stringify(roster), snapshot);
  const first = BuilderModel.equip(roster, data, ctx, "del-meeko", false, uid);
  assert.equal(first.ok, true, first.reason);
  const replacement = BuilderModel.equip(first.draft, data, ctx, "stormtrooper-dlt19", false, uid);
  assert.equal(replacement.ok, true, replacement.reason);
  assert.equal(replacement.draft.units[0].upgrades.length, 1);
  assert.equal(replacement.draft.units[0].upgrades[0].upgradeId, "stormtrooper-dlt19");
});
test("stale or mismatched targets and wrong slots never mutate a roster", () => {
  const roster = armyOf(unit(), unit()),
    ctx = slotContext(roster, "heavy_weapon");
  roster.units[1].upgrades.push({
    instanceId: uid(),
    upgradeId: "stormtrooper-dlt19",
    slotIndex: 0,
  });
  const snapshot = JSON.stringify(roster);
  assert.equal(BuilderModel.equip(roster, data, ctx, "stormtrooper-dlt19", true, uid).ok, false);
  assert.equal(
    BuilderModel.equip(roster, data, { ...ctx, slotIndex: 99 }, "stormtrooper-dlt19", false, uid)
      .ok,
    false,
  );
  assert.equal(BuilderModel.equip(roster, data, ctx, "force-saber", false, uid).ok, false);
  assert.equal(JSON.stringify(roster), snapshot);
});
test("new local duplicate equipment is rejected even when the roster is unfinished", () => {
  const roster = armyOf(unit("empire-darth-vader-lord"));
  const ctx = slotContext(roster, "force");
  const first = BuilderModel.equip(roster, data, ctx, "force-saber", false, uid);
  assert.equal(first.ok, true, first.reason);
  const second = BuilderModel.equip(
    first.draft,
    data,
    { ...ctx, slotIndex: ctx.slotIndex + 1 },
    "force-saber",
    false,
    uid,
  );
  assert.equal(second.ok, false);
  assert.match(second.reason, /重复|同名/);
});

test("copy cannot worsen an existing upgrade limit violation", () => {
  const limitedData = {
    ...data,
    upgrades: {
      ...data.upgrades,
      "stormtrooper-dlt19": {
        ...data.upgrades["stormtrooper-dlt19"],
        rules: { ...data.upgrades["stormtrooper-dlt19"].rules, limit: 1 },
      },
    },
  };
  const roster = armyOf(unit(), unit());
  for (const u of roster.units)
    u.upgrades = [{ instanceId: uid(), upgradeId: "stormtrooper-dlt19", slotIndex: 0 }];
  const result = BuilderModel.duplicate(roster, limitedData, roster.units[0].instanceId, uid);
  assert.equal(result.ok, false);
  assert.match(result.reason, /上限/);
  assert.equal(roster.units.length, 2);
});
test("batch replacements remove all old conflicting choices before checking the new configuration", () => {
  const replacement = {
    ...data.upgrades["stormtrooper-dlt19"],
    id: "test-replacement",
    name: { en: "Replacement" },
    upstream: { id: "test-replacement" },
    rules: { slotTypes: [4], locallyUnique: true },
  };
  const scoped = {
    ...data,
    upgrades: { ...data.upgrades, [replacement.id]: replacement },
    pkg: {
      ...data.pkg,
      upgradeRules: {
        ...data.pkg.upgradeRules,
        [String(data.upgrades["stormtrooper-dlt19"].upstream.id)]: {
          ...data.pkg.upgradeRules[String(data.upgrades["stormtrooper-dlt19"].upstream.id)],
          conflictGroup: "test-group",
        },
        "test-replacement": { conflictGroup: "test-group" },
      },
    },
  };
  scoped.nameIndex = RulesCore.buildNameIndex(scoped.upgrades, scoped.defs);
  const roster = armyOf(unit(), unit());
  for (const u of roster.units)
    u.upgrades = [{ instanceId: uid(), upgradeId: "stormtrooper-dlt19", slotIndex: 0 }];
  const result = BuilderModel.equip(
    roster,
    scoped,
    slotContext(roster, "heavy_weapon"),
    replacement.id,
    true,
    uid,
  );
  assert.equal(result.ok, true, result.reason);
  assert.ok(result.draft.units.every((u) => u.upgrades[0].upgradeId === replacement.id));
  assert.ok(roster.units.every((u) => u.upgrades[0].upgradeId === "stormtrooper-dlt19"));
});
test("unit selection rejects unique name variants and does not mutate the input", () => {
  const roster = { ...armyOf(unit("rebels-solo")), armyId: 1 };
  const snapshot = JSON.stringify(roster);
  for (const id of ["rebels-solo", "rebels-han-solo-tauntaun"]) {
    const result = BuilderModel.addUnit(roster, data, id, uid);
    assert.equal(result.ok, false);
    assert.match(result.reason, /独特|互斥/);
  }
  assert.equal(JSON.stringify(roster), snapshot);
});
test("combined Han and Chewie reserves both characters in either selection order", () => {
  for (const id of ["rebels-solo", "rebels-han-solo-tauntaun", "rebels-chewbacca-rebel"]) {
    for (const [first, next] of [
      [id, "mercenary-rogue-han-and-chewie"],
      ["mercenary-rogue-han-and-chewie", id],
    ]) {
      const roster = { ...armyOf(unit(first)), armyId: 1 };
      const result = BuilderModel.addUnit(roster, data, next, uid);
      assert.equal(result.ok, false, first + " + " + next);
      assert.match(result.reason, /独特角色/);
      const imported = { ...roster, units: [...roster.units, unit(next)] };
      assert.ok(
        RulesCore.validateArmy(imported, data).issues.some(
          (i) => i.code === "character_duplicate",
        ),
      );
    }
  }
});
test("combined character can equip its own mandatory unique children", () => {
  let roster = { ...armyOf(unit("mercenary-rogue-han-and-chewie")), armyId: 1 };
  const context = slotContext(roster, "personnel");
  for (const [slotIndex, card] of [
    [0, "upstream-23420"],
    [1, "upstream-23419"],
  ]) {
    const result = BuilderModel.equip(
      roster,
      data,
      { ...context, slotIndex },
      card,
      false,
      uid,
    );
    assert.equal(result.ok, true, result.reason);
    roster = result.draft;
  }
  assert.equal(roster.units[0].upgrades.length, 2);
  assert.ok(
    !RulesCore.validateArmy(roster, data).issues.some((i) => i.code === "character_duplicate"),
  );
});
test("unique upgrade and character unit conflict in both directions", () => {
  const host = unit("rebels-rebel-veterans");
  // The existing eligibility data for this host allows the Chewbacca heavy upgrade.
  const allowedHost = Object.values(data.units).find((u) => String(u.upstream?.id) === "1563");
  host.unitId = allowedHost.id;
  const base = { ...armyOf(host), armyId: 1 };
  const equipped = BuilderModel.equip(
    base,
    data,
    slotContext(base, "heavy_weapon"),
    "chewbacca-heavy",
    false,
    uid,
  );
  assert.equal(equipped.ok, true, equipped.reason);
  assert.equal(
    BuilderModel.addUnit(equipped.draft, data, "rebels-chewbacca-rebel", uid).ok,
    false,
  );
  assert.equal(
    BuilderModel.addUnit(equipped.draft, data, "mercenary-rogue-han-and-chewie", uid).ok,
    false,
  );
  const withUnit = { ...base, units: [host, unit("rebels-chewbacca-rebel")] };
  const result = BuilderModel.equip(
    withUnit,
    data,
    slotContext(withUnit, "heavy_weapon"),
    "chewbacca-heavy",
    false,
    uid,
  );
  assert.equal(result.ok, false);
  assert.match(result.reason, /独特/);
});
test("unrelated unique characters remain available", () => {
  const roster = { ...armyOf(unit("rebels-solo")), armyId: 1 };
  const result = BuilderModel.addUnit(roster, data, "rebels-chewbacca-rebel", uid);
  assert.equal(result.ok, true, result.reason);
});
test("rank maximum blocks new additions and copies even if the army was already over cap", () => {
  const id = "empire-imperial-officer-ruthless-efficiency";
  for (const n of [2, 3]) {
    const roster = armyOf(...Array.from({ length: n }, () => unit(id)));
    assert.equal(BuilderModel.addUnit(roster, data, id, uid).ok, false);
    assert.equal(
      BuilderModel.duplicate(roster, data, roster.units[0].instanceId, uid).ok,
      false,
    );
    assert.equal(roster.units.length, n);
  }
  assert.equal(BuilderModel.addUnit(armyOf(), data, id, uid).ok, true);
});
test("unit limits apply to base armies and cannot worsen existing violations", () => {
  const scoped = {
    ...data,
    units: {
      ...data.units,
      "empire-stormtroopers": {
        ...data.units["empire-stormtroopers"],
        rules: { ...data.units["empire-stormtroopers"].rules, limit: 1 },
      },
    },
  };
  const roster = armyOf(unit(), unit());
  assert.ok(
    RulesCore.validateArmy(roster, scoped).issues.some(
      (i) => i.code === "unit_limit_exceeded",
    ),
  );
  assert.equal(BuilderModel.addUnit(roster, scoped, "empire-stormtroopers", uid).ok, false);
  assert.equal(
    BuilderModel.duplicate(roster, scoped, roster.units[0].instanceId, uid).ok,
    false,
  );
});
test("existing explicit unit mutual exclusion still blocks adding a differently named unit", () => {
  const a = data.units["empire-stormtroopers"];
  const b = Object.values(data.units).find((u) => u.id === "empire-imperial-officer-ruthless-efficiency");
  const scoped = {
    ...data,
    units: {
      ...data.units,
      [a.id]: {
        ...a,
        rules: {
          ...a.rules,
          unavailableWith: [{ propertyName: "units", id: b.upstream.id }],
        },
      },
    },
  };
  for (const [first, next] of [
    [a.id, b.id],
    [b.id, a.id],
  ]) {
    const result = BuilderModel.addUnit(armyOf(unit(first)), scoped, next, uid);
    assert.equal(result.ok, false);
    assert.match(result.reason, /互斥/);
  }
});
