const test = require("node:test");
const assert = require("node:assert/strict");
const BuilderSettings = require("../builder-settings.js");

test("selection style defaults to detail and persists the supported value", () => {
  const values = new Map();
  global.localStorage = {
    getItem:key => values.get(key) ?? null,
    setItem:(key,value) => values.set(key,String(value)),
  };
  assert.equal(BuilderSettings.load().selectionListStyle,"detail");
  assert.deepEqual(BuilderSettings.update({selectionListStyle:"large"}),{selectionListStyle:"large"});
  assert.deepEqual(JSON.parse(values.get(BuilderSettings.KEY)),{selectionListStyle:"large"});
  delete global.localStorage;
});

test("invalid settings and unavailable storage keep the safe detail default", () => {
  delete require.cache[require.resolve("../builder-settings.js")];
  const fresh = require("../builder-settings.js");
  global.localStorage = {
    getItem:() => JSON.stringify({selectionListStyle:"broken"}),
    setItem:() => {throw Error("quota");},
  };
  assert.equal(fresh.load().selectionListStyle,"detail");
  assert.equal(fresh.update({selectionListStyle:"large"}).selectionListStyle,"detail");
  delete global.localStorage;
});
