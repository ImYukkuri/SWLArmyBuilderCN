/* Rule editor for card `rules` blocks, using the shared data dictionary (defs).
 * Renders the fields the rule engine actually reads; edits declarations only. */
window.RuleEditor = (() => {
  const E = (tag, text) => {
    const e = document.createElement(tag);
    if (text !== undefined) e.textContent = text;
    return e;
  };
  const labels = {
    slotTypes: "可匹配槽位",
    availableIn: "允许的单位",
    unavailableWith: "互斥卡牌（旧字段，与互斥卡牌 ID 重复）",
    factions: "军队准入（含战斗部队）",
    requiredProperties: "适用条件（外层 OR / 内层 AND）",
    requiredDivisions: "光明/黑暗限定",
    unique: "整军唯一",
    locallyUnique: "同一单位不重复",
    limit: "数量上限",
    unlimited: "允许重复单位",
    addProperties: "增加属性",
    replaceProperties: "替换属性",
    modifiedPointsWith: "条件费用修正",
    tierCounting: "军阶计数修正",
    requiredChildren: "强制附带卡",
    quantityLimitedBy: "数量受母单位限制",
    chooseOneKey: "互斥选择组",
    poolBonuses: "雇佣兵池奖励",
    property: "比较属性",
    value: "目标值",
    tiers: "军阶",
    whenArmyIncludes: "需要军队包含",
    perSourceUnit: "每个来源提供名额",
    ignoreMinimum: "不计入最低",
    ignoreMaximum: "不计入最高",
    waivesMinimum: "免除最低",
    exempt: "条件豁免",
    ignoreMaximumWhenArmyIncludes: "存在指定单位时豁免上限",
    id: "引用 ID",
    elementPropertyName: "对象类别",
    upgradeIndex: "槽位索引",
    modifier: "点数变化",
    unit: "母单位",
    ratio: "数量比例",
    in: "限定对象",
    requiresTier: "军阶要求",
    replaceTier: "替换军阶",
    unavailableWithIds: "互斥卡牌 ID",
    rank: "军阶",
    slotGrants: "槽位授予（equipped=携带生效 / unitQualifies=单位满足条件生效）",
    trigger: "触发方式",
    type: "效果类型",
    slot: "槽位",
    when: "触发条件",
    field: "字段",
    op: "操作符",
  };
  const groups = [
    [
      "适用资格",
      [
        "slotTypes",
        "requiredProperties",
        "requiredDivisions",
        "availableIn",
        "unavailableIn",
        "factions",
      ],
    ],
    [
      "唯一性与互斥",
      ["unique", "unlimited", "limit", "locallyUnique", "chooseOneKey", "unavailableWithIds"],
    ],
    ["依赖与数量", ["requiredChildren", "quantityLimitedBy"]],
    ["效果与费用", ["addProperties", "replaceProperties", "modifiedPointsWith"]],
    ["军阶和佣兵池", ["tierCounting", "poolBonuses"]],
    ["军阶要求", ["requiresTier"]],
    ["槽位授予", ["slotGrants"]],
  ];
  const defaults = {
    slotTypes: [2],
    availableIn: [],
    factions: [],
    requiredProperties: [[{ property: "unitType", value: 1 }]],
    requiredDivisions: ["Light"],
    unique: false,
    locallyUnique: false,
    requiresTier: [],
    replaceTier: null,
    unavailableWithIds: [],
    unavailableIn: [],
    unlimited: true,
    limit: 1,
    chooseOneKey: "leader",
    addProperties: [],
    replaceProperties: [],
    modifiedPointsWith: [],
    tierCounting: { ignoreMinimum: false },
    requiredChildren: [],
    quantityLimitedBy: [],
    poolBonuses: [],
    slotGrants: [],
  };
  let props = ["unitType", "faction", "affiliation", "keywords"];
  let atomTables = {
    unitType: "unitTypes",
    faction: "factions",
    affiliation: "affiliations",
    keywords: "keywords",
  };
  let propLabels = {
    unitType: "单位类型",
    faction: "阵营",
    affiliation: "组织",
    keywords: "关键词",
  };

  function render(container, rules, defs, onchange, context = {}) {
    if (defs && defs.ruleFields) {
      props = Object.keys(defs.ruleFields.properties || {}) || props;
      atomTables = {};
      propLabels = {};
      for (const [k, v] of Object.entries(defs.ruleFields.properties || {})) {
        atomTables[k] = v.values;
        propLabels[k] = v.zh || k;
      }
      for (const [k, v] of Object.entries(defs.ruleFields.fields || {}))
        labels[k] = v.zh || labels[k];
      for (const [k, v] of Object.entries(defs.ruleFields.nested || {})) labels[k] = v;
    }
    container.replaceChildren();
    const help = E(
      "p",
      context.usage === "counterpart"
        ? "伙伴用途：维护宿主资格、伙伴槽及费用来源；不会作为普通独立单位加入军表。"
        : "按名称或 ID 搜索已有单位、升级和枚举值。未识别的当前值会保留；数量、费用与文字说明可直接输入。",
    );
    help.className = "hint";
    container.append(help);
    const badge = E("div");
    badge.className = "rule-overview";
    for (const [key, value] of Object.entries(rules || {})) {
      const c = E(
        "span",
        (labels[key] || key) + (Array.isArray(value) ? " · " + value.length : ""),
      );
      c.className = "rule-chip";
      badge.append(c);
    }
    container.append(badge);
    const notify = () => onchange && onchange();

    function control(object, key, path) {
      const value = object[key],
        row = E("div");
      row.className = "field";
      row.title = path.join(".");
      row.append(E("span", labels[key] || "项目 " + (Number(key) + 1)));
      const ancestors = [];
      let cursor = rules;
      for (const part of path.slice(0, -1)) {
        ancestors.push(cursor);
        cursor = cursor?.[part];
      }
      const choices = defs.editorOptions.rule(path, object, value, ancestors);
      const update = (next) => {
        object[key] = next;
        notify();
        if (
          ["property", "propertyName", "elementPropertyName", "field", "op"].includes(
            String(key),
          ) ||
          (typeof next === "object" && next !== null)
        )
          render(container, rules, defs, onchange, context);
      };
      if (choices.length)
        row.append(
          EditorOptions.control(value, choices, update, {
            label: "规则 " + path.join("."),
            custom:
              [
                "chooseOneKey",
                "poolBonuses",
                "modifiedPointsWith",
                "unavailableWith",
                "unavailableWithIds",
              ].includes(path[0]) || key === "value",
          }),
        );
      else if (
        typeof value === "boolean" ||
        [
          "unique",
          "unlimited",
          "locallyUnique",
          "ignoreMaximum",
          "ignoreMinimum",
          "countsAsActivation",
          "costViaUpgrade",
        ].includes(key)
      )
        row.append(
          EditorOptions.control(
            value,
            [
              { value: true, label: "是" },
              { value: false, label: "否" },
            ],
            update,
            { label: "规则 " + path.join(".") },
          ),
        );
      else {
        const input = E("input");
        input.value = value ?? "";
        input.setAttribute("aria-label", "规则 " + path.join("."));
        if (
          typeof value === "number" ||
          ["limit", "modifier", "ratio", "perSourceUnit", "upgradeIndex"].includes(key)
        ) {
          input.type = "number";
          input.step = "1";
        }
        input.oninput = () => {
          object[key] =
            input.type === "number"
              ? input.value === ""
                ? null
                : Number(input.value)
              : input.value;
          notify();
        };
        row.append(input);
      }
      return row;
    }

    function defaultItem(key, parent, path) {
      // Array operands need a typed value, not another rule atom.
      if (key === "value") {
        const ancestors = [];
        let cursor = rules;
        for (const part of path) {
          ancestors.push(cursor);
          cursor = cursor?.[part];
        }
        const choices = defs.editorOptions.rule([...path, 0], parent[key], null, ancestors);
        return choices.length ? structuredClone(choices[0].value) : "";
      }
      if (key === "requiredProperties")
        return [{ property: "unitType", value: defs.unitTypes[0]?.id ?? null }];
      if (path.includes("requiredProperties"))
        return { property: "unitType", value: defs.unitTypes[0]?.id ?? null };
      if (key === "requiredChildren")
        return {
          id: defs.upgrades?.[0]?.id ?? null,
          elementPropertyName: "upgrades",
          upgradeIndex: 0,
        };
      if (key === "quantityLimitedBy") return { unit: defs.sourceUnits?.[0]?.id ?? null, ratio: 1 };
      if (key === "modifiedPointsWith")
        return { id: defs.options?.[0]?.id ?? null, property: "options", modifier: 0 };
      if (["addProperties", "replaceProperties"].includes(key))
        return [{ property: "keywords", value: [] }];
      if (path.includes("addProperties") || path.includes("replaceProperties")) {
        return { property: "keywords", value: [] };
      }
      if (key === "slotGrants")
        return { trigger: "equipped", slot: defs.slotRules.slots[0]?.id ?? null };
      const choices = defs.editorOptions.rule([...path, 0], parent, null, [parent]);
      return choices.length ? structuredClone(choices[0].value) : "";
    }

    function fields(object, path, into) {
      for (const key of Object.keys(object)) {
        const value = object[key],
          p = [...path, key];
        if (Array.isArray(value)) {
          const box = E("fieldset");
          box.append(
            E(
              "legend",
              (labels[key] || key) + (key === "requiredProperties" ? "（外层 OR / 内层 AND）" : ""),
            ),
          );
          value.forEach((v, i) => {
            const row = E("div");
            row.className = "rule-item";
            if (
              ["unavailableWith", "unavailableWithIds"].includes(p[0]) &&
              v &&
              typeof v === "object" &&
              !Array.isArray(v)
            ) {
              row.append(control(value, i, [...p, i]));
            } else if (Array.isArray(v)) {
              const nested = E("div");
              nested.append(
                E(
                  "strong",
                  key === "requiredProperties" ? "条件组 " + (i + 1) + "：全部满足" : String(i + 1),
                ),
              );
              fields(v, [...p, i], nested);
              const addAtom = E("button", "＋ AND 条件");
              addAtom.type = "button";
              addAtom.onclick = () => {
                v.push({ property: "unitType", value: defs.unitTypes[0]?.id ?? null });
                notify();
                render(container, rules, defs, onchange, context);
              };
              nested.append(addAtom);
              row.append(nested);
            } else if (v !== null && typeof v === "object") {
              fields(v, [...p, i], row);
            } else {
              row.append(control(value, i, [...p, i]));
            }
            const remove = E("button", "删除");
            remove.type = "button";
            remove.className = "minor";
            remove.onclick = () => {
              value.splice(i, 1);
              notify();
              render(container, rules, defs, onchange, context);
            };
            row.append(remove);
            box.append(row);
          });
          const add = E("button", key === "requiredProperties" ? "＋ OR 条件组" : "＋ 添加");
          add.type = "button";
          add.onclick = () => {
            value.push(defaultItem(key, object, p));
            notify();
            render(container, rules, defs, onchange, context);
          };
          box.append(add);
          into.append(box);
        } else if (value !== null && typeof value === "object") {
          const box = E("fieldset");
          box.append(E("legend", labels[key] || key));
          fields(value, p, box);
          if (key === "tierCounting") {
            const choices = E("select");
            for (const name of [
              "ignoreMinimum",
              "ignoreMaximum",
              "waivesMinimum",
              "exempt",
              "ignoreMaximumWhenArmyIncludes",
            ]) {
              const op = E("option", labels[name] || name);
              op.value = name;
              choices.append(op);
            }
            const b = E("button", "添加计数修正");
            b.type = "button";
            b.onclick = () => {
              const k = choices.value;
              if (!(k in value)) {
                value[k] =
                  k === "waivesMinimum"
                    ? { tiers: [1] }
                    : k.includes("When") || k === "exempt"
                      ? { whenArmyIncludes: [], perSourceUnit: 1 }
                      : false;
                notify();
                render(container, rules, defs, onchange, context);
              }
            };
            box.append(choices, b);
          }
          into.append(box);
        } else {
          into.append(control(object, key, p));
        }
      }
    }

    const seen = new Set();
    for (const [name, keys] of groups) {
      const section = E("details");
      section.open = true;
      section.className = "restriction-section";
      section.append(E("summary", name));
      for (const key of keys) {
        seen.add(key);
        if (!(key in (rules || {}))) continue;
        const block = E("div");
        block.dataset.ruleField = key;
        fields(
          {
            get [key]() {
              return rules[key];
            },
            set [key](v) {
              rules[key] = v;
            },
          },
          [],
          block,
        );
        const remove = E("button", "移除此限制项");
        remove.className = "minor";
        remove.onclick = () => {
          delete rules[key];
          notify();
          render(container, rules, defs, onchange, context);
        };
        block.append(remove);
        section.append(block);
      }
      const known = new Set([
        ...Object.keys(defaults),
        ...groups.flatMap((g) => g[1]),
        ...Object.keys(labels),
      ]);
      const options = keys.filter((k) => !(k in (rules || {})) && known.has(k));
      if (options.length) {
        const select = E("select");
        select.setAttribute("aria-label", name + "添加字段");
        for (const k of options) {
          const op = E("option", labels[k] || k);
          op.value = k;
          select.append(op);
        }
        const add = E("button", "添加限制");
        add.onclick = () => {
          rules[select.value] = structuredClone(defaults[select.value]);
          notify();
          render(container, rules, defs, onchange, context);
        };
        const controls = E("div");
        controls.className = "rule-add";
        controls.append(select, add);
        section.append(controls);
      }
      container.append(section);
    }
    const extra = Object.keys(rules || {}).filter((k) => !seen.has(k));
    if (extra.length) {
      const panel = E("details");
      panel.append(E("summary", "其他保留字段"));
      for (const k of extra)
        fields(
          {
            get [k]() {
              return rules[k];
            },
            set [k](v) {
              rules[k] = v;
            },
          },
          [],
          panel,
        );
      container.append(panel);
    }
  }
  return { render, labels };
})();
