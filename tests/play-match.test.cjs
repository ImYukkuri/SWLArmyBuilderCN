const assert = require("node:assert/strict");
const test = require("node:test");
const PlayMatch = require("../play-match.js");
const PlayStore = require("../play-store.js");

const catalog = { hasBattleCard: () => true };

function archiveFixture() {
  const contents = new Map();
  const storage = {
    getItem: key => contents.get(key) ?? null,
    setItem: (key, value) => contents.set(key, value),
    removeItem: key => contents.delete(key)
  };
  const record = {
    id: "roster", name: "测试军表",
    army: { armyId: 4, units: [], commandIds: [], deck: { primary: [], secondary: [], advantage: [] } }
  };
  return { storage, record };
}

test("archive keeps a legacy match, resumes the latest unfinished match and isolates updates", () => {
  const { storage, record } = archiveFixture();
  const legacyKey = "swl.play.match.v1:" + record.id;
  const oldMatch = PlayMatch.create(record);
  oldMatch.stage = "finished";
  delete oldMatch.reminderStates;
  storage.setItem(legacyKey, JSON.stringify(oldMatch));
  assert.equal(PlayStore.entryFor(PlayStore.open(storage, record.id)).id, "legacy");
  assert.ok(storage.getItem(PlayStore.storageKey(record.id)));
  const first = PlayStore.start(storage, record);
  const second = PlayStore.start(storage, { ...record, name: "更新后的军表" });
  PlayStore.save(storage, record.id, second.id, { ...second.match, stage: "finished" });
  const archive = PlayStore.read(storage, record.id);
  assert.equal(PlayStore.entryFor(archive).id, first.id);
  assert.deepEqual(PlayStore.entryFor(archive, "legacy").match, oldMatch);
  assert.equal(PlayStore.entryFor(archive, first.id).match.armies.self.name, record.name);
  assert.equal(PlayStore.entryFor(archive, second.id).match.armies.self.name, "更新后的军表");
  PlayStore.remove(storage, record.id, "legacy");
  assert.equal(storage.getItem(legacyKey), null);
  PlayStore.remove(storage, record.id, first.id);
  assert.throws(() => PlayStore.save(storage, record.id, first.id, first.match), /已不存在/);
  assert.equal(PlayStore.entryFor(PlayStore.read(storage, record.id)).id, second.id);
});

test("backup restoration preserves missing card IDs and creates a separate match", () => {
  const { storage, record } = archiveFixture();
  record.army.units.push({ instanceId: "unit", unitId: "old-unit", upgrades: [{ instanceId: "u", upgradeId: "old-card" }] });
  const entry = PlayStore.start(storage, record);
  const text = PlayStore.exportJSON(entry);
  const first = PlayStore.restore(storage, record.id, text);
  const second = PlayStore.restore(storage, record.id, text);
  assert.notEqual(first.id, entry.id);
  assert.notEqual(second.id, first.id);
  assert.deepEqual(second.match.armies, entry.match.armies);
  assert.equal(second.createdAt, entry.createdAt);
  const malformed = JSON.parse(text);
  malformed.match.armies.self.army.units = null;
  const before = storage.getItem(PlayStore.storageKey(record.id));
  assert.throws(() => PlayStore.restore(storage, record.id, JSON.stringify(malformed)), /格式不兼容/);
  assert.equal(storage.getItem(PlayStore.storageKey(record.id)), before);
});
const apply = (match, type, fields = {}) => PlayMatch.update(match, { type, ...fields }, catalog);
const annotate = (match, player, value, category = "other") => apply(match, "score", { player, value, category });
const playingMatch = () => apply(PlayMatch.create({ id: "roster", army: { units: [] } }), "skipSetup");

test("terrain generation draws distinct halves, rotates them independently and preserves the saved layout", () => {
  const {storage, record} = archiveFixture();
  const setup = apply(PlayMatch.create(record), "beginSetup");
  const draws = [.99, .99, .99, .99, .99, .1, .9];
  const generated = PlayMatch.update(setup, {type: "generateTerrain"}, catalog, () => draws.shift());
  assert.equal(setup.setup.terrainLayout, undefined);
  assert.deepEqual(generated.setup.terrainLayout, [{id: 1, rotated: true}, {id: 2, rotated: false}]);
  const withNote = apply(generated, "terrain", {value: "保留中央通道"});
  const backup = PlayStore.exportJSON({match: withNote});
  assert.deepEqual(PlayStore.restore(storage, record.id, backup).match.setup, withNote.setup);
  const duplicate = JSON.parse(backup);
  duplicate.match.setup.terrainLayout[1].id = 1;
  assert.throws(() => PlayStore.restore(storage, record.id, JSON.stringify(duplicate)), /格式不兼容/);
});

test("a saved pre-game setup can be skipped while retaining the current armies and selections", () => {
  const { record } = archiveFixture();
  const imported = apply(PlayMatch.create(record), "opponent", { record: { ...record, name: "对手军表" } });
  const setup = apply(imported, "beginSetup");
  assert.equal(apply(setup, "skipSetup").stage, "playing");
  const confirmed = apply(apply(setup, "terrain", { value: "靠窗" }), "chooseBlue", { player: "opponent" });
  const picked = apply(confirmed, "setMission", { category: "primary", id: "deployment-13" });
  const started = apply(picked, "skipSetup");
  assert.equal(started.stage, "playing");
  assert.equal(started.blue, "opponent");
  assert.deepEqual(started.armies, picked.armies);
  assert.deepEqual(started.mission, picked.mission);
  assert.throws(() => apply({ ...picked, stage: "bp" }, "skipSetup"), /无法跳过/);
  assert.throws(() => apply({ ...picked, bp: {} }, "skipSetup"), /无法跳过/);
});

test("six-step mission construction follows the selected blue side and consumes only its matching deck", () => {
  const { record } = archiveFixture();
  record.army.deck = {
    primary: ["deployment-13", "deployment-14", "deployment-15"],
    secondary: ["objective-13", "objective-14", "objective-15"],
    advantage: ["condition-13", "condition-14", "condition-15"]
  };
  const opponent = structuredClone(record);
  opponent.id = "opponent";
  opponent.name = "对手军表";
  opponent.army.armyId = 2;
  const validCards = new Set(Object.values(record.army.deck).flat());
  const fullCatalog = { hasBattleCard: (category, id) => validCards.has(String(id)) };
  const update = (match, action) => PlayMatch.update(match, action, fullCatalog, () => 0);
  let match = update(PlayMatch.create(record), { type: "opponent", record: opponent });
  match = update(match, { type: "beginSetup" });
  match = update(match, { type: "choosePlayerColor", value: "red" });
  assert.equal(match.blue, "opponent");
  assert.equal(PlayMatch.hasBattleDecks(match, fullCatalog), true);
  match = update(match, { type: "startBP" });
  assert.equal(match.bp.stepIndex, 0);
  assert.equal(PlayMatch.canBPMove(match, "primary"), false);
  match = update(match, { type: "bpReveal", category: "primary" });
  assert.equal(match.bp.stepIndex, 2);
  assert.equal(match.mission.primary.player, "opponent");
  assert.equal(match.mission.secondary.player, "self");
  assert.equal(match.mission.advantage.opponent.player, "opponent");
  assert.equal(match.mission.advantage.self.player, "self");
  const afterOpen = match;

  const turnOrder = [];
  for (const action of [
    { type: "modifyMission", value: "primary" },
    { type: "modifyMission", value: "claimBlue" },
    { type: "modifyMission", value: "secondary" },
    { type: "modifyMission", value: "pass" }
  ]) {
    turnOrder.push(match.bp.turn);
    match = update(match, action);
  }
  assert.deepEqual(turnOrder, ["opponent", "self", "self", "opponent"]);
  assert.equal(match.blue, "self");
  assert.equal(match.initialBlue, "opponent");
  assert.equal(match.bp.complete, true);
  assert.equal(match.bp.stepIndex, 6);
  assert.equal(match.stage, "bp");
  for (const player of PlayMatch.players) {
    for (const category of PlayMatch.categories) {
      const pile = match.bp.piles[player][category];
      const inPlay = category === "advantage"
        ? Number(match.mission.advantage[player]?.id != null)
        : Number(match.mission[category]?.player === player);
      assert.equal(pile.discard.length + pile.cards.length + inPlay, 3);
    }
  }
  match = update(match, { type: "finishSetup" });
  assert.equal(match.stage, "playing");
  assert.equal(PlayMatch.canBPMove(match, "primary"), false);

  let depleted = update(afterOpen, { type: "modifyMission", value: "advantage" });
  depleted = update(depleted, { type: "modifyMission", value: "opponentAdvantage" });
  assert.equal(PlayMatch.canBPMove(depleted, "advantage"), false);
  assert.throws(() => update(depleted, { type: "modifyMission", value: "advantage" }), /没有可替换/);
});

test("manual task selection requires one primary, one secondary and both players' advantages", () => {
  const { record } = archiveFixture();
  let match = apply(PlayMatch.create(record), "beginSetup");
  match = apply(match, "choosePlayerColor", { value: "blue" });
  match = apply(match, "manualMissions");
  assert.throws(() => apply(match, "finishSetup"), /四张任务卡/);
  match = apply(match, "setMission", { category: "primary", id: "deployment-13" });
  match = apply(match, "setMission", { category: "secondary", id: "objective-13" });
  match = apply(match, "setMission", { category: "advantage", player: "self", id: "condition-13" });
  assert.throws(() => apply(match, "finishSetup"), /四张任务卡/);
  match = apply(match, "setMission", { category: "advantage", player: "opponent", id: "condition-14" });
  assert.equal(apply(match, "finishSetup").stage, "playing");
});

const finishRound = match => {
  for (const phase of PlayMatch.phases) {
    assert.equal(match.phase, phase);
    match = apply(match, "advance");
  }
  return match;
};

test("score corrections retain source and revision history and feed round totals", () => {
  let match = playingMatch();
  match = apply(match, "setMission", { category: "primary", id: "original" });
  match = annotate(match, "self", 2, "primary");
  match = apply(match, "setMission", { category: "primary", id: "new-task" });
  const previous = match;
  match = apply(match, "amendScore", {
    id: 1, player: "opponent", value: "4", category: "primary", round: "3", phase: "end_round", note: "在结束阶段结算"
  });
  assert.equal(previous.scoreEvents[0].points, 2);
  assert.equal(match.scoreEvents[0].cardId, "original");
  assert.equal(match.scoreEvents[0].revisions[0].points, 2);
  assert.deepEqual(PlayMatch.totals(match), { self: 0, opponent: 4 });
  assert.equal(PlayMatch.scoreSummary(match)[0].points.self, 0);
  assert.equal(PlayMatch.scoreSummary(match)[2].points.opponent, 4);
  assert.equal(PlayMatch.scoreSummary(match)[4].cumulative.opponent, 4);
  match = apply(match, "undoScore", { id: 1 });
  assert.equal(match.scoreEvents[0].reversed, true);
  assert.equal(match.scoreEvents[0].revisions.length, 1);
  assert.equal(PlayMatch.totals(match).opponent, 0);
});

test("rejected score corrections leave the prior match intact", () => {
  let match = annotate(playingMatch(), "self", 2);
  match = annotate(match, "self", -2);
  assert.throws(() => apply(match, "undoScore", { id: 1 }), /非负整数/);
  assert.throws(() => apply(match, "amendScore", { id: 1, player: "opponent", value: 2, category: "other" }), /非负整数/);
  assert.equal(match.scoreEvents[0].reversed, false);
  assert.equal(match.scoreEvents[0].player, "self");
});

test("early victory is checked at round end and is reopened if score correction invalidates it", () => {
  let match = annotate(playingMatch(), "self", 12);
  assert.equal(match.stage, "playing");
  match = finishRound(match);
  assert.deepEqual(PlayMatch.matchOutcome(match), { reason: "target", winner: "self" });
  match = apply(match, "undoScore", { id: 1 });
  assert.equal(match.stage, "playing");
  assert.equal(match.phase, "end_round");
  match = apply(apply(match, "advance"), "retreat");
  assert.equal(match.round, 1);
  assert.equal(match.phase, "end_round");
});

test("a tie at the limit plays on through round five and can use manually entered losses", () => {
  let match = playingMatch();
  for (let round = 1; round <= 5; round++) {
    for (const player of PlayMatch.players) match = annotate(match, player, round <= 4 ? 3 : 1);
    match = finishRound(match);
    assert.equal(match.stage, round < 5 ? "playing" : "finished");
  }
  assert.deepEqual(PlayMatch.matchOutcome(match), { reason: "pendingTie" });
  assert.throws(() => apply(match, "settleTie", { self: "", opponent: "400" }));
  match = apply(match, "settleTie", { self: "550", opponent: "400" });
  assert.deepEqual(PlayMatch.matchOutcome(match), { reason: "defeatedPoints", winner: "opponent" });
  match = apply(match, "settleTie", { self: "400", opponent: "400" });
  assert.deepEqual(PlayMatch.matchOutcome(match), { reason: "draw" });
  match = apply(match, "reopen");
  assert.equal(PlayMatch.matchOutcome(match), null);
});

test("confirming one remaining army works without importing the opponent", () => {
  let match = annotate(playingMatch(), "self", 10);
  match = apply(match, "confirmLastArmy", { player: "opponent" });
  assert.deepEqual(PlayMatch.matchOutcome(match), { reason: "lastArmy", winner: "opponent" });
});

test("upgrade state and face remain independent per copy and per player in old saves", () => {
  const units = ["a", "b"].map(instanceId => ({
    instanceId, upgrades: [{ instanceId: instanceId + "-config", upgradeId: "dual", face: "front" }]
  }));
  const army = { units };
  let match = apply(PlayMatch.create({ id: "roster", army }), "skipSetup");
  match = apply(match, "opponent", { record: { army } });
  delete match.upgradeFaces;
  const input = { player: "self", unit: "a", id: "a-config" };
  match = apply(match, "upgradeStatus", { ...input, value: "exhausted" });
  match = apply(match, "upgradeStatus", { ...input, value: "ready" });
  match = apply(match, "upgradeStatus", { ...input, value: "expended" });
  assert.throws(() => apply(match, "upgradeStatus", { ...input, value: "ready" }), /更正/);
  assert.throws(() => apply(match, "upgradeStatus", { ...input, value: "exhausted" }), /更正/);
  assert.throws(() => apply(match, "upgradeStatus", { ...input, unit: "b", value: "removed" }), /无效/);
  const face = { type: "upgradeFace", ...input, value: "back" };
  assert.throws(() => PlayMatch.update(match, face, { isDualUpgrade: () => false }), /双面/);
  match = PlayMatch.update(match, face, { isDualUpgrade: (_, id) => id === "dual" });
  match = apply(match, "upgradeStatus", { ...input, player: "opponent", value: "removed" });
  assert.equal(match.upgradeFaces[PlayMatch.cardKey("self", "a-config")], "back");
  assert.equal(match.upgradeFaces[PlayMatch.cardKey("opponent", "a-config")], undefined);
  assert.equal(match.upgradeStates[PlayMatch.cardKey("self", "a-config")], "expended");
  assert.equal(match.upgradeStates[PlayMatch.cardKey("opponent", "a-config")], "removed");
  assert.equal(match.upgradeStates[PlayMatch.cardKey("self", "b-config")], undefined);
  assert.equal(match.armies.self.army.units[0].upgrades[0].face, "front");
  match = apply(match, "upgradeStatus", { ...input, value: "ready", correction: true });
  assert.equal(match.upgradeStates[PlayMatch.cardKey("self", "a-config")], "ready");
});

test("commands can be withdrawn or replaced while hidden and reveal independently by side", () => {
  const army = { units: [], commandIds: ["8", "35"] };
  let match = apply(PlayMatch.create({ id: "roster", army }), "skipSetup");
  match = apply(match, "opponent", { record: { army } });
  const command = (player, id, value) => { match = apply(match, "command", { player, id, value }); };
  const state = (player, id) => match.commands[PlayMatch.cardKey(player, id)];
  command("self", 0, "hide");
  command("self", 1, "hide");
  assert.equal(state("self", 0).hidden, false);
  assert.equal(state("self", 1).hidden, true);
  command("self", 1, "withdraw");
  command("self", 1, "hide");
  command("opponent", 0, "hide");
  match = apply(match, "revealCommands");
  assert.equal(state("self", 1).revealedRound, 1);
  assert.equal(state("opponent", 0).revealedRound, 1);
  assert.throws(() => command("self", 0, "hide"), /翻开前/);
  command("self", 1, "markUsed");
  assert.equal(state("self", 1).used, true);
  assert.equal(state("opponent", 0).used, undefined);
});

test("the score panel keeps matching command cards, discards and display effects separate by player", () => {
  const { record } = archiveFixture();
  record.army.commandIds = ["8", "35"];
  let match = apply(PlayMatch.create(record), "skipSetup");
  match = apply(match, "opponent", { record });
  const command = (type, player, id = 0, fields = {}) => {
    match = apply(match, type, { player, id, ...fields });
  };
  const state = (player, id = 0) => match.commands[PlayMatch.cardKey(player, id)];

  command("placeCommand", "self");
  command("removeCommand", "self");
  assert.equal(PlayMatch.commandSlot(match, "self"), -1);
  assert.ok(!state("self").used);
  assert.equal(match.activityLog.at(-1).card, "");

  command("placeCommand", "self");
  command("placeCommand", "opponent");
  command("flipCommand", "self");
  assert.equal(PlayMatch.commandPair(match), "");
  command("flipCommand", "opponent");
  const pair = PlayMatch.commandPair(match);
  assert.ok(pair);
  match = PlayMatch.update(match, { type: "rollPriority", pair }, catalog, () => 0.99);
  assert.deepEqual(match.priorityRoll, { pair, player: "opponent" });
  command("removeCommand", "self");
  assert.equal(match.priorityRoll, undefined);
  assert.equal(state("self").used, true);
  assert.ok(!state("opponent").used);
  assert.equal(PlayMatch.commandSlot(match, "opponent"), 0);
  assert.equal(match.activityLog.at(-1).player, "self");
  command("restoreCommand", "self");
  assert.equal(state("self").used, false);

  command("displayCommand", "self", 0, { permanent: false });
  assert.equal(state("self").displayed, true);
  command("placeCommand", "self");
  command("removeCommand", "self");
  command("removeDisplay", "self");
  command("displayCommand", "self", 0, { permanent: true });
  assert.equal(state("self").displayed, true);
  assert.equal(state("self").used, true);
  command("removeDisplay", "self");
  assert.equal(state("self").displayed, false);
  assert.equal(state("self").used, true);
  assert.throws(() => command("restoreCommand", "self"), /无法返回手牌/);
  assert.throws(() => command("placeCommand", "self"), /已弃置/);
  assert.equal(PlayMatch.commandSlot(match, "opponent"), 0);
});

test("explicit saves write snapshots and update the same archive entry", () => {
  const { storage, record } = archiveFixture();
  const match = apply(PlayMatch.create(record), "skipSetup");
  const session = { id: "session", createdAt: new Date().toISOString(), match: annotate(match, "self", 1) };
  const entries = () => PlayStore.read(storage, record.id).entries;

  assert.equal(entries().length, 0);
  PlayStore.saveSession(storage, session);
  session.match = annotate(session.match, "self", 1);
  assert.deepEqual(entries().map(entry => [entry.id, entry.match.scoreEvents.length]), [[session.id, 1]]);

  session.match = apply(session.match, "endGame");
  PlayStore.saveSession(storage, session);
  assert.deepEqual(entries().map(entry => [entry.id, entry.match.stage, entry.match.scoreEvents.length]),
    [[session.id, "finished", 2]]);
  PlayStore.remove(storage, record.id, session.id);
  assert.equal(entries().length, 0);
});

test("legacy token ownership survives a transfer and activity records preserve snapshots", () => {
  const army = { units: [{ instanceId: "unit", upgrades: [] }], commandIds: [] };
  let match = apply(PlayMatch.create({ id: "roster", army }), "skipSetup");
  match = apply(match, "opponent", { record: { army } });
  match.tokens = [{ id: 1, label: "赏金", player: "self", unit: "unit" }];
  delete match.activityLog;
  match = apply(match, "assignToken", { id: 1, player: "opponent", value: "unit" });
  assert.equal(match.tokens[0].owner, "self");
  assert.equal(match.activityLog[0].before.player, "self");
  assert.equal(match.activityLog[0].after.player, "opponent");
  assert.throws(() => apply(match, "editToken", { id: 1, label: "物资", quantity: "0" }), /正整数/);
  match = apply(match, "editToken", { id: 1, label: "物资", quantity: "3", owner: "self" });
  match = apply(match, "removeToken", { id: 1 });
  assert.equal(match.tokens.length, 0);
  assert.equal(match.activityLog[0].after.label, "赏金");
  assert.equal(match.activityLog.at(-1).before.quantity, 3);
});

test("rule profiles and manually repeated activations are scoped to the match and round", () => {
  const army = { units: [{ instanceId: "unit", upgrades: [] }], commandIds: [] };
  let match = apply(PlayMatch.create({ id: "roster", army }), "skipSetup");
  delete match.rulesProfile;
  assert.equal(PlayMatch.rulesProfile(match), "pre-december-2026");
  assert.equal(PlayMatch.defaultRulesProfile(new Date(2026, 10, 30, 23, 59)), "pre-december-2026");
  assert.equal(PlayMatch.defaultRulesProfile(new Date(2026, 11, 1)), "doc61");
  match = apply(match, "rulesProfile", { value: "doc61" });
  assert.equal(PlayMatch.rulesProfile(match), "doc61");
  match = apply(apply(match, "advance"), "advance");
  match = apply(match, "repeatActivation", { player: "self", id: "unit" });
  assert.equal(PlayMatch.activationVisit(match, "self", "unit"), 2);
  assert.equal(PlayMatch.activationVisit(match, "opponent", "unit"), 1);
  match = apply(match, "setRound", { value: 2 });
  assert.equal(PlayMatch.activationVisit(match, "self", "unit"), 1);
  match = apply(match, "setRound", { value: 1 });
  assert.equal(PlayMatch.activationVisit(match, "self", "unit"), 2);
});
