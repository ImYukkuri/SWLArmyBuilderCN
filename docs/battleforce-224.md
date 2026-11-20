# 224 装甲师接入记录

本地战斗部队 ID：`27`；帝国势力下可选；V2 验证阶段。
依据用户提供的 `DOC61_BattleForces.pdf` 第 3 页，只执行组军规则。

## 军阶与数量

| 军阶 | 标准 | 侦察 |
|---|---:|---:|
| 指挥官 | 1–5 | 1–4 |
| 特工 | 0–4 | 0–3 |
| 指挥官＋特工合计 | 1–5 | 1–4 |
| 核心 | 4–7 | 3–5 |
| 特种 | 0–3 | 0–2 |
| 支援 | 0–5 | 0–4 |
| 重型 | 0–2 | 0–1 |
| 飞机 | 0–2 | 0–1 |

冲锋队最多 2 个，湿地装备冲锋队最多 4 个。复用现有 9 张单位卡，
不放行普通镇暴小队或 Heavy Response Unit；战壕奇兵在本部队按特种计数。
TIE/ln Fighter 没有本地单位卡，飞机入口保留为空。

学院训练、纵深防御、排长、矛锋在本部队各可携带 2 份，照常付费、占槽、
检查宿主。复制与“应用全部”同样受整军上限约束；超过上限的批量装备整批拒绝。
其他独特升级不受影响，切回普通帝国时恢复原单份规则。

规则页没有额外的升级槽增减规定。现有卡牌的槽位效果沿用原引擎，
例如泥地士兵装备帝国探测机器人后新增重武器槽，移除后撤销。
卡勒斯虽有槽位效果，但不在本部队的独特升级许可名单，不能因此放行。
战壕、掩护与设置阶段效果只保留已有规则文本，不自动执行。

## 卡牌录入状态

以下卡牌已由用户补充中文卡文和卡图。英文、关联词条及审校状态仍需继续核对，
可在对应编辑器中直接维护，无需新建卡。使用本地 ID，没有编造外部编号。

| 编辑器 | 本地 ID | 英文名称／中文暂译 | 已录入的组军信息 |
|---|---|---|---|
| 升级 | `frontal-assault` | Frontal Assault／正面突击 | 5 分，Doctrine 槽，224 帝国军官限定，全军最多 2 份 |
| 指挥卡 | `over-the-top` | Over the Top／跃出战壕 | 1 点，224 限定，命令对象：无单位 |
| 指挥卡 | `in-the-trenches` | In the Trenches／战壕之间 | 2 点，224 限定，命令对象：2 个士兵单位 |
| 指挥卡 | `creeping-barrage` | Creeping Barrage／徐进弹幕 | 3 点，224 限定，命令对象：3 个单位 |

Frontal Assault 的双点标记通过 `rules.limit=2` 表示，`unique=false` 避免被
旧引擎的单份独特限制截断；仍然禁止同一单位装备两张同名升级。
它不属于本部队额外增加一份的四张升级，不能携带第三份。

用户已录入的武器和毒气手雷均保留。毒气手雷 `new-upgrade-mwkggzem`
使用通用的 OR 条件：称号包含战壕奇兵／Trench Buster，或为潮湿气候装备冲锋队。
该条件保存在升级卡自身，不依赖 224 战斗部队。另有历史同名武器记录，未合并或删除。

资料核对：官方[更新公告](https://www.atomicmassgames.com/transmission/legion-november-rules-update/)
确认新卡名称；基本卡牌信息参考公开卡表
[Frontal Assault](https://legion.takras.net/cards/upgrades/frontal-assault/)、
[Over the Top](https://legion.takras.net/cards/command/over-the-top/)、
[In the Trenches](https://legion.takras.net/cards/command/in-the-trenches/)、
[Creeping Barrage](https://legion.takras.net/cards/command/creeping-barrage/)。
初始占位仅核对组军信息；后续卡图及中文卡文由用户补充，仍保留待校对状态。

## 验证入口

写表器新建银河帝国军表 → 战斗部队选择“224装甲师”。
切换 600／1000 分检查侦察／标准配额；特种入口检查战壕奇兵；
军官 Doctrine 槽测试学院训练的第二份与第三份；指挥卡各牌点检查占位。

自动化覆盖候选白名单、配额最小值和上限、指定单位上限、四卡额外副本、复制、
批量装备、宿主限制、现有授予槽位、普通独特卡、切换部队、原生／TTS JSON 往返、
Python 与 JavaScript 校验一致性，以及桌面／手机实际选择及保存重开。
