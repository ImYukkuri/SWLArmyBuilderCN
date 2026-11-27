(() => {
  const root = document.querySelector("[data-play]");
  const status = root.querySelector("[role=status]");
  const url = new URL(location.href);
  const rosterId = url.searchParams.get("roster");
  const sessionKey = "swl.play.session:" + rosterId;
  const base = new URL(url.searchParams.get("base") || "./", url);
  const initialView = () => ({
    page: "home", wizardStep: 1, tab: "match", selectedToken: null, scoreRound: "", scoreEditId: "",
    importError: "", importWarnings: [],
    dicePools: { self: { count: 0, faces: null }, opponent: { count: 0, faces: null } },
    deckDialog: null, pendingStartBP: false, commandDialog: null, displayChoice: null, priorityBusy: false
  });
  let ui = initialView();
  const repeatedNodes = new WeakMap();
  let catalog;
  let archive;
  let session;
  let rosterRecord;
  let currentId = url.searchParams.get("match");
  const currentEntry = () => currentId && (session?.id === currentId ? session : PlayStore.entryFor(archive, currentId));

  function expandTemplates(container) {
    for (const placeholder of container.querySelectorAll("template[data-use]")) {
      const fragment = document.getElementById(placeholder.dataset.use).content.cloneNode(true);
      expandTemplates(fragment);
      placeholder.replaceWith(fragment);
    }
  }
  expandTemplates(root);

  function readPath(context, path) {
    if (!path) return undefined;
    return path.split(".").reduce((value, key) => value?.[key], context);
  }

  function bindList(template, context) {
    const { each, key } = template.dataset;
    const previous = repeatedNodes.get(template) || new Map();
    const next = new Map();
    let cursor = template.nextSibling;
    let last = template;
    for (const item of readPath(context, each) || []) {
      const value = readPath(item, key);
      const id = value == null || next.has(value) ? Symbol() : value;
      let nodes = previous.get(id);
      if (!nodes) {
        const fragment = template.content.cloneNode(true);
        expandTemplates(fragment);
        nodes = [...fragment.childNodes];
      }
      previous.delete(id);
      next.set(id, nodes);
      for (const child of nodes) {
        if (child.nodeType === Node.ELEMENT_NODE) bind(child, item);
        if (child === cursor) cursor = cursor.nextSibling;
        else template.parentNode.insertBefore(child, cursor);
        last = child;
      }
    }
    for (const nodes of previous.values()) for (const child of nodes) child.remove();
    repeatedNodes.set(template, next);
    return last;
  }

  function bind(node, context) {
    const data = node.dataset;
    if (data.text) {
      const value = String(readPath(context, data.text) ?? "");
      if (node.textContent !== value) node.textContent = value;
    }
    if (data.prose) node.replaceChildren(catalog.prose(readPath(context, data.prose)));
    if (data.show) node.hidden = !readPath(context, data.show);
    if (data.hide) node.hidden = !!readPath(context, data.hide);
    if (data.enable) node.disabled = !readPath(context, data.enable);
    if (data.src) {
      const src = readPath(context, data.src);
      if (src && node.getAttribute("src") !== src) node.src = src;
      if (!src) node.removeAttribute("src");
    }
    if (data.attr) {
      for (const pair of data.attr.split(" ")) {
        const [attr, path] = pair.split("=");
        const value = readPath(context, path);
        if (value == null || value === false) node.removeAttribute(attr);
        else node.setAttribute(attr, value);
      }
    }
    if (data.args) node.playArgs = Object.fromEntries(data.args.split(" ").map(pair => {
      const [key, path] = pair.split("=");
      return [key, readPath(context, path)];
    }));
    if (data.with) context = readPath(context, data.with) || {};
    for (let child = node.firstElementChild; child; child = child.nextElementSibling) {
      if (child.matches("template[data-each]")) {
        child = bindList(child, context);
      } else if (child.tagName !== "TEMPLATE" && !child.hasAttribute("data-detail-dialog")) {
        bind(child, context);
      }
    }
    if (data.model) {
      const value = String(readPath(context, data.model) ?? "");
      if (node.value !== value) node.value = value;
    }
  }

  function render() {
    BuilderOverlays.preserveScroll(renderView, [...root.querySelectorAll("dialog[open]")]);
  }

  function renderView() {
    const before = document.activeElement;
    const focusKey = before?.getAttribute("data-focus-key");
    const match = currentEntry()?.match;
    const pageView = match ? catalog.view(match, ui) : { rosterName: "游玩系统", homeOpen: true };
    bind(root, {
      ...pageView,
      ...catalog.archiveView(archive, currentId),
      rosterName: match?.armies.self.name || rosterRecord?.name || "游玩系统",
      hasMatch: !!match
    });
    root.querySelector("[data-loaded]").hidden = false;
    if (focusKey && !before.isConnected) {
      const candidates = root.querySelectorAll('[data-focus-key="' + CSS.escape(focusKey) + '"]');
      [...candidates].find(element => !element.closest("[hidden]"))?.focus({ preventScroll: true });
    }
  }

  function showUnitCardDetails(dialog, target, detail) {
    const {printed, resolved, equipped, rank, points} = detail;
    const {node, named, originLabel} = UnitCardView;
    const openSubdialog = (anchor, build) => {
      const subdialog = node("dialog", "unit-card-subdialog");
      subdialog.append(build(() => subdialog.close()));
      dialog.append(subdialog);
      subdialog.addEventListener("close", () => {
        subdialog.remove();
        BuilderOverlays.focus(anchor);
      }, {once: true});
      subdialog.showModal();
    };
    const view = UnitCardView.create({
      getData: () => resolved,
      openRule(rule, anchor) {
        openSubdialog(anchor, close => {
          const popover = node("div", "keyword-popover");
          view.renderRulePopover(popover, rule, close);
          for (const card of rule.origins || []) {
            const source = node("div", "popover-source");
            source.append(node("h4", null, "来自 " + originLabel(card)), upgrade(card));
            popover.append(source);
          }
          return popover;
        });
      }
    });
    const upgrade = (card, compact = false) => {
      const path = card.assets?.front || card.image;
      const art = compact && path ? node("button", "upgrade-art") : null;
      if (art) {
        const image = node("img");
        image.src = new URL(path, base).href;
        image.alt = named(card.name);
        image.loading = "lazy";
        art.append(image);
        art.setAttribute("aria-label", "查看" + image.alt + "卡图");
        art.onclick = () => openSubdialog(art, close => {
          const figure = node("div", "detail-image");
          const header = node("div", "popover-heading");
          const button = node("button", null, "关闭");
          button.onclick = close;
          header.append(node("h3", null, image.alt), button);
          figure.append(header, image.cloneNode());
          return figure;
        });
      }
      return view.upgradeEntry(card, {forceOpen: true, compact, art, showWeapons(anchor) {
        openSubdialog(anchor, close => {
          const content = node("div");
          const header = node("div", "popover-heading");
          const button = node("button", null, "关闭");
          button.onclick = close;
          header.append(node("h3", null, named(card.name) + " · 武器"), button);
          content.append(header, view.unitWeaponGroups(null, [{card}], {forceOpen: true}));
          return content;
        });
      }});
    };
    if (!equipped) {
      target.append(upgrade(printed));
      return;
    }
    const card = node("article", "roster-unit");
    const contents = view.unitContents(printed, equipped, {forceOpen: true});
    if (equipped.length) {
      const upgrades = node("div", "selected-upgrades");
      upgrades.append(node("h4", "compact-section-title", "升级卡"));
      for (const {card: selected} of equipped) upgrades.append(upgrade(selected, true));
      contents.append(upgrades);
    }
    card.append(view.unitHeader(printed, {rank, points, detail: true, showModels: true}), contents);
    target.append(card);
  }

  function savePageRoute() {
    const nextURL = new URL(location.href);
    if (currentId) nextURL.searchParams.set("match", currentId);
    else nextURL.searchParams.delete("match");
    if (ui.page === "home") nextURL.searchParams.delete("view");
    else nextURL.searchParams.set("view", ui.page);
    if (ui.page === "setup") nextURL.searchParams.set("step", String(ui.wizardStep));
    else nextURL.searchParams.delete("step");
    history.replaceState(null, "", nextURL);
  }

  function selectMatch(entry, page = "") {
    currentId = entry?.id || null;
    const back = new URL("index.html", url);
    const snapshot = entry?.match.armies.self;
    back.hash = snapshot ? BuilderShare.rosterRoute({ ...snapshot, id: rosterId }) : "#army/" + encodeURIComponent(rosterId);
    if (url.searchParams.has("base")) back.searchParams.set("base", url.searchParams.get("base"));
    root.querySelector("[data-back]").href = back.href;
    ui = initialView();
    if (entry) {
      const requestedPage = page || url.searchParams.get("view");
      const stage = entry.match.stage;
      if (requestedPage === "setup" && ["setup", "bp"].includes(stage)) ui.page = "setup";
      if (requestedPage === "score" && ["playing", "finished"].includes(stage)) ui.page = "score";
      const requestedStep = Number(url.searchParams.get("step"));
      ui.wizardStep = Number.isInteger(requestedStep) && requestedStep >= 1 && requestedStep <= 3
        ? requestedStep : entry.match.bp ? 3 : 1;
    }
    savePageRoute();
  }

  function setSession(entry) {
    sessionStorage.setItem(sessionKey, JSON.stringify(entry));
    session = entry;
  }

  async function commit(action, matchId) {
    const entry = currentEntry();
    if (!entry || entry.id !== matchId) throw new Error("这个对局已不存在。");
    setSession({ ...entry, match: PlayMatch.update(entry.match, action, catalog) });
  }

  function openTaskDeck(player) {
    const match = currentEntry()?.match;
    if (!match || !PlayMatch.players.includes(player)) throw new Error("找不到任务牌组。");
    const pending = Object.fromEntries(PlayMatch.categories.map(category => [
      category, PlayMatch.taskDeck(match, player, category).map(String)
    ]));
    ui.deckDialog = { player, pending, readOnly: !!match.bp };
    render();
    root.querySelector("[data-deck-dialog]").showModal();
  }

  async function startMissionBuilding(matchId) {
    const match = matchId === currentId && currentEntry()?.match;
    if (!match?.initialBlue) throw new Error("先确认玩家");
    if (PlayMatch.hasBattleDecks(match, catalog)) {
      await commit({ type: "startBP" }, matchId);
      ui.wizardStep = 3;
      savePageRoute();
      ui.pendingStartBP = false;
    } else {
      ui.pendingStartBP = true;
      render();
      root.querySelector("[data-deck-warning]").showModal();
    }
  }

  function downloadMatch(entry) {
    const link = document.createElement("a");
    const href = URL.createObjectURL(new Blob([PlayStore.exportJSON(entry)], { type: "application/json" }));
    link.href = href;
    link.download = "legion-match-" + (entry.updatedAt?.slice(0, 10) || "legacy") + "-" + entry.id + ".json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
  }

  async function manageArchive(type, args) {
    if (type === "restoreMatch") {
      if (!args.file?.size) throw new Error("请选择对局备份文件。");
      const contents = await args.file.text();
      const restored = await PlayStore.lock(rosterId, () => PlayStore.restore(localStorage, rosterId, contents));
      const stage = restored.match.stage;
      const page = ["playing", "finished"].includes(stage) ? "score" : ["setup", "bp"].includes(stage) ? "setup" : "home";
      selectMatch(restored, page);
      return "已恢复对局。";
    }
    if (type === "startSetup" || type === "startPlay") {
      const record = rosterRecord || currentEntry()?.match.armies.self;
      if (!record) throw new Error("请从写表器打开一份军表。");
      const createdAt = new Date().toISOString();
      const match = PlayMatch.create({ ...record, id: rosterId, army: BuilderLibrary.normalize(record.army) });
      const action = type === "startSetup" ? { type: "beginSetup" } : { type: "skipSetup" };
      const entry = { id: crypto.randomUUID(), createdAt, updatedAt: createdAt, match: PlayMatch.update(match, action, catalog) };
      setSession(entry);
      selectMatch(entry, type === "startSetup" ? "setup" : "score");
      return "";
    }
    if (type === "newMatch") {
      rosterRecord ||= currentEntry()?.match.armies.self;
      selectMatch(null);
      return "";
    }
    const id = args.id || currentId;
    const entry = id && PlayStore.entryFor(PlayStore.read(localStorage, rosterId), id);
    if (!entry) throw new Error("这个对局已不存在。");
    if (type === "exportMatch") downloadMatch(entry);
    if (type === "deleteMatch" && window.confirm("删除「" + entry.match.armies.self.name + "」的这场对局？")) {
      await PlayStore.lock(rosterId, () => PlayStore.remove(localStorage, rosterId, id));
      if (session?.id === id) {
        const createdAt = new Date().toISOString();
        setSession({ ...session, id: crypto.randomUUID(), createdAt, updatedAt: createdAt });
        if (id === currentId) {
          currentId = session.id;
          savePageRoute();
        }
      } else if (id === currentId) selectMatch(null);
      return "已删除对局。";
    }
    return "";
  }

  async function saveMatch(end) {
    const entry = currentEntry();
    if (!entry || !["playing", "finished"].includes(entry.match.stage)) throw new Error("请先进入对局。");
    if (end && !window.confirm("结束游戏并存档？")) return "";
    await PlayStore.lock(rosterId, () => {
      const latest = currentEntry();
      if (latest?.id !== entry.id) throw new Error("当前对局已切换。");
      const match = end && latest.match.stage !== "finished"
        ? PlayMatch.update(latest.match, { type: "endGame" }, catalog) : latest.match;
      const saved = { ...latest, match };
      PlayStore.saveSession(localStorage, saved);
      setSession(saved);
      archive = PlayStore.read(localStorage, rosterId);
    });
    return end ? "游戏已结束并存档。" : "对局已存档。";
  }

  async function rollPriority(element, pair, matchId) {
    if (ui.priorityBusy) return;
    const view = ui;
    view.priorityBusy = true;
    render();
    const label = element.querySelector("[data-priority-label]");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let blue = Math.random() < .5;
    const interval = reducedMotion ? null : setInterval(() => {
      blue = !blue;
      label.textContent = blue ? "蓝色玩家" : "红色玩家";
    }, 85);
    try {
      await new Promise(resolve => setTimeout(resolve, 1000));
      if (view === ui && matchId === currentId && PlayMatch.commandPair(currentEntry().match) === pair) {
        await commit({ type: "rollPriority", pair }, matchId);
      }
    } finally {
      clearInterval(interval);
      view.priorityBusy = false;
    }
  }

  async function act(element, fields = {}) {
    const type = element.dataset.action;
    const args = { ...element.dataset, ...element.playArgs, ...fields, type };
    const matchId = currentId;
    let message = "";
    let importWarnings = [];
    try {
      if (["newMatch", "restoreMatch", "exportMatch", "deleteMatch", "startSetup", "startPlay"].includes(type)) {
        message = await manageArchive(type, args);
        archive = PlayStore.read(localStorage, rosterId);
      } else if (type === "saveMatch" || type === "endGame") {
        message = await saveMatch(type === "endGame");
      } else if (type === "commandPicker" || type === "discardList") {
        if (type === "commandPicker") ui.commandDialog = { player: args.player, purpose: args.purpose };
        render();
        root.querySelector(type === "commandPicker" ? "[data-command-picker]" : "[data-discard-dialog]").showModal();
        return;
      } else if (type === "chooseCommand") {
        if (args.purpose === "display") {
          ui.displayChoice = { player: args.player, id: args.id };
          root.querySelector("[data-display-confirm]").showModal();
          return;
        }
        await commit({ ...args, type: "placeCommand" }, matchId);
        root.querySelector("[data-command-picker]").close();
      } else if (type === "confirmDisplay") {
        if (!ui.displayChoice) return;
        await commit({ ...ui.displayChoice, type: "displayCommand", permanent: args.value === "yes" }, matchId);
        root.querySelector("[data-display-confirm]").close();
        root.querySelector("[data-command-picker]").close();
      } else if (type === "rollPriority") {
        await rollPriority(element, args.pair, matchId);
      } else if (type === "wizardStep") {
        ui.wizardStep = Number(args.value);
        savePageRoute();
      } else if (type === "wizardPrevious") {
        ui.wizardStep = Math.max(1, ui.wizardStep - 1);
        savePageRoute();
      } else if (type === "wizardNext") {
        if (ui.wizardStep < 3) {
          ui.wizardStep++;
          savePageRoute();
        }
        else {
          if (!currentEntry()?.match.initialBlue) throw new Error("先确认玩家");
          await commit({ type: "finishSetup" }, currentId);
          ui.page = "score";
          ui.tab = "match";
          savePageRoute();
        }
      } else if (type === "returnHome") {
        ui.page = "home";
        savePageRoute();
      } else if (type === "rollDice") {
        const pool = ui.dicePools[args.player];
        if (!pool) throw new Error("无法识别这组骰子。");
        const faces = ["critical", "hit", "hit", "hit", "surge", "blank", "blank", "blank"];
        pool.faces = Array.from({ length: 4 }, () => faces[Math.floor(Math.random() * faces.length)]);
        pool.count++;
      } else if (type === "beginMissionBuilding") {
        await startMissionBuilding(matchId);
      } else if (type === "manualMissions") {
        await commit({ type: "manualMissions" }, currentId);
        ui.pendingStartBP = false;
        root.querySelector("[data-deck-warning]").close();
      } else if (type === "supplementDeck") {
        root.querySelector("[data-deck-warning]").close();
        openTaskDeck(args.player);
        return;
      } else if (type === "confirmDeckOpen") {
        ui.pendingDeckPlayer = args.player;
        render();
        root.querySelector("[data-confirm-deck]").showModal();
        return;
      } else if (type === "openConfirmedDeck") {
        const player = ui.pendingDeckPlayer;
        root.querySelector("[data-confirm-deck]").close();
        openTaskDeck(player);
        return;
      } else if (type === "cancelDeckConfirm") {
        ui.pendingDeckPlayer = "";
        root.querySelector("[data-confirm-deck]").close();
      } else if (type === "reimportOpponent") {
        ui.wizardStep = 1;
        savePageRoute();
        root.querySelector("[data-deck-warning]").close();
        window.setTimeout(() => root.querySelector("#setup-opponent-import")?.scrollIntoView({ block: "center", behavior: "smooth" }), 0);
      } else if (type === "openDeck") {
        openTaskDeck(args.player);
        return;
      } else if (type === "closeDeck") {
        ui.deckDialog = null;
        root.querySelector("[data-deck-dialog]").close();
      } else if (type === "setDeckSlot") {
        const picks = ui.deckDialog?.pending[args.category];
        if (!picks || ui.deckDialog.readOnly) throw new Error("当前无法编辑任务牌组。");
        picks[args.index] = args.value;
      } else if (type === "saveDeck") {
        const deck = ui.deckDialog?.pending;
        const player = ui.deckDialog?.player;
        if (!deck || ui.deckDialog.readOnly) throw new Error("当前无法保存任务牌组。");
        await commit({ type: "setTaskDecks", player, decks: deck }, matchId);
        ui.deckDialog = null;
        root.querySelector("[data-deck-dialog]").close();
        if (ui.pendingStartBP) await startMissionBuilding(matchId);
      } else if (type === "tab") {
        ui.tab = args.value;
      } else if (type === "setView") {
        if (!Object.hasOwn(ui, args.field)) return;
        ui[args.field] = String(args.value ?? "");
      } else if (type === "selectToken") {
        const id = String(args.id);
        ui.selectedToken = ui.selectedToken === id ? null : id;
      } else if (type === "detail") {
        if (!args.card) return;
        const dialog = root.querySelector("[data-detail-dialog]");
        const pages = (args.card.pages || [args.card]).map(card => ({
          ...card, plainRules: !card.sharedDetail && !card.isCommand ? card.rules : ""
        }));
        bind(dialog, { ...args.card, pages });
        dialog.querySelectorAll("[data-unit-detail]").forEach((target, index) => {
          const detail = pages[index].sharedDetail;
          if (detail) showUnitCardDetails(dialog, target, detail);
        });
        dialog.showModal();
        return;
      } else {
        if (type === "opponent") {
          ui.importError = "";
          const input = args.file?.size ? await args.file.text() : args.input || "";
          const imported = await catalog.importOpponent(input);
          args.record = imported.record;
          importWarnings = imported.warnings;
        }
        if (type === "assignToken") {
          args.id ||= ui.selectedToken;
          if (!args.id) return;
        }
        await commit(args, matchId);
        if (type === "opponent") ui.importWarnings = importWarnings;
        if (type === "opponent" && ui.pendingStartBP) {
          ui.wizardStep = 3;
          savePageRoute();
          await startMissionBuilding(matchId);
        }
        if (currentId === matchId) {
          if (["assignToken", "removeToken"].includes(type)) ui.selectedToken = null;
          if (type === "amendScore") ui.scoreEditId = "";
        }
      }
      render();
      status.textContent = message;
      return true;
    } catch (error) {
      if (type === "opponent" && currentId === matchId) {
        ui.importError = error.message;
        status.textContent = "";
        render();
      } else status.textContent = error.message;
    }
  }

  function connect() {
    root.querySelector("[data-display-confirm]").addEventListener("close", () => { ui.displayChoice = null; });
    root.querySelector("[data-deck-dialog]").addEventListener("close", event => {
      if (!event.currentTarget.open) ui.deckDialog = null;
    });
    root.addEventListener("click", event => {
      const button = event.target.closest("button[data-action]");
      if (button && !(button.form && button.type === "submit") && !button.disabled) void act(button);
    });
    root.addEventListener("submit", async event => {
      if (!event.target.matches("form[data-action]")) return;
      event.preventDefault();
      const form = event.target;
      const fields = Object.fromEntries(new FormData(form, event.submitter));
      if (await act(form, fields) && form.hasAttribute("data-clear")) form.reset();
    });
    root.addEventListener("change", event => {
      if (event.target.matches("select[data-action]")) void act(event.target, { value: event.target.value, id: event.target.value });
    });
    root.addEventListener("dragstart", event => {
      const token = event.target.closest("[data-drag-token]");
      if (!token) return;
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("application/x-swl-token", token.getAttribute("data-drag-token"));
    });
    const dropTarget = event => event.target.closest("[data-token-drop]");
    root.addEventListener("dragover", event => {
      if (dropTarget(event) && event.dataTransfer.types.includes("application/x-swl-token")) event.preventDefault();
    });
    root.addEventListener("drop", event => {
      const target = dropTarget(event);
      const id = event.dataTransfer.getData("application/x-swl-token");
      if (!target || !id) return;
      event.preventDefault();
      void act(target, { id });
    });
    window.addEventListener("storage", event => {
      if (event.storageArea !== localStorage || event.key !== PlayStore.storageKey(rosterId)) return;
      try {
        archive = PlayStore.read(localStorage, rosterId);
        if (currentId && !currentEntry()) {
          selectMatch(null);
          status.textContent = "当前对局已在另一个窗口删除。";
        }
        render();
      } catch (error) {
        status.textContent = error.message;
      }
    });
  }

  async function boot() {
    try {
      if (!rosterId) throw new Error("请从写表器中的军表进入对局。");
      rosterRecord = BuilderLibrary.read(localStorage).records.find(record => record.id === rosterId);
      archive = PlayStore.read(localStorage, rosterId);
      session = JSON.parse(sessionStorage.getItem(sessionKey) || "null");
      if (session?.match?.rosterId !== rosterId) session = null;
      const entry = currentEntry();
      const missingEntry = currentId && !entry;
      selectMatch(entry);
      catalog = await PlayData.load(base);
      render();
      connect();
      status.textContent = missingEntry ? "找不到该对局，可从历史记录选择其他对局。" : "";
    } catch (error) {
      status.textContent = error.message;
    }
  }
  void boot();
})();
