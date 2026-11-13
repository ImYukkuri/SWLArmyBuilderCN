/* Faction selection, saved rosters and navigation around the shared editor. */
let collection = { version: 1, records: [] },
  activeRecord = null,
  lastSavedRoster = "",
  deletedRecord = null;
const rosterFingerprint = (record) => JSON.stringify([record.name, record.factionId, record.army]);

function initializeLibrary() {
  try {
    collection = BuilderLibrary.migrate(localStorage, data, uid, new Date().toISOString());
    setStatus("");
  } catch (error) {
    setStatus("已保存军表读取失败：" + error.message + " 原有记录未被覆盖。", true);
    try {
      collection = BuilderLibrary.read(localStorage);
    } catch (_) {}
  }
  renderFactionChoices();
  navigateLibrary();
}

function renderFactionChoices() {
  const list = $("#faction-choices");
  list.replaceChildren();
  const representatives = {
    1: "Luke Skywalker",
    2: "Darth Vader",
    4: "Anakin Skywalker",
    5: "General Grievous",
    8: "Din Djarin",
    9: "Maul",
  };
  for (const faction of BuilderLibrary.FACTIONS) {
    const button = node("button", "faction-choice");
    button.dataset.faction = faction.id;
    button.style.setProperty("--faction-color", faction.color);
    button.setAttribute("aria-label", "新建" + faction.name + "军表");
    const available = Object.values(data.units).filter(
      (u) => !u.isCounterpart && u.usage !== "counterpart" && rankOf(u, faction.id) != null,
    );
    const representative =
      available.find((u) => u.name?.en === representatives[faction.id]) ||
      available.find((u) => isUnique(u)) ||
      available[0];
    if (representative?.assets?.portrait) {
      const image = node("img", "faction-portrait");
      image.src = assetPath(representative.assets.portrait);
      image.alt = "";
      image.loading = "lazy";
      button.append(image);
    }
    const text = node("span", "faction-choice-text");
    text.append(node("strong", null, faction.name), node("span", null, faction.en));
    button.append(text, node("span", "faction-create", "＋ 新建军表"));
    button.onclick = () => createRoster(faction.id);
    list.append(button);
  }
}

function createRoster(factionId) {
  const name = BuilderLibrary.faction(factionId, data).name + "军表";
  const record = BuilderLibrary.create(factionId, name, data, uid, new Date().toISOString());
  openRoster(record);
}

function openRoster(record) {
  activeRecord = structuredClone(record);
  army = BuilderLibrary.normalize(record.army);
  activeRecord.army = army;
  lastSavedRoster = collection.records.some(
    (r) => r.id === record.id && rosterFingerprint(r) === rosterFingerprint(activeRecord),
  )
    ? rosterFingerprint(activeRecord)
    : "";
  browser = null;
  cardView.expanded.clear();
  cardView.tags.clear();
  cardView.commandCollapsed.clear();
  cardView.applyAll = false;
  cardView.explanations = false;
  $("#open-explanations").checked = false;
  $("#library-page").hidden = true;
  $("#editor-page").hidden = false;
  $("#save-state").textContent = "已保存";
  $("#save-state").classList.remove("error");
  history.replaceState(null, "", "#army/" + encodeURIComponent(record.id));
  setStatus("");
  render();
  window.scrollTo(0, 0);
  // Only the roster content is saved; opening a candidate panel is view state.
  $("#rank-bar").querySelector("button")?.focus({ preventScroll: true });
}

function saveActiveRoster() {
  if (!activeRecord || !army) return true;
  activeRecord.name =
    activeRecord.name.trim() || BuilderLibrary.faction(activeRecord.factionId, data).name + "军表";
  activeRecord.army = army;
  const signature = rosterFingerprint(activeRecord);
  if (signature === lastSavedRoster) return true;
  const candidate = { ...activeRecord, updatedAt: new Date().toISOString() };
  try {
    collection = BuilderLibrary.writeRecord(localStorage, candidate);
    activeRecord = candidate;
    lastSavedRoster = signature;
    $("#save-state").textContent = "已保存";
    $("#save-state").classList.remove("error");
    return true;
  } catch (error) {
    $("#save-state").textContent = "保存失败";
    $("#save-state").classList.add("error");
    setStatus("军表未能保存到浏览器：" + error.message + "。当前修改仍保留在编辑器中。", true);
    return false;
  }
}

function closeEditorPanels() {
  browser = null;
  hideRule(false);
  renderBrowser();
  for (const dialog of document.querySelectorAll("dialog[open]")) dialog.close();
}

function showLibrary() {
  if (activeRecord && !$("#points-limit").reportValidity()) return;
  if (activeRecord && !saveActiveRoster()) {
    history.replaceState(null, "", "#army/" + encodeURIComponent(activeRecord.id));
    return;
  }
  closeEditorPanels();
  activeRecord = null;
  army = null;
  lastSavedRoster = "";
  $("#editor-page").hidden = true;
  $("#library-page").hidden = false;
  history.replaceState(null, "", "#home");
  document.documentElement.style.removeProperty("--faction");
  try {
    collection = BuilderLibrary.read(localStorage);
  } catch (error) {
    setStatus("军表列表读取失败：" + error.message, true);
  }
  renderSavedRosters();
  window.scrollTo(0, 0);
}

function navigateLibrary() {
  if (!data) return;
  const id = location.hash.startsWith("#army/") ? decodeURIComponent(location.hash.slice(6)) : null;
  if (id) {
    const record = collection.records.find((r) => r.id === id);
    if (record) {
      openRoster(record);
      return;
    }
  }
  showLibrary();
}

function renderSavedRosters() {
  const list = $("#saved-rosters");
  list.replaceChildren();
  $("#saved-count").textContent = String(collection.records.length);
  const search = $("#saved-search").value.trim().toLocaleLowerCase();
  const records = [...collection.records].sort((a, b) =>
    String(b.updatedAt).localeCompare(String(a.updatedAt)),
  );
  for (const record of records) {
    const faction = BuilderLibrary.faction(record.factionId, data);
    if (
      search &&
      ![record.name, faction.name, faction.en].join(" ").toLocaleLowerCase().includes(search)
    )
      continue;
    const article = node("article", "saved-roster");
    article.dataset.id = record.id;
    article.style.setProperty("--faction-color", faction.color);
    const open = node("button", "saved-roster-main");
    open.setAttribute("aria-label", "打开军表 " + record.name);
    const title = node("span", "saved-roster-title");
    title.append(node("b", null, record.name), node("span", null, faction.name));
    const bf =
      record.army.armyId === record.factionId
        ? "无战斗部队"
        : named(data.defs.armies.find((a) => a.id === record.army.armyId)?.name) || "原军队配置";
    const date = new Date(record.updatedAt);
    const stamp = Number.isNaN(date.getTime())
      ? ""
      : date.toLocaleString("zh-CN", {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        });
    title.append(node("small", null, bf + (stamp ? " · " + stamp : "")));
    const numbers = node("span", "saved-roster-numbers");
    const total = RulesCore.validateArmy(record.army, data).basePoints;
    const points = node("span", "saved-points");
    points.append(
      node("b", null, total),
      node("small", null, " / " + record.army.pointsLimit + " 分"),
    );
    numbers.append(points, node("span", null, record.army.units.length + " 个单位"));
    open.append(title, numbers);
    open.onclick = () => openRoster(record);
    const actions = node("div", "saved-roster-actions"),
      copy = node("button", null, "复制"),
      remove = node("button", null, "删除");
    copy.setAttribute("aria-label", "复制军表 " + record.name);
    remove.setAttribute("aria-label", "删除军表 " + record.name);
    copy.onclick = () => {
      const duplicate = BuilderLibrary.copy(record, uid, new Date().toISOString());
      try {
        collection = BuilderLibrary.writeRecord(localStorage, duplicate);
        renderSavedRosters();
        setStatus("已复制军表 " + record.name);
      } catch (error) {
        setStatus("复制未保存：" + error.message, true);
      }
    };
    remove.onclick = () => {
      try {
        collection = BuilderLibrary.removeRecord(localStorage, record.id);
        deletedRecord = record;
        showUndo(record.name);
        renderSavedRosters();
      } catch (error) {
        setStatus("删除失败：" + error.message, true);
      }
    };
    actions.append(copy, remove);
    article.append(open, actions);
    list.append(article);
  }
  if (!list.children.length) {
    const empty = node("div", "saved-empty");
    empty.append(
      node("h3", null, search ? "没有匹配的军表" : "还没有保存的军表"),
      node(
        "p",
        null,
        search ? "试试军表名称或势力名称。" : "从上方选择一个势力开始，编辑过程中会自动保存。",
      ),
    );
    list.append(empty);
  }
}

function showUndo(name) {
  const notice = $("#library-notice");
  notice.hidden = false;
  notice.replaceChildren(node("span", null, "已删除 " + name));
  const undo = node("button", null, "撤销删除");
  undo.onclick = () => {
    if (!deletedRecord) return;
    try {
      collection = BuilderLibrary.writeRecord(localStorage, deletedRecord);
      deletedRecord = null;
      notice.hidden = true;
      renderSavedRosters();
    } catch (error) {
      setStatus("恢复失败：" + error.message, true);
    }
  };
  notice.append(undo);
}

function wireLibrary() {
  $("#back-library").onclick = showLibrary;
  $("#saved-search").oninput = renderSavedRosters;
  $("#roster-name").oninput = () => {
    if (!activeRecord) return;
    activeRecord.name = $("#roster-name").value;
    $("#save-state").textContent = "名称待保存";
  };
  $("#roster-name").onchange = () => {
    saveActiveRoster();
    if (activeRecord) $("#roster-name").value = activeRecord.name;
  };
  $("#save-roster").onclick = () => {
    if (!$("#points-limit").reportValidity()) return;
    if (saveActiveRoster()) setStatus("军表已保存，可从“势力与军表”继续编辑。");
  };
  $(".brand").onclick = (event) => {
    event.preventDefault();
    if (data) showLibrary();
  };
  window.addEventListener("hashchange", navigateLibrary);
  window.addEventListener("beforeunload", (event) => {
    if (
      activeRecord &&
      rosterFingerprint({ ...activeRecord, army }) !== lastSavedRoster &&
      !saveActiveRoster()
    ) {
      event.preventDefault();
      event.returnValue = "";
    }
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && activeRecord) saveActiveRoster();
  });
}
wireEditor();
wireLibrary();
load();
