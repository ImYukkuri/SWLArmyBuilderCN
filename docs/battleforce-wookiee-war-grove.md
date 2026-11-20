# 伍基人林地战团 / Wookiee War Grove

2026-11-20：按 DOC61 战斗部队规则第 21 页及用户提供的更新卡图启用，继续使用战斗部队本地 ID `21`。中文卡名、卡文为待校对译文。

## 卡牌录入

| 类别 | 卡牌 | 费用 | 槽位或牌点 |
| --- | --- | --- | --- |
| 单位（更新） | Wookiee Chieftain · Clan Leader | 85 | 指挥、训练、训练、装备 |
| 单位（更新） | Raddaugh Gnasp Fluttercraft · Attack Craft | 62 | 乘员、通讯；必须装备乘员 |
| 单位（新增） | Wookiee Warriors · Treetop Defenders | 69 | 重武器、训练、装备、手雷 |
| 单位（新增） | Wookiee Warriors · Fearsome Guardians | 72 | 重武器、训练、装备、手雷 |
| 升级（新增） | Eyes and Ears | 8 | 训练；ARF 士兵；全军最多 2 张 |
| 升级（新增） | Veteran Operators | 8 | 训练；帝国特种部队；排除配备；全军最多 2 张 |
| 升级（新增） | Wookiee Battle Cries | 5 | 指挥；酋长；伍基人林地战团限定 |
| 升级（更新） | Mag-Det Enforcer | 16 | 重武器；黑日执法者 |
| 升级（新增） | War Grove Battle Shield Wookiee | 32 | 重武器；伍基战士；伍基人林地战团限定 |
| 升级（新增） | War Grove Bowcaster Wookiee | 31 | 同上 |
| 升级（新增） | War Grove Long Gun Wookiee | 28 | 同上 |
| 升级（更新） | Gnasp Bombardier / Gnasp Gunner | 20 / 15 | 乘员；扑翼机 |
| 升级（新增） | War Grove Gnasp Bombardier / War Grove Gnasp Gunner | 20 / 15 | 乘员；扑翼机；伍基人林地战团限定 |
| 指挥（新增） | Crashing Counterattack / Ferocious Leadership / Relentless Resistance | — | 1 / 2 / 3 牌点；伍基人林地战团限定 |

同名已存在记录沿用本地 ID；两个新战士形态各有新 ID，不替换 Noble Fighters / Kashyyyk Defenders。酋长与攻击艇按新卡面的 Special Issue 限定到伍基人林地战团。旧军表保留记录，重新校验当前许可与槽位。

## 规则接入

- 复用 V2 战斗部队引擎：军阶配额、许可单位、独特升级白名单、至少 2 队树梢保卫者，以及克隆步兵、BARC、ISP、军刀级坦克的数量上限。
- 树梢保卫者的 Tenacity 设为 0 分，按宿主匹配计价，不修改全局升级原价。候选卡、军表合计、导入导出共用计价。
- 本部队的扑翼机获得 Transport，来源单位不变。
- Veteran Operators 使用通用条件 `unit.hasEquip = false`；同时识别词条、`equipUpgradeIds`、`equipSlotIds` 及旧必带升级关联。编辑器提供是／否选择。
- 自动装备先完成指定的 Equip，再处理其他槽位。非 Equip 槽位仅在全部合法候选中恰有 1 张且当前费用为 0 时安装；Equip 指定槽位唯一候选可为付费卡。每次装备走正常选择校验，持续遍历新增槽位。
- TTS 导出使用 Wookiee War Grove；导入仍识别旧名称 Wookiee Defenders。

## 待补资料

尤达升级卡已按用户补充的卡图录入模板（`yoda-heavy`）：20 分、独特、重武器槽。
宿主匹配克隆人士兵部队的名称标识，或共和国＋伍基人士兵子类型；加入本部队独特升级许可。
卡面未限定为战斗部队专属，基础共和国也按宿主条件使用。
装备后增加 1 个重武器槽，复用现有槽位授予／卸载清理；包含非战斗人员、卡图及待校对中英文卡文。

V-Wing 单位卡仍未提供，本地尚无记录，许可清单保留待补项。
