window.PlayData = (() => {
  const nameOf = (name, fallback = "") => typeof name === "string" ? name : name?.zh || name?.en || fallback;
  const phases = { command: "命令阶段", activation_start: "激活阶段开始", activation: "激活阶段", end_round: "结束阶段" };
  const phaseSteps = {
    command: ["选择、暗置并翻开指挥卡", "结算指挥卡，由牌点较少的一方决定谁获得优先权",
      "发布命令，建立命令池与跳过池。跳过池的基础数量为双方未被击败单位数之差"],
    activation_start: ["结算激活阶段开始时的效果"],
    activation: ["依次处理激活或跳过", "查看单位激活开始、执行中与结束时的效果"],
    end_round: ["结算结束阶段效果", "记录任务得分", "处理指挥卡与标记，结束本回合"]
  };
  const labels = { primary: "主任务", secondary: "次要任务", advantage: "优势卡", other: "其他得分" };
  const unitStates = { ready: "就绪", activated: "已激活", defeated: "已击败" };
  const upgradeStates = { ready: "就绪", exhausted: "横置", expended: "已消耗", removed: "已移除" };
  const faceLabels = { front: "正面", back: "反面", both: "双面" };
  const playerNames = { self: "我方", opponent: "对方" };
  const bpMoves = {
    primary: "替换主任务", secondary: "替换次要任务", advantage: "替换自己的优势卡",
    opponentAdvantage: "替换对方优势卡", claimBlue: "成为蓝方", pass: "跳过本次调整"
  };
  const timingLabels = {
    setup: "设置", deployment: "部署", command: "命令阶段", command_reveal: "翻开指挥卡",
    receive_order: "收到命令", activation_start: "激活阶段开始", unit_activation_start: "单位激活开始",
    activation: "单位激活期间", activation_end: "单位激活结束", activation_phase_end: "激活阶段结束", end_round: "结束阶段"
  };
  const timingWindows = {
    setup: ["setup", "deployment"], command: ["command", "command_reveal", "receive_order"],
    activation_start: ["activation_start"], activation: ["unit_activation_start", "activation", "activation_end"],
    end_round: ["activation_phase_end", "end_round"]
  };
  const orderKeywords = new Set(["coordinate", "target", "defend", "disciplined", "this_is_the_way"]);
  const missionMoves = [
    { id: "primary", name: "替换主要任务" }, { id: "secondary", name: "替换次要任务" },
    { id: "advantage", name: "替换己方优势卡" }, { id: "opponentAdvantage", name: "替换对方优势卡" },
    { id: "claimBlue", name: "把自己变成蓝色方" }, { id: "pass", name: "让过" }
  ];
  const sideName = (match, player) => player === match.blue ? "蓝方" : "红方";
  const battleRuleHeading = /^(部署|计分|特殊规则|计分格|任意领地|友方领地|争夺领地|敌方领地|敌方单位恐慌|所有敌方单位受压制)[：:]/;

  function battleParagraphs(rules) {
    return rules.trim().split(/\r?\n/).filter(line => line.trim()).map(line => ({
      parts: line.trim().replace(battleRuleHeading, "**$&**").split(/\*\*([^*]+)\*\*/g)
        .map((text, index) => ({ text, bold: index % 2 === 1 })).filter(part => part.text)
    }));
  }

  async function load(base) {
    const [units, upgrades, defs, pkg, deckData, ttsNames] = await Promise.all(
      ["units", "upgrades", "catalog-definitions", "slot-rules", "battle-deck", "tts-names"].map(async file => {
        const response = await fetch(new URL("data/" + file + ".json", base));
        if (!response.ok) throw new Error("无法读取卡牌数据。HTTP " + response.status);
        return response.json();
      })
    );
    const data = {
      units: Object.fromEntries(units.units.map(unit => [unit.id, unit])),
      unitIdAliases: units.idAliases || {},
      upgrades: UpgradeFaces.index(upgrades.cards), defs, pkg, deckData, ttsNames
    };
    RulesCore.prepareData(data);
    data.nameIndex = RulesCore.buildNameIndex(data.upgrades, data.defs);
    return createCatalog(data, base);
  }

  function createCatalog(data, base) {
    const deck = data.deckData;
    const pools = {
      primary: [...new Map([...(deck.primary || []), ...(deck.deployments || [])].map(card => [String(card.id), card])).values()],
      secondary: [...new Map([...(deck.secondary || []), ...(deck.objectives || [])].map(card => [String(card.id), card])).values()],
      advantage: deck.conditions || []
    };
    const keywords = new Map();
    for (const keyword of data.defs.keywords) {
      for (const id of [keyword.id, ...(keyword.upstreamIds || [])]) keywords.set(String(id), keyword);
    }
    const asset = path => path ? new URL(path, base).href : "";
    const findBattleCard = (category, id) => pools[category]?.find(card => String(card.id) === String(id));
    const commandsById = new Map(data.defs.commands.map(card => [String(card.id), card]));
    const commandCard = (match, player, slot) => commandsById.get(String(match.armies[player]?.army.commandIds[slot]));
    function resolveUnit(instance, army, resolved) {
      const unit = RulesCore.unitFor(instance, army, resolved);
      if (unit?.id) return unit;
      let id = instance.unitId;
      const visited = new Set();
      while (Object.hasOwn(resolved.unitIdAliases || {}, id) && !visited.has(id)) {
        visited.add(id);
        id = resolved.unitIdAliases[id];
      }
      return Object.hasOwn(resolved.units, id) ? resolved.units[id] : undefined;
    }
    const cardView = (card, id, extra = {}) => ({
      id, name: nameOf(card?.name, id), english: card?.name?.zh && card.name.en, title: nameOf(card?.title),
      image: asset(card?.assets?.front || card?.image),
      missing: card ? "" : "当前卡库缺少此卡资料",
      rules: nameOf(card?.description) || nameOf(card?.rules),
      ...extra
    });
    const battleCard = (category, choice) => {
      if (!choice) return null;
      const source = findBattleCard(category, choice.id);
      const card = cardView(source, choice.id);
      if (category === "primary" && source?.image?.includes("/primary/")) {
        card.map = { id: card.id, name: card.name + "部署地图", image: card.image, cropped: true };
      }
      const paragraphs = battleParagraphs(card.rules || "");
      return {
        ...card, paragraphs, detailLabel: "查看" + card.name + "详情",
        hasArt: !!card.image, footerImage: category === "advantage" && paragraphs.length ? card.image : "",
        showTitle: !card.image || (category !== "advantage" && paragraphs.length > 0)
      };
    };

    function keywordViews(card) {
      return (card?.keywords || []).flatMap(ref => {
        const id = String(ref?.id ?? ref);
        const keyword = keywords.get(id);
        let name = nameOf(keyword?.name, ref?.label || ref?.raw || id);
        if (ref?.value != null) name = name.includes("X") ? name.replaceAll("X", String(ref.value)) : name + " " + ref.value;
        if (typeof ref?.parameter === "string" || typeof ref?.parameter === "number") name += " · " + ref.parameter;
        return [{ id, name, rules: nameOf(keyword?.full || keyword?.summary),
          summary: nameOf(keyword?.summary), timing: keyword?.timing || [] }];
      });
    }

    function upgradeView(match, player, instance, choice, unit, resolved) {
      const id = String(choice.instanceId);
      const key = PlayMatch.cardKey(player, id);
      const base = Object.hasOwn(resolved.upgrades, choice.upgradeId) ? resolved.upgrades[choice.upgradeId] : undefined;
      const state = match.upgradeStates[key] || "ready";
      const face = match.upgradeFaces?.[key] || UpgradeFaces.mode(choice.face || base?._face);
      const dual = UpgradeFaces.isDual(base);
      const display = side => {
        let card = UpgradeFaces.view(base, side);
        if (resolved.pkg._v2 && card) card = BattleForceRuntime.upgradeFor(card, unit, resolved);
        return BuilderModel.upgradePresentation(card, resolved, unit);
      };
      const upgrade = display(face);
      const focus = key + ":upgrade:";
      const selected = type => ({
        id, player, unit: String(instance.instanceId), value: type, focus: focus + type
      });
      const unavailable = state === "removed" || state === "expended";
      const visualState = unavailable ? "removed" : state;
      const stateOptions = ["ready", "exhausted", "removed"].map(value => ({
        ...selected(value), label: { ready: "就绪", exhausted: "横置", removed: "移除" }[value],
        active: visualState === value, correction: unavailable
      }));
      const faceOptions = dual ? PlayMatch.upgradeFaces.map(value => ({
        ...selected(value), label: faceLabels[value], active: face === value, focus: focus + value
      })) : [];
      const details = printed => printed && {printed, resolved};
      const card = cardView(upgrade, choice.upgradeId, {sharedDetail: details(upgrade)});
      if (dual) {
        const faces = face === "back" ? ["back", "front"] : PlayMatch.upgradeFaces;
        card.pages = faces.map(value => {
          const printed = display(value);
          return cardView(printed, choice.upgradeId, {faceLabel: faceLabels[value], sharedDetail: details(printed)});
        });
      }
      const activeCards = unavailable ? [] : dual && face === "both" ? PlayMatch.upgradeFaces.map(display) : [upgrade];
      return {
        view: { ...card, id, card, player, unit: String(instance.instanceId), visualState,
          stateOptions, faceOptions, faceLabel: dual ? faceLabels[face] : "", focus },
        activeCards
      };
    }

    function tokenSuggestions(match) {
      const labels = new Set();
      for (const category of ["primary", "secondary"]) {
        const card = findBattleCard(category, match.mission[category]?.id);
        for (const token of card?.tokens || []) labels.add(token.name);
      }
      labels.delete("赏金");
      return [...labels].map(label => ({ label, button: "添加" + label }));
    }

    function tokenView(match, token, selectedToken) {
      const owner = PlayMatch.tokenOwner(token);
      const quantity = token.quantity ?? 1;
      const ownerLabel = sideName(match, owner);
      const quantityLabel = quantity > 1 ? "×" + quantity : "";
      return { ...token, quantity, owner, quantityLabel, color: owner === match.blue ? "blue" : "red",
        bounty: token.label === "赏金",
        focus: "token-" + token.id, returnable: !!token.unit,
        assignedElsewhere: !!token.unit && token.player !== owner,
        ariaLabel: [ownerLabel, token.label, quantityLabel].filter(Boolean).join(" "),
        selected: String(token.id) === selectedToken };
    }

    function reminderView(match, id, fields) {
      const state = match.reminderStates?.[id];
      return { id, ...fields, pending: !state, state: { handled: "已处理", ignored: "暂时忽略" }[state] };
    }

    function cardReminders(match, player, source, card, printed, unit = null) {
      const window = PlayMatch.reminderWindow(match);
      const allowed = timingWindows[window] || [];
      return keywordViews(printed).flatMap((keyword, index) => {
        const timingKeys = new Set(keyword.timing.map(timing => {
          if (timing === "command" && orderKeywords.has(keyword.id)) return "receive_order";
          if (timing === "command" && keyword.id === "one_step_ahead") return "command_reveal";
          return timing;
        }));
        return [...timingKeys].filter(timing => allowed.includes(timing)).map(timing => {
          const visit = window === "activation" && unit ? PlayMatch.activationVisit(match, player, unit) : null;
          const id = JSON.stringify([match.round, window, player, unit, source.key, timing, keyword.id, index, visit]);
          return reminderView(match, id, {
            player, name: keyword.name, summary: keyword.summary, card,
            timing: timingLabels[timing], source: source.name, visitLabel: visit > 1 ? "第 " + visit + " 次激活" : ""
          });
        });
      });
    }

    function allReminders(match, rosters) {
      const window = PlayMatch.reminderWindow(match);
      if (!window) return [];
      const notes = (match.reminderNotes || []).filter(note => note.window === window && note.round === match.round)
        .map(note => reminderView(match, note.id, { name: note.note, timing: window === "setup" ? "设置" : phases[window] }));
      return [...rosters.flatMap(roster => roster.reminders), ...notes];
    }

    function activityView(match) {
      const actions = {
        startBP: "开始任务构建", modifyMission: "调整任务", setRound: "跳转回合",
        advance: "推进阶段", retreat: "返回阶段", finish: "结束对局", score: "记录得分", amendScore: "修改得分",
        undoScore: "撤销得分", unitStatus: "单位状态", upgradeStatus: "升级卡状态", upgradeFace: "切换卡面",
        revealCommands: "翻开指挥卡", command: "管理指挥卡", addToken: "添加标记", editToken: "修改标记",
        placeCommand: "暗置指挥卡", flipCommand: "翻开指挥卡", removeCommand: "移出卡槽",
        restoreCommand: "恢复指挥卡", displayCommand: "揭露指挥卡", removeDisplay: "移出揭露区", rollPriority: "随机选择优势玩家",
        settleTie: "比较被击败单位分值", reopen: "返回对局",
        removeToken: "删除标记", assignToken: "移动标记", repeatActivation: "记录额外激活"
      };
      const place = (token, unit) => unit ? playerNames[token.player] + " · " + unit : "托盘";
      const tokenLabel = token => {
        return [token.label + " ×" + (token.quantity ?? 1), sideName(match, PlayMatch.tokenOwner(token))].join(" · ");
      };
      return (match.activityLog || []).filter(entry => entry.type !== "rulesProfile").reverse().map(entry => {
        const { type, value, score, before, after } = entry;
        let detail = "";
        if (type === "assignToken") detail = tokenLabel(after) + " · " + place(before, entry.from) + " → " + place(after, entry.to);
        else if (type === "editToken") detail = tokenLabel(before) + " → " + tokenLabel(after);
        else if (before || after) detail = tokenLabel(after || before);
        else if (score) detail = "记录 #" + score.id + " · " + labels[score.category] + " · " + score.points + " VP";
        else if (type === "modifyMission") detail = bpMoves[value];
        else if (type === "startBP") detail = "先翻" + labels[entry.category];
        else if (type === "unitStatus") detail = [entry.unit, unitStates[value]].filter(Boolean).join(" · ");
        else if (type === "upgradeStatus" || type === "upgradeFace") detail = [entry.unit, entry.card, upgradeStates[value] || faceLabels[value]].join(" · ");
        else if (type === "command") detail = [{ hide: "暗置", withdraw: "收回暗置卡", markUsed: "切换使用状态" }[value], entry.card].filter(Boolean).join(" · ");
        else if (type === "revealCommands") detail = (entry.revealed || []).map(item => [playerNames[item.player], item.card].filter(Boolean).join(" · ")).join("／");
        else if (type === "removeCommand") detail = entry.discarded ? [entry.card, "弃置"].filter(Boolean).join(" · ") : "收回暗置卡";
        else if (type === "displayCommand") detail = [entry.card, entry.permanent ? "永久揭露" : ""].filter(Boolean).join(" · ");
        else if (type !== "placeCommand") detail = entry.card || entry.unit || "";
        const timing = type === "startBP" || type === "modifyMission" ? "任务构建"
          : ({ import: "对局准备", setup: "赛前设置", bp: "任务构建" }[entry.stage] || phases[entry.phase]);
        return { action: actions[type] || type, playerLabel: playerNames[entry.player], detail, round: entry.round, phase: timing };
      });
    }

    function rosterView(match, player, selectedToken) {
      const record = match.armies[player];
      const identity = { player, sideName: playerNames[player], color: player === match.blue ? "blue" : "red",
        colorName: sideName(match, player) };
      const owned = match.tokens.filter(token => PlayMatch.tokenOwner(token) === player);
      const selection = owned.find(token => String(token.id) === selectedToken);
      const freeTokens = owned.filter(token => !token.unit || token.player !== player)
        .map(token => tokenView(match, token, selectedToken));
      const tokenPanel = {...identity, freeTokens, selectedToken: selection && tokenView(match, selection, selectedToken)};
      if (!record) return { ...identity, name: "未导入军表", units: [], reminders: [], tokenPanel };
      const resolved = RulesCore.resolveArmyData(record.army, data);
      const reminders = [];
      const units = record.army.units.map((instance, index) => {
        const id = String(instance.instanceId);
        const unit = resolveUnit(instance, record.army, resolved);
        const key = PlayMatch.cardKey(player, id);
        const rawState = match.unitStates[key];
        const state = rawState?.value === "activated" && rawState.round !== match.round ? "ready" : rawState?.value || "ready";
        const unitName = nameOf(unit?.name, instance.unitId);
        const sourceName = record.army.units.some(other => other !== instance && other.unitId === instance.unitId)
          ? unitName + " #" + (index + 1) : unitName;
        const upgrades = instance.upgrades.map(choice => upgradeView(match, player, instance, choice, unit, resolved));
        const equipped = upgrades.flatMap(upgrade => upgrade.activeCards.filter(Boolean)
          .map(card => ({card, choiceId: upgrade.view.id})));
        const army = record.army;
        let points = unit?.points ?? null;
        for (const choice of instance.upgrades) {
          const upgrade = Object.hasOwn(resolved.upgrades, choice.upgradeId) && resolved.upgrades[choice.upgradeId];
          if (!upgrade || points === null) {
            points = null;
            break;
          }
          points += RulesCore.upgradePoints(upgrade, unit, army, resolved);
        }
        const card = cardView(unit, instance.unitId, {sharedDetail: unit && {
          printed: unit, resolved, equipped,
          rank: RulesCore.armyRank(unit, army.armyId, resolved.pkg, resolved.defs, resolved.units),
          points
        }});
        const unitReminders = [];
        if (state !== "defeated") {
          unitReminders.push(...cardReminders(match, player, { key: "unit", name: sourceName }, card, unit, id));
          for (const upgrade of upgrades) {
            for (const side of upgrade.activeCards.filter(Boolean)) {
              const name = [sourceName, nameOf(side.name), faceLabels[side._face]].filter(Boolean).join(" · ");
              const sourceKey = JSON.stringify(["upgrade", upgrade.view.id, side._face]);
              unitReminders.push(...cardReminders(match, player, { key: sourceKey, name }, upgrade.view.card, side, id));
            }
          }
          reminders.push(...unitReminders);
        }
        const tokens = owned.filter(token => token.player === player && token.unit === id)
          .map(token => tokenView(match, token, selectedToken));
        const stateOptions = [["ready", "就绪"], ["activated", "横置"], ["defeated", "移除"]].map(([value, label]) => ({
          id, player, label, value, active: state === value, focus: key + ":unit:" + value
        }));
        return { ...card, card, id, key, player, points, stateOptions,
          visualState: { ready: "ready", activated: "exhausted", defeated: "removed" }[state],
          canRepeatActivation: match.phase === "activation" && unitReminders.length > 0,
          upgrades: upgrades.map(upgrade => upgrade.view), tokens, canAssign: !!selection };
      });
      record.army.commandIds.forEach((commandId, slot) => {
        if (commandId == null) return;
        const state = match.commands[PlayMatch.cardKey(player, slot)] || {};
        if (state.hidden || (state.revealedRound !== match.round && !state.displayed)) return;
        const card = commandCard(match, player, slot);
        const presentation = cardView(card, String(commandId));
        reminders.push(...cardReminders(match, player, { key: "command-" + slot, name: presentation.name }, presentation, card));
      });
      return { ...identity, name: record.name, units, reminders, tokenPanel };
    }

    function commandView(match, ui, boardPlayers) {
      const color = player => player === match.blue ? "blue" : "red";
      const sideName = player => player === match.blue ? "蓝方" : "红方";
      const sideLabel = player => sideName(player) + "指挥卡";
      const sides = boardPlayers.map(({id: player}) => {
        const record = match.armies[player];
        const slot = PlayMatch.commandSlot(match, player);
        const commands = record?.army.commandIds.flatMap((id, index) => {
          if (id == null) return [];
          const source = commandCard(match, player, index);
          const state = match.commands[PlayMatch.cardKey(player, index)] || {};
          const card = cardView(source, String(id), {
            isCommand: true, pips: source?.pips, orders: nameOf(source?.orders)
          });
          return [{ id: String(index), player, card, color: color(player), owner: sideName(player),
            hidden: !!state.hidden, discarded: !!state.used, displayed: !!state.displayed,
            restorable: !!state.used && !state.permanent }];
        }) || [];
        const table = commands.find(item => Number(item.id) === slot);
        const hidden = !!table?.hidden;
        return { player, label: sideLabel(player), color: color(player), commands, empty: !table,
          hidden, revealed: !!table && !hidden, id: table?.id, card: hidden ? null : table?.card,
          revealedLabel: table && !hidden ? "查看" + table.card.name : "",
          back: asset("assets/command-cards/play-card-back.png"),
          hasTable: !!table };
      });
      const commands = sides.flatMap(side => side.commands);
      const pair = PlayMatch.commandPair(match);
      const dialog = ui.commandDialog;
      const hand = (player, purpose) => commands.filter(command => command.player === player && (purpose === "display"
        ? !command.displayed : !command.discarded));
      return {
        leftCommand: sides[0], rightCommand: sides[1], commandPair: pair,
        priorityReady: !!pair && !ui.priorityBusy, priorityPrompt: ui.priorityBusy ? "蓝色玩家" : "随机选择优势玩家",
        priorityResult: !ui.priorityBusy && pair && match.priorityRoll?.pair === pair
          ? sideName(match.priorityRoll.player).replace("方", "色玩家") : "",
        commandPicker: dialog ? { title: sideName(dialog.player) + (dialog.purpose === "display" ? " · 选择揭露卡" : " · 选择指挥卡"),
          cards: hand(dialog.player, dialog.purpose).map(command => ({ ...command, purpose: dialog.purpose })) } : null,
        discardedCommands: commands.filter(command => command.discarded),
        displayedCommands: commands.filter(command => command.displayed),
        displaySides: sides.map(side => ({ ...side, label: "揭露" + sideName(side.player) + "指挥卡",
          canDisplay: hand(side.player, "display").length > 0 }))
      };
    }

    function missionScoringView(match, boardPlayers) {
      const categories = ["primary", "secondary"];
      const events = match.scoreEvents.filter(entry => entry.round === match.round && !entry.reversed);
      return categories.flatMap(category => {
        const cardId = match.mission[category]?.id;
        const card = findBattleCard(category, cardId);
        if (!card) return [];
        const items = (card.scoreItems || []).map(item => {
          const results = PlayMatch.missionResults(match, category, cardId, item.id);
          const current = results.find(entry => entry.round === match.round);
          const sides = boardPlayers.map(({id: player, name, color}) => {
            const scored = results.find(entry => entry.player === player && entry.round === match.round);
            const completed = item.globalOnce && results.find(entry => entry.player === player && entry.points > 0);
            const points = scored?.points || 0;
            const locked = !!completed && completed.round !== match.round;
            return {player, name, color, category, id: item.id, points, locked,
              subtractLabel: name + "减少" + item.name, addLabel: name + "增加" + item.name,
              label: completed ? "第 " + completed.round + " 回合完成" : "",
              canAdd: !locked && (!points || item.repeatable && !item.globalOnce),
              canSubtract: points > 0, selected: current?.control === player};
          });
          const options = [
            ...sides.map(side => ({...side, value: side.player, label: side.name, completion: side.label, enabled: !side.locked})),
            {id: item.id, category, value: "tie", label: "打平", enabled: true, selected: current?.control === "tie"},
            {id: item.id, category, value: "", label: "清除", enabled: !!current}
          ];
          return {...item, category, left: sides[0], right: sides[1], options};
        });
        const totals = boardPlayers.map(({id, name, color}) => {
          const points = events.filter(entry => entry.player === id && entry.category === category)
            .reduce((sum, entry) => sum + entry.points, 0);
          return {color, points, label: name + "本回合" + labels[category] + " " + points + " 分"};
        });
        return [{category, title: labels[category] + " · " + nameOf(card.name), left: totals[0], right: totals[1], items}];
      });
    }

    function missionFields(match, manual) {
      const fields = [
        { category: "primary", name: labels.primary, choice: match.mission.primary },
        { category: "secondary", name: labels.secondary, choice: match.mission.secondary },
        ...[match.blue, PlayMatch.other(match.blue)].map(player => ({
          category: "advantage", player, name: (player === match.blue ? "蓝方" : "红方") + labels.advantage,
          choice: match.mission.advantage[player]
        }))
      ];
      return fields.map(field => {
        const selected = field.choice?.id || "";
        const options = manual ? [{ id: "", name: "未选择" }, ...pools[field.category]
          .map(card => ({ id: card.id, name: nameOf(card.name, card.id) }))] : [];
        const card = battleCard(field.category, field.choice);
        return { ...field, key: "mission-" + (field.player || field.category), card,
          previewLabel: card?.detailLabel, selected, options, manual };
      });
    }

    function taskDeckView(match, { player, pending, readOnly }) {
      const rows = PlayMatch.categories.map(category => {
        const picks = pending[category];
        const pile = match.bp?.piles[player]?.[category];
        const current = category === "advantage" ? match.mission.advantage[player] : match.mission[category];
        const cards = Array.from({ length: 3 }, (_, index) => {
          const id = picks[index] || "";
          const card = battleCard(category, id ? { id } : null);
          const inPlay = !!id && current?.player === player && String(current.id) === id;
          const discarded = !!id && !!pile?.discard.some(value => String(value) === id);
          const options = readOnly ? [] : [{ id: "", name: "选择卡牌" }, ...pools[category]
            .filter(source => !picks.includes(String(source.id)) || String(source.id) === id)
            .map(source => ({ id: String(source.id), name: nameOf(source.name, String(source.id)) }))];
          if (card?.missing && !readOnly) options.push({ id, name: id + "（卡库缺失）" });
          return {
            id, category, index, readOnly, options, card, unavailable: inPlay || discarded,
            label: labels[category] + " " + (index + 1), key: "deck-" + category + "-" + index,
            status: inPlay ? "场上" : discarded ? "已弃置" : readOnly && id ? "可抽取" : ""
          };
        });
        return { name: labels[category], cards };
      });
      return {
        playerName: player === "self" ? "己方" : "对手", rows, readOnly,
        complete: rows.every(row => row.cards.every(slot => slot.card && !slot.card.missing))
      };
    }

    function diceView(ui, player, canRoll) {
      const pool = ui.dicePools[player];
      return {
        player, playerName: player === "self" ? "你" : "对手", rollCount: pool.count, canRoll,
        totals: pool.faces ? {
          critical: pool.faces.filter(face => face === "critical").length,
          hit: pool.faces.filter(face => face === "hit").length,
          surge: pool.faces.filter(face => face === "surge").length
        } : null,
        dice: Array.from({ length: 4 }, (_, index) => {
          const face = pool.faces?.[index] || "empty";
          return { face, symbol: { critical: "✹", hit: "✦", surge: "⌁", blank: "·", empty: "" }[face], label: { critical: "暴击", hit: "命中", surge: "激增", blank: "空白", empty: "未掷" }[face] };
        })
      };
    }

    function scoreView(match, ui, scorePlayers, matchTotals, losses) {
      const { blue } = match;
      const red = PlayMatch.other(blue);
      const playerLabel = player => player === blue ? "蓝方" : "红方";
      const describe = event => ({
        ...event,
        playerLabel: playerLabel(event.player), categoryLabel: labels[event.category],
        source: event.cardId ? battleCard(event.category, { id: event.cardId }).name : "",
        phaseLabel: phases[event.phase], signed: event.points > 0 ? "+" + event.points : String(event.points)
      });
      const rounds = PlayMatch.scoreSummary(match);
      const roundOptions = rounds.map(row => ({ id: row.round, name: "第 " + row.round + " 回合" }));
      const scoreRound = ui.scoreRound || "";
      const editingScore = match.scoreEvents.find(event => String(event.id) === ui.scoreEditId && !event.reversed && !event.itemId);
      const result = PlayMatch.matchOutcome(match, losses);
      const winner = result?.winner ? playerLabel(result.winner) : "";
      const resultLabels = {
        target: winner + "达到 12 VP 且领先，赢得对局",
        points: winner + "以胜利分获胜",
        lastArmy: winner + "为唯一仍有未被击败单位的一方",
        pendingTie: "胜利分相同，需要补录缺少的被击败单位总分",
        defeatedPoints: winner + "以较高的击杀分获胜",
        draw: "平局"
      };
      return {
        scoreRound,
        roundFilterOptions: [{ id: "", name: "全部回合" }, ...roundOptions],
        scoreEvents: match.scoreEvents.slice().reverse().filter(event => !scoreRound || String(event.round) === scoreRound).map(event => ({
          ...describe(event),
          canEdit: !event.reversed && !event.itemId,
          revisions: (event.revisions || []).slice().reverse().map(describe),
          canUndo: !event.reversed && Number.isSafeInteger(matchTotals[event.player] - event.points) && matchTotals[event.player] >= event.points
        })),
        roundScores: rounds.map(row => ({
          round: row.round, blue: row.points[blue], red: row.points[red],
          cumulativeBlue: row.cumulative[blue], cumulativeRed: row.cumulative[red]
        })),
        editingScore: editingScore ? {
          ...editingScore, playerOptions: scorePlayers, roundOptions,
          categoryOptions: PlayMatch.scoreCategories.map(id => ({ id, name: labels[id] })),
          phaseOptions: PlayMatch.phases.map(id => ({ id, name: phases[id] }))
        } : null,
        outcome: result ? resultLabels[result.reason] : "",
        canSettleTie: ["pendingTie", "draw", "defeatedPoints"].includes(result?.reason) && Object.values(losses).includes(null),
        casualtyScores: scorePlayers.map(player => ({ ...player, known: losses[player.id] !== null,
          points: losses[player.id] ?? match.result?.defeatedPoints?.[player.id] ?? "" }))
      };
    }

    function view(match, ui) {
      const { stage, round, phase, blue, bp } = match;
      const red = PlayMatch.other(blue);
      const totals = PlayMatch.totals(match);
      const playing = stage === "playing";
      const finished = stage === "finished";
      const manual = !bp && (match.missionMode === "manual" || playing || finished);
      const setupOpen = !!match && ui.page === "setup" && (stage === "setup" || stage === "bp");
      const homeOpen = !match || ui.page === "home";
      const scoreOpen = !!match && !setupOpen && !homeOpen && (playing || finished);
      const wizardStep = Math.min(4, Math.max(1, Number(ui.wizardStep) || 1));
      const rosterOpen = ui.tab !== "match" && scoreOpen;
      const rosters = PlayMatch.players.map(player => rosterView(match, player, ui.selectedToken));
      const roster = rosterOpen ? rosters.find(side => side.player === ui.tab) : null;
      const losses = PlayMatch.defeatedPoints(match, (player, unit) =>
        rosters.find(side => side.player === player).units.find(row => row.id === String(unit.instanceId))?.points);
      const killPoints = player => {
        const enemy = PlayMatch.other(player);
        return losses[enemy] ?? match.result?.defeatedPoints?.[enemy] ?? "—";
      };
      const reminderRows = allReminders(match, roster ? [roster] : rosters)
        .map(row => ({ ...row, playerLabel: playerNames[row.player] }));
      if (roster) {
        roster.killPoints = killPoints(roster.player);
        roster.showUnitKeywords = ui.showUnitKeywords;
        for (const unit of roster.units) unit.showUnitKeywords = ui.showUnitKeywords;
        roster.tokenPanel.tokenSuggestions = tokenSuggestions(match).map(suggestion => ({...suggestion, owner: roster.player}));
        const selected = roster.tokenPanel.selectedToken;
        if (selected) {
          selected.ownerOptions = [match.blue, PlayMatch.other(match.blue)].map(id => ({id, name: sideName(match, id)}));
          selected.externalTargets = rosters.find(side => side.player !== roster.player).units.map(unit => ({
            player: unit.player, unit: unit.id, name: unit.name
          }));
        }
      }
      const trackScores = Array.from({ length: PlayMatch.victoryTarget + 1 }, (_, score) => score);
      trackScores.push(...[...new Set(Object.values(totals).filter(score => score > PlayMatch.victoryTarget))].sort((a, b) => a - b));
      const mission = missionFields(match, manual);
      const missionByCategory = Object.fromEntries(mission.map(field => [field.category + ":" + (field.player || ""), field]));
      const missingDeckPlayer = PlayMatch.hasBattleDeck(match, "opponent", catalog) ? "self" : "opponent";
      const sideLabel = player => player === "self" ? "己方" : "对手";
      const missionsReady = PlayMatch.missionsReady(match);
      const bpTurn = bp && PlayMatch.bpPlayer(match);
      const terrainLayout = (match.setup.terrainLayout || []).map(({id, rotated}, index) => ({
        id, rotated, image: asset("assets/references/terrain_layout_" + id + ".png"),
        label: (index ? "右半场" : "左半场") + " · " + id + " 号" + (rotated ? " · 旋转 180°" : " · 正向")
      }));
      const scorePlayers = [[blue, "blue", "蓝方"], [red, "red", "红方"]].map(([id, color, name]) => {
        const army = match.armies[id];
        const factionId = army && (army.factionId ?? BuilderLibrary.factionOf(army.army.armyId, data));
        return {
          id, color, name, score: totals[id], canSubtract: totals[id] > 0,
          canScore: playing || finished,
          faction: army ? BuilderLibrary.faction(factionId, data).name : "",
          scoreLabel: name + " " + totals[id] + " 分", subtractLabel: name + "减一分", addLabel: name + "加一分"
        };
      });
      const boardPlayers = match.mirrored ? [...scorePlayers].reverse() : scorePlayers;
      const primary = missionByCategory["primary:"];
      const secondary = missionByCategory["secondary:"];
      return {
        stage, round, phase: phases[phase], playing, finished, rosterOpen,
        homeOpen, setupOpen, scoreOpen, wizardStep,
        wizardImportOpen: wizardStep === 1, wizardSidesOpen: wizardStep === 2, wizardBPOpen: wizardStep === 3,
        wizardEffectsOpen: wizardStep === 4,
        wizardFooterOpen: wizardStep < 3 || !!match.initialBlue,
        wizardSteps: ["导入与地形", "确认玩家", "组建任务", "设置效果"].map((label, index) => ({
          value: index + 1, label, key: "wizard-step-" + (index + 1), current: wizardStep === index + 1,
          complete: index + 1 < wizardStep, enabled: true
        })),
        canGoPrevious: wizardStep > 1,
        canGoNext: wizardStep < 3 || missionsReady,
        playerConfirmed: !!match.initialBlue,
        playerColorSelf: match.initialBlue ? match.blue === "self" ? "蓝" : "红" : "",
        playerColorOpponent: match.initialBlue ? match.blue === "opponent" ? "蓝" : "红" : "",
        playerColorSelfValue: match.initialBlue ? match.blue === "self" ? "blue" : "red" : "unconfirmed",
        playerColorOpponentValue: match.initialBlue ? match.blue === "opponent" ? "blue" : "red" : "unconfirmed",
        selfHasBlue: !!match.initialBlue && match.blue === "self",
        selfHasRed: !!match.initialBlue && match.blue === "opponent",
        canChoosePlayerColor: stage === "setup" && !bp,
        canImportOpponent: stage === "setup" && !bp,
        bpBoardOpen: !!bp || match.missionMode === "manual",
        beginBPAvailable: !bp && match.missionMode !== "manual",
        matchOpen: !rosterOpen, selfOpen: rosterOpen && ui.tab === "self", opponentOpen: rosterOpen && ui.tab === "opponent",
        terrainLayout,
        terrainButtonLabel: terrainLayout.length ? "重新生成地形参考" : "生成地形参考",
        opponentName: match.armies.opponent?.name, importError: ui.importError,
        importWarnings: (ui.importWarnings || []).map(message => ({message})),
        bpTurn: bpTurn === "self" ? "我方" : "对方",
        bpTurnColor: bp ? (bpTurn === blue ? "蓝方" : "红方") : "",
        bpSelfActive: !!bp && !bp.complete && bpTurn === "self",
        bpOpponentActive: !!bp && !bp.complete && bpTurn === "opponent",
        bpStarted: !!bp,
        bpComplete: !!bp?.complete,
        bpRevealOpen: !!bp && bp.stepIndex === 0,
        bpActionOpen: !!bp && bp.stepIndex >= 2 && bp.stepIndex < 6,
        bpCurrentSteps: Array.from({ length: 6 }, (_, index) => ({
          value: index + 1, side: bp ? playerNames[PlayMatch.bpPlayer(match, index)] : "",
          active: bp?.stepIndex === index, complete: (bp?.stepIndex ?? 0) > index
        })),
        bpMoves: missionMoves.map(move => ({ ...move, enabled: bp ? PlayMatch.canBPMove(match, move.id) : false })),
        bpHistory: bp?.history.map(entry => ({
          player: playerNames[entry.player],
          playerColor: entry.player === match.blue ? "蓝方" : "红方",
          action: entry.opening ? "揭露" + labels[entry.move] : bpMoves[entry.move] || entry.move,
          revealed: entry.revealed ? battleCard(entry.move === "opponentAdvantage" ? "advantage" : entry.move, { id: entry.revealed }).name : ""
        })) || [],
        mission: {
          primary, secondary,
          selfAdvantage: missionByCategory["advantage:self"], opponentAdvantage: missionByCategory["advantage:opponent"],
          leftAdvantage: missionByCategory["advantage:" + boardPlayers[0].id],
          rightAdvantage: missionByCategory["advantage:" + boardPlayers[1].id]
        },
        mirrored: !!match.mirrored,
        leftMission: match.mirrored ? secondary : primary,
        rightMission: match.mirrored ? primary : secondary,
        missionScoreGroups: scoreOpen ? missionScoringView(match, boardPlayers) : [],
        showBoard: playing || finished,
        boardPhase: playing || finished ? phases[phase] : "赛前准备",
        canRetreat: playing && (round > 1 || phase !== "command"),
        advanceLabel: phase === "end_round" ? "结束本回合" : "下一阶段",
        phaseSteps: phaseSteps[phase].map(text => ({ text })),
        rounds: Array.from({ length: PlayMatch.maxRounds }, (_, index) => {
          const value = match.mirrored ? PlayMatch.maxRounds - index : index + 1;
          return { value, label: "第 " + value + " 回合", key: "round-" + value, current: round === value, complete: round > value, enabled: playing };
        }),
        scorePlayers, leftPlayer: boardPlayers[0], rightPlayer: boardPlayers[1],
        killScores: boardPlayers.map(({id, name, color}) => ({id, name, color, points: killPoints(id)})),
        track: (match.mirrored ? trackScores.reverse() : trackScores).map(score => ({
          score, start: score === 0, blue: score === totals[blue], red: score === totals[red],
          blueLabel: "蓝方 " + score + " 分", redLabel: "红方 " + score + " 分"
        })),
        ...scoreView(match, ui, scorePlayers, totals, losses),
        ...(scoreOpen ? commandView(match, ui, boardPlayers) : {}),
        dicePools: [diceView(ui, "self", stage === "setup"), diceView(ui, "opponent", stage === "setup")],
        currentDeck: ui.deckDialog ? taskDeckView(match, ui.deckDialog) : null,
        deckWarningTitle: !match.armies.opponent && missingDeckPlayer === "opponent" ? "对手军表未导入" :
          sideLabel(missingDeckPlayer) + "军表任务卡不完整",
        supplementButtonLabel: missingDeckPlayer === "self" ? "现场补充己方任务牌组" : "现场补充对手任务牌组",
        supplementPlayer: missingDeckPlayer || "opponent",
        roster,
        showReminders: !!PlayMatch.reminderWindow(match),
        reminders: reminderRows,
        pendingReminderCount: reminderRows.filter(row => row.pending).length,
        activity: activityView(match)
      };
    }

    const catalog = {
      view,
      archiveView(archive, currentId) {
        const format = new Intl.DateTimeFormat("zh-CN", { dateStyle: "short", timeStyle: "short" });
        const status = { import: "待设置", setup: "赛前设置", bp: "组建任务", playing: "进行中", finished: "已结束" };
        return { matches: archive.entries.slice().reverse().map(entry => {
          const { match } = entry;
          const points = PlayMatch.totals(match);
          const score = match.stage === "playing" || match.stage === "finished";
          const time = Date.parse(entry.updatedAt);
          return {
            id: entry.id, current: entry.id === currentId, name: match.armies.self.name || "未命名军表",
            opponent: match.armies.opponent?.name || "对手未导入", status: status[match.stage],
            score: score ? "第 " + match.round + " 回合 · 蓝 " + points[match.blue] + " ∶ " + points[PlayMatch.other(match.blue)] + " 红" : "",
            time: Number.isFinite(time) ? format.format(time) : ""
          };
        }) };
      },
      reminder: (match, id) => allReminders(match, PlayMatch.players.map(player => rosterView(match, player))).find(row => row.id === id),
      unitName(match, player, id) {
        const army = match.armies[player]?.army;
        const instance = army?.units.find(unit => String(unit.instanceId) === id);
        return instance && nameOf(resolveUnit(instance, army, RulesCore.resolveArmyData(army, data))?.name, instance.unitId);
      },
      upgradeName(match, player, unitId, id) {
        const army = match.armies[player]?.army;
        const choice = army?.units.find(unit => String(unit.instanceId) === unitId)?.upgrades.find(upgrade => String(upgrade.instanceId) === id);
        const face = match.upgradeFaces?.[PlayMatch.cardKey(player, id)] || choice?.face;
        return choice && nameOf(UpgradeFaces.view(data.upgrades[choice.upgradeId], face)?.name, choice.upgradeId);
      },
      commandName(match, player, slot) {
        const id = String(match.armies[player]?.army.commandIds[slot]);
        return nameOf(commandCard(match, player, slot)?.name, id);
      },
      commandCard,
      prose: text => RuleIcons.prose(text, data.defs),
      isDualUpgrade: (army, id) => UpgradeFaces.isDual(RulesCore.resolveArmyData(army, data).upgrades[id]),
      hasBattleCard: (category, id) => !!findBattleCard(category, id),
      missionScoring: findBattleCard,
      async importOpponent(input) {
        const now = new Date().toISOString();
        const makeId = () => crypto.randomUUID();
        const value = input.trim();
        if (!value) throw new Error("请提供军表 JSON 或分享链接。");
        let shared;
        if (/^(https?:\/\/|#share\/)/.test(value)) {
          shared = BuilderShare.request(new URL(value, location.href).href);
          if (!shared) throw new Error("链接中没有军表分享数据。");
        }
        const parsed = shared ? await BuilderShare.readRequest(shared) : BuilderTransfer.parse(value);
        const result = BuilderTransfer.detect(parsed) === "tts"
          ? BuilderTransfer.importTTS(parsed, data, makeId, now)
          : BuilderTransfer.readNative(parsed, data, makeId, now);
        if (result.issues.length) {
          throw new Error("请先在写表器中完成卡牌匹配：" + result.issues.map(issue => issue.name || issue.message).join("、"));
        }
        return { record: result.record, warnings: result.warnings };
      }
    };
    return catalog;
  }

  return { load };
})();
