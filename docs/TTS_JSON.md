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
| battleForce | 有战斗部队时输出英文名称，HQ 已支持此可选字段 |
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
