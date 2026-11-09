# 升级槽位 ID 对照

本表是上游适配参考，不是最终业务模型。原始 `legion.json` 的 `type`、`upgradeTypes`
和 `id` 不直接作为写表器的运行槽位。语义规则包在 `data/slot-rules.json`（`swl-rules/v1`），
组军引擎使用语义 ID，数字只用于来源追溯（`sourceId`）。

| ID | 英文 | 中文 / 含义 | 图标 |
| --- | --- | --- | --- |
| 1 | Personnel | 人员 | 本地字体符号 |
| 2 | Gear | 装备 | 本地字体符号 |
| 3 | Grenades | 手雷 | 本地字体符号 |
| 4 | Heavy Weapon | 重武器 | 本地字体符号 |
| 5 | Force | 原力 | 本地字体符号 |
| 6 | Comms | 通讯 | 本地字体符号 |
| 7 | Pilot | 驾驶员 | 本地字体符号 |
| 8 | Hardpoint | 挂载点 | 本地字体符号 |
| 9 | Command | 指挥 | 本地字体符号 |
| 10 | Training | 训练 | 本地字体符号 |
| 11 | Generator | 发生器 | 本地字体符号 |
| 12 | Armament | 武装 | 本地字体 B（已对照卡图） |
| 13 | Crew | 乘员 | 本地字体符号 |
| 14 | Ordnance | 弹药 | 暂无可确认的本地图标 |
| 15 | Counterpart | 伙伴 | 暂无可确认的本地图标 |
| 16 | Electrobinoculars | 电动双筒望远镜专用 | 暂无可确认的本地图标 |
| 17 | Portable Scanner | 便携扫描仪专用 | 暂无可确认的本地图标 |
| 18 | Protocol | 程序 | 字体缺失；文字显示，不能用 V 代替 |
| 19 | Squad Leader | 小队队长 | 暂无可确认的本地图标 |
| 20 | Strike and Fade | 打了就跑专用 | 暂无可确认的本地图标 |
| 21 | Door Gunners | 舱门机枪手专用 | 暂无可确认的本地图标 |
| 22 | Imperial March | 帝国行军专用 | 暂无可确认的本地图标 |
| 23 | Dug In | 掘壕专用 | 暂无可确认的本地图标 |
| 24 | Doctrine | 学说 | 暂无可确认的本地图标 |
| 25 | Helmet | 头盔 | 暂无可确认的本地图标 |
| 26 | Hit the Dirt | 卧倒专用 | 暂无可确认的本地图标 |

同一个单位有重复 ID 就表示多个独立槽位，不能去重。规范化后它们是多个
`slots[]` 实例，不是把槽位 ID 当作卡牌特例。
`{"id":18,"required":true}` 表示此槽必须配升级。
条件解锁槽位单独放在 conditionalUpgradeSlots，upgradeId 指向上游升级名称对照；
不会提前算入基础槽，更不会自动解锁。
15 是伙伴槽；16/17/20/21/22/23/26 是 `dedicated` 匹配条件，并不是新增的
通用类别。升级卡的 `type:[2,16]` 会规范化为一个候选组
`["gear", "electrobinoculars"]`，表示二选一匹配，不表示同时占用两个槽。
上游显示标签 C/E/P/SaF/DG/IM/DI/HtD 已结合实际升级 type 数组还原。
上游还声明了 27–30 的图标 URL，但本快照没有单位槽位或升级使用这些 ID，
含义无法确认，暂不加入运行槽位表。

规范化规则包分五部分：`slots` 是语义槽位注册表，`dedicatedGrants` 是专用槽授予，
`upgradeRules` 是角色限定/唯一性/互斥的人工语义覆盖，`modes` 是模式配额与佣兵池，
`battleForces` 是战斗部队骨架。升级卡的默认槽位匹配由卡牌自身 `slotIds` 映射到语义键；
只有角色限定、整军唯一与互斥组等需要人工语义的卡才在 `upgradeRules` 中覆盖。
未覆盖的复杂限制由引擎回退上游快照的 `availableIn`/`unavailableWith` 求值，无法判定时返回 unknown。
不能直接把这些值当作中文名称或本地 ID 猜测。

上游远程图标请求返回 HTTP 403，未伪装成下载成功。已能明确对应的类别改用项目既有
MIT 社区字体，字体及许可随本地项目保存；缺失类别保留文本，不借用其他槽图标。
