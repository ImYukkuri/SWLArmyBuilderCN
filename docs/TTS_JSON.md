# TTS JSON 兼容

导入／导出默认选择 **TTS JSON格式**，也可选择 **原生 JSON格式（完整备份）**。导入支持文件和粘贴，先预览、解决名称歧义，再保存为新军表；失败或取消不修改当前军表。原生格式兼容原有完整记录与裸 `army` 对象。

## 格式依据与字段

已对照用户给出的 13 激活义军、10 激活共和国示例，以及 [Legion HQ](https://legionhq2.com/) 2026-11-16 运行版本的 TTS 导出逻辑。基础字段定义也可见 [TTS 模组格式文档](https://github.com/swlegion/tts/wiki/List-Import-Format)。该文档较旧，阵营与任务牌分类以当前 HQ 导出和用户示例为准。

| TTS 字段 | 本地处理 |
| --- | --- |
| author | SWLArmyBuilderCN，注明实际生成工具 |
| listname | 军表名称 |
| points | 现有规则引擎计算的已用点数，不是上限 |
| numActivations | 独立单位实例数量，合并显示的相同单位仍逐条导出 |
| armyFaction | 义军 rebel、帝国 empire、共和国 republic、分离主义 separatist |
| battleForce | 使用 battleForces 映射中的标准英文引用，独立于可编辑显示名称 |
| commandCards | 指挥卡英文引用；Standing Orders 输出一次 |
| contingencies | 备用指挥卡；导入保留在 contingencyIds 中并可再次导出，当前无专门编辑界面 |
| units | 单位英文名＋称号；upgrades 为实体升级卡英文名称数组 |
| units[].loadout | 如有，保留在 ttsLoadout 中并再次导出；不模拟备用装备切换 |
| battlefieldDeck.conditions | 优势卡 |
| battlefieldDeck.deployment | 主要任务 |
| battlefieldDeck.objective | 次要任务 |
| battlefieldDeck.scenario | standard 或 recon |
| listlink | 始终为空字符串；不解析或生成 HQ 压缩链接 |

TTS 没有分数上限。导入 standard 默认 1000，recon 默认 600，均可在预览时修改；不能把示例的 983 已用点数当作 983 分上限。现有“600 及以下侦察、超过 600 标准”的规则继续适用。卡牌点数更新导致原文件与本地计算不同，会显示双方数值，不覆盖本地点数。

曼达洛人和暗影集会在当前 HQ 导出实现中仍出现空 armyFaction；本工具输出 `mandalorian`／`mercenary` 并附带 `Mandalorian Clans`／`Shadow Collective`，界面明确提示需核对接收模组版本。导入可指定缺失势力。不能保证所有旧 TTS 模组都识别这两类代码。

## 战斗部队名称

2026-11-16 对照 [Legion HQ 战斗部队索引](https://legionhq2.com/static/js/471.f021ef23.chunk.js)，本地 15 个战斗部队全部建立 `data/tts-names.json.battleForces` 映射，包含标准名称、HQ ID 和本地所属势力 ID。运行时读取本地映射，不请求上游。

| 本地 ID | 标准 TTS 名称 | 所属势力 |
| --- | --- | --- |
| 7 | Imperial Remnant | 银河帝国 |
| 8 | Mandalorian Clans | 曼达洛人 |
| 9 | Shadow Collective | 暗影集会 |
| 10 | Stormtrooper Battalion | 银河帝国 |
| 11 | Separatist Invasion | 分离主义 |
| 12 | 212th Attack Battalion | 银河共和国 |
| 13 | Echo Base Defenders | 义军 |
| 14 | The Ohnaka Gang | 暗影集会／佣兵 |
| 15 | Rapid Interdiction Force | 分离主义 |
| 16 | 501st Legion | 银河共和国 |
| 17 | Blizzard Force | 银河帝国 |
| 18 | Bright Tree Village | 义军 |
| 19 | Tempest Force | 银河帝国 |
| 20 | Experimental Droids | 分离主义 |
| 21 | Wookiee Defenders | 银河共和国 |

原先导入仅匹配名称字典，212 的本地英文名 `212 Attack Battalion` 缺少 `th`，因此无法匹配。现在兼容两种写法，导出始终使用标准名。其余 14 项没有发现同类拼写差异；另修正奥纳卡帮缺少所属势力映射的问题。用户提供的 212 示例已验证 9 激活、999 分及全部升级、指挥卡和任务／优势卡往返导入导出。

规则库 → 战斗部队可修改中英文显示名称；保存同步 `slot-rules.json` 与 `catalog-definitions.json`，旧英文名保留在 `nameAliases`。改名不会改变固定 ID、规则关联和标准 TTS 引用。遇到未知、重复或势力不符的战斗部队名称时，导入暂停并提供当前势力内的搜索选择器，不自动猜测。

224th Armored Division 已接入本地部队 27，可按英文部队名导入导出；四张指定升级的第二份也按同一个卡牌名称重复记录。TIE/ln Fighter 尚未录入，相关引用仍会提示缺项。新增卡牌占位的英文名可用于本地往返，但尚未与 TTS 客户端逐卡实测。

## 双面卡与伙伴

双面卡始终只输出一次，不包含显示朝向。导入默认正面；原生 JSON 保留 front／back／both。

| 本地实体 ID | TTS 名称 |
| --- | --- |
| commandos-sniper-a | DC-17m ICWS Config |
| e-11d-focused-fire | E-11D Focused Fire Config |
| cassian-a280-pistol | A280, Rifle Config |
| battleshield-1 | Battle Shield Wookiee (Offensive) |
| geonosian-pike-1 | Force Pike Warrior |
| cassian-andor | Cassian Andor |
| b2-anti-infantry-missile | Missile Pod Rocket Droid |

攻击姿态／防御姿态继续保持两张本地升级卡；没有为了对齐 HQ 而合并，也未新增旧版双面卡。防御姿态尚未找到独立 HQ 名称，导出会提示。

伙伴输出在母单位 upgrades 中，不增加激活数。C-3PO 根据母单位阵营区分 `C-3PO Human-Cyborg Relations` 与 `C-3PO Human Cyborg Relations (GAR)`。升级按实际槽位分配，支持先装备授予槽位的升级；不会在导入时自动重复添加 Equip 必带项。

## 英文引用校对

`data/tts-names.json` 只保存本地 ID → TTS 名称及 HQ ID，运行时不请求 HQ。规则为优先 `ttsName`，否则单位／伙伴使用“cardName 空格 title”，升级使用“cardName 逗号 title”。独特符号、阵营后缀、双面统称与印刷名称不可机械拼接。

首轮校对覆盖 **186/186 单位记录（含伙伴）、454/528 升级、242/247 指挥卡、43/43 不重复任务／优势卡**。两个用户示例所有名称和槽位均可解析，重新导出保留其名称集合、重复单位及三类牌组，分数分别为 1000 和 983。

未校对升级有 63 张 `tod-` 战役成长记录，以及：Defensive Stance、A-180、A-300、Bistan、Electrostaff Guard、Iden's DLT-20A Rifle、Iden's TL-50 Repeater、J-19 Bo-rifle、Looted E-5 Blaster、Mandalorian Combat Shields、Pao。

未校对指挥卡：Rebellious、And Now You Will Die、An Entire Legion、Complete the Mission、Give in to Your Anger。当前 HQ 索引没有找到这些独立记录，不能自动拿近似名称的新卡替换。

导入按已校对名称与本地别名匹配，使用势力、母单位要求和槽位消除歧义；不做模糊自动选择，不将字母 O 与数字 0 混同。重音、标点、大小写和 `&`／`and` 可以规范化。同名仍有多个候选或查无名称时，显示可搜索选择器让用户指定。已知但编制不合法的军表可保留，由正常规则校验显示问题；无法分配槽位的项目不静默丢弃。

导出缺少校对映射时使用现有英文名，并逐项提示。可通过增加核实后的 ID 映射持续提高覆盖率，但名称校对不能补齐接收端缺少的卡牌资源。没有实际运行 Steam / TTS 模组，当前验收范围为与 HQ 命名规则及 JSON 格式一致。

执行 `python tools/audit_tts_names.py` 查看完整未校对列表；`--json` 输出结构化报告。新增映射前核对卡名、称号、卡类型、使用对象和阵营，不以相似度直接确认。下载的 HQ 脚本与原始核对资料置于仓库外，不进入静态发布。
