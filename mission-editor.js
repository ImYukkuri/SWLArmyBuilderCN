(() => {
  const category = document.querySelector("#mission-category");
  const picker = document.querySelector("#mission-card");
  const form = document.querySelector("#mission-form");
  const feedback = document.querySelector("#mission-feedback");
  const lists = {
    scoreItems: document.querySelector("#mission-scores"),
    tokens: document.querySelector("#mission-tokens")
  };
  let catalog, revision, draft, activeCategory, activeId, dirty = false;
  let editable = true;

  function field(text, {type, value}, onChange) {
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = type;
    if (type === "checkbox") input.checked = value;
    else {
      label.className = "mission-editor-field";
      input.required = true;
      input.value = value;
      if (type === "number") {
        input.min = 1;
        input.max = text === "个数" ? 1000 : 1000000;
        input.step = 1;
      }
    }
    input.oninput = () => {
      onChange(type === "checkbox" ? input.checked : type === "number" ? input.valueAsNumber : input.value);
      dirty = true;
      feedback.textContent = "有未保存的修改";
    };
    label.append(text, input);
    return label;
  }

  function renderRows() {
    for (const [key, host] of Object.entries(lists)) {
      const isScore = key === "scoreItems";
      host.replaceChildren(...draft[key].map((entry, index) => {
        const row = document.createElement("div");
        row.className = "mission-editor-row";
        row.append(field("名称", {type: "text", value: entry.name}, value => { entry.name = value; }));
        const number = isScore ? "points" : "quantity";
        row.append(field(isScore ? "分值" : "个数", {type: "number", value: entry[number]}, value => { entry[number] = value; }));
        if (isScore) {
          const flags = document.createElement("div");
          flags.className = "mission-editor-flags";
          for (const [flag, label] of [["repeatable", "可重复"], ["globalOnce", "全局不重复"], ["poi", "POI"]]) {
            flags.append(field(label, {type: "checkbox", value: entry[flag]}, value => { entry[flag] = value; }));
          }
          row.append(flags);
        }
        const remove = document.createElement("button");
        remove.type = "button";
        remove.textContent = "移除";
        remove.onclick = () => {
          draft[key].splice(index, 1);
          dirty = true;
          feedback.textContent = "有未保存的修改";
          renderRows();
        };
        row.append(remove);
        return row;
      }));
    }
  }

  function selectCard(nextCategory, id) {
    if (dirty && !window.confirm("放弃这张卡尚未保存的修改？")) {
      category.value = activeCategory;
      picker.value = activeId;
      return;
    }
    activeCategory = nextCategory;
    const cards = catalog[nextCategory] || [];
    picker.replaceChildren(...cards.map(card => new Option(
      (card.name.zh || card.name.en) + " · " + (card.modes || []).join("/") + " · " + card.id, card.id
    )));
    const card = cards.find(card => card.id === id) || cards[0];
    activeId = card.id;
    category.value = activeCategory;
    picker.value = activeId;
    draft = {scoreItems: structuredClone(card.scoreItems || []), tokens: structuredClone(card.tokens || [])};
    dirty = false;
    feedback.textContent = editable ? "" : "通过本地 Python 服务保存修改。";
    renderRows();
  }

  form.querySelectorAll("[data-add]").forEach(button => {
    button.onclick = () => {
      const key = button.dataset.add;
      draft[key].push(key === "scoreItems"
        ? {id: crypto.randomUUID(), name: "", points: 1, repeatable: true, globalOnce: false, poi: false}
        : {name: "", quantity: 1});
      dirty = true;
      feedback.textContent = "有未保存的修改";
      renderRows();
      lists[key].lastElementChild.querySelector("input").focus();
    };
  });
  category.onchange = () => selectCard(category.value);
  picker.onchange = () => selectCard(category.value, picker.value);
  window.addEventListener("beforeunload", event => {
    if (dirty) event.preventDefault();
  });
  form.onsubmit = async event => {
    event.preventDefault();
    const controls = [...form.elements, category, picker];
    controls.forEach(control => { control.disabled = true; });
    try {
      const response = await fetch("api/missions/save", {method: "POST", headers: {"Content-Type": "application/json"},
        body: JSON.stringify({revision, category: activeCategory, id: activeId, ...draft})});
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      ({catalog, revision} = result);
      dirty = false;
      feedback.textContent = "已保存任务配置。";
    } catch (error) {
      feedback.textContent = error.message;
    } finally {
      controls.forEach(control => { control.disabled = false; });
    }
  };

  async function load() {
    try {
      const response = await fetch("api/missions");
      if (response.ok) ({catalog, revision} = await response.json());
      else {
        editable = false;
        const file = await fetch("data/battle-deck.json");
        if (!file.ok) throw new Error("无法载入任务卡资料。");
        catalog = await file.json();
      }
      selectCard(category.value);
      form.hidden = false;
      form.querySelector("[type=submit]").disabled = !editable;
    } catch (error) {
      document.querySelector("#mission-load-error").textContent = error.message;
    }
  }
  void load();
})();
