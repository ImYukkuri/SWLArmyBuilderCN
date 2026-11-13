/* Card-shaped inputs shared by unit and upgrade maintenance. */
window.EditorForms = (() => {
  const el = (tag, text, cls) => {
    const e = document.createElement(tag);
    if (text != null) e.textContent = text;
    if (cls) e.className = cls;
    return e;
  };
  function icon(kind) {
    const glyph = { attackSurge: "a", defenseSurge: "d", hit: "h", critical: "c", block: "s" }[
      kind
    ];
    if (glyph) return el("span", glyph, "form-symbol");
    if (["red", "black", "white"].includes(kind)) return el("i", null, "form-die " + kind);
    const paths = {
      models: "M4 19v-6a4 4 0 0 1 8 0v6M7 5a2 2 0 1 0 4 0 2 2 0 1 0-4 0M16 12a4 4 0 0 1 4 4v3",
      wounds: "M12 20 3.7 11.7A5.2 5.2 0 0 1 12 5.5a5.2 5.2 0 0 1 8.3 6.2Z",
      courage: "m12 2 8 3v6c0 5-8 10-8 10S4 16 4 11V5Zm0 5v7m-3-3 3-4 3 4",
      resilience: "m12 2 9 10-9 10-9-10Zm-5 10h10",
      speed: "m3 6 6 6-6 6m7-12 6 6-6 6m7-12 5 6-5 6",
    };
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.classList.add("form-icon");
    svg.setAttribute("aria-hidden", "true");
    const p = document.createElementNS(svg.namespaceURI, "path");
    p.setAttribute("d", paths[kind] || "M4 4h16v16H4Z");
    p.setAttribute("fill", "none");
    p.setAttribute("stroke", "currentColor");
    p.setAttribute("stroke-width", "1.6");
    svg.append(p);
    return svg;
  }
  function input(label, value, change, type = "text") {
    const wrap = el("label", null, "metric-input"),
      name = el("span", label),
      control = el("input");
    control.type = type;
    control.value = value ?? "";
    control.setAttribute("aria-label", label);
    if (type === "number") {
      control.step = "1";
      control.placeholder = "未设置";
    }
    control.oninput = () =>
      change(
        type === "number" ? (control.value === "" ? null : Number(control.value)) : control.value,
      );
    wrap.append(name, control);
    return wrap;
  }
  function choices(label, value, options, change, draw) {
    const group = el("div", null, "metric-choice");
    group.setAttribute("role", "group");
    group.setAttribute("aria-label", label);
    for (const [key, text] of [[null, "未设置"], ...options]) {
      const b = el("button");
      b.type = "button";
      b.title = text;
      b.setAttribute("aria-label", label + "：" + text);
      b.setAttribute("aria-pressed", String(value === key || (value == null && key == null)));
      if (draw && key != null) draw(b, key);
      else b.append(el("span", text));
      b.onclick = () => {
        change(key);
        for (const n of group.children) n.setAttribute("aria-pressed", String(n === b));
      };
      group.append(b);
    }
    return group;
  }
  function stats(stats, change) {
    const box = el("section", null, "stats-editor");
    box.append(el("h3", "基础属性"));
    const numbers = el("div", null, "stats-matrix");
    for (const [key, label] of [
      ["models", "模型数量"],
      ["wounds", "生命值"],
      ["courage", "勇气"],
      ["resilience", "韧性"],
      ["speed", "速度"],
    ]) {
      const row = input(
        label,
        stats[key],
        (v) => {
          stats[key] = v;
          delete stats[key + "Symbol"];
          change();
        },
        "number",
      );
      row.firstChild.prepend(icon(key));
      row.querySelector("input").min = "0";
      if (["wounds", "courage", "resilience"].includes(key)) {
        const symbolic = el("select");
        symbolic.dataset.noCombo = "true";
        symbolic.setAttribute("aria-label", label + "显示方式");
        for (const [v, l] of [
          ["number", "数值"],
          ["dash", "—"],
          ["x", "X"],
        ]) {
          const op = el("option", l);
          op.value = v;
          symbolic.append(op);
        }
        symbolic.value = stats[key + "Symbol"] || "number";
        row.querySelector("input").hidden = symbolic.value !== "number";
        symbolic.onchange = () => {
          if (symbolic.value === "number") delete stats[key + "Symbol"];
          else {
            stats[key + "Symbol"] = symbolic.value;
            stats[key] = null;
          }
          row.querySelector("input").hidden = symbolic.value !== "number";
          row.querySelector("input").value = stats[key] ?? "";
          change();
        };
        row.append(symbolic);
      }
      numbers.append(row);
    }
    box.append(numbers);
    const modes = el("div", null, "stats-conversions");
    for (const [key, label, options] of [
      [
        "defenseDie",
        "防御骰",
        [
          ["white", "白骰"],
          ["red", "红骰"],
        ],
      ],
      [
        "attackSurge",
        "攻击激增",
        [
          ["none", "无转换"],
          ["hit", "命中"],
          ["critical", "暴击"],
        ],
      ],
      [
        "defenseSurge",
        "防御激增",
        [
          ["none", "无转换"],
          ["block", "格挡"],
        ],
      ],
    ]) {
      const row = el("div", null, "conversion-row");
      row.append(
        el("span", label),
        choices(
          label,
          stats[key],
          options,
          (v) => {
            stats[key] = v;
            change();
          },
          (b, v) => {
            if (key === "defenseDie") {
              const d = icon(v);
              d.classList.add("defense");
              b.append(d, el("span", v === "red" ? "红骰" : "白骰"));
            } else {
              b.append(icon(key), el("span", "→"), v === "none" ? el("span", "—") : icon(v));
            }
          },
        ),
      );
      modes.append(row);
    }
    box.append(modes);
    return box;
  }
  function keywords(keywords, defs, change) {
    const root = el("div", null, "weapon-keyword-editor");
    function draw() {
      root.replaceChildren();
      for (const [i, k] of keywords.entries()) {
        const row = el("div", null, "weapon-keyword-row");
        row.append(
          EditorOptions.control(
            k.id,
            defs.editorOptions.table("keywords"),
            (v) => {
              k.id = v;
              change();
            },
            { label: "武器词条 " + (i + 1), nullable: false },
          ),
        );
        row.append(
          input(
            "数值",
            k.value,
            (v) => {
              k.value = v;
              change();
            },
            "number",
          ),
          input("参数", k.parameter, (v) => {
            k.parameter = v || null;
            change();
          }),
        );
        const del = el("button", "×", "minor");
        del.type = "button";
        del.setAttribute("aria-label", "删除武器词条 " + (i + 1));
        del.onclick = () => {
          keywords.splice(i, 1);
          change();
          draw();
        };
        row.append(del);
        root.append(row);
      }
      const add = el("button", "＋ 武器词条", "minor");
      add.type = "button";
      add.onclick = () => {
        const first = defs.keywords?.[0];
        if (!first) return;
        keywords.push({ id: first.id, value: null, parameter: null });
        change();
        draw();
      };
      root.append(add);
    }
    draw();
    return root;
  }
  function weapons(weapons, defs, change, { variable = false } = {}) {
    const root = el("section", null, "weapons-editor");
    function draw() {
      root.replaceChildren();
      root.append(el("h3", "武器配置"));
      for (const [i, w] of weapons.entries()) {
        const card = el("article", null, "weapon-editor");
        card.dataset.weaponIndex = i;
        const head = el("div", null, "weapon-editor-head"),
          names = el("div", null, "weapon-names");
        for (const [lang, label] of [
          ["zh", "武器中文名"],
          ["en", "武器英文名"],
        ])
          names.append(
            input(label, w.name?.[lang], (v) => {
              (w.name ||= {})[lang] = v;
              change();
            }),
          );
        const remove = el("button", "删除武器", "minor");
        remove.type = "button";
        remove.onclick = () => {
          weapons.splice(i, 1);
          change();
          draw();
        };
        head.append(names, remove);
        card.append(head);
        const strip = el("div", null, "weapon-data-strip"),
          range = el("div", null, "weapon-range-inputs"),
          badge = el("span", null, "weapon-range-preview");
        function updateRange() {
          const r = w.range || {};
          badge.className =
            "weapon-range-preview " + (r.min === 0 ? (r.max === 0 ? "melee" : "mixed") : "ranged");
          badge.textContent =
            r.min == null
              ? "射程待确认"
              : (r.min === 0 ? (r.max === 0 ? "近战" : "近战 / 远程") : "仅远程") +
                " " +
                r.min +
                (r.max != null && r.max !== r.min ? "–" + r.max : "");
        }
        range.append(badge);
        for (const [key, label] of [
          ["min", "最小射程"],
          ["max", "最大射程"],
        ]) {
          const field = input(
            label,
            w.range?.[key],
            (v) => {
              (w.range ||= {})[key] = v;
              change();
              updateRange();
            },
            "number",
          );
          field.querySelector("input").min = "0";
          range.append(field);
        }
        updateRange();
        strip.append(range);
        const dice = el("div", null, "weapon-dice-inputs");
        for (const [color, label] of [
          ["red", "红骰"],
          ["black", "黑骰"],
          ["white", "白骰"],
        ]) {
          const field = input(
            label,
            w.dice?.[color],
            (v) => {
              (w.dice ||= {})[color] = v;
              change();
            },
            "number",
          );
          field.firstChild.prepend(icon(color));
          const number = field.querySelector("input");
          number.min = variable ? "-1" : "0";
          if (variable) {
            const toggle = el("button", "X", "variable-dice");
            toggle.type = "button";
            toggle.title = "可变骰数（保存为 -1）";
            toggle.setAttribute("aria-label", label + "可变骰数");
            toggle.setAttribute("aria-pressed", String(w.dice?.[color] === -1));
            number.hidden = w.dice?.[color] === -1;
            toggle.onclick = () => {
              const active = w.dice?.[color] !== -1;
              (w.dice ||= {})[color] = active ? -1 : 0;
              toggle.setAttribute("aria-pressed", String(active));
              number.hidden = active;
              number.value = active ? "-1" : "0";
              change();
            };
            field.append(toggle);
          }
          dice.append(field);
        }
        strip.append(dice);
        card.append(
          strip,
          el("p", "最小射程 0 表示近战可用；兼用武器保留其远程上限。", "weapon-edit-hint"),
        );
        if (Array.isArray(w.keywords)) card.append(keywords(w.keywords, defs, change));
        root.append(card);
      }
      const add = el("button", "＋ 添加武器");
      add.type = "button";
      add.onclick = () => {
        weapons.push({
          name: { en: "New Weapon", zh: "" },
          range: { min: null, max: null },
          dice: { red: 0, black: 0, white: 0 },
          keywords: [],
        });
        change();
        draw();
      };
      root.append(add);
    }
    draw();
    return root;
  }
  return { stats, weapons, icon };
})();
