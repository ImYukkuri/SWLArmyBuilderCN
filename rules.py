"""Semantic list-building rule engine (upstream-free).

Pure functions only: no network, no DOM, no file writes. All machine rules are
read from our own data files (data/upgrades.json, data/units.json,
data/slot-rules.json, data/catalog-definitions.json). The upstream legion.json
snapshot is a development-time source only and is not loaded at runtime.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

from dice_enums import (
    AttackDieColor,
    AttackDieFace,
    DefenseDieColor,
    DefenseDieFace,
    DICE as DICE_ENUMS,
)

ROOT = Path(__file__).resolve().parent

_UNKNOWN = object()


def _read(name: str):
    return json.loads((ROOT / name).read_bytes())


def load_package():
    return _read("data/slot-rules.json")


def load_cards():
    units = {u["id"]: u for u in _read("data/units.json")["units"]}
    upgrades = {c["id"]: c for c in _read("data/upgrades.json")["cards"]}
    definitions = _read("data/catalog-definitions.json")
    return units, upgrades, definitions


def _resolve(ctx: dict, field: str):
    node = ctx
    for part in str(field).split("."):
        if not isinstance(node, dict) or part not in node:
            return _UNKNOWN
        node = node[part]
    return node


def evaluate(cond, ctx: dict, predicates: dict | None = None):
    """Three-valued condition evaluation (True / False / None)."""
    if not isinstance(cond, dict):
        return None
    if "ref" in cond:
        if predicates and cond.get("ref") in predicates:
            return evaluate(predicates[cond["ref"]], ctx, predicates)
        return None
    if "all" in cond:
        out = True
        for c in cond["all"]:
            r = evaluate(c, ctx, predicates)
            if r is False:
                return False
            if r is None:
                out = None
        return out
    if "any" in cond:
        out = False
        for c in cond["any"]:
            r = evaluate(c, ctx, predicates)
            if r is True:
                return True
            if r is None:
                out = None
        return out
    if "not" in cond:
        r = evaluate(cond["not"], ctx, predicates)
        return None if r is None else not r
    if "field" in cond:
        actual = _resolve(ctx, cond["field"])
        if actual is _UNKNOWN:
            return None
        op = cond.get("op", "eq")
        value = cond.get("value")
        try:
            if op == "eq":
                return actual == value
            if op == "in":
                return actual in value
            if op == "contains":
                return any(str(x) == str(value) for x in actual) if isinstance(actual, list) else None
            if op == "gte":
                return actual >= value
            if op == "lte":
                return actual <= value
        except (TypeError, ValueError):
            return None
        return None
    return None


def slot_registry(package):
    by_id = {}
    by_source = {}
    for s in package.get("slots", []):
        by_id[s["id"]] = s
        by_source[str(s.get("sourceId"))] = s
    return by_id, by_source


def slot_key(package, source_id):
    _, by_source = slot_registry(package)
    slot = by_source.get(str(source_id))
    return slot["id"] if slot else f"unknown_source_slot_{source_id}"


def access_keys(card, package, upgrade_rule=None):
    if upgrade_rule and upgrade_rule.get("access"):
        return [a.get("slot") for a in upgrade_rule["access"] if a.get("slot")]
    return list(dict.fromkeys(slot_key(package, sid) for sid in (card.get("slotIds") or [])))


def _unit_context(unit, package):
    return {
        "unit": {
            "id": unit.get("id"),
            "upstreamId": str(unit.get("upstream", {}).get("id", "")),
            "unitTypeId": unit.get("unitTypeId"),
            "defenseDie": (unit.get("stats") or {}).get("defenseDie"),
            "factionId": unit.get("factionId"),
            "rankId": unit.get("rankId"),
            "affiliationIds": [str(a) for a in (unit.get("affiliationIds") or [])],
            "keywords": [k.get("id") for k in unit.get("keywords", []) if isinstance(k, dict)],
        }
    }


def slot_grants_for(package, unit, inst, upgrades):
    """All slot grants that apply to this instance.

    Card-level rules.slotGrants entries carry a trigger:
      * equipped      -> applies while the card is carried
      * unitQualifies -> applies when the unit meets the grant condition
    """
    ctx = _unit_context(unit, package)
    predicates = package.get("predicates") or {}
    equipped_grants = []
    for sel in (inst.get("upgrades") if inst else []) or []:
        card = upgrades.get(sel.get("upgradeId"))
        if not card:
            continue
        for grant in (card.get("rules") or {}).get("slotGrants") or []:
            if not isinstance(grant, dict) or grant.get("trigger") != "equipped" or not grant.get("slot"):
                continue
            if grant.get("when") is not None and evaluate(grant["when"], ctx, predicates) is not True:
                continue
            equipped_grants.append({"key": grant["slot"], "addedBy": card.get("id")})
    qualify_grants = []
    uid = str(unit.get("upstream", {}).get("id", ""))
    for card_id in sorted(upgrades):
        for grant in (upgrades[card_id].get("rules") or {}).get("slotGrants") or []:
            if not isinstance(grant, dict) or grant.get("trigger") != "unitQualifies" or not grant.get("slot"):
                continue
            if grant.get("condition") is not None:
                ok = evaluate(grant["condition"], ctx, predicates) is True
            else:
                ok = uid in [str(h) for h in (grant.get("holders") or [])]
            if ok:
                qualify_grants.append({"key": grant["slot"], "ifAbsentAny": grant.get("ifAbsentAny")})
    return equipped_grants, qualify_grants


def dedicated_slot_keys(package, unit, upgrades=None):
    if upgrades is None:
        upgrades = {c["id"]: c for c in _read("data/upgrades.json")["cards"]}
    return slot_grants_for(package, unit, None, upgrades)[1]


def slot_list_for(package, unit, inst, upgrades):
    out = []
    by_id, _ = slot_registry(package)
    for sid in unit.get("upgradeSlots") or []:
        raw = sid.get("id") if isinstance(sid, dict) else sid
        key = slot_key(package, raw)
        if by_id.get(key, {}).get("kind") == "dedicated":
            continue  # printed dedicated slots are replaced by the shared exempt grants
        out.append({"key": key, "required": bool(sid.get("required")) if isinstance(sid, dict) else False})
    equipped_grants, qualify_grants = slot_grants_for(package, unit, inst, upgrades)
    out.extend(equipped_grants)
    for g in qualify_grants:
        if any(r["key"] == g["key"] for r in out):
            continue
        if g.get("ifAbsentAny") and any(r["key"] in g["ifAbsentAny"] for r in out):
            continue
        out.append({"key": g["key"], "required": False, "virtual": True})
    return out


def unit_divisions(unit):
    return [str(d) for d in (unit.get("divisions") or [])]


def upstream_hosts(upgrade_rule, card):
    if upgrade_rule and upgrade_rule.get("host"):
        return [str(h) for h in upgrade_rule["host"]]
    local = (card.get("rules") or {}).get("availableIn")
    if local:
        return [str(h) for h in local]
    return None


def _normalize_key(value):
    import re
    return re.sub(r"[^a-z0-9]", "", str(value).lower())


def build_name_index(upgrades, definitions):
    idx = {}

    def add(key, uid):
        if key is None or key == "":
            return
        k = _normalize_key(key)
        if not k:
            return
        idx.setdefault(k, set()).add(str(uid))

    for card in (upgrades or {}).values():
        uid = str((card.get("upstream") or {}).get("id", ""))
        if not uid:
            continue
        add(card.get("id"), uid)
        add((card.get("name") or {}).get("en", ""), uid)
    for u in (definitions or {}).get("upgrades", []) or []:
        add(u.get("id"), u.get("name", {}).get("en") if isinstance(u.get("name"), dict) else None)
        add((u.get("name") or {}).get("en", ""), u.get("id"))
    return idx


def unavailable_sets(card, idx, definitions):
    up = set()
    fac = set()
    own = str((card.get("upstream") or {}).get("id", ""))
    own_aliases = {_normalize_key(card.get("id")), _normalize_key((card.get("name") or {}).get("en", ""))}
    du = next((x for x in (definitions or {}).get("upgrades", []) or [] if str(x.get("id")) == own), None)
    if du and du.get("name"):
        own_aliases.add(_normalize_key(du["name"].get("en")))
    for item in ((card.get("rules") or {}).get("unavailableWithIds") or []):
        if isinstance(item, dict):
            if item.get("propertyName") == "upgrades":
                up.add(str(item["id"]))
            elif item.get("propertyName") == "factions":
                fac.add(int(item["id"]))
        elif isinstance(item, str):
            k = _normalize_key(item)
            if k in own_aliases:
                continue  # self-name: already enforced via unique-by-name
            for uid in (idx or {}).get(k, set()):
                if uid != own:
                    up.add(uid)
    return {"up": up, "fac": fac}


def _norm_rp(rp):
    if not rp:
        return None
    if isinstance(rp, list) and rp and isinstance(rp[0], list):
        return rp
    return [rp]


def _required_properties_ok(unit, rp, definitions):
    groups = _norm_rp(rp)
    if groups is None:
        return True
    kw_map = {}
    for k in definitions.get("keywords", []):
        for uid in k.get("upstreamIds") or []:
            kw_map[str(uid)] = k["id"]
    ut_map = {1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: "local:wookiee_trooper", 9: 9}
    unit_kw = {k.get("id") for k in unit.get("keywords", []) if isinstance(k, dict)}
    affiliation = {str(a) for a in unit.get("affiliationIds") or []}
    for group in groups:
        ok = True
        for atom in group:
            if not isinstance(atom, dict):
                continue
            prop = atom.get("property")
            v = atom.get("value")
            vlist = v if isinstance(v, list) else [v]
            if prop == "faction":
                if unit.get("factionId") not in vlist:
                    ok = False
            elif prop == "unitType":
                local = [ut_map.get(x, x) for x in vlist]
                if unit.get("unitTypeId") not in local:
                    ok = False
            elif prop == "affiliation":
                if not any(str(x) in affiliation for x in vlist):
                    ok = False
            elif prop == "keywords":
                local = [kw_map.get(str(x)) for x in vlist if kw_map.get(str(x))]
                if not any(k in unit_kw for k in local):
                    ok = False
        if ok:
            return True
    return False


def normalize_name(value):
    return re.sub(r"[^a-z0-9]", "", str(value or "").lower())


def entourage_exemptions(army_units, units):
    """ENTOURAGE: each entourage unit lets one copy of the named unit skip the rank maximum."""
    grants = {}
    for inst in army_units:
        u = units.get(inst.get("unitId")) or {}
        for kw in u.get("keywords") or []:
            if kw.get("id") == "entourage" and kw.get("parameter"):
                key = normalize_name(kw["parameter"])
                if key:
                    grants[key] = grants.get(key, 0) + 1
    exempt = {}
    for inst in army_units:
        u = units.get(inst.get("unitId")) or {}
        n = grants.get(normalize_name((u.get("name") or {}).get("en") or ""), 0)
        if n <= 0:
            continue
        uid = str(u.get("upstream", {}).get("id", ""))
        exempt[uid] = min(exempt.get(uid, 0) + 1, n)
    return exempt


def keyword_map(definitions):
    m = {}
    for k in definitions.get("keywords", []):
        for uid in k.get("upstreamIds") or []:
            m[str(uid)] = k["id"]
    return m


def apply_property_effects(unit, cards, definitions):
    """Apply addProperties / replaceProperties of the equipped cards to a unit copy."""
    if not cards:
        return unit
    kw = keyword_map(definitions)
    keywords = {k.get("id") for k in (unit.get("keywords") or []) if isinstance(k, dict)}
    affiliations = [str(a) for a in (unit.get("affiliationIds") or [])]
    for card in cards:
        r = (card or {}).get("rules") or {}
        for group in r.get("addProperties") or []:
            for atom in group:
                if not isinstance(atom, dict):
                    continue
                vals = atom.get("value") if isinstance(atom.get("value"), list) else [atom.get("value")]
                if atom.get("property") == "keywords":
                    for v in vals:
                        keywords.add(kw.get(str(v), str(v)))
                elif atom.get("property") == "affiliation":
                    for v in vals:
                        if str(v) not in affiliations:
                            affiliations.append(str(v))
        for group in r.get("replaceProperties") or []:
            for atom in group:
                if not isinstance(atom, dict):
                    continue
                vals = atom.get("value") if isinstance(atom.get("value"), list) else [atom.get("value")]
                if atom.get("property") == "affiliation":
                    affiliations = [str(v) for v in vals]
                elif atom.get("property") == "keywords":
                    keywords = {kw.get(str(v), str(v)) for v in vals}
    out = dict(unit)
    out["keywords"] = [{"id": k} for k in keywords]
    out["affiliationIds"] = affiliations
    return out


def upgrade_eligibility(card, unit, army, package, definitions, name_index, equipped=None):
    """Single source of truth for card-vs-unit eligibility.

    Used by full army validation (S1), candidate filtering (S2/S8) so the two
    can never drift apart."""
    if card.get("deprecated"):
        return [("invalid", "deprecated_card", "该卡为废案，不参与组军")]
    if equipped:
        unit = apply_property_effects(unit, equipped, definitions)
    rule = (package.get("upgradeRules") or {}).get(str((card.get("upstream") or {}).get("id", "")), {})
    name = (card.get("name") or {}).get("en") or card.get("id")
    memberships = [m for m in unit.get("factions", []) if m.get("id") == army.get("armyId")]
    out = []
    hosts = upstream_hosts(rule, card)
    if hosts is not None and str(unit.get("upstream", {}).get("id", "")) not in hosts:
        out.append(("invalid", "host_restriction", "此升级仅限特定角色/版本"))
    facs = (card.get("rules") or {}).get("factions")
    if facs and army.get("armyId") not in [int(f) for f in facs]:
        out.append(("invalid", "upgrade_faction", f"升级「{name}」不属于当前军队/战斗部队"))
    if army.get("armyId") in unavailable_sets(card, name_index, definitions)["fac"]:
        out.append(("invalid", "unavailable_faction", f"升级「{name}」无法加入当前军队/战斗部队"))
    rp = (card.get("rules") or {}).get("requiredProperties")
    if rp and not _required_properties_ok(unit, rp, definitions):
        out.append(("invalid", "required_properties", f"升级「{name}」不满足适用条件（阵营/类型/词条）"))
    rc = (card.get("restrictions") or {}).get("condition")
    if rc is not None:
        rc_ok = evaluate(rc, _unit_context(unit, package), package.get("predicates") or {})
        if rc_ok is False:
            out.append(("invalid", "restriction_condition", f"升级「{name}」不满足卡面限制条件"))
        elif rc_ok is None:
            out.append(("unknown", "restriction_condition_unknown", f"升级「{name}」的卡面限制条件存在未覆盖语义"))
    divs = (card.get("rules") or {}).get("requiredDivisions")
    if divs:
        ud = unit_divisions(unit)
        if ud and not any(d in ud for d in divs):
            out.append(("invalid", "division_restriction", f"升级「{name}」仅限{'/'.join(divs)}阵营"))
    req_tier = (card.get("rules") or {}).get("requiresTier")
    if req_tier:
        host_rank = memberships[0].get("rankId") if memberships else None
        if host_rank is None or int(host_rank) not in [int(t) for t in req_tier]:
            out.append(("invalid", "requires_tier", f"升级「{name}」要求母单位军阶为 {'/'.join(str(t) for t in req_tier)}，当前为 {'无' if host_rank is None else host_rank}"))
    return out


def validate_army(army):
    package = load_package()
    units, upgrades, definitions = load_cards()

    issues = []
    base_points = 0
    seen = []
    sel = []
    name_index = build_name_index(upgrades, definitions)

    def issue(status, code, message, instance):
        issues.append({"status": status, "code": code, "message": message, "instanceId": instance})

    mode = package.get("modes", {}).get(army.get("mode", "standard"), {})
    battle_force = (package.get("battleForces") or {}).get(str(army.get("armyId")))
    if battle_force:
        bf_mode = (battle_force.get("modes") or {}).get(army.get("mode", "standard"), {})
        mode = {**mode, **bf_mode}
        issue("unknown", "battle_force_rules",
              "战斗部队规则仍未完整实现（textRules / machineRules / options 未求值）", None)
    points_limit = army.get("pointsLimit") or mode.get("points") or 1000

    for inst in army.get("units", []):
        key = inst.get("instanceId")
        unit = units.get(inst.get("unitId"))
        if not unit:
            issue("invalid", "missing_unit", "单位引用不存在", key)
            continue
        if unit.get("usage") == "counterpart" or unit.get("isCounterpart"):
            issue("invalid", "counterpart_as_unit", "伙伴卡需通过宿主单位的伙伴槽加入，不能作为独立单位", key)
        base_points += unit.get("points") or 0
        memberships = [m for m in unit.get("factions", []) if m.get("id") == army.get("armyId")]
        if not memberships:
            issue("invalid", "army_membership", "此单位未列入当前军队", key)
            continue
        urc = (unit.get("restrictions") or {}).get("condition")
        if urc is not None:
            urc_ok = evaluate(urc, _unit_context(unit, package), package.get("predicates") or {})
            if urc_ok is False:
                issue("invalid", "unit_restriction_condition", f"单位「{(unit.get('name') or {}).get('en', unit.get('id'))}」不满足卡面限制条件", key)
            elif urc_ok is None:
                issue("unknown", "unit_restriction_condition_unknown", f"单位「{(unit.get('name') or {}).get('en', unit.get('id'))}」的卡面限制条件存在未覆盖语义", key)

        slot_list = slot_list_for(package, unit, inst, upgrades)
        for rec in slot_list:
            if rec.get("virtual"):
                issue("unknown", "dedicated_grant_virtual",
                      f"该单位满足专用槽 {rec['key']} 的语义条件，但本地基础槽未包含；已按虚拟槽补入", key)

        assigned = {}
        equipped = [upgrades[x.get("upgradeId")] for x in inst.get("upgrades", []) if x.get("upgradeId") in upgrades]
        for selected in inst.get("upgrades", []):
            ckey = selected.get("instanceId")
            card = upgrades.get(selected.get("upgradeId"))
            if not card:
                issue("invalid", "missing_upgrade", "升级引用不存在", ckey)
                continue
            base_points += card.get("points") or 0
            rule = (package.get("upgradeRules") or {}).get(str(card.get("upstream", {}).get("id", "")), {})
            seen.append((str(card.get("upstream", {}).get("id", "")), card.get("id"), ckey))
            sel.append({"upstream_id": str(card.get("upstream", {}).get("id", "")), "card_id": card.get("id"),
                        "ckey": ckey, "unit_id": unit.get("id"), "unit_key": key,
                        "unit_upstream_id": str(unit.get("upstream", {}).get("id", ""))})

            index = selected.get("slotIndex")
            if not isinstance(index, int):
                issue("invalid", "slot_missing", "升级未指定槽位", ckey)
                continue
            if not (0 <= index < len(slot_list)):
                issue("invalid", "slot_missing", "对应槽不存在；已保留选择", ckey)
                continue
            slot_rec = slot_list[index]
            allowed = access_keys(card, package, rule)
            if slot_rec["key"] not in allowed:
                issue("invalid", "slot_mismatch", f"升级可匹配槽位 {allowed}，不包含当前槽 {slot_rec['key']}", ckey)
            if index in assigned:
                issue("invalid", "slot_occupied", "该槽已被另一张升级占用", ckey)
            else:
                assigned[index] = ckey

            for status, code, message in upgrade_eligibility(card, unit, army, package, definitions, name_index, equipped):
                issue(status, code, message, ckey)

        for i, s in enumerate(slot_list):
            if s.get("required") and i not in assigned:
                issue("invalid", "required_slot", f"必选槽位 {s['key']} 尚未配置升级", key)

        seen_local = {}
        seen_local_names = {}
        for selected in inst.get("upgrades", []):
            cid = selected.get("upgradeId")
            if cid and cid in seen_local:
                issue("invalid", "local_duplicate", "同一单位重复装备同组升级", selected.get("instanceId"))
            if cid:
                seen_local[cid] = True
            card = upgrades.get(cid) or {}
            nm = str((card.get("name") or {}).get("en") or cid or "").lower()
            if nm in seen_local_names:
                issue("invalid", "local_duplicate_name",
                      f"同一单位不能装备多张同名升级「{(card.get('name') or {}).get('zh') or (card.get('name') or {}).get('en') or nm}」",
                      selected.get("instanceId"))
            seen_local_names[nm] = True

        children = (package.get("unitRules") or {}).get(str(unit.get("upstream", {}).get("id", "")), {}).get("requiredChildren")
        if not children:
            children = (unit.get("rules") or {}).get("requiredChildren")
        if children:
            have = []
            for u in inst.get("upgrades", []):
                c = upgrades.get(u.get("upgradeId"))
                if c:
                    have.append(str(c.get("upstream", {}).get("id", "")))
            for child in children:
                if str(child.get("id")) not in have:
                    issue("invalid", "required_child_missing", f"缺少必带升级（上游 ID {child.get('id')}）", key)

    # army-wide uniqueness / conflicts
    by_name = {}
    conflict_groups = {}
    selected_upstream_ids = set()
    for upstream_id, card_id, ckey in seen:
        card = upgrades.get(card_id) or {}
        name = ((card.get("name") or {}).get("en") or card_id).lower()
        by_name.setdefault(name, set()).add(card_id)
        rule = (package.get("upgradeRules") or {}).get(upstream_id, {})
        group = rule.get("conflictGroup")
        if group:
            conflict_groups.setdefault(group, set()).add(upstream_id)
        selected_upstream_ids.add(upstream_id)
    for name, ids in by_name.items():
        if len(ids) > 1 and any(((upgrades.get(cid) or {}).get("rules") or {}).get("unique") is True for cid in ids):
            issue("invalid", "unique_duplicate", f"独特升级「{name}」跨版本只能携带一次", None)
    for group, ids in conflict_groups.items():
        if len(ids) > 1:
            issue("invalid", "conflict_group", f"互斥组 {group} 中选择了多个互斥升级", None)
    conflict_sets = {card_id: unavailable_sets(upgrades.get(card_id) or {}, name_index, definitions) for _, card_id, _ in seen}
    for i in range(len(seen)):
        for j in range(i + 1, len(seen)):
            au, ac, akey = seen[i]
            bu, bc, bkey = seen[j]
            ra = (package.get("upgradeRules") or {}).get(au, {})
            rb = (package.get("upgradeRules") or {}).get(bu, {})
            if ra.get("conflictGroup") and rb.get("conflictGroup") and ra.get("conflictGroup") == rb.get("conflictGroup"):
                continue  # already reported as conflict_group
            ca = conflict_sets.get(ac) or {}
            cb = conflict_sets.get(bc) or {}
            if bu in ca.get("up", set()) or au in cb.get("up", set()):
                issue("invalid", "upgrade_conflict", "选择了互斥的升级", akey)

    # upgrade unique / limit (from card rules)
    upgrade_counts = {}
    for upstream_id, card_id, ckey in seen:
        upgrade_counts[card_id] = upgrade_counts.get(card_id, 0) + 1
    for card_id, n in upgrade_counts.items():
        card = upgrades.get(card_id) or {}
        r = card.get("rules") or {}
        name = (card.get("name") or {}).get("en") or card_id
        rule = (package.get("upgradeRules") or {}).get(str(card.get("upstream", {}).get("id", "")), {})
        if (r.get("unique") is True or rule.get("armyUnique")) and n > 1:
            issue("invalid", "unique_duplicate", f"独特升级「{name}」整军只能携带一次", None)
        lim = r.get("limit")
        if isinstance(lim, int) and n > lim:
            issue("invalid", "limit_exceeded", f"升级「{name}」超过数量上限 {lim}", None)

    # unit uniqueness (group by name for unique units)
    unique_unit_counts = {}
    for inst in army.get("units", []):
        unit = units.get(inst.get("unitId"))
        if not unit:
            continue
        r = unit.get("rules") or {}
        if r.get("unlimited") is False:
            key = str((unit.get("name") or {}).get("en") or unit["id"]).lower()
            unique_unit_counts[key] = unique_unit_counts.get(key, 0) + 1
    for key, n in unique_unit_counts.items():
        if n > 1:
            issue("invalid", "unit_unique_duplicate", f"独特单位「{key}」整军只能携带一次", None)

    # rank counting with tier exemptions (all from local unit rules/factions)
    army_unit_upstream_ids = set()
    army_unit_upstream_counts = {}
    unit_id_counts = {}
    for inst in army.get("units", []):
        u = units.get(inst.get("unitId"))
        if not u:
            continue
        unit_id_counts[u["id"]] = unit_id_counts.get(u["id"], 0) + 1
        if u.get("upstream"):
            uid = str(u["upstream"]["id"])
            army_unit_upstream_ids.add(uid)
            army_unit_upstream_counts[uid] = army_unit_upstream_counts.get(uid, 0) + 1
    min_counts = {}
    max_counts = {}
    waived_tiers = set()
    unit_replace_tier = {}
    for inst in army.get("units", []):
        for su in inst.get("upgrades", []):
            card = upgrades.get(su.get("upgradeId"))
            rt = (card.get("rules") or {}).get("replaceTier") if card else None
            if rt is not None:
                unit_replace_tier[inst.get("unitId")] = int(rt)
    entourage_exempt = entourage_exemptions(army.get("units", []), units)
    for unit_id, copies in unit_id_counts.items():
        unit = units[unit_id]
        memberships = [m for m in unit.get("factions", []) if m.get("id") == army.get("armyId")]
        rank = memberships[0].get("rankId") if memberships else None
        if rank is None:
            continue
        if unit_replace_tier.get(unit_id) is not None:
            rank = unit_replace_tier[unit_id]
        tc = (unit.get("rules") or {}).get("tierCounting") or {}
        ignore_min = tc.get("ignoreMinimum") is True
        ignore_max = tc.get("ignoreMaximum") is True
        for f in unit.get("factions", []):
            if f.get("id") == army.get("armyId"):
                ftc = f.get("tierCounting") or {}
                if ftc.get("ignoreMinimum") is True:
                    ignore_min = True
                if ftc.get("ignoreMaximum") is True:
                    ignore_max = True
        exempt_copies = 0
        ex = tc.get("exempt") or tc.get("ignoreMaximumWhenArmyIncludes")
        if ex:
            whens = ex.get("whenArmyIncludes")
            per = ex.get("perSourceUnit") or 1
            if isinstance(whens, str):
                whens = [whens]
            src = sum(1 for w in whens if str(w) in army_unit_upstream_ids)
            if src:
                exempt_copies = min(per * src, copies)
        waives = tc.get("waivesMinimum")
        if waives:
            for t in waives.get("tiers") or []:
                waived_tiers.add(t)
        if not ignore_min:
            min_counts[rank] = min_counts.get(rank, 0) + copies
        ent_exempt = entourage_exempt.get(str(unit.get("upstream", {}).get("id", "")), 0)
        max_counts[rank] = max_counts.get(rank, 0) + copies - exempt_copies - ent_exempt

    quotas = {q["rankId"]: q for q in mode.get("rankQuotas", [])}
    for rank_id, count in max_counts.items():
        q = quotas.get(rank_id)
        if q and count > q.get("max", 99):
            issue("invalid", "rank_max", f"军阶 {rank_id} 超过上限 {q['max']}", None)
    for rank_id, q in quotas.items():
        if rank_id in waived_tiers:
            continue
        if min_counts.get(rank_id, 0) < q.get("min", 0):
            issue("invalid", "rank_min", f"军阶 {rank_id} 未满最低要求 {q['min']}", None)
    for combo in mode.get("combined", []) or []:
        total = sum(max_counts.get(t, 0) for t in combo.get("tiers", []))
        if total > combo.get("maximum", 99):
            issue("invalid", "rank_combined", f"军阶组合 {combo.get('tiers')} 合计超过上限 {combo['maximum']}", None)

    # command cards: faction / unlock / campaign
    selected_upgrade_upstream = {x["upstream_id"] for x in sel}
    for cid in army.get("commandIds", []):
        cmd = next((c for c in definitions.get("commands", []) if str(c.get("id")) == str(cid)), None)
        if not cmd:
            issue("invalid", "command_missing", f"命令卡引用不存在：{cid}", None)
            continue
        name = (cmd.get("name") or {}).get("en") or cid
        facs = [f for f in (cmd.get("factions") or [])]
        if facs and army.get("armyId") not in facs:
            issue("invalid", "command_faction", f"命令卡「{name}」不属于当前军队", None)
        if cmd.get("campaigns"):
            issue("unknown", "command_campaign", f"命令卡「{name}」为战役卡，标准模式资格待核验", None)
        for un in cmd.get("unlockedBy") or []:
            target = str(un.get("id"))
            prop = un.get("propertyName")
            if prop == "units" and target not in army_unit_upstream_ids:
                issue("invalid", "command_unlock", f"命令卡「{name}」需要包含解锁单位（上游 {target}）", None)
            elif prop == "upgrades" and target not in selected_upgrade_upstream:
                issue("invalid", "command_unlock", f"命令卡「{name}」需要包含解锁升级（上游 {target}）", None)

    hand = mode.get("commandHand")
    if hand and army.get("commandIds"):
        pips = []
        for cid in army.get("commandIds"):
            cmd = next((c for c in definitions.get("commands", []) if str(c.get("id")) == str(cid)), None)
            if cmd and cmd.get("pips") is not None:
                pips.append(cmd["pips"])
        for rule in hand:
            if pips.count(rule["pips"]) < rule.get("min", 0):
                issue("invalid", "command_min", f"{rule['pips']} 点命令卡不足 {rule['min']} 张", None)
            if pips.count(rule["pips"]) > rule.get("max", 99):
                issue("invalid", "command_max", f"{rule['pips']} 点命令卡超过 {rule['max']} 张", None)

    # mercenary pool (membership + bonus from local data)
    pool = (mode.get("pools") or {}).get("mercenary")
    if pool:
        bonus = 0
        for x in sel:
            card = upgrades.get(x["card_id"]) or {}
            if "extraMercenary" in ((card.get("rules") or {}).get("poolBonuses") or []):
                bonus += 1
        merc_count = 0
        for inst in army.get("units", []):
            unit = units.get(inst.get("unitId"))
            if not unit:
                continue
            for f in unit.get("factions", []):
                if "mercenary" in (f.get("tierPools") or []) and f.get("id") == army.get("armyId"):
                    merc_count += 1
                    break
        limit = pool.get("max", 1) + bonus
        if merc_count > limit:
            issue("invalid", "mercenary_pool", f"雇佣兵数量 {merc_count} 超过上限 {limit}", None)
        if bonus:
            issue("unknown", "mercenary_pool_semantics", "雇佣兵池额外名额叠加语义仍需核验", None)

    # effects: effective points / chooseOneKey / quantityLimitedBy (local)
    effective_points = base_points
    for x in sel:
        card = upgrades.get(x["card_id"]) or {}
        for m in (card.get("rules") or {}).get("modifiedPointsWith") or []:
            prop = m.get("property")
            m_id = str(m.get("id"))
            mod = m.get("modifier") or 0
            applies = False
            if prop == "options":
                if any(str(o) == m_id for o in army.get("options", [])) and str(m.get("in")) in army_unit_upstream_ids:
                    applies = True
            elif prop == "units":
                if m_id in army_unit_upstream_ids:
                    applies = True
            if applies:
                effective_points += mod
    by_unit_choose = {}
    for x in sel:
        card = upgrades.get(x["card_id"]) or {}
        ck = (card.get("rules") or {}).get("chooseOneKey")
        if ck:
            by_unit_choose.setdefault(x["unit_key"], {}).setdefault(ck, set()).add(x["upstream_id"])
    for unit_key, groups in by_unit_choose.items():
        for ck, ids in groups.items():
            if len(ids) > 1:
                issue("invalid", "choose_one", f"单位内互斥选择组「{ck}」只能选择其一", unit_key)
    for unit_id, copies in unit_id_counts.items():
        unit = units[unit_id]
        for q in (unit.get("rules") or {}).get("quantityLimitedBy") or []:
            src_id = str(q.get("unit"))
            ratio = q.get("ratio") or 1
            src_copies = army_unit_upstream_counts.get(src_id, 0)
            if copies > ratio * src_copies:
                issue("invalid", "quantity_limited", f"「{unit.get('name', {}).get('en', unit_id)}」数量受母单位限制", None)

    if effective_points > points_limit:
        issue("invalid", "points_limit", f"有效费用 {effective_points} 超过上限 {points_limit}", None)

    has_invalid = any(i["status"] == "invalid" for i in issues)
    has_unknown = any(i["status"] == "unknown" for i in issues)
    status = "invalid" if has_invalid else ("unknown" if has_unknown else "valid")
    issues.append({
        "status": "unknown",
        "code": "coverage_note",
        "message": "属性效果（addProperties/replaceProperties）已参与资格判断；卡面限制、费用修正、chooseOneKey、quantityLimitedBy、军阶豁免、军阶要求/替换军阶与互斥卡牌已执行。战斗部队规则未覆盖项仍标 unknown。",
        "instanceId": None,
    })
    return {
        "status": status,
        "basePoints": base_points,
        "effectivePoints": effective_points,
        "rankCounts": max_counts,
        "issues": issues,
    }


def query_candidates(unit_id, package=None, units=None, upgrades=None, army_id=None):
    package = package or load_package()
    units = units or {u["id"]: u for u in _read("data/units.json")["units"]}
    upgrades = upgrades or {c["id"]: c for c in _read("data/upgrades.json")["cards"]}
    unit = units.get(unit_id)
    if not unit:
        return []
    by_id, _ = slot_registry(package)
    slot_keys = []
    for s in unit.get("upgradeSlots") or []:
        raw = s.get("id") if isinstance(s, dict) else s
        key = slot_key(package, raw)
        slot_def = by_id.get(key)
        if slot_def and slot_def.get("kind") == "dedicated":
            continue
        slot_keys.append(key)
    granted = set()
    for g in dedicated_slot_keys(package, unit, upgrades):
        if g.get("ifAbsentAny") and any(k in g["ifAbsentAny"] for k in slot_keys):
            continue
        if g["key"] in granted:
            continue
        if g["key"] not in slot_keys:
            slot_keys.append(g["key"])
            granted.add(g["key"])
    definitions = _read("data/catalog-definitions.json")
    name_index = build_name_index(upgrades, definitions)
    army = {"armyId": army_id if army_id is not None else ((unit.get("factions") or [{}])[0].get("id"))}
    results = []
    for card in upgrades.values():
        rule = (package.get("upgradeRules") or {}).get(str(card.get("upstream", {}).get("id", "")), {})
        matched = [k for k in access_keys(card, package, rule) if k in slot_keys]
        blocked = [i for i in upgrade_eligibility(card, unit, army, package, definitions, name_index) if i[0] == "invalid"]
        available = bool(matched) and not blocked
        reason = ("可匹配槽位 " + "/".join(matched)) if available else (blocked[0][2] if blocked else "无匹配槽位")
        results.append({"upgradeId": card.get("id"), "available": available, "matchedSlots": matched, "reason": reason})
    return results
