# 战斗部队（Battle Force）规则引擎设计

> 数据来源：`references/upstream/legion.json`（配额、选项、部分规则文本）+ `DOC56_BattleForces-3.pdf`（官方规则文本、可用单位、独特升级）。
> 现状：配额已与上游完全一致（15 个战斗部队），规则文本/选项已导入；机器规则（machineRules）尚未求值。

## 1. 规则现在设置在哪

| 内容 | 位置 | 说明 |
|---|---|---|
| 战斗部队列表与名称 | `data/catalog-definitions.json` → `armies`（id 7–21） | `parentName` 指向基础阵营 |
| 该部队**能用哪些单位** | `data/units.json` → 每个单位的 `factions` 数组 | 单位属于哪些阵营/战斗部队；加入时引擎按 `army_membership` 校验 |
| 该部队的**军阶配额** | `data/slot-rules.json` → `battleForces[id].modes.{standard,recon}` | `rankQuotas[{rankId,min,max}]` + `combined[{tiers,maximum}]`；引擎已合并覆盖全局模式 |
| **特殊规则文本** | `battleForces[id].textRules[]` | 来自上游 `faction.rules`（部分部队上游为空，需从 PDF 补） |
| **选项（如氏族选择）** | `battleForces[id].options[]` | 上游 `faction.options`，与 `catalog-definitions.options` 的定义表关联 |
| **机器可执行规则** | `battleForces[id].machineRules[]` | 本设计新增，见第 3 节 |
| 独特升级白名单 | `battleForces[id].uniqueUpgrades[]` | 来自 PDF「Unique Upgrades Allowed」，需名称解析到升级卡 |

编辑入口：**规则库页面（`rules.html`）→「战斗部队」标签** 目前只读展示 + JSON 标签整体编辑；要实现可维护需要在 `rules.js` 加重建表单（第 5 节）。

## 2. 数据模型

```json
"battleForces": {
  "17": {
    "name": "Blizzard Force",
    "parentFaction": "Empire",
    "alignment": "Dark",
    "status": "text_only",
    "modes": {
      "standard": {
        "rankQuotas": [
          {"rankId": 1, "min": 1, "max": 2},
          {"rankId": 2, "min": 3, "max": 6},
          {"rankId": 3, "min": 0, "max": 3},
          {"rankId": 4, "min": 1, "max": 4},
          {"rankId": 5, "min": 0, "max": 2},
          {"rankId": 6, "min": 0, "max": 1}
        ],
        "combined": [{"tiers": [1, 6], "maximum": 2}]
      },
      "recon": { "...": "同上结构" }
    },
    "textRules": [
      "The Field Commander keyword cannot be used in a Blizzard Force army.",
      "Imperial Probe Droid units in this army do not have the Detachment keyword."
    ],
    "machineRules": [
      {"type": "banKeyword", "keyword": "field_commander"},
      {"type": "removeKeyword", "keyword": "detachment", "target": {"unitNames": ["Imperial Probe Droid"]}},
      {"type": "unitCap", "unitName": "Stormtroopers", "max": 2}
    ],
    "uniqueUpgrades": ["Academy Trained", "Defend in Depth", "General Weiss", "Improvised Orders", "Tip of the Spear"],
    "options": []
  }
}
```

### 关键映射规则

- 上游 `tierRequirements.tiers[].tier` **等于**本地 `rankId`（Commander=1、Corps=2、Special=3、Support=4、Heavy=5、Operative=6），无需换算。已验证：本地 12 个骨架与上游逐项一致。
- 上游 `combined[{tiers,maximum}]` 与本地 `combined` 同构。
- `unit.factions[].rankId` 是该单位在该部队中的军阶（同一单位在不同部队军阶可不同）。

## 3. 机器规则类型（从 PDF 归纳）

| type | 含义 | 引擎检查 | 典型出现 |
|---|---|---|---|
| `banKeyword` | 该关键词/单位在本部队不可用 | 任一单位带该关键词 → `battle_force_keyword_banned` | Blizzard：Field Commander 禁用 |
| `removeKeyword` | 指定单位在本部队**失去**某关键词 | 求值上下文里剔除该关键词（影响后续条件判断） | Blizzard：帝国探测机器人失去 Detachment |
| `unitCap` | 某单位在本部队最多 N 个（可少于军阶上限） | 计数超限 → `battle_force_unit_cap` | Blizzard：0–2 Stormtroopers |
| `uniqueUpgrades` | 白名单外的独特升级不可用 | 任一独特升级不在白名单 → `battle_force_unique_upgrade` | 各部队「Unique Upgrades Allowed」 |
| `allowAnyMercenaries` | 任意数量雇佣兵，且计入最低军阶 | 豁免雇佣兵池上限；最低军阶计数包含雇佣兵 | Bright Tree、Mandalorian Clans |
| `requireSharedAffiliation` | 全军单位须与某指挥官/特工的组织一致 | 不一致 → `battle_force_affiliation` | Mandalorian Clans |
| `divisionChoice` | 组建时选择光明/黑暗 | 未选择或选错 → `battle_force_division` | Mandalorian Clans |
| `optionChoice` | 氏族/选项选择（chooseOneKey） | 未选或重复 → `battle_force_option` | Mandalorian Clans（Clan Wren/Child of the Watch…） |
| `textOnly` | 纯局内效果，不参与组军校验 | 不校验，仅展示 | 大多数「During the End Phase…」 |

## 4. 引擎切面（新增/改动）

1. **配额**：已实现。`mode = {...全局模式, ...battleForces[id].modes[mode]}`，`combined` 走 `rank_combined`。
2. **可用单位**：已实现（`army_membership`）。注意：基础阵营单位也能加入战斗部队军表 —— 这是规则允许的（战斗部队是阵营的子集扩展），但**部队特有单位只能出现在该部队**，已由成员关系保证。
3. **机器规则**：新增 `battleForceChecks(army, bf, units, upgrades, defs)`，在 `validate_army` 里调用，产出：
   - `battle_force_keyword_banned`（invalid）
   - `battle_force_unit_cap`（invalid）
   - `battle_force_unique_upgrade`（invalid）
   - `battle_force_affiliation` / `battle_force_division` / `battle_force_option`（invalid）
4. **未知项提示**：只有当 `machineRules` 未覆盖的 `textRules` 存在（`unparsedRules`）时，才发 `unknown / battle_force_rules`，避免「一律未知」的噪音。
5. **写表器交互**：军阶栏显示该部队的配额（`count/max`）；不满足最低要求的军阶徽标同样标红（已由 `rank_min` 带 `rank` 实现）。

## 5. 编辑器改造

`rules.js` → 「战斗部队」标签改为可编辑：

- 顶部：部队选择（15 个）。
- 基本信息：名称、母阵营、alignment、status。
- 军阶配额：两个模式（standard / recon）各一张 `rankId → min/max` 表格 + combined 行。
- 可用单位：列出 `units.factions` 里属于该部队的单位（只读，跳转到单位卡编辑其归属）+ `unitCap` 编辑。
- 独特升级：可搜索多选（来自升级卡 `unique` 列表）。
- 特殊规则：`textRules` 多行文本 + `machineRules` 结构化编辑（类型下拉 + 目标选择），保存时校验类型合法。
- 选项：从 `catalog-definitions.options` 选择，设置 chooseOneKey。

单位侧：`units.html` 的「可加入军队及军阶」表格已经是设置单位归属的地方（`factions` 数组），无需新增入口。

## 6. 实施步骤

1. ✅ 配额与规则文本导入（`tools/import_battleforces.py`）。
2. ⏳ 从 PDF 抽取「Unique Upgrades Allowed」并按名称解析到升级卡（解析率报告）。
3. ✅ 引擎实现 `battleForceChecks`（banKeyword / unitCap / uniqueUpgrades）；Blizzard Force 已作为样例配置并通过双引擎测试。
4. ⏳ 逐个部队补 `machineRules`（15 个，按 PDF 核对）。
5. ⏳ 规则库页面战斗部队编辑表单。
6. ⏳ 写表器：军阶栏显示配额、选项选择 UI。

## 7. 风险与注意

- PDF 的 OCR 文本有连字丢失（Field→Fᵢₑₗd、The→Te），机器规则需要人工核对后才写入 `machineRules`。
- 「可用单位」以 `unit.factions` 为准，PDF 列表用于核对；两者不一致时以本地数据为准并记入差异报告。
- 部队专属单位（`factions` 只含该部队）在基础阵营军表中不会出现，这是正确的。
- 雇佣兵部队（Mandalorian Clans / Shadow Collective / Ohnaka Gang）的池化规则与 `allowAnyMercenaries` 交互复杂，需要单独设计（第 3 节第 5 条）。

## 8. 规则类型 ↔ 词条 / 条件映射（排查结果）

对 15 个部队的 PDF「SPECIAL RULES」逐条扫描后，机器规则与词条/条件的对应关系：

| 规则类型 | 依赖的词条 / 字段 | 能否用现有条件语言表达 | 说明 |
|---|---|---|---|
| `banKeyword` | `unit.keywords`（如 `field_commander`） | **可以**：`{not:{field:"unit.keywords",op:"contains",value:"field_commander"}}` | 但需要「对全军每个单位施加」的机制；Blizzard / Echo Base / Separatist Invasion 三处出现 |
| `removeKeyword` | `unit.keywords`（如 `detachment`） | 不能 | 是修改器：先改上下文再判其他规则（Blizzard：帝国探测机器人失去 Detachment） |
| `hostAlias` | 卡的 `availableIn` + 单位 `unitTypeId` | 不能 | 跨「卡 × 单位 × 部队」的例外（帝国残党重武器） |
| `unitCap` | 无词条，纯计数 | 不能 | Blizzard：0–2 冲锋队 |
| `uniqueUpgrades` | 卡 `rules.unique` | 不能 | 白名单校验 |
| `treatAsMercenary` | `unit.factions` + 雇佣兵池 | 部分 | 帝国残党：侦察兵/死亡士兵「视为雇佣兵」用于组军计数 |
| `allowAnyMercenaries` | 雇佣兵池 | 部分 | Bright Tree Village 等 |
| `requireSharedAffiliation` | `unit.affiliationIds` | **可以**（条件），但锚点单位需额外机制 | Mandalorian Clans |
| `divisionChoice` | `unit.divisions` | **可以**（`contains`） | Mandalorian Clans |
| `optionChoice` | `options` + `chooseOneKey` | 不能 | 氏族选项，需要 UI 选择 |

### 数据质量提示

- PDF 规则文本里的图标在 OCR 后变成占位字母（`p`=指挥官图标、`o`=特工图标、`m`=雇佣兵图标），例如「non-p non-o Vehicle unit」「count as m units」。机器化时必须人工读图确认。
- 关键词表里存在 OCR 残留的占位词条：`pending_equir`、`pending_move`、`pending_vehicle`、`pending_w_lo`，条件扫描会误命中，建议清理。

## 9. 帝国残党重武器共享（hostAliases）

PDF 原文：

> Any non-Droid Trooper unit in this army with a [heavy weapon] upgrade icon may equip a [heavy weapon] upgrade with one of the following unit requirements, ignoring that requirement: Stormtroopers only, Shoretroopers only, Scout Troopers only, or Imperial Death Troopers only.

数据（`battleForces["7"].hostAliases`）：

```json
{
  "type": "ignoreHostRequirement",
  "slot": "heavy_weapon",
  "when": {"field": "unit.unitTypeId", "op": "in", "value": [1, 5, 7, 9, "local:wookiee_trooper"]},
  "asUnits": ["Stormtroopers", "Shoretroopers", "Scout Troopers", "Imperial Death Troopers"]
}
```

引擎（`upgradeEligibility` / `upgrade_eligibility`）：宿主检查失败时，若当前部队存在匹配该槽位的 `ignoreHostRequirement`，且单位满足 `when`，且卡片的 `availableIn` 与 `asUnits` 解析出的上游单位有交集，则视为通过。

验证（双引擎一致）：

| 场景 | 结果 |
|---|---|
| 帝国残党 · 冲锋队 + T-21B（仅岸防兵） | 允许 |
| 帝国残党 · 岸防兵 + T-21（仅冲锋队） | 允许 |
| 帝国残党 · 黑暗士兵（机器人）+ T-21B | 拒绝（`host_restriction`） |
| 帝国 · 冲锋队 + T-21B | 拒绝（`host_restriction`） |
