# 规则引擎校验切面与规则条目盘点

> 目的：重新整改规则限制前的事实清单。列出「在哪里校验」「每个规则条目是什么/取值从哪来/什么时候触发校验/现在到底生效没有」。

## 一、校验切面（Validation Surfaces）

| # | 切面 | 代码位置 | 触发时机 | 输入 | 输出 |
|---|---|---|---|---|---|
| S1 | 组军完整校验 | `rules.py::validate_army` / `rules-core.js::validateArmy` | 军表每次变化（选择/移除单位、增删升级、切模式/军队） | army + data | issues[{status,code,message}] |
| S2 | 升级候选过滤 | `builder.js::restrictionOk` | 打开某个槽位浏览升级卡时 | card + unit + army | bool（是否进候选） |
| S3 | 候选去重/互斥 | `builder.js::alreadySelectedUnique / sameNameSelected / conflictsWithSelected` | 同 S2 | card + unit 实例 | bool |
| S4 | 单位可选性 | `builder.js::unitAvailability` | 浏览单位卡、渲染军表行 | unit + army | hidden / orphan（变红） |
| S5 | 槽位计算 | `rules-core.js::slotListFor` / `rules.py::slot_list_for` | S1、S2 之前；每次渲染 | unit + 已携带升级 | slotList[{key,required,virtual}] |
| S6 | 规则声明结构校验 | `rule_schema.py::validate_rules` | 编辑器保存规则 / 导入 | rules 对象 | raise（结构错误） |
| S7 | 卡牌数据校验 | `maintenance_store.validate`（升级）、`server.validate`（单位） | 保存卡片 | card | raise（引用/类型错误） |
| S8 | 候选查询接口 | `rules.py::query_candidates` | `POST /api/candidates` | unit id | 候选列表 |
| S9 | 数据合并/导入脚本 | `tools/merge_upstream.py`、`import_maintenance.py` | 手工运行 | 上游快照 + 本地卡 | 写回 data/*.json |
| S10 | 编辑器规则界面 | `rule-editor.js` | 编辑规则时 | 字段词表 | 控件（不校验，只暴露字段） |

## 二、规则限制条目

### A. 槽位与宿主

| 字段 | 含义 | 可选值取值方式 | 校验切面（触发时机） | issue code | 现状 |
|---|---|---|---|---|---|
| `slotIds` / `rules.slotTypes` | 卡可匹配的槽位 | 数字 sourceId，来自 `slot-rules.json.slots`（26 类，sourceId↔语义键） | S5 生成槽、S1 比对 | `slot_mismatch` `slot_missing` `slot_occupied` `required_slot` | 生效 |
| `rules.slotEffects` | 携带后增加槽位 | `[{type:"addSlot", slot:"<语义槽键>", when?:<条件>}]`，slot 取 `slot-rules.slots` 语义键 | S5 | 通过槽位间接生效 | 生效 |
| `rules.availableIn` | 宿主白名单（上游单位 id） | `catalog-definitions.sourceUnits`（183） | S1、S2 | `host_restriction` | 生效 |
| `rules.unavailableIn` | 宿主黑名单 | 同上 | — | — | **未执行**（只存） |
| `upgradeRules[].access` | 规则包覆盖槽位访问 | `slot-rules.slots` 语义键 | S1、S2 | 间接 | 生效 |

### B. 军队资格

| 字段 | 含义 | 可选值取值方式 | 校验切面 | issue code | 现状 |
|---|---|---|---|---|---|
| `rules.factions` | 军队/战斗部队白名单 | `catalog-definitions.armies`（19） | S1、S2 | `upgrade_faction` | 生效 |
| `rules.unavailableWithIds`（对象 factions） | 排斥某军队 | armies id | S1、S2 | `unavailable_faction` | 生效 |

### C. 单位属性条件（两套并存）

| 字段 | 含义 | 可选值取值方式 | 校验切面 | issue code | 现状 |
|---|---|---|---|---|---|
| `rules.requiredProperties` | OR(AND(property,value)) | property ∈ {unitType,faction,affiliation,keywords}；value 取 unitTypes/factions/affiliations/keywords 字典 | S1、S2 | `required_properties` | 生效 |
| `restrictions.condition`（卡级） | 表达式限制 | `{all/any/not/field/op/value/ref}`；field ∈ unit.rankId/upstreamId/unitTypeId/factionId/keywords/defenseDie…；ref 取 `slot-rules.predicates`（4 个） | S1、S2 | `restriction_condition` / `restriction_condition_unknown` | 生效（不看 `restrictions.execution` 状态） |
| `rules.requiredDivisions` | 光明/黑暗限定 | Light/Dark；单位 `divisions` | S1、S2 | `division_restriction` | 生效 |
| `rules.requiresTier` | 母单位军阶要求 | `ranks`（1–6） | S1、S2 | `requires_tier` | 生效 |

### D. 互斥与唯一

| 字段 | 含义 | 可选值取值方式 | 校验切面 | issue code | 现状 |
|---|---|---|---|---|---|
| `rules.unavailableWithIds`（对象 upgrades / 字符串） | 互斥升级 | 对象 id=上游升级 id；字符串=英文名/驼峰键，经名称索引解析 | S1（成对）、S2 | `upgrade_conflict`；规则包 conflictGroup→`conflict_group` | 生效 |
| `rules.unique` | 整军唯一（按英文名） | bool | S1 | `unique_duplicate` | 生效 |
| `rules.locallyUnique` | 同一单位同卡不重复 | bool | S1 | `local_duplicate` | 生效 |
| 同名规则（引擎硬编码） | 同一单位同名卡唯一 | `name.en` | S1、S2 | `local_duplicate_name` | 生效（不可配置） |
| `rules.chooseOneKey` | 单位内互斥选择组 | 自由字符串 | S1 | `choose_one` | 生效 |

### E. 数量与军阶配额

| 字段 | 含义 | 可选值取值方式 | 校验切面 | issue code | 现状 |
|---|---|---|---|---|---|
| `rules.limit` | 整军数量上限 | 非负整数 | S1、S2 | `limit_exceeded` | 生效 |
| `rules.unlimited`（单位） | 允许重复 | bool | S1 | `unit_unique_duplicate` | 生效 |
| `rules.quantityLimitedBy` | 数量受母单位限制 | `[{unit:<上游id>, ratio:n}]`；factions 内 `[{tier, ratio}]` | S1；S4（可选性/变红） | `quantity_limited` | unit/ratio 生效；**tier/ratio 未实现** |
| `rules.tierCounting` | 军阶计数修正 | 对象：ignoreMinimum/ignoreMaximum(bool)、waivesMinimum{tiers}、exempt{whenArmyIncludes,perSourceUnit} | S1 | `rank_min` `rank_max` `rank_combined` | 生效 |
| `rules.replaceTier` | 有效军阶替换 | ranks id | S1 军阶计数 | （无独立 code） | 生效 |
| `modes.rankQuotas` / battleForces.modes | 模式/战斗部队配额 | `slot-rules.json.modes` | S1 | `rank_min` `rank_max` `rank_combined` `points_limit` | 生效 |

### F. 费用与效果

| 字段 | 含义 | 可选值取值方式 | 校验切面 | issue code | 现状 |
|---|---|---|---|---|---|
| `rules.modifiedPointsWith` | 条件费用修正 | `[{id, property:"options"\|"units", modifier, in}]`；id/in 取 sourceUnits/options | S1 | `points_limit`（经 effectivePoints） | 生效 |
| `rules.addProperties` / `replaceProperties` | 属性效果 | OR(AND(property,value)) | — | — | **未计算**（coverage_note 仍写「已计算」，误导） |
| `rules.poolBonuses` | 雇佣兵池奖励 | 自由字符串（如 extraMercenary） | S1 | `mercenary_pool`（附 unknown 语义提示） | 生效 |

### G. 伙伴与依赖

| 字段 | 含义 | 可选值取值方式 | 校验切面 | issue code | 现状 |
|---|---|---|---|---|---|
| `rules.countsAsActivation` / `costViaUpgrade` | 伙伴是否计激活/费用归属 | bool | — | — | **未执行** |
| `rules.requiredChildren` | 必带升级 | `[{id:<上游升级id>, elementPropertyName, upgradeIndex}]` | S1 | `required_child_missing` | 生效 |
| `rules.memberships`（单位） | 军队成员+军阶镜像 | `[{id,rank}]` | — | — | **不参与校验**（引擎读顶层 `factions`） |
| DETACHMENT/RETINUE/ENTOURAGE 词条 | 单位可选性 | 词条 parameter（父/子单位名）+ `quantityLimitedBy` | S1（数量）、S4（可选/变红） | `quantity_limited` | 部分生效（名称解析可靠的才拦） |
| `usage` / `isCounterpart` | 伙伴不能独立加入 | `counterpart` | S1 | `counterpart_as_unit` | 生效 |

### H. 军队级（非卡片规则）

| 条目 | 含义 | 取值 | 切面 | code | 现状 |
|---|---|---|---|---|---|
| `commands` | 命令手牌 | `catalog-definitions.commands` + 军队/解锁/等级 | S1 | `command_missing` `command_faction` `command_unlock` `command_min` `command_max` `command_campaign` | 生效 |
| 军队成员 | 单位属于当前军队 | 单位顶层 `factions` | S1 | `army_membership` | 生效 |
| 战斗部队 | 骨架规则未完整 | `slot-rules.battleForces` | S1 | `battle_force_rules`（unknown） | 未完整 |

## 三、目前「乱套」的具体点

1. **两套条件系统并存**：`requiredProperties`（结构化）与 `restrictions.condition`（表达式）。同一张卡可能两处都有，求值逻辑不同，容易重复报错或互相矛盾。
2. **只存不查**：`unavailableIn`、`countsAsActivation`、`costViaUpgrade` 完全不参与校验。
3. **声称已计算但实际没有**：`addProperties/replaceProperties` 未计算，coverage_note 文案误导。
4. **镜像字段误导**：`memberships` 可编辑、会同步，但引擎不读；真正生效的是单位顶层 `factions`。
5. **execution 状态与求值不一致**：`restrictions.execution`（not_connected/source_alignment_pending…）仍有值，但引擎已统一求值 `restrictions.condition`，不看 execution。
6. **编辑器字段 ≠ 引擎字段**：rule-editor 暴露和 rule_schema 允许的字段，比引擎真正执行的多（如 unavailableIn）。
7. **同名规则硬编码**：`local_duplicate_name` 写死在引擎，不可配置，且与 `unique`/`locallyUnique` 语义重叠。
8. **quantityLimitedBy 只实现一半**：unit/ratio 生效，faction 内 tier/ratio 未实现。
9. **两套加槽机制**：规则包 `dedicatedGrants` 与卡级 `slotEffects` 并存。
10. **候选过滤与组军校验是两份独立实现**：部分规则只在 S1 执行、不在 S2 过滤（例如 requiredChildren、部分 limit），会出现「候选能选、组军才报错」。

## 四、整改建议顺序（供决策）

1. 先定字段清单：哪些字段「必须执行」、哪些「仅展示」、哪些「删除」。
2. 合并条件系统：统一到 `restrictions.condition` 或 `requiredProperties` 其中一套。
3. 对齐 S1/S2：把候选过滤改成复用同一套检查函数，避免两处不同步。
4. 清理无效字段与误导文案（unavailableIn、countsAsActivation、addProperties、memberships、execution）。
5. 把「同名卡」「DETACHMENT」等硬编码规则提为可配置规则包条目。
