# 双面升级卡

升级记录顶层保留 `id`、`points`、`slotIds`、`usage`、选择规则 `rules` 和 `restrictions`。`dualSided: true` 启用双面；正面沿用顶层 `name`、`description`、`keywords`、`weapons`、`assets`，背面在 `back` 中独立存储这五组字段。中英文卡文仍为段落数组，词条仍引用统一词条库。没有背面费用。

`actionTypes` 同样按正反面分别存储，不共用或继承；缺失时表示尚未分类。详见 [行动触发标记](ACTION_TYPES.md)。

军表中的升级实例使用 `face: "front" | "back" | "both"` 保存显示状态；旧记录缺省为正面。候选区每张实体卡只显示一条正面记录，选入时默认正面，占一个升级槽、计算一次费用。装备后可在军表或大图选择正面、反面、双面，两处使用同一个实例状态；从合并单位切换时只修改被点击的第一个实例，配置不同的单位自然分开显示。复制、批量装备、导出与分享保留状态。

`both` 同时展示两面的卡名、卡图、效果、词条、武器和武器词条；展开升级列表增加背面一行，不生成第二个升级实例。武器来源标明正反面，同名不同骰池分别显示。它是资料展示模式，不表示对局中两面效果可以同时生效。翻面仅刷新受影响单位，保留其他区域与滚动位置；卡图按页面会话缓存，大图保留两个图片节点。

编制约束与费用始终使用共用数据，翻面不会移除已装备升级或改变编制槽位。卡文的战斗效果按当前面展示；此改造不模拟对局触发时机、属性修正或耗竭状态。

## 本次合并

| 正面 ID（保留） | 背面旧 ID（兼容导入） |
| --- | --- |
| cassian-a280-pistol | cassian-a280-sniper |
| e-11d-focused-fire | e-11d-grenade-launcher |
| commandos-sniper-a | commandos-sniper-b |
| battleshield-1 | battleshield-2 |
| geonosian-pike-1 | geonosian-pike-2 |
| cassian-andor | cassian-andor-2 |
| b2-anti-infantry-missile | b2-anti-infantry-missile-flipside |

`back.legacyId` 只用于旧军表引用迁移，`back.source` 保留原上游和校对信息，不是另一套机器约束。DC-17m 以正面的配置槽为共同槽位，迁移旧背面时仅在配置槽空闲的情况下调整旧槽位。未知引用或已有冲突不会被删除。

攻防姿态按用户要求保留两个独立升级记录。A-180、A-300、J-19 及旧 A280-CFE 未新增或登记。此次规则、译文和图片均取自已存在的现行两面记录，没有为缺失字段编造内容。

网页资料核对见：[官方卡包](https://www.atomicmassgames.com/product_type/card-pack/)、[E-11D 官方卡表](https://cdn.svc.asmodee.net/production-amgcom/uploads/2025/04/DOC13_GalacticEmpire_Upgrades-1.pdf)、[DC-17m 裁定](https://forums.atomicmassgames.com/topic/16411-clone-commando-weapon-config/)、[双面规则示例](https://cdn.svc.asmodee.net/production-amgcom/uploads/2025/11/SWQ_Rulebook_11.11.2025.pdf)、[卡西安升级](https://www.atomicmassgames.com/transmission/star-wars-legion-ministrav-card-update/)、[导弹舱裁定](https://forums.atomicmassgames.com/topic/21358-choosing-rocket-b2-missile-pod-rocket-droid-side/)。
