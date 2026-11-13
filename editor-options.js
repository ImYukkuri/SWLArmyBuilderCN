/* Preloaded, typed references for maintenance forms. No runtime data is rewritten. */
window.EditorOptions = (() => {
  const labelOf = (item) =>
    [item.name?.zh, item.name?.en, item.label]
      .filter(Boolean)
      .filter((v, i, a) => a.indexOf(v) === i)
      .join(" / ");
  const unique = (items) => [
    ...new Map(items.map((item) => [JSON.stringify(item.value), item])).values(),
  ];
  const option = (value, label = String(value)) => ({ value, label });
  const enums = {
    defenseDie: [
      ["white", "白色防御骰"],
      ["red", "红色防御骰"],
    ],
    attackSurge: [
      ["none", "无转换"],
      ["hit", "激增 → 命中"],
      ["critical", "激增 → 暴击"],
    ],
    defenseSurge: [
      ["none", "无转换"],
      ["block", "激增 → 格挡"],
    ],
    action: [
      ["none", "无"],
      ["action", "卡牌行动"],
      ["free-action", "免费卡牌行动"],
    ],
    divisions: [
      ["Light", "光明面"],
      ["Dark", "黑暗面"],
    ],
    trigger: [
      ["equipped", "携带该卡时"],
      ["unitQualifies", "单位满足条件时"],
    ],
    op: [
      ["eq", "等于"],
      ["in", "属于以下任意值"],
      ["contains", "包含"],
      ["gte", "大于等于"],
      ["lte", "小于等于"],
    ],
  };
  const conditionFields = [
    ["unit.unitTypeId", "单位类型"],
    ["unit.factionId", "阵营"],
    ["unit.affiliationIds", "组织"],
    ["unit.title", "单位称号"],
    ["unit.name", "单位名称"],
    ["unit.keywords", "词条"],
    ["unit.rankId", "军阶"],
    ["unit.upstreamId", "来源单位 ID"],
    ["unit.defenseDie", "防御骰"],
    ["unit.divisions", "光暗标签"],
    ["unit.id", "本地单位 ID"],
    ["unit.nameEn", "英文名称"],
    ["unit.nameZh", "中文名称"],
    ["unit.titleEn", "英文称号"],
    ["unit.titleZh", "中文称号"],
  ];
  function create(defs, units, upgrades, pkg, fields) {
    const tables = {};
    for (const [key, rows] of Object.entries(defs))
      if (Array.isArray(rows))
        tables[key] = rows
          .filter((x) => x && x.id != null)
          .map((x) => option(x.id, (labelOf(x) || String(x.id)) + " · " + x.id));
    function merge(key, rows) {
      tables[key] = unique([...(rows || []), ...(tables[key] || [])]);
    }
    merge(
      "sourceUnits",
      units
        .filter((u) => u.upstream?.id != null)
        .map((u) =>
          option(
            String(u.upstream.id),
            [labelOf(u), labelOf({ name: u.title })].filter(Boolean).join(" · ") +
              " · " +
              u.upstream.id,
          ),
        ),
    );
    merge(
      "upgrades",
      upgrades
        .filter((c) => c.upstream?.id != null)
        .map((c) => option(String(c.upstream.id), labelOf(c) + " · " + c.upstream.id)),
    );
    tables.units = units.map((u) =>
      option(
        u.id,
        [labelOf(u), labelOf({ name: u.title })].filter(Boolean).join(" · ") + " · " + u.id,
      ),
    );
    tables.semanticSlots = (pkg.slots || []).map((s) => option(s.id, labelOf(s) + " · " + s.id));
    tables.predicates = Object.keys(pkg.predicates || {}).map((k) => option(k));
    tables.properties = Object.entries(fields.properties || {}).map(([k, v]) =>
      option(k, (v.zh || k) + " · " + k),
    );
    tables.names = unique(units.map((u) => option(u.name?.en, labelOf(u))).filter((x) => x.value));
    tables.titles = unique(
      units.map((u) => option(u.title?.en, labelOf({ name: u.title }))).filter((x) => x.value),
    );
    tables.collections = [
      ["units", "单位"],
      ["upgrades", "升级卡"],
      ["options", "军队选项"],
      ["factions", "军队 / 战斗部队"],
    ].map(([v, l]) => option(v, l));
    tables.cardConflicts = unique(
      [
        ...units.map((u) => option(u.name?.en, "单位：" + labelOf(u))),
        ...upgrades.map((c) => option(c.name?.en, "升级：" + labelOf(c))),
        ...(tables.upgrades || []).map((o) =>
          option({ id: o.value, propertyName: "upgrades" }, "升级引用：" + o.label),
        ),
        ...(tables.sourceUnits || []).map((o) =>
          option({ id: o.value, propertyName: "units" }, "单位引用：" + o.label),
        ),
      ].filter((o) => o.value),
    );
    tables.sourceKeywords = (defs.sourceKeywords || []).map((k) => {
      const local = (defs.keywords || []).find((x) =>
        (x.upstreamIds || []).map(String).includes(String(k.id)),
      );
      return option(
        k.id,
        (local?.name?.zh ? local.name.zh + " / " : "") + (k.name?.en || k.id) + " · " + k.id,
      );
    });
    const observed = new Map();
    function scan(value, path = []) {
      if (Array.isArray(value)) value.forEach((v) => scan(v, [...path, "*"]));
      else if (value && typeof value === "object")
        Object.entries(value).forEach(([k, v]) => scan(v, [...path, k]));
      else if (value != null && typeof value !== "object") {
        const key = path.join(".");
        if (!observed.has(key)) observed.set(key, []);
        observed.get(key).push(option(value));
      }
    }
    for (const c of [...units, ...upgrades]) scan(c.rules || {});
    const observedAt = (path) =>
      unique(observed.get(path.map((p) => (/^\d+$/.test(String(p)) ? "*" : p)).join(".")) || []);
    const table = (name) => tables[name] || [];
    const enumList = (name) => (enums[name] || []).map(([v, l]) => option(v, l));
    function collection(name) {
      return table(
        { units: "sourceUnits", upgrades: "upgrades", options: "options", factions: "armies" }[
          name
        ],
      );
    }
    function condition(field, op = "eq") {
      const t = {
        "unit.unitTypeId": "unitTypes",
        "unit.factionId": "factions",
        "unit.affiliationIds": "affiliations",
        "unit.keywords": "keywords",
        "unit.rankId": "ranks",
        "unit.upstreamId": "sourceUnits",
        "unit.id": "units",
      }[field];
      if (t) return table(t);
      if (field === "unit.defenseDie") return enumList("defenseDie");
      if (field === "unit.divisions") return enumList("divisions");
      const key = field.split(".").at(-1);
      if (/^(name|title)(En|Zh)?$/.test(key)) {
        const prop = key.startsWith("name") ? "name" : "title",
          lang = key.endsWith("Zh") ? "zh" : "en";
        return unique(
          units
            .map((u) => {
              const n = u[prop] || {},
                combined = [n.en, n.zh].filter(Boolean).join(" ");
              return option(
                key === prop && op !== "contains" ? combined : n[lang],
                labelOf({ name: n }),
              );
            })
            .filter((o) => o.value),
        );
      }
      return [];
    }
    function rule(path, parent, value, ancestors = []) {
      const key = String(path.at(-1)),
        root = path[0],
        strings = path.map(String);
      const atom = [parent, ...ancestors.toReversed()].find(
        (x) => x && !Array.isArray(x) && typeof x.property === "string",
      );
      if (key === "property")
        return root === "modifiedPointsWith" ? table("collections") : table("properties");
      if (key === "propertyName" || key === "elementPropertyName") return table("collections");
      if (key === "field") return conditionFields.map(([v, l]) => option(v, l));
      if (key === "op") return enumList("op");
      if (key === "ref") return table("predicates");
      if ((key === "value" || strings.includes("value")) && atom) {
        const name = fields.properties?.[atom.property]?.values;
        if (atom.property === "keywords")
          return typeof value === "string" && !/^\d+$/.test(value)
            ? table("keywords")
            : table("sourceKeywords");
        return table(name);
      }
      const expression = [parent, ...ancestors.toReversed()].find((x) => x?.field);
      if ((key === "value" || strings.includes("value")) && expression)
        return condition(expression.field, expression.op);
      if (["unavailableWith", "unavailableWithIds"].includes(root)) {
        if (path.length === 2) return table("cardConflicts");
        if (key === "id") return collection(parent.propertyName || "upgrades");
      }
      if (root === "modifiedPointsWith") {
        if (key === "id") return unique([...collection(parent.property), ...observedAt(path)]);
        if (key === "in") return table("sourceUnits");
      }
      if (root === "requiredChildren" && key === "id")
        return collection(parent.elementPropertyName || "upgrades");
      if (
        (root === "quantityLimitedBy" && key === "unit") ||
        strings.includes("whenArmyIncludes") ||
        strings.includes("holders")
      )
        return table("sourceUnits");
      if (strings.includes("tiers") || ["tier", "rank", "replaceTier"].includes(key))
        return table("ranks");
      if (root === "slotGrants") {
        if (key === "trigger") return enumList("trigger");
        if (key === "slot" || strings.includes("ifAbsentAny")) return table("semanticSlots");
        if (key === "type") return unique([option("addSlot", "增加槽位"), ...observedAt(path)]);
      }
      const spec = fields.fields?.[root];
      if (spec?.values && (path.length === 1 || path.length === 2)) return table(spec.values);
      if (spec?.options) return Object.entries(spec.options).map(([v, l]) => option(v, l));
      if (["chooseOneKey", "poolBonuses"].includes(root)) return observedAt(path);
      return [];
    }
    return { table, enumList, condition, rule, observedAt, conditionFields, fields, pkg };
  }
  let pending;
  function load(force = false) {
    if (!pending || force)
      pending = Promise.all(
        ["catalog-definitions", "units", "upgrades", "slot-rules", "rule-fields"].map(
          async (name) => {
            const r = await fetch("data/" + name + ".json", { cache: "no-cache" });
            if (!r.ok) throw Error("无法加载编辑选项：" + name + "（" + r.status + "）");
            return r.json();
          },
        ),
      )
        .then(([defs, units, upgrades, pkg, fields]) => {
          defs.slotRules = pkg;
          defs.semanticSlots = pkg.slots || [];
          defs.ruleFields = fields;
          Object.defineProperty(defs, "editorOptions", {
            value: create(defs, units.units, upgrades.cards, pkg, fields),
            enumerable: false,
          });
          return { defs, units, upgrades, pkg, fields };
        })
        .catch((e) => {
          pending = null;
          throw e;
        });
    return pending;
  }
  function control(
    value,
    items,
    onChange,
    { label = "选择项目", custom = false, nullable = true, preserveType = true } = {},
  ) {
    const box = document.createElement("div");
    box.className = "option-control";
    const select = document.createElement("select");
    select.setAttribute("aria-label", label);
    const choices = unique([
      ...(nullable || value == null ? [option(null, "未设置")] : []),
      ...items,
    ]);
    if (
      value != null &&
      !choices.some(
        (o) =>
          JSON.stringify(o.value) === JSON.stringify(value) ||
          (typeof o.value !== "object" && String(o.value) === String(value)),
      )
    )
      choices.push(
        option(
          structuredClone(value),
          "保留当前值：" + (typeof value === "object" ? JSON.stringify(value) : value),
        ),
      );
    for (const [i, o] of choices.entries()) {
      const op = document.createElement("option");
      op.value = String(i);
      op.textContent = o.label;
      select.append(op);
    }
    const selected = choices.findIndex(
      (o) =>
        JSON.stringify(o.value) === JSON.stringify(value) ||
        (value != null && typeof o.value !== "object" && String(o.value) === String(value)),
    );
    select.value = selected < 0 ? "0" : String(selected);
    select.onchange = () => {
      const o = choices[Number(select.value)];
      if (!o) return;
      let next = structuredClone(o.value);
      if (preserveType && next != null && typeof next !== "object") {
        if (typeof value === "number" && /^-?\d+$/.test(String(next))) next = Number(next);
        else if (typeof value === "string" && typeof next === "number") next = String(next);
      }
      value = next;
      onChange(next);
    };
    box.append(select);
    if (custom) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "minor option-manual";
      button.textContent = "手动输入";
      button.onclick = () => {
        const input = document.createElement("input");
        input.setAttribute("aria-label", label + "手动值");
        input.value =
          value == null ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
        const apply = document.createElement("button");
        apply.type = "button";
        apply.textContent = "应用";
        apply.onclick = () => {
          let next = input.value;
          if (typeof value === "number") {
            if (!next.trim() || !Number.isFinite(Number(next))) {
              input.setCustomValidity("请输入有效数字");
              input.reportValidity();
              return;
            }
            next = Number(next);
          } else if (typeof value === "object" && value !== null) {
            try {
              next = JSON.parse(next);
            } catch {
              input.setCustomValidity("请输入有效 JSON");
              input.reportValidity();
              return;
            }
          }
          onChange(next);
          box.replaceWith(
            control(next, items, onChange, { label, custom, nullable, preserveType }),
          );
        };
        box.replaceChildren(input, apply);
        input.focus();
      };
      box.append(button);
    }
    return box;
  }
  return { create, load, control, conditionFields };
})();
