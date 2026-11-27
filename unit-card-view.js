/* Presentation shared by the army builder and the play roster. */
window.UnitCardView = (() => {
  "use strict";

  const ACTION_LABEL = {action: '行动', 'double-action': '双行动',
    'free-action': '免费行动', 'free-exhaust': '免费行动：横置'};
  const node = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (text !== undefined) n.textContent = text;
    if (cls) n.className = cls;
    if (typeof text === "string" && /行动|免费(?:行动|动)/.test(text)) n.replaceChildren(actionText(text));
    return n;
  };
  // Shared by plain labels, rule text and icon substitutions; longest label wins.
  function actionText(text) {
    const out = document.createDocumentFragment();
    let pos = 0;
    for (const match of text.matchAll(/免费(?:行动|动)(?:(?:\s*[：:]\s*|并)横置)?|普通行动|双行动|行动/g)) {
      out.append(document.createTextNode(text.slice(pos, match.index)));
      const mark = document.createElement("span");
      mark.className = "action-mark";
      const type = match[0].includes('横置') ? 'free-exhaust' : match[0].startsWith('免费') ? 'free-action'
        : match[0] === '双行动' ? 'double-action' : 'action';
      mark.textContent = ACTION_LABEL[type];
      mark.dataset.action = type === 'free-action' ? 'free' : type === 'action' ? 'normal' : type;
      out.append(mark);
      pos = match.index + match[0].length;
    }
    out.append(document.createTextNode(text.slice(pos)));
    return out;
  }
  const named = (v) => (typeof v === "string" ? v : textParts(v?.zh).trim() ? v.zh : v?.en || "");
  const textParts = (v) => (Array.isArray(v) ? v : [v]).filter(Boolean).join("\n");

  const RANK_GLYPH = { 1: "5", 6: "b", 2: "6", 3: "7", 4: "8", 5: "9" };
  function setRankIcon(icon, rank) {
    icon.replaceChildren();
    if (rank === 7) icon.append(RuleIcons.icon('rank-flier'));
    else icon.textContent = RANK_GLYPH[rank] || '';
  }
  function rankIcon(rank) {
    const icon = node('span');
    icon.className = 'rank-icon';
    setRankIcon(icon, rank);
    return icon;
  }

  const TIMING_LABEL = {
    action: "行动",
    global: "全局",
    army_building: "组军",
    setup: "设置",
    deployment: "部署",
    command: "命令阶段",
    activation_start: "激活开始",
    activation: "激活",
    activation_end: "激活结束",
    movement: "移动",
    attack: "攻击",
    defense: "防御",
    end_round: "回合结束",
    unclassified: "未分类",
  };

  const svgNS = "http://www.w3.org/2000/svg";

  function uiIcon(kind, label) {
    const glyphs = { surge: "a", "surge-block": "d", hit: "h", critical: "c", block: "s" };
    if (glyphs[kind]) {
      const icon = node("span", "ui-symbol legion-symbol", glyphs[kind]);
      icon.setAttribute("role", "img");
      icon.setAttribute("aria-label", label || kind);
      return icon;
    }
    const svg = document.createElementNS(svgNS, "svg");
    svg.classList.add("ui-symbol");
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", label || kind);
    const shapes = {
      models:
        "M4 19v-6a4 4 0 0 1 8 0v6M7 5a2 2 0 1 0 4 0 2 2 0 1 0-4 0M15 8a2 2 0 1 0 4 0 2 2 0 1 0-4 0M16 12a4 4 0 0 1 4 4v3",
      wounds: "M12 20 3.7 11.7A5.2 5.2 0 0 1 12 5.5a5.2 5.2 0 0 1 8.3 6.2Z",
      courage: "m12 2 8 3v6c0 5-8 10-8 10S4 16 4 11V5Zm0 5v7m-3-3 3-4 3 4",
      speed: "m3 6 6 6-6 6m7-12 6 6-6 6m7-12 5 6-5 6",
      resilience: "m12 2 9 10-9 10-9-10Zm-5 10h10",
      trash: "M4 6h16M9 3h6l1 3M6 6l1 15h10l1-15M10 10v7m4-7v7",
      exhaust: "M5 7h14v12H5Zm3-4h11l3 3",
      expend: "M5 3h14v18H5Zm3 5 8 8m0-8-8 8",
    };
    if (shapes[kind]) {
      svg.setAttribute("viewBox", "0 0 24 24");
      const p = document.createElementNS(svgNS, "path");
      p.setAttribute("d", shapes[kind]);
      p.setAttribute("fill", "none");
      p.setAttribute("stroke", "currentColor");
      p.setAttribute("stroke-width", "1.7");
      p.setAttribute("stroke-linecap", "round");
      p.setAttribute("stroke-linejoin", "round");
      svg.append(p);
    } else if (kind === "red-defense" || kind === "white-defense") {
      svg.setAttribute("viewBox", "0 0 24 24");
      const p = document.createElementNS(svgNS, "rect");
      p.setAttribute("x", "3");
      p.setAttribute("y", "3");
      p.setAttribute("width", "18");
      p.setAttribute("height", "18");
      p.setAttribute("rx", "2");
      p.setAttribute("fill", kind === "red-defense" ? "#b04448" : "white");
      p.setAttribute("stroke", kind === "red-defense" ? "#91373b" : "#74838c");
      svg.append(p);
      const dot = document.createElementNS(svgNS, "path");
      dot.setAttribute("d", "M8 8h8v6l-4 3-4-3Z");
      dot.setAttribute("fill", kind === "red-defense" ? "white" : "#344550");
      svg.append(dot);
    } else {
      svg.setAttribute("viewBox", "0 0 24 24");
    }
    return svg;
  }

  function statMatrix(u, { showModels = false, compactDefense = false } = {}) {
    const bar = node("dl", "attribute-band");
    const s = u.stats || {};
    const fields = [
      ...(showModels ? [["人数", "models", s.models]] : []),
      ["生命", "wounds", s.wounds ?? s.woundsSymbol],
      ...(!compactDefense ? [["防御", "defense", s.defenseDie]] : []),
      s.resilience != null || s.resilienceSymbol
        ? ["韧性", "resilience", s.resilience ?? s.resilienceSymbol]
        : ["勇气", "courage", s.courage ?? s.courageSymbol],
      ["速度", "speed", s.speed],
      ["攻转", "attack", s.attackSurge],
      ["防转", "defenseSurge", s.defenseSurge ?? (compactDefense && s.defenseDie ? "none" : null)],
    ];
    for (const [label, key, value] of fields) {
      if (value == null) continue;
      const cell = node("div", "attribute"),
        dd = node("dd");
      cell.title = label;
      cell.setAttribute("aria-label", label + "：" + value);
      if (compactDefense && key === "attack") cell.dataset.attack = value;
      if (compactDefense && key === "defenseSurge" && s.defenseDie) {
        cell.dataset.defense = s.defenseDie;
        cell.title = (s.defenseDie === "red" ? "红色防御骰" : "白色防御骰") +
          (value === "none" ? " · 无防御转换" : " · 激增转格挡");
        cell.setAttribute("aria-label", cell.title);
      }
      cell.append(node("dt", null, label));
      if (key === "defense")
        dd.append(
          uiIcon(value + "-defense", value === "red" ? "红色防御骰" : "白色防御骰"),
        );
      else if (key === "attack" || key === "defenseSurge") {
        dd.append(
          uiIcon(
            key === "attack" ? "surge" : "surge-block",
            key === "attack" ? "攻击激增" : "防御激增",
          ),
        );
        dd.append(node("span", "surge-arrow", "›"));
        if (value === "none") dd.append(node("span", "no-conversion", "—"));
        else
          dd.append(uiIcon(value, { hit: "命中", critical: "暴击", block: "格挡" }[value]));
      } else {
        dd.append(
          uiIcon(key, label + (key === "wounds" ? "（每模型）" : "")),
          node("b", null, value === "dash" ? "—" : value === "x" ? "X" : value),
        );
      }
      cell.append(dd);
      bar.append(cell);
    }
    return bar;
  }

  function keywordKey(k) {
    return JSON.stringify([
      String(k.id || k.ruleId || k.raw || ""),
      k.value ?? null,
      k.parameter ?? null,
      k.parameterRefs || k.parameterRef || null,
      k.action ?? null,
      !!k.weaponSources?.length,
    ]);
  }

  function uniqueRules(ks) {
    const seen = new Set();
    return (ks || []).filter((k) => {
      const key = keywordKey(typeof k === "string" ? { id: k } : k);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function battleForceSourceLabel(source) {
    return source.ruleGroupName || source.name;
  }

  function setTagSummary(tag, toggle, body, expanded) {
    body.hidden = !expanded;
    tag.classList.toggle("open", expanded);
    toggle.textContent = expanded ? "−" : "＋";
    toggle.setAttribute("aria-label", (expanded ? "收起" : "展开") + toggle.dataset.ruleLabel + "释义");
    toggle.setAttribute("aria-expanded", String(expanded));
  }

  function timingMarkers(timings) {
    const markers = node("span", "timing-markers");
    const list = [...new Set(timings?.length ? timings : ["unclassified"])];
    markers.title = list.map((t) => TIMING_LABEL[t] || t).join(" / ");
    markers.setAttribute("aria-label", "时机：" + markers.title);
    for (const t of list) {
      const mark = node("span", "timing-mark", TIMING_LABEL[t] || t);
      mark.textContent = TIMING_LABEL[t] || t;
      mark.dataset.timing = t;
      markers.append(mark);
    }
    return markers;
  }

  function faceLabel(card) {
    return {front: "正面", back: "反面", both: "双面"}[card._face || "front"];
  }

  function originLabel(card) {
    return named(card.name) + (UpgradeFaces.isDual(card) ? " · " + faceLabel(card) : "");
  }

  function slotDefinition(key, data) {
    if (key?.startsWith("special:")) {
      const card = data.upgrades[key.slice(8)];
      return {name: {zh: named(card?.name)}, iconGlyph: "+"};
    }
    const slot = (data.pkg.slots || []).find(entry => entry.id === key);
    if (!slot) return null;
    return (data.defs.upgradeSlots || []).find(entry => entry.id === slot.sourceId) || slot;
  }

  function slotName(key, data) {
    return key === "heavy_weapon" ? "重武" : slotDefinition(key, data)?.name?.zh || key;
  }

  function create({getData, openRule, cardView = {tags: new Set()}}) {
    function ruleInfo(k) {
      const data = getData();
      const item = typeof k === "string" ? { id: k } : k;
      if (item._actionUpgrade) {
        const c = item._actionUpgrade;
        return {item, label: named(c.name), ref: {name: c.name, timing: ['action'],
          summary: textParts(named(c.description))}};
      }
      const ref = item._entry || data.defs.keywords.find(ref => String(ref.id) === String(item.id));
      if (!ref)
        return { item, ref: null, label: String(item.label || item.raw || item.id || "") };
      let label = named(ref.name);
      if (item.value != null)
        label = label.includes("X")
          ? label.replaceAll("X", String(item.value))
          : label + " " + item.value;
      const targets = item.parameterRefs || (item.parameterRef ? [item.parameterRef] : []);
      const targetLabel = targets.map(ref => {
        if (ref.kind === 'unit') {
          const unit = data.units[ref.id];
          return unit ? [named(unit.name), named(unit.title)].filter(Boolean).join(' · ') : ref.id;
        }
        if (ref.kind === 'nameIdentity') return named(Object.values(data.units).find(u => u.nameIdentityId === ref.id)?.name) || ref.id;
        const table = {unitCategory: 'unitCategories', unitSubtype: 'unitSubtypes', unitType: 'unitTypes', rank: 'ranks'}[ref.kind];
        return named(data.defs[table]?.find(t => t.id === ref.id)?.name) || ref.id;
      }).join(' 或 ');
      if (targetLabel || item.parameter) label = label.split(/[：:]/)[0] + "：" + (targetLabel || item.parameter);
      return { item, ref, label };
    }

    function proseNode(raw) {
      return RuleIcons.prose(raw, getData().defs, actionText);
    }

    function unitKeywords(unit, equipped) {
      const map = new Map();
      const add = (k, origin, weaponName) => {
        if (!k) return;
        const item = typeof k === "string" ? { id: k } : { ...k };
        if (weaponName) item.weaponSources = [weaponName];
        const key = keywordKey(item);
        if (!map.has(key)) map.set(key, { ...item, origins: [] });
        const current = map.get(key);
        if (weaponName && !current.weaponSources.includes(weaponName))
          current.weaponSources.push(weaponName);
        if (item._battleForceSources?.length) {
          const sources=new Map([...(current._battleForceSources || []),...item._battleForceSources].map(s=>[JSON.stringify([s.id,s.ruleGroupId]),s]));
          current._battleForceSources=[...sources.values()];
        }
        if (origin && !current.origins.some((x) => x.id === origin.id && x._face === origin._face))
          current.origins.push(origin);
      };
      for (const k of cardKeywords(unit)) add(k, null);
      for (const {card: c, choiceId} of equipped) {
        for (const k of cardKeywords(c)) add(k, c);
        for (const weapon of c.weapons || []) {
          const name = named(weapon.name) || "未命名武器";
          for (const k of weapon.keywords || []) add(k, null, name);
        }
        if (c.actionTypes?.length) map.set('upgrade:' + choiceId + ':' + c._face, {
          id: 'upgrade-action:' + choiceId + ':' + c._face, actionTypes: c.actionTypes, _actionUpgrade: c,
        });
      }
      return [...map.values()];
    }

    function cardKeywords(card) {
      if (!card) return [];
      const data = getData();
      const keywords = card.keywords || [];
      const equip = keywords.filter(k => (typeof k === 'string' ? k : k?.id) === 'equip');
      if (!equip.length && !card.equipUpgradeIds?.length && !card.equipSlotIds?.length) return keywords;
      const labels = [];
      const add = name => {if (name && !labels.includes(name)) labels.push(name);};
      for (const id of card.equipUpgradeIds || []) {
        const target = data.upgrades[id];
        add(target ? named(BuilderModel.upgradePresentation(target, data, card).name) : id);
      }
      for (const id of RulesCore.equipSlotKeys(card, data.pkg)) add(slotName(id, data));
      const linked = Array.isArray(card.equipUpgradeIds) || Array.isArray(card.equipSlotIds);
      if (!linked) for (const keyword of equip) {
        const refs = keyword.parameterRefs || (keyword.parameterRef ? [keyword.parameterRef] : []);
        for (const ref of refs) {
          if (ref.kind === 'unit') add(named(data.units[ref.id]?.name) || ref.id);
          if (ref.kind === 'upgrade') add(named(data.upgrades[ref.id]?.name) || ref.id);
        }
        if (refs.length || labels.length) continue;
        // Legacy text is only translated through exact catalog names. Canonical
        // Equip IDs above take precedence over stale or incomplete OCR parameters.
        const norm = value => String(value || '').trim().toLocaleLowerCase();
        for (const part of String(keyword.parameter || '').split(/[,，、;；]+/).filter(s => s.trim())) {
          const target = [...Object.values(data.upgrades), ...Object.values(data.units)]
            .find(c => [c.id, c.name?.en, c.name?.zh].some(n => n && norm(n) === norm(part)));
          add(target ? named(target.name) : part.trim());
        }
      }
      const other = keywords.filter(k => (typeof k === 'string' ? k : k?.id) !== 'equip');
      if (labels.length || equip.length) other.push({id: 'equip', parameter: labels.join('、') || null});
      return other;
    }

    function tag(k, {
      forceOpen = false, timing = false, showOrigin = true, showBattleForceOrigin = true, summaryView = null,
    } = {}) {
      const info = ruleInfo(k);
      const key = JSON.stringify([keywordKey(info.item), (k.origins || []).map((c) => c.id), k.weaponSources || []]);
      const outer = node("span", "rule-tag");
      outer.dataset.ruleId = info.item.id;
      outer.dataset.ruleKey = key;
      const main = node("button", "rule-tag-main");
      main.type = "button";
      const actions = BuilderModel.keywordActionTypes(info.item, getData().defs);
      if (timing) main.append(timingMarkers(ruleTimings(k)));
      // A generic keyword may have several printed variants. Show only a known
      // per-card type here, never imply that one ability has several costs.
      const sourceTypes = [...new Set((k.origins || []).flatMap(c => c.actionTypes || []))];
      const printedTypes = ACTION_LABEL[info.item.action] || info.item.actionTypes ? actions
        : sourceTypes.length === 1 && actions.length ? sourceTypes : actions.length === 1 ? actions : [];
      if (printedTypes.length) {
        const badge = node('span', 'rule-action');
        badge.textContent = printedTypes.map(t => ACTION_LABEL[t]).join(' / ');
        main.append(badge);
      }
      main.append(actionText(info.label));
      const origins = [
        ...(showOrigin ? (k.origins || []).map(originLabel) : []),
        ...(showOrigin ? k.weaponSources || [] : []),
        ...(showBattleForceOrigin ? (k._battleForceSources || []).map(battleForceSourceLabel) : []),
      ];
      if (origins.length)
        main.append(
          node(
            "small",
            "rule-origin",
            [...new Set(origins)].map(name=>"来自 " + name).join(" / "),
          ),
        );
      main.setAttribute("aria-haspopup", "dialog");
      main.onclick = (e) => {
        e.stopPropagation();
        openRule(k, main);
      };
      outer.append(main);
      const summary = info.ref?.summary || "";
      if (summary) {
        const toggle = node("button", "rule-tag-toggle");
        toggle.type = "button";
        toggle.dataset.ruleLabel = info.label;
        const expanded = summaryView
          ? summaryView.open !== summaryView.overrides.has(key)
          : forceOpen || cardView.explanations || cardView.tags.has(key);
        const body = node("span", "tag-summary");
        body.append(proseNode(summary));
        setTagSummary(outer, toggle, body, expanded);
        toggle.onclick = (e) => {
          e.stopPropagation();
          const next = body.hidden;
          setTagSummary(outer, toggle, body, next);
          const overrides = summaryView ? summaryView.overrides : cardView.tags;
          if (next !== (summaryView?.open ?? false)) overrides.add(key);
          else overrides.delete(key);
        };
        outer.append(toggle, body);
      }
      return outer;
    }

    function ruleTimings(k) {
      return BuilderModel.keywordActionTypes(k, getData().defs).length ? ['action'] : ruleInfo(k).ref?.timing || [];
    }
    function phaseRules(ks, forceOpen = false, { hideArmyBuilding = false } = {}) {
      const list = node("div", "phase-rules");
      const order = Object.keys(TIMING_LABEL),
        groups = new Map();
      for (const k of uniqueRules(ks)) {
        const timings = [...new Set(ruleTimings(k).filter(Boolean))];
        for (const timing of timings.length ? timings : ['unclassified']) {
          if (!groups.has(timing)) groups.set(timing, []);
          groups.get(timing).push(k);
        }
      }
      for (const [key, entries] of [...groups].sort(
        (a, b) => order.indexOf(a[0]) - order.indexOf(b[0]),
      )) {
        if (hideArmyBuilding && key === 'army_building') continue;
        const row = node("div", "phase-row");
        row.dataset.phase = key;
        const label = node("div", "phase-title");
        label.append(node("span", "phase-name", TIMING_LABEL[key] || key));
        const tags = node("div", "phase-tags");
        for (const k of entries) tags.append(tag(k, { forceOpen }));
        row.append(label, tags);
        list.append(row);
      }
      return list;
    }

    function dicePool(d) {
      const box = node("span", "attack-pool");
      for (const color of ["red", "black", "white"]) {
        const v = d?.[color];
        if (v == null || v === 0) continue;
        const part = node("span", "die-value");
        const label =
          (v < 0 ? "X" : v) + { red: "红", black: "黑", white: "白" }[color] + "骰";
        part.setAttribute("aria-label", label);
        part.append(node("i", "die " + color), node("b", null, v < 0 ? "X" : v));
        box.append(part);
      }
      return box;
    }

    function weaponBlock(w, origin, { forceOpen = false, timing = false, summaryView = null } = {}) {
      const card = node("div", "weapon-card"),
        head = node("div", "weapon-card-head");
      const name = node("div", "weapon-title");
      name.append(node("b", null, named(w.name)));
      if (w.name?.zh && w.name?.en && w.name.zh !== w.name.en)
        name.append(node("span", "weapon-english", w.name.en));
      if (origin) name.append(node("small", "weapon-origin", "来自 " + originLabel(origin)));
      if (origin?._face) card.dataset.face = origin._face;
      head.append(name);
      const r = w.range;
      if (r?.min != null) {
        const kind = r.min < 0 ? "overrun" : r.min === 0 ? (r.max === 0 ? "melee" : "mixed") : "ranged";
        const range = node("span", "range-pill " + kind);
        range.append(
          node(
            "small",
            null,
            kind === "overrun" ? "碾压" : kind === "melee" ? "近战" : kind === "mixed" ? "近 / 远" : "远程",
          ),
          node("b", null, kind === "overrun" ? "" : r.max == null || r.min === r.max ? r.min : r.min + "–" + r.max),
        );
        head.append(range);
      }
      head.append(dicePool(w.dice));
      card.append(head);
      if (w.keywords?.length) {
        const ks = node("div", "weapon-tags");
        for (const k of uniqueRules(w.keywords))
          ks.append(tag(k, { forceOpen, timing, summaryView, showOrigin: false, showBattleForceOrigin: false }));
        card.append(ks);
      }
      if (Object.values(w.dice || {}).some((v) => v < 0) && origin) {
        const p = node("p", "variable-dice-note");
        p.append(proseNode(textParts(named(origin.description))));
        card.append(p);
      }
      return card;
    }

    function unitWeaponGroups(unit, equipped, options = {}) {
      const list = [
        ...(unit?.weapons || []).map(w => ({w, origin: null})),
        ...equipped.flatMap(({card}) => (card.weapons || []).map(w => ({w, origin: card})))
      ];
      const out = node("div", "weapon-groups");
      for (const [key, label, test] of [
        ["melee", "近战可用武器", (w) => w.range?.min === 0],
        ["ranged", "远程武器", (w) => w.range?.min > 0],
        ["overrun", "碾压武器", (w) => w.range?.min < 0],
        ["unknown", "射程待确认", (w) => w.range?.min == null],
      ]) {
        const found = list.filter((x) => test(x.w));
        if (!found.length) continue;
        const group = node("section", "weapon-group " + key);
        group.append(node("h4", null, label));
        for (const { w, origin } of found)
          group.append(weaponBlock(w, origin, options));
        out.append(group);
      }
      return out;
    }

    function unitContents(unit, equipped, {forceOpen = false, hideArmyBuilding = false} = {}) {
      const out = node("div", "unit-expanded");
      const phases = phaseRules(unitKeywords(unit, equipped), forceOpen, {hideArmyBuilding});
      if (phases.childElementCount) out.append(phases);
      out.append(unitWeaponGroups(unit, equipped, {forceOpen}));
      return out;
    }

    function upgradeEffect(c) {
      const effect = node("div", "upgrade-effect");
      const description = textParts(named(c.description));
      if (description) effect.append(proseNode(description));
      if (c.counterpart) {
        const heading = node("p", "counterpart-heading", "伙伴单位 · " + named(c.counterpart.name));
        const stats = c.counterpart.stats;
        if (stats?.wounds != null) heading.append(node("span", null, "生命 " + stats.wounds));
        effect.append(heading);
        for (const k of uniqueRules(cardKeywords(c.counterpart))) {
          const { ref, label } = ruleInfo(k);
          const text = ref?.summary || ref?.full;
          if (!text) continue;
          const row = node("p", "counterpart-effect-rule");
          row.append(node("strong", null, label + "："), proseNode(text));
          effect.append(row);
        }
      }
      return effect;
    }

    function usageBadges(c) {
      const wrap = node("span", "usage-flags");
      const raw = textParts(c.description?.en),
        zh = textParts(c.description?.zh);
      const one =
        /\{@icon\.expend\}\s*this\s*card/i.test(raw) ||
        (!raw && /\{@icon\.expend\}\s*(?:此卡|这张卡)/.test(zh));
      const exhaust =
        /\{@icon\.exhaust\}\s*this\s*card/i.test(raw) ||
        (!raw && /\{@icon\.exhaust\}\s*(?:此卡|这张卡)/.test(zh)) ||
        /\{@icon\.free-exhaust\}/.test(raw);
      if (one) {
        const b = node("span", "usage-flag", "一次性");
        b.prepend(uiIcon("expend", "一次性消耗"));
        wrap.append(b);
      } else if (exhaust) {
        const b = node("span", "usage-flag", "可横置");
        b.prepend(uiIcon("exhaust", "横置使用"));
        wrap.append(b);
      }
      return wrap;
    }

    function upgradeEntry(c, {forceOpen, compact, facePart, art, faceControl, actions, showWeapons} = {}) {
      const box = node("article", "upgrade-detail");
      if (c._choiceId) box.dataset.choiceId = c._choiceId;
      const body = node("div", "upgrade-body");
      box.classList.toggle("has-upgrade-art", !!art && !art.disabled);
      const h = node("div", "upgrade-line");
      h.append(node("b", null, named(c.name)));
      if (c.name?.zh && c.name.en && c.name.zh !== c.name.en)
        h.append(node("span", "upgrade-english", c.name.en));
      h.append(usageBadges(c));
      if (facePart) h.append(node('span', 'face-badge', faceLabel(c)));
      else if (faceControl) h.append(faceControl);
      if (actions) h.append(actions);
      body.append(h);
      const effect = upgradeEffect(c);
      if (effect.childNodes.length) body.append(effect);
      if (!compact) {
        const req = textParts(
          c.restrictions?.text?.zh || c.requirementsText || c.restrictions?.text?.en,
        );
        if (req) {
          const p = node("div", "upgrade-requirements", "使用要求：");
          p.append(proseNode(req));
          body.append(p);
        }
      }
      const footer = node("div", "upgrade-tags");
      for (const k of uniqueRules(cardKeywords(c)))
        footer.append(
          tag({ ...(typeof k === "string" ? { id: k } : k), origins: [c] }, { forceOpen, showOrigin: false }),
        );
      if (c.weapons?.length && showWeapons) {
        const b = node(
          "button",
          "weapon-inspect",
          "查看武器属性 · " + c.weapons.map((w) => named(w.name)).join(" / "),
        );
        b.onclick = (e) => {
          e.stopPropagation();
          showWeapons(b);
        };
        body.append(b);
      }
      box.append(body);
      if (art) box.append(art);
      if (footer.children.length) box.append(footer);
      return box;
    }

    function unitHeader(unit, {rank, points, quantity = 1, art, detail, showModels = !detail, controls, setNameTone}) {
      const data = getData();
      const header = node("div", detail ? "unit-brief detail-brief" : "unit-brief");
      if (art) header.append(art);
      else header.classList.add("without-thumbnail");
      const body = node("div", "brief-body"),
        first = node("div", "brief-first"),
        name = node("div", "bilingual-name" + (detail ? "" : " candidate-unit-name roster-name-band"));
      if (!detail) setNameTone(name, unit);
      name.append(node("b", null, named(unit.name)));
      if (unit.name?.zh && unit.name.en && unit.name.en !== unit.name.zh)
        name.append(node("span", null, unit.name.en));
      first.append(name, statMatrix(unit, {showModels}));
      const second = node("div", "brief-meta");
      second.append(rankIcon(rank));
      second.append(
        node(
          "span",
          "rank-label-inline",
          [
            named(data.defs.ranks.find((r) => r.id === rank)?.name),
            named(data.defs.unitTypes.find((t) => t.id === unit.unitTypeId)?.name),
          ]
            .filter(Boolean)
            .join(" / "),
        ),
      );
      if (named(unit.title)) {
        const title = node("span", "bilingual-title", named(unit.title));
        if (unit.title.zh && unit.title.en && unit.title.en !== unit.title.zh)
          title.append(node("span", null, unit.title.en));
        second.append(title);
      }
      body.append(first, second);
      header.append(body);
      const cost = node("div", "brief-cost"),
        single = points;
      if (single != null) {
        cost.append(node("b", null, single * quantity), node("small", null, "分"));
        if (quantity > 1) cost.append(node("span", null, single + " × " + quantity));
      }
      if (controls) {
        const end = node("div", "brief-end");
        end.append(cost, controls);
        first.append(end);
      } else first.append(cost);
      return header;
    }

    function renderRulePopover(rulePop, k, onClose, onChange = () => {}) {
      const { ref, label } = ruleInfo(k);
      rulePop.replaceChildren();
      rulePop.setAttribute('aria-label', '词条规则');
      const header = node("div", "popover-heading");
      const title = node("div");
      title.append(node("h3", null, label));
      if (ref?.name?.en) title.append(node("span", "popover-english", ref.name.en));
      const close = node("button", null, "×");
      close.setAttribute("aria-label", "关闭词条");
      close.onclick = onClose;
      header.append(title, close);
      rulePop.append(
        header,
        node(
          "p",
          "popover-timing",
          ruleTimings(k).map((t) => TIMING_LABEL[t] || t).join(" / "),
        ),
      );
      for (const weapon of k.weaponSources || [])
        rulePop.append(node("p", "rule-origin", "来自 " + weapon));
      for (const source of k._battleForceSources || []) rulePop.append(node('p','rule-origin','来自 '+battleForceSourceLabel(source)));
      const tabs = node("div", "rule-tabs");
      tabs.setAttribute("role", "tablist");
      tabs.setAttribute("aria-label", "词条说明长度");
      const panel = node("section", "popover-rule");
      panel.id = "rule-text-panel";
      panel.setAttribute("role", "tabpanel");
      panel.tabIndex = 0;
      const content = node("div");
      panel.append(content);
      const buttons = [];
      for (const [key, title, text] of [["summary", "简写", ref?.summary], ["full", "完整规则", ref?.full]]) {
        const button = node("button", null, title);
        button.id = "rule-tab-" + key;
        button.setAttribute("role", "tab");
        button.setAttribute("aria-controls", panel.id);
        button.onclick = () => {
          for (const tab of buttons) {
            tab.setAttribute("aria-selected", String(tab === button));
            tab.tabIndex = tab === button ? 0 : -1;
          }
          panel.setAttribute("aria-labelledby", button.id);
          content.replaceChildren(proseNode(text || (key === "summary" && ref?.full
            ? "暂无简写，可切换完整规则。" : "现有资料没有关联释义。")));
          if (!rulePop.hidden) onChange();
        };
        button.onkeydown = (e) => {
          if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
          e.preventDefault();
          const next = e.key === "Home" ? buttons[0] : e.key === "End" ? buttons[1] : buttons.find((b) => b !== button);
          next.click(); next.focus({preventScroll: true});
        };
        buttons.push(button);
        tabs.append(button);
      }
      buttons[0].click();
      rulePop.append(tabs, panel);
      return close;
    }

    return {ruleInfo, proseNode, cardKeywords, unitKeywords, tag, ruleTimings, phaseRules,
      unitWeaponGroups, unitContents, weaponBlock, upgradeEntry, upgradeEffect, usageBadges, unitHeader, renderRulePopover};
  }

  return {create, node, named, textParts, actionText, ACTION_LABEL, TIMING_LABEL, setRankIcon, rankIcon, slotDefinition, slotName,
    uiIcon, statMatrix, uniqueRules, battleForceSourceLabel, setTagSummary, timingMarkers, faceLabel, originLabel};
})();
