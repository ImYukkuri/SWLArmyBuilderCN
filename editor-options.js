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
      ["action", "行动"],
      ["double-action", "双行动"],
      ["free-action", "免费行动"],
      ["free-exhaust", "免费行动：横置"],
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
    ["unit.unitCategoryId", "单位类型（士兵 / 载具）"],
    ["unit.unitSubtypeId", "单位子类型"],
    ["unit.nameIdentityId", "名称标识"],
    ["unit.unitTypeId", "旧版混合类型（兼容）"],
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
      tables[key] = unique([...(tables[key] || []), ...(rows || [])]);
    }
    merge(
      "sourceUnits",
      units
        .filter((u) => u.upstream?.id != null && u.upstream.collection !== 'upgrades')
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
    const linkedSources = new Set(units.filter(u => u.upstream?.id != null && u.upstream.collection !== 'upgrades')
      .map(u => String(u.upstream.id)));
    tables.unitHosts = [
      ...tables.units.map(o => option({kind: 'unit', id: o.value}, '本地单位 · ' + o.label)),
      ...tables.sourceUnits.map(o => option(o.value, '来源编号 · ' + o.label +
        (linkedSources.has(String(o.value)) ? ' · 已关联本地单位' : ' · 未关联本地单位'))),
    ];
    tables.localUpgrades = upgrades.map(c => option(c.id,
      labelOf(c) + (c.usage === 'counterpart' ? ' · 伙伴' : '') + ' · ' + c.id));
    const identities = new Map();
    for (const u of units) if (u.nameIdentityId) {
      const row = identities.get(u.nameIdentityId) || {id: u.nameIdentityId, names: new Set(), count: 0};
      row.names.add(labelOf(u)); row.count++; identities.set(row.id, row);
    }
    tables.unitNameIdentities = [...identities.values()].map(row => ({
      ...option(row.id, [...row.names].join(' / ') + ' · ' + row.count + ' 个版本 · ' + row.id),
      text: [...row.names][0],
    }));
    tables.keywordTargets = [
      ...units.map(u => ({...option({kind: 'unit', id: u.id},
        [labelOf(u), labelOf({name: u.title}), u.id].filter(Boolean).join(' · ')),
        text: u.name?.en || u.name?.zh || u.id})),
      ...(defs.unitTypes || []).map(t => ({...option({kind: 'unitType', id: t.id},
        '单位类型 · ' + labelOf(t)), text: t.name?.en || t.name?.zh || String(t.id)})),
      ...['unitCategories', 'unitSubtypes'].flatMap(table => (defs[table] || []).map(t => ({
        ...option({kind: table === 'unitCategories' ? 'unitCategory' : 'unitSubtype', id: t.id}, labelOf(t)),
        text: t.name?.en || t.name?.zh || t.id,
      }))),
      ...(defs.ranks || []).map(t => ({...option({kind:'rank', id:t.id}, labelOf(t)), text: t.name?.en || String(t.id)})),
      ...tables.unitNameIdentities.map(t => ({...option({kind: 'nameIdentity', id: t.value}, t.label), text: t.text})),
    ];
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
        "unit.unitCategoryId": "unitCategories",
        "unit.unitSubtypeId": "unitSubtypes",
        "unit.nameIdentityId": "unitNameIdentities",
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
      if (root === 'availableIn' && path.length <= 2) return table('unitHosts');
      if (root === 'slotGrants' && strings.includes('holders')) return table('unitHosts');
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
        strings.includes("whenArmyIncludes")
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
            enumerable: false, writable: true,
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
  // Parameter text stays separate from keyword identity. Editing it must never
  // leave an older target reference silently overriding the visible text.
  function setKeywordParameter(keyword, text, reference = null) {
    keyword.parameter = text === '' ? null : text;
    delete keyword.parameterRefs;
    if (reference) keyword.parameterRef = structuredClone(reference);
    else delete keyword.parameterRef;
  }
  function keywordParameterControl(keyword, defs, change, {label = '参数'} = {}) {
    const box = document.createElement('div');
    box.className = 'keyword-parameter-control';
    const input = document.createElement('input');
    input.type = 'text';input.value = keyword.parameter ?? '';
    input.setAttribute('aria-label', label);
    input.placeholder = '自由填写参数；留空表示无参数';
    box.append(input);
    const global = defs.keywords?.find(k => k.id === keyword.id)?.timing?.some(t => ['global', 'army_building'].includes(t));
    const freeText = ['mercenary', 'aid', 'independent'].includes(keyword.id) ||
      (!global && !['detachment', 'entourage', 'retinue'].includes(keyword.id));
    let redrawTargets;
    if (!freeText) {
      const targets = defs.editorOptions?.table('keywordTargets') || [];
      let rows = structuredClone(keyword.parameterRefs || (keyword.parameterRef ? [keyword.parameterRef] : []));
      const list = document.createElement('div'); list.className = 'keyword-targets';
      const note = document.createElement('small');note.textContent = '关联目标：满足任一条件（或）。手填参数会清除关联。';
      const kinds = [['unitCategory','单位类型'], ['unitSubtype','单位子类型'],
        ['nameIdentity','名称标识'], ['unit','具体单位'], ['rank','军阶']];
      function write() {
        const refs = unique(rows.filter(r => r.id != null).map(value => ({value}))).map(r => r.value);
        delete keyword.parameterRef;
        if (refs.length) {
          keyword.parameterRefs = structuredClone(refs);
          keyword.parameter = refs.map(ref => targets.find(t => t.value.kind === ref.kind && t.value.id === ref.id)?.text || String(ref.id)).join(' 或 ');
        } else {delete keyword.parameterRefs; keyword.parameter = null;}
        input.value = keyword.parameter || ''; change();
      }
      function render() {
        list.replaceChildren();
        rows.forEach((ref, i) => {
          const row = document.createElement('div');row.className = 'keyword-target-row';
          const badge = document.createElement('span');badge.textContent = i ? '或' : '匹配';
          const kindChoices = kinds.map(([v,l]) => option(v,l));
          if (ref.kind === 'unitType') kindChoices.push(option('unitType','旧版类型（兼容）'));
          row.append(badge, control(ref.kind, kindChoices, kind => {
            rows[i] = {kind, id: null};write();render();
          }, {label: label + '匹配方式 ' + (i + 1), nullable: false}));
          row.append(control(ref.id, targets.filter(t => t.value.kind === ref.kind).map(t => option(t.value.id, t.label)), id => {
            rows[i].id = id;write();
          }, {label: label + '关联目标 ' + (i + 1), preserveType: false}));
          const remove = document.createElement('button');remove.type = 'button';remove.textContent = '删除';
          remove.setAttribute('aria-label', '删除目标条件 ' + (i + 1));
          remove.onclick = () => {rows.splice(i, 1);write();render();};row.append(remove);list.append(row);
        });
      }
      redrawTargets = () => {rows = [];render();};
      const add = document.createElement('button');add.type = 'button';add.className = 'minor';add.textContent = '＋ 添加匹配条件（或）';
      add.onclick = () => {rows.push({kind: 'unit', id: null});render();};
      box.append(note, list, add);render();
    }
    input.oninput = () => {
      setKeywordParameter(keyword, input.value);redrawTargets?.();change();
    };
    return box;
  }
  function unitClassificationControl(unit, defs, change) {
    const box = document.createElement('fieldset');box.className = 'unit-classification';
    const legend = document.createElement('legend');legend.textContent = '单位分类与名称标识';box.append(legend);
    const fields = document.createElement('div');fields.className = 'classification-fields';box.append(fields);
    const subtypes = defs.unitSubtypes || [], categories = defs.unitCategories || [];
    const legacy = subtypes.find(s => s.legacyTypeId === unit.unitTypeId);
    const category = () => unit.unitCategoryId || legacy?.categoryId || 'trooper';
    const subtype = () => 'unitSubtypeId' in unit ? unit.unitSubtypeId : legacy?.id || null;
    const update = (cat, sub) => {
      unit.unitCategoryId = cat;unit.unitSubtypeId = sub;
      unit.unitTypeId = subtypes.find(s => s.id === sub)?.legacyTypeId || categories.find(c => c.id === cat)?.legacyTypeId || null;
      change();render();
    };
    function field(label, node) {
      const row = document.createElement('label');row.className = 'field';
      const name = document.createElement('span');name.textContent = label;row.append(name, node);fields.append(row);
    }
    function render() {
      fields.replaceChildren();
      field('单位类型', control(category(), categories.map(c => option(c.id, labelOf(c))), cat => {
        const next = subtypes.find(s => s.id === subtype() && s.categoryId === cat);
        update(cat, next?.id || (cat === 'vehicle' ? subtypes.find(s => s.categoryId === cat)?.id : null));
      }, {label: '单位类型', nullable: false}));
      const choices = subtypes.filter(s => s.categoryId === category()).map(s => option(s.id, labelOf(s)));
      if (category() === 'trooper') choices.unshift(option(null, '普通士兵（无子类型）'));
      field('单位子类型', control(subtype(), choices, sub => update(category(), sub), {label: '单位子类型', nullable: false}));
      field('名称标识', control(unit.nameIdentityId || null, defs.editorOptions?.table('unitNameIdentities') || [], value => {
        unit.nameIdentityId = value;change();
      }, {label: '名称标识', nullable: false, custom: true}));
    }
    render();
    const note = document.createElement('small');note.className = 'hint';
    note.textContent = '同名不同形态可选同一标识；仅在规则按名称标识匹配时视为同一单位。新标识使用小写英文字母、数字、连字符或下划线，保存后会进入下拉词典。';box.append(note);
    return box;
  }
  function equipControl(unit, defs, change) {
    const box = document.createElement('fieldset');box.className = 'equip-editor';
    const legend = document.createElement('legend');legend.textContent = 'Equip · 必带卡牌与槽位';box.append(legend);
    const hint = document.createElement('p');hint.className = 'hint';
    hint.textContent = '具体卡牌：加入单位时自动装备。槽位：该类槽至少装备一张升级，由你选卡；多个关联分别满足，不新增槽位。';box.append(hint);
    const options = defs.editorOptions, pkg = options.pkg;
    let kind = 'upgrade';
    const list = document.createElement('div'), add = document.createElement('div');
    add.className = 'equip-link equip-add';box.append(list, add);
    const slotIds = () => RulesCore.equipSlotKeys(unit, pkg);
    const items = type => options.table(type === 'slot' ? 'semanticSlots' : 'localUpgrades');
    const ids = type => type === 'slot' ? slotIds() : unit.equipUpgradeIds || [];
    const field = type => type === 'slot' ? 'equipSlotIds' : 'equipUpgradeIds';
    function write(type, next) {
      if (type === 'slot') {
        // Move legacy required flags into this association before editing, so
        // removing it really removes this Equip requirement.
        const migrated = new Set(Array.isArray(unit.equipSlotIds) ? [] : slotIds());
        unit.upgradeSlots = (unit.upgradeSlots || []).map(s => {
          if (!s || typeof s !== 'object' || !s.required ||
              !migrated.has(RulesCore.slotKey(pkg, s.id))) return s;
          const next = {...s};delete next.required;
          return Object.keys(next).length === 1 ? next.id : next;
        });
      }
      unit[field(type)] = [...new Set(next)];change();render();
    }
    function render() {
      list.replaceChildren();add.replaceChildren();
      for (const type of ['upgrade', 'slot']) {
        const current = ids(type);
        current.forEach((id, index) => {
          const row = document.createElement('div');row.className = 'equip-link';
          const label = document.createElement('span');label.className = 'equip-kind';label.textContent = type === 'slot' ? '必选槽位' : '自动装备';
          row.append(label, control(id, items(type).filter(o => o.value === id || !current.includes(o.value)), value => {
            const next = [...current];next[index] = value;write(type, next);
          }, {label: (type === 'slot' ? '必选槽位 ' : '必带升级卡 ') + (index + 1), nullable: false}));
          const remove = document.createElement('button');remove.type = 'button';remove.textContent = '移除关联';
          remove.setAttribute('aria-label', '移除' + (type === 'slot' ? '槽位' : '卡牌') + '关联 ' + (index + 1));
          remove.onclick = () => write(type, current.filter((_, i) => i !== index));row.append(remove);list.append(row);
        });
      }
      add.append(control(kind, [option('upgrade','升级卡 / 伙伴卡'),option('slot','槽位')], type => {
        kind = type;render();
      }, {label:'Equip 关联类型',nullable:false}));
      add.append(control(null, items(kind).filter(o => !ids(kind).includes(o.value)), value => {
        if (value != null) write(kind, [...ids(kind), value]);
      }, {label:kind === 'slot' ? '添加必选槽位' : '添加必带升级或伙伴卡'}));
    }
    render();return box;
  }
  return { create, load, control, conditionFields, setKeywordParameter, keywordParameterControl, unitClassificationControl, equipControl };
})();
