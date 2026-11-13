const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
global.window = global;
require("../editor-options.js");
const read = (name) =>
  JSON.parse(fs.readFileSync(path.join(__dirname, "../data", name + ".json"), "utf8"));
const defs = read("catalog-definitions"),
  units = read("units"),
  upgrades = read("upgrades");
const pkg = read("slot-rules"),
  fields = read("rule-fields");
const options = EditorOptions.create(defs, units.units, upgrades.cards, pkg, fields);

test("catalog indexes retain local and upstream identity and bilingual searchable names", () => {
  const unit = units.units.find((u) => u.id === "rebels-solo");
  assert.ok(
    options.table("units").some((x) => x.value === unit.id && x.label.includes("Han Solo")),
  );
  assert.ok(
    options
      .table("sourceUnits")
      .some((x) => x.value === String(unit.upstream.id) && x.label.includes("汉")),
  );
  assert.ok(options.table("upgrades").length >= defs.upgrades.length);
});
test("reference enumeration is pure and does not mutate any source catalog", () => {
  const before = JSON.stringify({ defs, units, upgrades, pkg, fields });
  EditorOptions.create(defs, units.units, upgrades.cards, pkg, fields);
  assert.equal(JSON.stringify({ defs, units, upgrades, pkg, fields }), before);
});
test("effect keyword arrays resolve numeric source IDs while conditions use local IDs", () => {
  const atom = { property: "keywords", value: [6] };
  const effect = options.rule(["addProperties", 0, 0, "value", 0], atom.value, 6, [atom]);
  assert.ok(effect.some((x) => x.value === 6));
  assert.ok(effect.every((x) => typeof x.value === "number"));
  assert.ok(options.condition("unit.keywords").some((x) => x.value === "guardian"));
});
test("cost modifiers distinguish options from units and resolve scope separately", () => {
  assert.ok(
    options
      .rule(["modifiedPointsWith", 0, "property"], {}, "options")
      .some((x) => x.value === "options"),
  );
  assert.ok(
    options
      .rule(["modifiedPointsWith", 0, "id"], { property: "options" }, "veterans")
      .some((x) => x.value === "veterans"),
  );
  assert.ok(
    options
      .rule(["modifiedPointsWith", 0, "id"], { property: "units" }, 29928)
      .some((x) => String(x.value) === "29928"),
  );
  assert.ok(
    options
      .rule(["modifiedPointsWith", 0, "in"], { property: "options" }, "33788")
      .some((x) => String(x.value) === "33788"),
  );
});
test("nested references honor namespace, slot, rank and predicate dictionaries", () => {
  assert.ok(
    options
      .rule(["requiredChildren", 0, "id"], { elementPropertyName: "upgrades" }, 23420)
      .some((x) => String(x.value) === "23420"),
  );
  assert.ok(
    options.rule(["quantityLimitedBy", 0, "unit"], {}, 15).some((x) => String(x.value) === "15"),
  );
  assert.ok(
    options.rule(["slotGrants", 0, "ifAbsentAny", 0], [], "crew").some((x) => x.value === "crew"),
  );
  assert.ok(options.rule(["requiresTier", 0], [], 2).some((x) => x.value === 2));
  assert.ok(
    options
      .rule(["slotGrants", 0, "when", "ref"], {}, "trooperUnitType")
      .some((x) => x.value === "trooperUnitType"),
  );
});
test("conflicts offer names and namespace-qualified references without flattening objects", () => {
  const choices = options.rule(["unavailableWithIds", 0], [], "Han Solo");
  assert.ok(choices.some((x) => x.value === "Han Solo"));
  assert.ok(choices.some((x) => x.value?.propertyName === "units" && x.value.id === "15"));
  assert.ok(choices.some((x) => x.value?.propertyName === "upgrades"));
});
test("condition values retain engine types and use combined names only for equality", () => {
  assert.ok(options.condition("unit.unitTypeId").some((x) => x.value === 1));
  assert.ok(options.condition("unit.upstreamId").some((x) => x.value === "15"));
  assert.ok(options.condition("unit.name", "contains").some((x) => x.value === "Han Solo"));
  assert.ok(options.condition("unit.name", "eq").some((x) => x.value === "Han Solo 汉·索罗"));
});
test("nested rule arrays choose values from their owning condition or effect", () => {
  const unitType = { property: "unitType", value: [1, 2] };
  const typeChoices = options.rule(["requiredProperties", 0, 0, "value", 0], unitType.value, null, [
    unitType,
  ]);
  assert.ok(typeChoices.some((x) => x.value === 1));
  assert.ok(typeChoices.some((x) => x.value === "local:wookiee_trooper"));
  assert.ok(typeChoices.every((x) => ["number", "string"].includes(typeof x.value)));
  const when = { field: "unit.id", op: "in", value: ["rebels-solo"] };
  assert.ok(
    options
      .rule(["slotGrants", 0, "when", "value", 0], when.value, null, [when])
      .some((x) => x.value === "rebels-solo"),
  );
});
test("one preload shares requests and keeps editor-only indexes out of exported definitions", async () => {
  const oldFetch = global.fetch,
    calls = [];
  const files = {
    "catalog-definitions": defs,
    units,
    upgrades,
    "slot-rules": pkg,
    "rule-fields": fields,
  };
  global.fetch = async (url) => {
    calls.push(url);
    return {
      ok: true,
      json: async () => structuredClone(files[url.split("/").at(-1).replace(".json", "")]),
    };
  };
  try {
    const first = EditorOptions.load(true),
      second = EditorOptions.load();
    assert.equal(first, second);
    const loaded = await first;
    assert.equal(calls.length, 5);
    assert.ok(loaded.defs.editorOptions);
    assert.ok(!JSON.stringify(loaded.defs).includes("editorOptions"));
    await EditorOptions.load(true);
    assert.equal(calls.length, 10);
  } finally {
    global.fetch = oldFetch;
  }
});
test("failed preload can be retried and never resolves an incomplete registry", async () => {
  const oldFetch = global.fetch;
  global.fetch = async () => ({ ok: false, status: 503 });
  try {
    await assert.rejects(EditorOptions.load(true), /503/);
  } finally {
    global.fetch = oldFetch;
  }
});
