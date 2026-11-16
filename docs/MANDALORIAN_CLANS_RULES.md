# 曼达洛氏族：规则识别记录

记录日期：2026-11-17。状态：**图片内容已人工核对；本文件保留原图和早期分析。当前实施解释与用户确认见 [独立引擎说明](MANDALORIAN_ENGINE.md)，实现以该说明优先。**

来源为用户本轮提供的单页 `MANDALORIAN CLANS / SPECIAL RULES` 图片，来源标识 `user-mandalorian-clans-2026-11-17`。图中没有版本、发布日期或页码，不能据此声称是最新版本。原图与逐段英文转录存放在仓库外的同名私有资料组，不进入静态网站。原图 SHA-256：`6978c6d1fe18df6dc8928abffb7844f7eb92ae914392cd7ddf189276bcb38aac`。

以下中文为核对后的工作译文，英文专名保留以便匹配。图标名称通过对应本地单位卡的徽记核对；原图的图标没有被当成无意义装饰省略。本文不改写任何运行时 JSON、点数、候选列表、军阶配额或词条。

## 1. 原图结构与图标

页面包括四段通用规则，以及五个组织专属规则框：左侧四个小框，右侧一个带曼达洛人骷髅徽记的大框。右侧的 **CHOOSE 2 OF THE FOLLOWING** 和五个选项均属于这个大框。

因此记录为“满足通用触发条件后，获得对应组织专属规则；其中曼达洛人组织的规则是五选二”，**不是所有氏族额外都选五项中的两项**。这是根据边框、徽记及通用引导句作出的结构判读。

| 原图符号／位置 | 含义 | 现有本地标识 | 对照依据 |
| --- | --- | --- | --- |
| 双翼三角军阶 | Commander／指挥官 | `rankId: 1` | 指挥官单位卡右上角 |
| 双层尖角军阶 | Operative／特工 | `rankId: 6` | 现有军阶字典与通用规则 |
| 左一，交叉锤钳 | Children of the Watch／守望之子 | `affiliationIds: ["965"]`；选项 `childrenOfTheWatch` | The Armorer 卡图 |
| 左二，圆形鸟面 | Clan Kryze／克里兹氏族 | `affiliationIds: ["1081"]`；选项 `clanKryze` | Bo-Katan Kryze 卡图 |
| 左三，展开双翼 | Clan Wren／雷恩氏族 | `affiliationIds: ["1082"]`；选项 `clanWren` | Ursa Wren 卡图 |
| 左四，三叉长形徽记 | Clan Saxon／萨克森氏族 | `affiliationIds: ["1083"]`；选项 `clanSaxon` | Gar Saxon — Head of Clan Saxon 卡图 |
| 右框，骷髅徽记 | Mandalorian／曼达洛人组织 | `affiliationIds: ["1084"]`；现有选项名 `unaffiliated` | Mandalorian Warriors 卡图 |
| Rapid Deployment 内的距离 2 图标 | Range 2／距离 2 | 数值 `2` | 原图数字与距离符号 |

必须区分“曼达洛人士兵”单位子类型 `unitSubtypeId: "mandalorian_trooper"` 和“曼达洛人”组织 `affiliationIds` 中的 `"1084"`：图中有的条件写 Trooper，有的只画组织徽记，不能统一改成同一个匹配范围。

## 2. 通用规则

### MC-G1：雇佣兵与军阶计数

在曼达洛氏族军队中，雇佣兵单位**计入军阶最低数量要求**，且每个军阶均可包含任意数量的雇佣兵。

这是雇佣兵计数／数量例外，不应未经核对就解释为取消所有军阶数量上限。图中没有军阶配额表。

### MC-G2：全军组织匹配

军队中的每个单位，其组织必须与军队中**至少一个指挥官或特工单位**的组织相同。

这里是逐个单位寻找符合条件的指挥官／特工。不要把它改成“所有单位都必须属于唯一的同一组织”；获得组织专属加成的更严格条件见 MC-G4。

### MC-G3：光明／黑暗立场

在**设置（Setup）**期间，玩家**可以**选择让军队属于光明面或黑暗面。

原文为可选，不是强制二选一；触发时机为 Setup，不是 Army Building。本页未给出不选时的默认值、存档方式或立场相关卡牌准入规则。

### MC-G4：组织专属规则的触发

在**组军（Army Building）**期间，如果你的**全部指挥官和特工单位具有相同组织**，军队获得该组织的特殊规则。

组织匹配应考虑最终有效组织；例如某些升级或 MC-M4 会改变组织。但效果结算顺序尚未实现，不能在此仅靠单位原始 `affiliationIds` 或手选一个氏族来冒充校验。

## 3. 左侧四个组织规则

### MC-C1：守望之子

- 军队可以包含任意数量的 **Mandalorian Initiate（曼达洛学徒）单位**，但仍必须满足本战斗部队的军阶要求。
- 当一个曼达洛学徒单位装备一张**独特的 Personnel（人员）升级**时，该升级费用减少 **5 分**。
- 折扣对象是该次装备的升级卡；不是单位本身，也不是任意类型的独特升级。

### MC-C2：克里兹氏族

在结束阶段的**移除标记步骤**，选择友方单位上的**至多 3 个绿色标记**；这些被选中的标记不移除。

数量是全军合计至多 3 个标记，不是 3 个单位，也不是每个单位保留 3 个。

### MC-C3：雷恩氏族

- 友方**曼达洛人士兵单位**获得 **Guardian 1: Clan Wren／护卫 1：雷恩氏族**。
- 本军队中拥有 Guardian X 的单位，可以对**同样拥有 Guardian X 的其他友方单位**使用该词条。
- 本军队中拥有 Guardian X 的**指挥官和特工**单位可以受益于 **Backup**。

`Guardian 1:` 后的图标与左侧雷恩氏族徽记一致，**不是右框的曼达洛人骷髅徽记**。Backup 是这里引用的规则名称，本页没有其完整定义，不据此新增同名词条或臆造效果。

### MC-C4：萨克森氏族

当一个友方单位击败一个敌方单位时，在该效果结算后，**该友方单位**可以进行一次 **Recover（恢复）行动**，或者进行一次**速度 1 移动**。

两项为“或”，不能同时执行。原文没有印免费行动图标，记录时不擅自增加 `free-action` 元数据。

## 4. 右侧曼达洛人组织规则：五选二

此框隶属于组织 `1084`，现有组织选项称 `unaffiliated`。标题为“选择以下两项”，没有“至多”或“可以重复选择”的表述；后续应表现为五个不同选项中选两项，并由 MC-G4 决定是否获得此规则。

下列中文选项标题是工作译名，不修改现有词典。

### MC-M1：Veterans／老兵

- 每当一个 **Mandalorian Warrior** 单位装备 **GALAAR-15 Carbines** 升级时，该升级费用减少 **5 分**。
- 另外，在 Setup 期间，可以选择 **2 个友方曼达洛人组织单位**；每个被选单位获得 **Dauntless／无畏**。
- 第一项限定单位名称和指定升级；第二项限定组织徽记 `1084`，不是任意曼达洛人士兵。
- 原文第二项写的是“choose 2”，不是“up to 2”。不足两个合格单位时如何处理，本页没有进一步说明。

### MC-M2：Tools of the Trade／行当工具

- 军队可以额外包含 **Flame Projector、Jetpack Rockets、Whipcord Launcher 各 1 张**。
- **这些额外副本**不花费点数，且任意友方**曼达洛人士兵单位**都可以装备，忽略限制。
- 每个单位仍然最多只能装备同一张升级卡的 **1 个副本**。
- “各额外 1 张”是整军额度，不是每个单位都得到一套；免费范围也不是所有正常购买的同名卡。
- 原文只写“ignoring restrictions”，没有展开槽位规则。是否豁免槽位、如何与独特性／专用槽冲突结算，留待实现前明确；不能直接套用现有“没有槽位也能安装”逻辑。

### MC-M3：Rapid Deployment／快速部署

1. 在 Setup 期间，可以将**至多 2 个友方曼达洛人组织单位**暂置一旁。它们必须**没有携带 Asset Objective（资产目标）标记**。
2. 用 **Advantage（优势）标记**标记这些暂置单位。
3. 本局中，每个暂置单位**第一次将被选择激活时**，可以将其部署：若能如此做，将单位队长放到战场上，满足原文的敌方距离要求，再将其余模型按凝聚放置。
4. 如果这样做，该单位被视为**已经激活**，命令标记背面朝上放置。随后该单位失去优势标记。

原文距离句保留为：`not within [Range 2] of all enemy units, if able`。通常可能按“与所有敌方单位均保持距离 2 以外”理解，但原文 `not … all` 的逻辑范围不够严谨；本记录保留原句，不提前将这项推断写成自动校验。未能放置、选择不部署时的后续处理也需结合完整规则确认。

此处“优势标记”是局内 token，不是写表器中选择的优势卡。

### MC-M4：Guns for Hire／雇佣火力

- 军队可包含 **AA-5 Speeder Truck、TX-225 GAVw Occupier Tank 或 WLO-5 Speeder Tank**。
- 这些单位的组织变为**曼达洛人组织 `1084`**。
- 这些单位获得 **Coordinate: Mandalorian Warriors／协同：曼达洛战士** 和 **Independent: Surge 1／独立：激增 1**。
- 协同目标是 Mandalorian Warriors 的名称，不是所有曼达洛人士兵；本条只改组织与词条，不把载具子类型改成士兵。

原句的数量措辞是 `a …, a …, or a …`，没有另外列出数值上限。暂不据此实现“全军总共一辆”或“三种各一辆”；必须先明确数量语义及适用的 A-A5 卡牌版本。图中文字为 `AA-5`，本地卡名为 `A-A5`。

### MC-M5：Feats of Valor／英勇事迹

本军队中一个友方单位击败敌方单位时，在该效果结算后，**该友方单位获得 1 个 Valor（英勇）标记**。

| 持有的 Valor 标记 | 获得的效果 |
| --- | --- |
| 至少 1 个 | 拥有 Dauntless／无畏 |
| 至少 2 个 | 每次自身激活开始时，获得 1 个瞄准、闪避或激增标记，三选一 |
| 至少 3 个 | 拥有 Exemplar／典范 |

这些加成**累积**。2 个标记并不移除无畏；3 个标记时保留前两档效果。不是每个标记都分别增加一次奖励，也不是一次同时获得三种绿色标记。

## 5. 现有数据关联候选

此表只是后续解析依据，不新增运行时关联。名称相同或相似并不自动代表已经确定适用版本。

| 图片中的名称／目标 | 本地记录或字段 | 注意点 |
| --- | --- | --- |
| Mandalorian Clans | `battleForces["8"]` | 当前 `status: text_only`，`machineRules` 为空 |
| Mandalorian Initiate | `mercenary-creedless-mandalorian-initiates` | 名称单复数差异；不要误匹配 `mandalorian-initiate-squad` 升级 |
| Mandalorian Warrior(s) | `mercenary-creedless-mandalorian-warriors-corps`、`mercenary-creedless-mandalorian-warriors-support` | 两张单位卡；后者有 Fire Support 称号，具体规则范围仍需按名称规则核对 |
| GALAAR-15 Carbines | `galaar-15-carbines` | 不含单数 Carbine 的 `galaar-15-leader` |
| Flame Projector | `flame-projector` | 本地英文名含独特圆点 |
| Jetpack Rockets | `mandalorian-rockets-clan` | 不含 `armament-saxon-jetpack-rocket`（Saxon's Jetpack Rockets） |
| Whipcord Launcher | `whipcord-launcher` | 本地英文名含独特圆点 |
| AA-5 Speeder Truck | `mercenary-raiders-aa5-speeder-truck`、`rebels-a-a5-speeder-truck-rebel` | 两条同名 A-A5 记录，尚未指定哪一条／是否都可用 |
| TX-225 GAVw Occupier Tank | `empire-tx-225` | 当前是帝国单位，MC-M4 会影响其准入和有效组织 |
| WLO-5 Speeder Tank | `mercenary-raiders-wlo5-speeder-tank` | 原组织为威奎海盗 `3` |
| Personnel | 语义槽 `personnel` | 与独特性联合判断，不是所有升级类型 |
| Guardian／Dauntless／Coordinate／Independent／Exemplar | `guardian`／`dauntless`／`coordinate`／`independent`／`exemplar` | 复用已有词条 ID 与释义 |

## 6. 与现有实现的差异及后续边界

- 目前运行时保存了四条通用英文文本和扁平选项；该图片补齐了五个组织规则框、五选二层级以及完整效果。不要仅因已有 `options` 就宣称规则已实现。
- Rapid Deployment 在 `slot-rules.json` 的选项 ID 是 `null`，但字典中的 ID 是字符串 `Rapid Deployment`。实现前需统一稳定标识并考虑已有军表，本文没有擅自修正数据。
- `unaffiliated` 是现有选项命名，不等于空 `affiliationIds`；原图右框明确有曼达洛人组织徽记。
- 需要区分组军可计算项（组织准入、雇佣兵计数、额外副本额度、费用修正、有效组织与获得词条）和局内说明（保留标记、部署、击败触发、Valor 累积）。写表器无需模拟整场战斗。
- 本页没有给出 Standard／Recon 配额、完整可用单位清单、点数上限、多个折扣如何叠加或是否有费用下限；这些不能从本图片补造。
- 涉及“任意数量”、跨势力加入、忽略限制和有效组织的结算顺序应先与现有引擎对齐，再编写机器规则；当前不改变现有选择限制。
