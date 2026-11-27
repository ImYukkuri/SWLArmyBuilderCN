(function (root, factory) {
  if (typeof module === "object") module.exports = factory();
  else root.PlayMatch = factory();
})(globalThis, () => {
  "use strict";

  const players = ["self", "opponent"];
  const categories = ["primary", "secondary", "advantage"];
  const scoreCategories = ["primary", "secondary", "other"];
  const phases = ["command", "activation_start", "activation", "end_round"];
  const maxRounds = 5;
  const victoryTarget = 12;
  const terrainCards = [1, 2, 3, 4, 5, 6];
  const upgradeStatuses = ["ready", "exhausted", "expended", "removed"];
  const upgradeFaces = ["front", "back"];
  const other = player => player === "self" ? "opponent" : "self";
  const emptyTaskDeck = () => ({ primary: [], secondary: [], advantage: [] });
  const cardKey = (player, id) => JSON.stringify([player, String(id)]);
  const rulesProfiles = ["pre-december-2026", "doc61"];
  const doc61Effective = new Date(2026, 11, 1);
  const defaultRulesProfile = (date = new Date()) => date >= doc61Effective ? rulesProfiles[1] : rulesProfiles[0];

  function requireCondition(condition, message) {
    if (!condition) throw new Error(message);
  }

  function create(record) {
    return {
      version: 1,
      rosterId: record.id,
      armies: { self: structuredClone(record), opponent: null },
      taskDecks: { self: structuredClone(record.army?.deck || emptyTaskDeck()), opponent: null },
      stage: "import",
      rulesProfile: defaultRulesProfile(),
      initialBlue: null,
      blue: "self",
      mission: { primary: null, secondary: null, advantage: { self: null, opponent: null } },
      missionMode: "bp",
      bp: null,
      setup: { edge: "", terrain: "", confirmed: false },
      round: 1,
      phase: phases[0],
      scoreEvents: [],
      result: null,
      unitStates: {},
      upgradeStates: {},
      upgradeFaces: {},
      commands: {},
      reminderStates: {},
      reminderNotes: [],
      activationVisits: {},
      activityLog: [],
      tokens: [],
      nextTokenId: 1
    };
  }

  function canSkipSetup(match) {
    return match.stage === "import" || (match.stage === "setup" && !match.bp);
  }

  function hasBattleDecks(match, catalog) {
    return players.every(player => hasBattleDeck(match, player, catalog));
  }

  function validTaskCards(cards, category, catalog) {
    return Array.isArray(cards) && cards.length === 3 &&
      new Set(cards.map(String)).size === 3 && cards.every(id => catalog.hasBattleCard(category, id));
  }

  function hasBattleDeck(match, player, catalog) {
    return categories.every(category => validTaskCards(taskDeck(match, player, category), category, catalog));
  }

  function shuffle(cards, random) {
    const order = [...cards];
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    return order;
  }

  function reveal(match, player, category) {
    const bp = match.bp;
    const pile = bp.piles[player][category];
    const current = category === "advantage" ? match.mission.advantage[player] : match.mission[category];
    if (current) bp.piles[current.player][category].discard.push(current.id);
    requireCondition(pile.cards.length, "这叠卡没有可翻开的卡。");
    const card = { id: pile.cards.shift(), player };
    if (category === "advantage") match.mission.advantage[player] = card;
    else match.mission[category] = card;
    return card.id;
  }

  function canBPMove(match, move, player = match.bp?.turn) {
    if (match.stage !== "bp" || !players.includes(player) || ![2, 3, 4, 5].includes(match.bp.stepIndex)) return false;
    const available = (owner, category) => match.bp.piles[owner][category].cards.length > 0;
    if (move === "primary" || move === "secondary") return available(player, move);
    if (move === "advantage") return available(player, "advantage");
    if (move === "opponentAdvantage") {
      const target = other(player);
      return available(target, "advantage");
    }
    if (move === "claimBlue") return player !== match.blue;
    return move === "pass";
  }

  function totals(match) {
    const scores = { self: 0, opponent: 0 };
    for (const event of match.scoreEvents) {
      if (!event.reversed) scores[event.player] += event.points;
    }
    return scores;
  }

  function scoreSummary(match) {
    const rounds = Array.from({ length: maxRounds }, (_, index) => ({
      round: index + 1, points: { self: 0, opponent: 0 }
    }));
    for (const event of match.scoreEvents) {
      if (!event.reversed) rounds[event.round - 1].points[event.player] += event.points;
    }
    const cumulative = { self: 0, opponent: 0 };
    return rounds.map(round => {
      for (const player of players) cumulative[player] += round.points[player];
      return { ...round, cumulative: { ...cumulative } };
    });
  }

  function scoreEntry(match, action, previous) {
    const { player, category } = action;
    const points = Number(action.value);
    const round = Number(action.round ?? match.round);
    const phase = action.phase ?? match.phase;
    requireCondition(players.includes(player) && scoreCategories.includes(category), "请选择有效的玩家和得分项。");
    requireCondition(Number.isInteger(round) && round >= 1 && round <= maxRounds && phases.includes(phase), "请选择有效的回合和阶段。");
    requireCondition(Number.isSafeInteger(points) && points !== 0, "分数必须是非零整数。");
    return {
      player, category, points, round, phase,
      cardId: previous?.category === category ? previous.cardId : match.mission[category]?.id ?? null,
      note: String(action.note ?? "").trim()
    };
  }

  function validTotals(match) {
    requireCondition(Object.values(totals(match)).every(value => Number.isSafeInteger(value) && value >= 0), "修正后的总分必须是非负整数。");
  }

  function leadsAtTarget({ self, opponent }) {
    return self !== opponent && Math.max(self, opponent) >= victoryTarget;
  }

  function matchOutcome(match) {
    if (match.stage !== "finished") return null;
    if (match.result?.reason === "lastArmy") return match.result;
    const { self, opponent } = totals(match);
    if (self !== opponent) {
      return { reason: match.round < maxRounds && match.result?.reason !== "manual" ? "target" : "points", winner: self > opponent ? "self" : "opponent" };
    }
    const costs = match.result?.defeatedPoints;
    if (!costs) return { reason: "pendingTie" };
    if (costs.self === costs.opponent) return { reason: "draw" };
    return { reason: "defeatedPoints", winner: costs.self < costs.opponent ? "self" : "opponent" };
  }

  function findUnit(match, player, id) {
    return players.includes(player) && match.armies[player]?.army.units.find(unit => String(unit.instanceId) === id);
  }

  function activationKey(match, player, unit) {
    return JSON.stringify([match.round, player, unit]);
  }

  function activationVisit(match, player, unit) {
    return match.activationVisits?.[activationKey(match, player, unit)] || 1;
  }

  function reminderWindow(match) {
    if (match.stage === "setup") return "setup";
    if (match.stage === "playing") return match.phase;
    return null;
  }

  function log(match, type, data = {}) {
    match.activityLog ??= [];
    match.activityLog.push({ type, ...data, round: match.round, phase: match.phase, stage: match.stage, time: new Date().toISOString() });
  }

  function unitName(match, player, unit, catalog) {
    return unit ? catalog.unitName?.(match, player, unit) || unit : "";
  }

  function editToken(token, action) {
    const label = String(action.label ?? action.value ?? "").trim();
    const quantity = Number(action.quantity ?? 1);
    const owner = action.owner || null;
    requireCondition(label && label.length <= 40, "标记名称须为 1 到 40 个字符。");
    requireCondition(Number.isSafeInteger(quantity) && quantity >= 1, "标记数量须为正整数。");
    requireCondition(!owner || players.includes(owner), "未知的标记归属。");
    Object.assign(token, { label, quantity, owner });
  }

  function canHideCommand(match, player, slot) {
    const state = match.commands[cardKey(player, slot)];
    return match.stage === "playing" && match.phase === "command" && !state?.used && !state?.hidden &&
      !match.armies[player]?.army.commandIds.some((_, index) => match.commands[cardKey(player, index)]?.revealedRound === match.round);
  }

  function changeCommand(match, player, slot, operation) {
    requireCondition(players.includes(player), "请选择指挥卡所属玩家。");
    const id = match.armies[player]?.army.commandIds[slot];
    requireCondition(id != null && /^\d+$/.test(slot), "找不到指挥卡。");
    const key = cardKey(player, slot);
    const card = match.commands[key] ||= {};
    if (operation === "hide") {
      requireCondition(canHideCommand(match, player, slot), "只能在命令阶段翻开前暗置未使用的指挥卡。");
      for (const index of match.armies[player].army.commandIds.keys()) {
        const previous = match.commands[cardKey(player, index)];
        if (previous?.hidden) previous.hidden = false;
      }
      card.hidden = true;
    } else if (operation === "withdraw") {
      requireCondition(card.hidden && match.phase === "command", "只能收回尚未翻开的指挥卡。");
      card.hidden = false;
    } else if (operation === "markUsed") {
      requireCondition(!card.hidden && !card.permanent, "先翻开指挥卡，永久揭露的卡无法返回手牌。");
      card.used = !card.used;
    }
  }

  function revealCommands(match, catalog) {
    const revealed = [];
    for (const [key, card] of Object.entries(match.commands)) {
      if (!card.hidden) continue;
      card.hidden = false;
      card.revealedRound = match.round;
      const [player, slot] = JSON.parse(key);
      revealed.push({ player, card: catalog.commandName?.(match, player, slot) });
    }
    if (revealed.length) log(match, "revealCommands", { revealed });
  }

  function commandSlot(match, player) {
    return (match.armies[player]?.army.commandIds || []).findIndex((id, index) => {
      if (id == null) return false;
      const state = match.commands[cardKey(player, index)];
      return state?.onTable ?? (state?.hidden || (!state?.used && state?.revealedRound === match.round));
    });
  }

  function commandPair(match) {
    const slots = players.map(player => commandSlot(match, player));
    if (slots.some((slot, index) => slot < 0 || match.commands[cardKey(players[index], slot)].hidden)) return "";
    return JSON.stringify([match.round, ...slots]);
  }

  function updateCommandTable(match, { type, player, id, permanent }, catalog) {
    requireCondition(players.includes(player) && /^\d+$/.test(String(id)) &&
      match.armies[player]?.army.commandIds[id] != null, "找不到这张指挥卡。");
    const key = cardKey(player, id);
    const card = match.commands[key] ||= {};
    const onTable = commandSlot(match, player) === Number(id);
    const concealed = type === "placeCommand" || (type === "removeCommand" && card.hidden);
    switch (type) {
      case "placeCommand":
        requireCondition(!card.used && commandSlot(match, player) < 0, "这个卡槽已有指挥卡，或此卡已弃置。");
        Object.assign(card, { onTable: true, hidden: true });
        delete match.priorityRoll;
        break;
      case "flipCommand":
        requireCondition(onTable && card.hidden, "请先暗置这张卡。");
        Object.assign(card, { onTable: true, hidden: false, revealedRound: match.round });
        break;
      case "removeCommand":
        requireCondition(onTable, "此卡已离开卡槽。");
        if (!card.hidden) card.used = true;
        Object.assign(card, { onTable: false, hidden: false });
        delete match.priorityRoll;
        break;
      case "restoreCommand":
        requireCondition(card.used && !card.permanent, "此卡无法返回手牌。");
        card.used = false;
        card.onTable = false;
        break;
      case "displayCommand":
        requireCondition(!card.displayed, "此卡已在揭露区。");
        card.displayed = true;
        if (permanent) {
          Object.assign(card, { used: true, permanent: true, onTable: false, hidden: false });
          if (onTable) delete match.priorityRoll;
        }
        break;
      case "removeDisplay":
        requireCondition(card.displayed, "此卡已离开揭露区。");
        card.displayed = false;
        break;
    }
    log(match, type, { player,
      card: concealed ? "" : catalog.commandName?.(match, player, id) || String(id),
      discarded: !!card.used, permanent: type === "displayCommand" && permanent === true });
  }

  function update(current, action, catalog, random = Math.random) {
    const match = structuredClone(current);
    const { type, player, category, value } = action;
    const id = action.id == null ? "" : String(action.id);
    const isSetup = match.stage === "setup";
    const isPlaying = match.stage === "playing";
    const canScore = isPlaying || match.stage === "finished";
    switch (type) {
      case "rulesProfile":
        requireCondition(rulesProfiles.includes(value), "未知的规则版本。");
        if (value === rulesProfile(match)) break;
        match.rulesProfile = value;
        log(match, type, { value });
        break;
      case "opponent":
        requireCondition(isSetup || (match.stage !== "bp" && !match.armies.opponent), "当前无法替换对手军表。");
        requireCondition(action.record?.army, "请提供对手军表。");
        match.armies.opponent = structuredClone(action.record);
        match.taskDecks ||= { self: structuredClone(match.armies.self.army.deck || emptyTaskDeck()), opponent: null };
        match.taskDecks.opponent = structuredClone(action.record.army.deck || emptyTaskDeck());
        break;
      case "beginSetup":
        requireCondition(match.stage === "import", "已进入赛前设置。");
        match.stage = "setup";
        break;
      case "skipSetup":
        requireCondition(canSkipSetup(match), "当前阶段无法跳过赛前设置。");
        match.initialBlue ||= match.blue;
        match.missionMode = "manual";
        match.stage = "playing";
        break;
      case "choosePlayerColor":
        requireCondition(isSetup && !match.bp && (value === "blue" || value === "red"), "当前无法确认玩家颜色。");
        match.blue = value === "blue" ? "self" : "opponent";
        match.initialBlue = match.blue;
        break;
      case "terrain":
        requireCondition(isSetup, "当前不在赛前设置。");
        match.setup.terrain = String(value ?? "").trim();
        match.setup.confirmed = true;
        break;
      case "generateTerrain": {
        requireCondition(isSetup || match.stage === "bp", "请在赛前设置中生成地形参考。");
        const ids = shuffle(terrainCards, random).slice(0, 2);
        match.setup.terrainLayout = ids.map(id => ({id, rotated: random() < 0.5}));
        break;
      }
      case "chooseBlue":
        requireCondition(((isSetup && !match.bp) || (isPlaying && !match.initialBlue && !match.scoreEvents.length)) && players.includes(player), "当前无法指定蓝方。");
        requireCondition(!isSetup || match.setup.confirmed, "先确认地形。");
        match.blue = match.initialBlue = player;
        break;
      case "startBP": {
        requireCondition(isSetup && match.initialBlue && !match.bp && hasBattleDecks(match, catalog), "双方需要各有三类完整牌堆，并先确定蓝方。");
        const piles = Object.fromEntries(players.map(side => [side, Object.fromEntries(categories.map(kind => [
          kind, { cards: shuffle(taskDeck(match, side, kind), random), discard: [] }
        ]))]));
        match.bp = { piles, turn: match.blue, stepIndex: 0, complete: false, history: [] };
        match.mission = { primary: null, secondary: null, advantage: { self: null, opponent: null } };
        match.missionMode = "bp";
        match.stage = "bp";
        log(match, type, { player: match.blue });
        break;
      }
      case "bpReveal": {
        requireCondition(match.stage === "bp" && match.bp.stepIndex === 0 &&
          (category === "primary" || category === "secondary"), "请选择要揭露的任务类型。");
        const blue = match.blue;
        const red = other(blue);
        const redCategory = category === "primary" ? "secondary" : "primary";
        reveal(match, blue, category);
        reveal(match, blue, "advantage");
        reveal(match, red, redCategory);
        reveal(match, red, "advantage");
        match.bp.history.push(
          { player: blue, move: category, opening: true, revealed: match.mission[category].id },
          { player: red, move: redCategory, opening: true, revealed: match.mission[redCategory].id }
        );
        match.bp.initial = structuredClone(match.mission);
        match.bp.stepIndex = 2;
        log(match, type, { player: blue, category });
        break;
      }
      case "modifyMission": {
        requireCondition(canBPMove(match, value), "这张任务卡已没有可替换卡牌，或当前无法执行这项调整。");
        const side = match.bp.turn;
        let revealed = null;
        if (value === "claimBlue") {
          requireCondition(side !== match.blue, "你已经是蓝方。");
          match.blue = side;
        } else if (value === "opponentAdvantage") {
          revealed = reveal(match, other(side), "advantage");
        } else if (categories.includes(value)) {
          revealed = reveal(match, side, value);
        }
        match.bp.history.push({ player: side, move: value, revealed });
        match.bp.stepIndex++;
        match.bp.turn = match.bp.stepIndex % 2 === 0 ? match.blue : other(match.blue);
        match.bp.complete = match.bp.stepIndex === 6;
        log(match, type, { player: side, value, revealed });
        break;
      }
      case "manualMissions":
        requireCondition(isSetup && !!match.initialBlue && !match.bp, "先确认双方玩家颜色。");
        match.missionMode = "manual";
        log(match, type);
        break;
      case "setTaskDecks": {
        requireCondition(isSetup && !match.bp && players.includes(player) && action.decks &&
          categories.every(kind => validTaskCards(action.decks[kind], kind, catalog)),
          "每位玩家的任务牌组都必须包含三类各三张有效卡牌。");
        match.taskDecks ||= { self: structuredClone(match.armies.self.army.deck || emptyTaskDeck()), opponent: null };
        match.taskDecks[player] = Object.fromEntries(categories.map(kind => [kind, action.decks[kind].map(id => String(id))]));
        break;
      }
      case "setMission": {
        requireCondition((isSetup && match.initialBlue && !match.bp) || (isPlaying && !match.bp), "当前无法手选任务卡。");
        requireCondition(categories.includes(category) && (!id || catalog.hasBattleCard(category, id)), "无效的任务卡。");
        const card = id ? { id, player: null } : null;
        if (category === "advantage") {
          requireCondition(players.includes(player), "请选择优势卡所属玩家。");
          match.mission.advantage[player] = card;
        } else {
          match.mission[category] = card;
        }
        break;
      }
      case "startGame":
        requireCondition(isSetup && match.setup.confirmed && match.initialBlue && String(value ?? "").trim(), "请确认地形、蓝方和战场边缘。");
        match.setup.edge = String(value).trim();
        match.stage = "playing";
        break;
      case "finishSetup":
        requireCondition((isSetup || match.stage === "bp") && match.initialBlue &&
          (match.missionMode === "manual"
            ? !!match.mission.primary && !!match.mission.secondary && players.every(side => !!match.mission.advantage[side])
            : !!match.bp?.complete), "先确认玩家，并完成四张任务卡设置。");
        match.stage = "playing";
        log(match, type);
        break;
      case "setRound": {
        const round = Number(value);
        requireCondition(isPlaying && Number.isInteger(round) && round >= 1 && round <= maxRounds, "无效的回合。");
        match.round = round;
        if (round !== current.round) log(match, type);
        break;
      }
      case "advance":
        requireCondition(isPlaying, "对局尚未开始。");
        if (match.phase !== phases.at(-1)) {
          match.phase = phases[phases.indexOf(match.phase) + 1];
          log(match, type);
          break;
        }
        {
          if (match.round >= maxRounds || leadsAtTarget(totals(match))) {
            match.stage = "finished";
          } else {
            match.round++;
            match.phase = phases[0];
          }
        }
        log(match, match.stage === "finished" ? "finish" : type);
        break;
      case "retreat": {
        requireCondition(isPlaying, "当前无法返回上一阶段。");
        const index = phases.indexOf(match.phase);
        requireCondition(match.round > 1 || index > 0, "已经是第一回合的命令阶段。");
        if (index > 0) match.phase = phases[index - 1];
        else {
          match.round--;
          match.phase = phases.at(-1);
        }
        log(match, type);
        break;
      }
      case "score":
        requireCondition(canScore, "请先进入对局。");
        match.scoreEvents.push({
          id: match.scoreEvents.length + 1, ...scoreEntry(match, action),
          createdAt: new Date().toISOString(), reversed: false
        });
        validTotals(match);
        const entry = match.scoreEvents.at(-1);
        log(match, type, { player, score: { id: entry.id, points: entry.points, category: entry.category } });
        break;
      case "amendScore":
      case "undoScore": {
        const entry = match.scoreEvents.find(event => String(event.id) === id);
        requireCondition(canScore && entry && !entry.reversed, "找不到有效的得分记录。");
        if (type === "undoScore") {
          entry.reversed = true;
          entry.reversedAt = new Date().toISOString();
        } else {
          const revised = scoreEntry(match, action, entry);
          const { revisions, ...before } = entry;
          if (Object.keys(revised).every(key => revised[key] === before[key])) break;
          Object.assign(entry, revised, {
            revisions: [...(revisions || []), { ...before, supersededAt: new Date().toISOString() }]
          });
        }
        validTotals(match);
        log(match, type, { player: entry.player, score: { id: entry.id, points: entry.points, category: entry.category } });
        break;
      }
      case "confirmLastArmy":
        requireCondition(isPlaying && players.includes(player), "请选择仍有未被击败单位的一方。");
        match.result = { reason: "lastArmy", winner: player };
        match.stage = "finished";
        log(match, "finish", { player });
        break;
      case "endGame":
        requireCondition(isPlaying, "当前对局已结束。");
        match.result = { reason: "manual" };
        match.stage = "finished";
        log(match, "finish");
        break;
      case "settleTie": {
        const outcome = matchOutcome(match);
        requireCondition(["pendingTie", "draw", "defeatedPoints"].includes(outcome?.reason), "当前对局无需按被击败单位分值判定。");
        const defeatedPoints = Object.fromEntries(players.map(playerId => {
          const value = action[playerId];
          const points = Number(value);
          requireCondition(String(value ?? "").trim() && Number.isSafeInteger(points) && points >= 0, "请输入双方各自被击败单位的总分。");
          return [playerId, points];
        }));
        match.result = { ...match.result, defeatedPoints };
        log(match, type);
        break;
      }
      case "reopen":
        requireCondition(match.stage === "finished", "当前对局尚未结算。");
        match.result = null;
        match.stage = "playing";
        log(match, type);
        break;
      case "unitStatus":
        requireCondition(findUnit(match, player, id) && ["ready", "activated", "defeated"].includes(value), "无效的单位状态。");
        match.unitStates[cardKey(player, id)] = { value, round: match.round };
        log(match, type, { player, unit: unitName(match, player, id, catalog), value });
        break;
      case "upgradeStatus":
        requireCondition(findUnit(match, player, action.unit)?.upgrades.some(upgrade => String(upgrade.instanceId) === id) &&
          upgradeStatuses.includes(value), "无效的升级卡状态。");
        requireCondition(!["ready", "exhausted"].includes(value) || !["expended", "removed"].includes(match.upgradeStates[cardKey(player, id)]) ||
          action.correction === true,
          "请通过更正操作恢复已消耗或已移除的升级卡。");
        match.upgradeStates[cardKey(player, id)] = value;
        log(match, type, { player, unit: unitName(match, player, action.unit, catalog), card: catalog.upgradeName?.(match, player, action.unit, id) || id, value });
        break;
      case "upgradeFace": {
        const choice = findUnit(match, player, action.unit)?.upgrades.find(upgrade => String(upgrade.instanceId) === id);
        requireCondition(choice && upgradeFaces.includes(value) && catalog.isDualUpgrade(match.armies[player].army, choice.upgradeId),
          "只能切换已装备双面升级卡的朝向。");
        match.upgradeFaces ??= {};
        match.upgradeFaces[cardKey(player, id)] = value;
        log(match, type, { player, unit: unitName(match, player, action.unit, catalog), card: catalog.upgradeName?.(match, player, action.unit, id) || id, value });
        break;
      }
      case "command":
        requireCondition(isPlaying && ["hide", "withdraw", "markUsed"].includes(value), "当前无法操作指挥卡。");
        changeCommand(match, player, id, value);
        log(match, type, { player, value, card: value === "markUsed" ? catalog.commandName?.(match, player, id) : "" });
        break;
      case "revealCommands":
        requireCondition(isPlaying && match.phase === "command", "当前无法翻开指挥卡。");
        revealCommands(match, catalog);
        break;
      case "placeCommand":
      case "flipCommand":
      case "removeCommand":
      case "restoreCommand":
      case "displayCommand":
      case "removeDisplay":
        requireCondition(canScore, "请先进入对局。");
        updateCommandTable(match, action, catalog);
        break;
      case "rollPriority": {
        const pair = commandPair(match);
        requireCondition(canScore && pair && pair === action.pair, "请先翻开双方的指挥卡。");
        match.priorityRoll = { pair, player: players[Math.floor(random() * players.length)] };
        log(match, type, { player: match.priorityRoll.player });
        break;
      }
      case "addToken": {
        match.nextTokenId ??= match.tokens.reduce((next, token) => Math.max(next, token.id + 1), 1);
        const token = { id: match.nextTokenId++, player: null, unit: null };
        editToken(token, action);
        match.tokens.push(token);
        log(match, type, { after: { ...token } });
        break;
      }
      case "assignToken":
      case "editToken":
      case "removeToken": {
        const token = match.tokens.find(entry => String(entry.id) === id);
        requireCondition(token, "标记已不存在。");
        const before = { ...token };
        if (type === "removeToken") match.tokens = match.tokens.filter(entry => entry !== token);
        else if (type === "editToken") editToken(token, action);
        else {
          requireCondition(!value || findUnit(match, player, String(value)), "找不到要分配标记的单位。");
          if (token.player === (value ? player : null) && token.unit === (value ? String(value) : null)) break;
          if (token.owner === undefined) token.owner = token.player;
          token.player = value ? player : null;
          token.unit = value ? String(value) : null;
        }
        log(match, type, {
          before, after: type === "removeToken" ? null : { ...token },
          from: unitName(match, before.player, before.unit, catalog), to: unitName(match, token.player, token.unit, catalog)
        });
        break;
      }
      case "reminderState": {
        const reminder = catalog.reminder?.(match, id);
        requireCondition(reminder && ["handled", "ignored", "pending"].includes(value), "这条提醒当前不可用。");
        match.reminderStates ??= {};
        if (value === "pending") delete match.reminderStates[id];
        else match.reminderStates[id] = value;
        break;
      }
      case "repeatActivation": {
        requireCondition(isPlaying && match.phase === "activation" && findUnit(match, player, id) &&
          match.unitStates[cardKey(player, id)]?.value !== "defeated", "请选择当前可激活的单位。");
        match.activationVisits ??= {};
        match.activationVisits[activationKey(match, player, id)] = activationVisit(match, player, id) + 1;
        log(match, type, { player, unit: unitName(match, player, id, catalog) });
        break;
      }
      case "addReminder": {
        const window = reminderWindow(match);
        const note = String(value ?? "").trim();
        requireCondition(window && note && note.length <= 200, "请输入 1 到 200 个字符的提醒。");
        match.reminderNotes ??= [];
        match.reminderNotes.push({ id: "note-" + (match.reminderNotes.length + 1), window, round: match.round, note });
        break;
      }
      default:
        throw new Error("未知的对局操作。");
    }
    if (["score", "amendScore", "undoScore"].includes(type) && match.stage === "finished" &&
        !["lastArmy", "manual"].includes(match.result?.reason) && match.round < maxRounds && !leadsAtTarget(totals(match))) {
      match.stage = "playing";
    }
    return match;
  }

  function rulesProfile(match) {
    return rulesProfiles.includes(match.rulesProfile) ? match.rulesProfile : rulesProfiles[0];
  }

  function taskDeck(match, player, category) {
    return match.taskDecks?.[player]?.[category] ?? match.armies[player]?.army.deck?.[category] ?? [];
  }

  return { players, categories, scoreCategories, phases, maxRounds, victoryTarget, terrainCards, upgradeStatuses, upgradeFaces,
    rulesProfiles, rulesProfile, defaultRulesProfile, reminderWindow, activationVisit,
    other, cardKey, canHideCommand, commandSlot, commandPair, create, update, totals, scoreSummary, matchOutcome,
    canSkipSetup, canBPMove, taskDeck, hasBattleDeck, hasBattleDecks };
});
