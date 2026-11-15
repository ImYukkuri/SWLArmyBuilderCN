# 行动触发标记

`data/catalog-definitions.json` 的每条 `keywords[]`、`data/upgrades.json` 的每张 `cards[]` 及双面卡的 `back` 均有 `actionTypes` 字段。仅表示卡牌本身提供的主动卡牌行动，不是效果中所有行动的列表，也不取代时机、容量、目标、横置／消耗等限制。

| 值 | 含义 |
| --- | --- |
| `["action"]` | 普通卡牌行动，消耗 1 次行动 |
| `["double-action"]` | 消耗 2 次行动；不是免费行动的双箭头图标 |
| `["free-action"]` | 免费卡牌行动 |
| `["free-exhaust"]` | 免费卡牌行动并横置该卡 |
| 多个枚举值 | 该卡包含多种主动能力；在词条库中表示不同卡牌可能赋予的行动类型 |
| `[]` | 已确认不提供独立主动卡牌行动 |
| `null` | 现有资料不足，尚不能判断；旧快照缺失字段同样视为未知 |

界面显示名称依次为：`action` → 行动、`double-action` → 双行动、`free-action` → 免费行动、`free-exhaust` → 免费行动：横置。JSON 枚举不变。当前已标记的双行动升级只有丁的安班步枪（`armament-din-djarin-rifle`）；词条库暂无双行动记录。

例如 C-3PO 伙伴记录为 `"actionTypes": ["action", "free-action"]`，分别对应计算概率与分散注意；不能把整个数组理解成一次能力的组合费用。

## 判定边界

- 词条库是通用能力分类。单位引用已有的 `keywords[].action` 仍是该单位卡面的具体标记，优先于词条库；不能把跳跃、修理、观察统一当作普通或免费行动。
- “给予免费攻击／移动”的被动触发（冲锋、追击、侦察等）不是独立主动卡牌行动，标为 `[]`。
- 普通武器加入攻击池不算额外主动卡牌行动；丁的安班步枪另有双行动能力，因此标为 `["double-action"]`。
- 援助之手替换另一单位的移动，后勤专长修正已有计算概率；两者虽在卡文中引用行动图标，仍标为 `[]`。仅有横置／消耗图标的反应能力也不算免费行动。
- 烟雾手雷在本单位激活中主动提供免费烟雾行动，标为 `["free-action"]`；其消耗要求仍见卡文。
- 切换配置、战盾伍基人及基奥诺西斯长矛的翻面触发不额外提供卡牌行动。双面卡两面分别记录，当前面的数据不会继承另一面。
- 现有未解析的 OCR 词条不猜测含义。三个原有待校对 ID 的行动符号已对照原图：`pending_a_reppairr_2_capacity_2`（R2-D2 修理）、`pending_4a_master_storyteller`（C-3PO Master Storyteller）、`pending_allume_2`（阿索卡 Jump 2）；保留原有 ID 与文本，仅补标记。

判定依据：现有逐卡英文／中文卡文中的结构化图标、伙伴词条的逐卡行动字段，以及原卡图。行动类型定义与 Master Storyteller 等规则对照 [AMG 核心规则 2026-06-17，第 15、24、52 页](https://cdn.svc.asmodee.net/production-amgcom/uploads/2026/06/DOC56_SWQ_Rulebook-2.pdf)；不导入或替换现有规则正文。

## 已标记的词条

共 19 条（含 3 条保留原 ID 的 OCR 待校对记录）。另有 66 条资料不足，使用 `null`。

| ID | 词条 | 行动类型 |
| --- | --- | --- |
| `smoke` | 烟雾X | 普通行动、免费行动 |
| `arm` | 安设X：炸药标记类型 | 普通行动 |
| `jump` | 跳跃X | 普通行动、免费行动 |
| `bolster` | 激励X | 普通行动 |
| `quick_thinking` | 快速思考 | 普通行动 |
| `observe` | 观察X | 普通行动、免费行动、免费行动：横置 |
| `take_cover` | 寻找掩护X | 普通行动、免费行动 |
| `guidance` | 引导 | 普通行动、免费行动 |
| `repair` | 修理X：容量Y | 普通行动、免费行动 |
| `spotter` | 观测员X | 普通行动、免费行动 |
| `calculate_odds` | 计算概率 | 普通行动 |
| `treat` | 治疗X：容量Y | 普通行动、免费行动 |
| `strategize` | 制定战略X | 普通行动 |
| `self_destruct` | 自毁X | 普通行动、免费行动 |
| `pulling_the_strings` | 幕后操纵 | 普通行动 |
| `pending_a_reppairr_2_capacity_2` | A) Reppairr 2: Capacity 2 | 普通行动 |
| `pending_distract` | 分散注意 | 免费行动 |
| `pending_4a_master_storyteller` | 4A) Master Storyteller | 普通行动 |
| `pending_allume_2` | Allume 2 | 普通行动 |

## 已标记的升级卡

共 63 张提供主动行动。另有 27 张空白导入记录使用 `null`，不按名称猜测其效果。当前 7 组双面卡的 14 面均无独立主动卡牌行动，分别记录为 `[]`。

| ID | 升级卡 | 行动类型 |
| --- | --- | --- |
| `21b-medical-droid` | 2-1B医疗机器人 | 免费行动 |
| `academy-trained` | 学院训练 | 普通行动 |
| `armament-din-djarin-rifle` | 丁的安班步枪 | 双行动 |
| `backworld-medic` | 边远世界医疗兵 | 普通行动 |
| `caught-in-a-web` | 落入蛛网 | 普通行动 |
| `clone-engineer` | 克隆人工程师 | 免费行动 |
| `clone-fox` | 克隆人指挥官福克斯 | 免费行动 |
| `clone-medic` | 克隆人医疗兵 | 免费行动 |
| `clone-specialist` | 克隆人专业兵 | 免费行动：横置 |
| `defend-in-depth` | 纵深防御 | 普通行动 |
| `del-meeko` | 德尔·米科 | 免费行动 |
| `e4-medical` | EV系列医疗机器人 | 免费行动 |
| `ewok-medicine` | 草药 | 免费行动：横置 |
| `ewoks-call-to-arms` | 战斗号召 | 免费行动：横置 |
| `ewoks-curiosity` | 无尽好奇 | 免费行动 |
| `force-adept` | 绝地训练，原力精通 | 普通行动 |
| `force-choke` | 原力扼喉 | 免费行动：横置 |
| `force-drain` | 原力汲取 | 免费行动：横置 |
| `force-guidance` | 原力引导 | 免费行动：横置 |
| `force-mind` | 绝地心灵术 | 免费行动：横置 |
| `force-push` | 原力推拉 | 免费行动：横置 |
| `force-reflexes` | 原力反射 | 免费行动：横置 |
| `fx-9-medical` | FX-9医疗机器人 | 免费行动 |
| `gear-ascension` | 攀爬缆索 | 免费行动：横置 |
| `gear-binoculars` | 电子望远镜 | 普通行动 |
| `gear-din-jetpack` | 丁的喷气背包 | 普通行动 |
| `gear-portable` | 便携式扫描仪 | 普通行动 |
| `general-of-the-republic` | 共和国将军 | 普通行动 |
| `governor-pryce` | 普赖斯总督 | 免费行动 |
| `grenade-smoke` | 烟雾手雷 | 免费行动 |
| `hatred` | 憎恨 | 免费行动 |
| `hound-grizzer` | 猎犬与咧嘴 | 普通行动 |
| `hunter` | 猎人 | 免费行动 |
| `imperial-probe-droid` | 帝国探测机器人 | 免费行动：横置 |
| `kallus` | 卡勒斯特工 | 免费行动：横置 |
| `ki-adi-mundi-leader` | 基-阿迪-芒迪 | 免费行动：横置 |
| `limiter-override` | 限幅器解除 | 免费行动：横置 |
| `lok-duk` | 洛克·杜尔德 | 免费行动：横置 |
| `master-duelist` | 绝地训练，决斗大师 | 普通行动 |
| `overclock` | 超频 | 免费行动：横置 |
| `pirate-captain` | 海盗船长 | 免费行动 |
| `pk-worker` | PK系列劳工机器人 | 免费行动 |
| `plo-koon` | 普洛·孔 | 免费行动：横置 |
| `proven-tactician` | 久经考验的战术家 | 普通行动 |
| `r4-astromech` | R4宇航机器人 | 免费行动 |
| `rebel-astromech` | 宇航技工机器人 | 免费行动 |
| `rebel-specialist` | 义军士兵专业兵 | 免费行动：横置 |
| `riot-squad-marksman` | 冲锋队神射手 | 普通行动 |
| `sabine-wren` | 萨宾·雷恩 | 免费行动 |
| `seeker-droid` | 追踪机器人 | 免费行动 |
| `shriv` | 施里夫·苏尔加夫 | 免费行动 |
| `sleeper-marksman` | 义军神射手 | 普通行动 |
| `sliced-comms` | 通信入侵 | 免费行动：横置 |
| `stormtrooper-specialist` | 冲锋队专业兵 | 免费行动：横置 |
| `strategic-programming` | 战略程序 | 普通行动 |
| `tactical-acument` | 绝地训练，战术洞察 | 普通行动 |
| `targeting-relay` | 瞄准中继器 | 免费行动：横置 |
| `training-offensive` | 攻势推进 | 免费行动：横置 |
| `viper-droid` | 蝰蛇侦察机器人 | 普通行动 |
| `wedge-antilles` | 韦奇·安蒂列斯 | 免费行动：横置 |
| `whipcord-launcher` | 缆索发射器 | 普通行动 |
| `upstream-131` | C-3PO | 普通行动、免费行动 |
| `upstream-167` | 伊登的ID10搜索机器人 | 免费行动 |

## 维护

新增或修订卡牌时按实际卡面更新 `actionTypes`；不要仅搜索“行动”二字自动覆盖。保存接口校验枚举、数组类型及重复值，允许旧快照与 `null`；现有编辑器读写会保留此字段。升级编辑器可在 JSON 页编辑，词条 JSON 导出包含此字段。
