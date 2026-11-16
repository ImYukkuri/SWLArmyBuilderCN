# 词条时机确认与卡牌引用清单

来源：当前本地 JSON。此表只列词条名称和卡牌引用，不修改时机归属。

写表器与词条编辑器已区分 `global`（全局）和 `army_building`（组军）。以下 28 项按用户于 2026-11-16 提供的完整时机列表更新，未列出的旧时机已移除。表格直接读取当前 JSON；保留原编号，便于后续校对。

时机只决定展示分组，不改变统率、附属、配备、灵活响应等规则引擎按词条 ID 执行的效果。多时机在每个分组各显示一次；已标记行动类型的词条仍优先进入“行动”。

写表器主界面隐藏组军分组；单位详情与候选选择完整显示。例如统率在主界面保留命令阶段，在详情中同时显示组军和命令阶段。

统计包含单位、升级卡正反面、武器、指挥卡的显式词条引用，以及明确 ID 的规则授予和 Equip 关联。每类同一卡牌仅计一次；不根据效果正文猜测词条，也不把所有可装备单位重复列作引用。“未发现引用”表示当前结构化数据未关联，不代表游戏中没有该词条。

| 序号 | 词条 | ID | 当前时机 | 单位 / 升级卡 / 指挥卡 |
| --- | --- | --- | --- | --- |
| 1 | 紧盯奖赏：词条 | `eyes_on_the_prize` | 全局 | 1 / 0 / 1 |
| 2 | 永久 | `permanent` | 全局 | 0 / 0 / 13 |
| 3 | 悬停：地面/空中X | `hover_ground` | 全局 | 10 / 0 / 0 |
| 4 | 副手：单位名称 | `associate` | 组军 | 2 / 0 / 0 |
| 5 | 配备 | `equip` | 组军 | 19 / 0 / 0 |
| 6 | 我们可不是一般货色 | `were_not_regs` | 全局 | 2 / 0 / 0 |
| 7 | 援助：联盟/单位类型 | `aid` | 全局 | 6 / 4 / 0 |
| 8 | 权宜之盟 | `allies_of_convenience` | 组军 | 5 / 3 / 0 |
| 9 | 雇佣兵：阵营 | `mercenary` | 组军 | 28 / 3 / 3 |
| 10 | 附属：单位名称/类型 | `detachment` | 组军、部署 | 10 / 0 / 0 |
| 11 | 重武器小组 | `heavy_weapon_team` | 组军 | 5 / 0 / 0 |
| 12 | 伪装 | `incognito` | 全局 | 7 / 0 / 1 |
| 13 | 激怒X | `enrage` | 全局、移动 | 6 / 0 / 0 |
| 14 | 典范 | `exemplar` | 全局 | 8 / 2 / 0 |
| 15 | 战地指挥官 | `field_commander` | 命令阶段 | 3 / 8 / 2 |
| 16 | 团队合作：单位名称 | `teamwork` | 全局 | 2 / 0 / 3 |
| 17 | 队长 | `leader` | 组军 | 0 / 49 / 0 |
| 18 | 随身武器 ：近战/远程 | `sidearm` | 攻击 | 0 / 16 / 0 |
| 19 | 统率 ：单位名称 | `entourage` | 组军、命令阶段 | 9 / 0 / 0 |
| 20 | 缓慢 | `plodding` | 移动 | 1 / 0 / 0 |
| 21 | 无所顾忌 | `unconcerned` | 防御 | 3 / 0 / 0 |
| 22 | 指挥载具X | `command_vehicle` | 全局 | 3 / 1 / 0 |
| 23 | 负重 | `weighed_down` | 全局 | 4 / 0 / 0 |
| 24 | 程序 | `programmed` | 组军 | 5 / 0 / 0 |
| 25 | 坚守战线 | `hold_the_line` | 全局 | 1 / 0 / 1 |
| 26 | 我也是小队的一员 | `pending_i_m_part_of_the_squad_too` | 全局 | 1 / 1 / 0 |
| 27 | 搭档 | `counterpart` | 组军 | 5 / 6 / 0 |
| 28 | 灵活响应 | `flexible_response` | 组军 | 2 / 1 / 0 |

## 1. 紧盯奖赏：词条 · eyes_on_the_prize

**单位**

- 汉与丘伊 · 恶名昭著的无赖（`mercenary-rogue-han-and-chewie`；正面词条）

**指挥卡**

- 我闻到了好处（`19407`；正面词条）


## 2. 永久 · permanent

**指挥卡**

- 独立程序（`3083`；正面词条）
- 一段美妙的友谊（`7330`；正面词条）
- 我们要静观其变（`18309`；正面词条）
- 恐惧将使他们服从（`18310`；正面词条）
- 胜利时刻（`18902`；正面词条）
- 黑暗降临（`55`；正面词条）
- 爆炸！（`48`；正面词条）
- 外交掩护（`78`；正面词条）
- 第501军团领袖（`2135`；正面词条）
- 无情军火（`46`；正面词条）
- 专注猎杀（`3084`；正面词条）
- 遵命，主人（`5182`；正面词条）
- 你在质问我？（`9457`；正面词条）


## 3. 悬停：地面/空中X · hover_ground

**单位**

- AAT战斗坦克（`separatists-aat`；正面词条）
- DRK-1西斯探测机器人（`separatists-drk1-droid`；正面词条）
- 帝国探测机器人（`empire-imperial-probe-droid`；正面词条）
- LAAT/LE运输巡逻艇（`empire-laat-empire`；正面词条）
- 步兵支援平台（`republic-isp`；正面词条）
- LAAT/LE运输巡逻艇（`republic-laat-gar`；正面词条）
- “军刀”坦克（`republic-saber-class`；正面词条）
- A-A5飞行卡车（`mercenary-raiders-aa5-speeder-truck`；正面词条）
- WLO-5飞行坦克（`mercenary-raiders-wlo5-speeder-tank`；正面词条）
- A-A5飞行卡车（`rebels-a-a5-speeder-truck-rebel`；正面词条）


## 4. 副手：单位名称 · associate

**单位**

- 七妹 · 执着于施加痛苦（`empire-seventh-sister`；正面词条）
- 阿索卡·塔诺 · 学徒指挥官（`republic-ahsoka-padawan-commander`；正面词条）


## 5. 配备 · equip

**单位**

- 特伦奇上将 · 舰队指挥官（`separatists-admiral-trench`；正面词条、Equip 关联）
- 超级战术指挥机器人 · 辅助指挥机器人（`separatists-super-tactica-command-droid-aux`；正面词条、Equip 关联）
- 超级战术指挥机器人 · 指挥控制机器人（`separatists-super-tactica-command-droid-cnc`；正面词条、Equip 关联）
- 塔格将军 · 帝国最高指挥部（`empire-general-tagge`；正面词条、Equip 关联）
- 帝国特工 · 为银河带来秩序（`empire-imperial-agent-order-to-galaxy`；正面词条、Equip 关联）
- 帝国军官 · 冷酷高效（`empire-imperial-officer-ruthless-efficiency`；Equip 关联）
- 帝国特种部队 · 炼狱小队（`empire-inferno-squad`；正面词条、Equip 关联）
- 残次品小队 · 99号克隆人部队（`republic-bad-batch-gar`；正面词条、Equip 关联）
- 克隆人突击队（`republic-clone-commandos`；正面词条、Equip 关联）
- 克隆人突击队 · 德尔塔小队（`republic-delta-squad`；正面词条、Equip 关联）
- 绝地武士 · 和平守护者（`republic-jedi-knight`；正面词条、Equip 关联）
- 绝地武士将军 · 原力强大（`republic-jedi-knight-general`；正面词条、Equip 关联）
- 曼达洛猎人（`mercenary-creedless-mandalorian-hunter`；正面词条、Equip 关联）
- 曼达洛领袖（`mercenary-creedless-mandalorian-leader`；正面词条、Equip 关联）
- 汉与丘伊 · 恶名昭著的无赖（`mercenary-rogue-han-and-chewie`；正面词条、Equip 关联）
- 残次品小队 · 99号克隆人部队（`mercenary-rogue-bad-batch`；正面词条、Equip 关联）
- 卡西安·安多 · 可靠的情报特工（`rebels-cassian`；正面词条、Equip 关联）
- 义军特工 · 民主捍卫者（`rebels-rebel-agent-defender-democracy`；正面词条、Equip 关联）
- 义军军官 · 为自由而战（`rebels-rebel-officer-fight-freedom`；正面词条、Equip 关联）


## 6. 我们可不是一般货色 · were_not_regs

**单位**

- 残次品小队 · 99号克隆人部队（`republic-bad-batch-gar`；正面词条）
- 残次品小队 · 99号克隆人部队（`mercenary-rogue-bad-batch`；正面词条）


## 7. 援助：联盟/单位类型 · aid

**单位**

- 超级战术指挥机器人 · 辅助指挥机器人（`separatists-super-tactica-command-droid-aux`；正面词条）
- 绝地武士 · 骑乘绝地将军（`republic-jedi-barc`；正面词条）
- 黑日维戈（`mercenary-black-sun-black-sun-vigo`；正面词条）
- 洛格雷 · 伊沃克萨满（`mercenary-ewoks-logray`；正面词条）
- 派克辛迪加头目（`mercenary-pyke-syndicate-pyke-syndicate-capo`；正面词条）
- 欧比-旺·克诺比 · 绝地飞车将军（`new-unit-mw9obgc9`；正面词条）

**升级卡**

- 纵深防御（`defend-in-depth`；正面规则授予）
- 秘密配方（`ewok-secret`；正面词条）
- 前线指挥官（`frontline-commander`；正面词条、正面规则授予）
- 矛锋（`tip-of-the-spear`；正面词条、正面规则授予）


## 8. 权宜之盟 · allies_of_convenience

**单位**

- 莎克·蒂 · 绝地委员会（`republic-shaak-ti`；正面词条）
- 加尔·萨克森 · 萨克森氏族首脑（`mercenary-clan-saxon-gar-saxon-leader`；正面词条）
- 加尔·萨克森 · 好战突击队员（`mercenary-maul-loyalists-gar-saxon`；正面词条）
- 摩尔 · 一个劲敌（`mercenary-maul-loyalists-maul-rival`；正面词条）
- 兰多·卡瑞辛 · 精明的将军（`rebels-lando`；正面词条）

**升级卡**

- 暗剑（`bo-katan-darksaber`；正面词条、正面规则授予）
- 地下联系（`command-underworld`；正面词条、正面规则授予）
- 劫掠小队队长（`pilot-raid-leader`；正面词条、正面规则授予）


## 9. 雇佣兵：阵营 · mercenary

**单位**

- 黑日执法者（`mercenary-black-sun-black-sun-enforcers`；正面词条）
- 黑日维戈（`mercenary-black-sun-black-sun-vigo`；正面词条）
- 丁·贾伦 · 曼达洛人（`mercenary-clan-covert-din-djarin-covert`；正面词条）
- 古古 · 小朋友（`mercenary-clan-covert-grogu-covert`；正面词条）
- 阿克斯·沃夫斯 · 机敏战士（`mercenary-clan-kryze-axe-woves`；正面词条）
- 博-卡坦·克里兹 · 曼达洛的拯救者（`mercenary-clan-kryze-bo-katan-kryze`；正面词条）
- 克里兹氏族老兵（`mercenary-clan-kryze-clan-kryze-veterans`；正面词条）
- 雷恩氏族老兵（`mercenary-clan-wren-clan-wren-veterans`；正面词条）
- 厄莎·雷恩 · 雷恩氏族领袖（`mercenary-clan-wren-ursa-wren`；正面词条）
- 曼达洛猎人（`mercenary-creedless-mandalorian-hunter`；正面词条）
- 伊沃克散兵（`mercenary-ewoks-ewok-skirmishers`；正面词条）
- 伊沃克投石兵（`mercenary-ewoks-ewok-slingers`；正面词条）
- 威克特 · 亮树村英雄（`mercenary-ewoks-wicket`；正面词条）
- 派克辛迪加头目（`mercenary-pyke-syndicate-pyke-syndicate-capo`；正面词条）
- 派克辛迪加步兵（`mercenary-pyke-syndicate-pyke-syndicate-footsoldier`；正面词条）
- 洪多·奥纳卡 · 可靠的同伴（`mercenary-raiders-hondo-ohnaka`；正面词条）
- 飞扑摩托骑手（`mercenary-raiders-swoop-bike`；正面词条）
- 威奎海盗（`mercenary-raiders-weequay-pirate`；正面词条）
- WLO-5飞行坦克（`mercenary-raiders-wlo5-speeder-tank`；正面词条）
- 汉与丘伊 · 恶名昭著的无赖（`mercenary-rogue-han-and-chewie`；正面词条）
- 残次品小队 · 99号克隆人部队（`mercenary-rogue-bad-batch`；正面词条）
- 波巴·费特 · 莫斯埃斯帕大名（`mercenary-rogue-boba-fett-daimyo`；正面词条）
- 波巴·费特 · 恶名昭著的赏金猎人（`mercenary-rogue-boba-fett-infamous`；正面词条）
- 博斯克 · 特兰多沙恐怖猎手（`mercenary-rogue-bossk`；正面词条）
- 凯德·贝恩 · 无需介绍（`mercenary-rogue-cad-bane`；正面词条）
- IG-11 · 照料与保护（`mercenary-rogue-ig-11`；正面词条）
- IG-88 · 恶名昭著的刺客机器人（`mercenary-rogue-ig-88`；正面词条）
- 欧米伽 · 99号部队的吉祥物（`mercenary-rogue-omega`；正面词条）

**升级卡**

- 古古（`upstream-22586`；正面词条）
- 古古（`upstream-3649`；正面词条）
- 欧米伽（`upstream-15628`；正面词条）

**指挥卡**

- 审慎（`1903`；正面词条）
- 侵攻（`1902`；正面词条）
- 夺取一切力量（`1827`；正面词条）


## 10. 附属：单位名称/类型 · detachment

**单位**

- BX系列机器人突击队 · 打击小队（`separatists-bx-strike`；正面词条）
- DRK-1西斯探测机器人（`separatists-drk1-droid`；正面词条）
- DF-90迫击炮部队（`empire-df-90-mortar`；正面词条）
- 帝国探测机器人（`empire-imperial-probe-droid`；正面词条）
- 侦察兵 · 打击小队（`empire-scout-strike`；正面词条）
- ARC士兵 · 打击小队（`republic-arc-troopers-strike`；正面词条）
- 曼达洛战士 · 火力支援（`mercenary-creedless-mandalorian-warriors-support`；正面词条）
- K-2SO · 爱挖苦的安保机器人（`rebels-k-2so`；正面词条）
- MARK II中型爆能枪士兵（`rebels-mark-2-blaster`；正面词条）
- 义军突击队 · 打击小队（`rebels-rebel-commandos`；正面词条）


## 11. 重武器小组 · heavy_weapon_team

**单位**

- BX系列机器人突击队 · 打击小队（`separatists-bx-strike`；正面词条）
- 侦察兵 · 打击小队（`empire-scout-strike`；正面词条）
- ARC士兵 · 打击小队（`republic-arc-troopers-strike`；正面词条）
- 曼达洛战士 · 火力支援（`mercenary-creedless-mandalorian-warriors-support`；正面词条）
- 义军突击队 · 打击小队（`rebels-rebel-commandos`；正面词条）


## 12. 伪装 · incognito

**单位**

- BX系列机器人突击队 · 打击小队（`separatists-bx-strike`；正面词条）
- DRK-1西斯探测机器人（`separatists-drk1-droid`；正面词条）
- 侦察兵 · 打击小队（`empire-scout-strike`；正面词条）
- ARC士兵 · 打击小队（`republic-arc-troopers-strike`；正面词条）
- 丘巴卡 · 让伍基人赢（`mercenary-ewoks-chewbacca`；正面词条）
- K-2SO · 爱挖苦的安保机器人（`rebels-k-2so`；正面词条）
- 义军突击队 · 打击小队（`rebels-rebel-commandos`；正面词条）

**指挥卡**

- 科雷利亚尖刺（`16618`；正面词条）


## 13. 激怒X · enrage

**单位**

- 萨瓦奇·奥普雷斯 · 杜库的学徒（`separatists-save-opress-cis`；正面词条）
- 五哥 · 由我猎杀（`empire-fifth-brother`；正面词条）
- 丘巴卡 · 卡希克的英雄（`republic-chewbacca-gar`；正面词条）
- 萨瓦奇·奥普雷斯 · 摩尔的打手（`mercenary-maul-loyalists-savage-opress-maul`；正面词条）
- 博斯克 · 特兰多沙恐怖猎手（`mercenary-rogue-bossk`；正面词条）
- 丘巴卡 · 行走的毛毯（`rebels-chewbacca-rebel`；正面词条）


## 14. 典范 · exemplar

**单位**

- 卡拉尼 · 超级战术机器人（`separatists-kalani`；正面词条）
- 克拉肯 · 超级战术机器人（`separatists-kraken`；正面词条）
- T系列战术机器人 · 战略程序机器人（`separatists-tactical-droid`；正面词条）
- 塔格将军 · 帝国最高指挥部（`empire-general-tagge`；正面词条）
- 索龙元帅 · 帝国最高统帅部（`empire-grand-admiral-thrawn`；正面词条）
- 奥尔森·克伦尼克总监 · 恐怖筑星者（`empire-orson-krennic`；正面词条）
- 维尔斯将军 · 战术大师（`empire-veers`；正面词条）
- 莱娅·奥加纳 · 无惧与创新（`rebels-leia-organa`；正面词条）

**升级卡**

- 学院训练（`academy-trained`；正面词条、正面规则授予）
- 久经考验的战术家（`proven-tactician`；正面词条、正面规则授予）


## 15. 战地指挥官 · field_commander

**单位**

- 马昆德少校 · 风暴侦察机2号（`empire-marquand`；正面词条）
- 帕兹·维兹拉 · 骄傲的战士（`mercenary-clan-covert-paz-vizsla`；正面词条）
- 卡西安·安多 · 可靠的情报特工（`rebels-cassian`；正面词条）

**升级卡**

- 艾拉·塞库拉（`aayla`；正面词条、正面规则授予）
- 克隆人指挥官福克斯（`clone-fox`；正面词条、正面规则授予）
- 韦斯将军（`general-weiss`；正面词条、正面规则授予）
- 普赖斯总督（`governor-pryce`；正面词条、正面规则授予）
- 劫掠小队队长（`pilot-raid-leader`；正面词条、正面规则授予）
- 施里夫·苏尔加夫（`shriv`；正面词条、正面规则授予）
- T系列战术机器人驾驶员（`t-series-pilot`；正面词条、正面规则授予）
- 韦奇·安蒂列斯（`wedge-antilles`；正面词条、正面规则授予）

**指挥卡**

- 空中支援（`98`；正面词条）
- 轨道打击（`95`；正面词条）


## 16. 团队合作：单位名称 · teamwork

**单位**

- 丘巴卡 · 行走的毛毯（`rebels-chewbacca-rebel`；正面词条）
- K-2SO · 爱挖苦的安保机器人（`rebels-k-2so`；正面词条）

**指挥卡**

- 一段美妙的友谊（`7330`；正面词条）
- 家族重聚（`6509`；正面词条）
- 信任是相互的（`40`；正面词条）


## 17. 队长 · leader

**升级卡**

- 阿萨吉·文崔斯（`asajj-heavy`；正面词条）
- 艾克斯·沃尔夫（`axe-woves`；正面词条）
- OOM系列战斗机器人（`b1-oom`；正面词条）
- 博-卡坦·克里兹（`bo-katan-kryze`；正面词条）
- 卡西安·安多（`cassian-andor`；正面词条、反面词条）
- 丘巴卡（`chewbacca-heavy`；正面词条）
- 沸腾（`clone-boil`；正面词条）
- 克隆人上尉（`clone-captain`；正面词条）
- 克隆人指挥官（`clone-commander`；正面词条）
- 克隆人上尉雷克斯（`clone-rex`；正面词条）
- 克隆人指挥官科迪（`cody-squad`；正面词条）
- 丁·贾林（`din-djarin`；正面词条）
- DT-F16（`dt-f16`；正面词条）
- 回声，ARC神射手（`echo-arc`；正面词条）
- 五弟（`fifth-brother`；正面词条）
- 五号（`fives`；正面词条）
- 绝地守护者（`gar-jedi-guardian`；正面词条）
- 加尔·萨克森（`gar-saxon`；正面词条）
- 吉迪恩·哈斯克（`gideon-hask`；正面词条）
- 格里弗斯将军（`grievous-heavy`；正面词条）
- 鲁克·卡斯特（`heavy-rook-kast`；正面词条）
- 猎人（`hunter`；正面词条）
- 帝国军官（`imperial-officer`；正面词条）
- 琴·厄索（`jyn-erso`；正面词条）
- 卡勒斯特工（`kallus`；正面词条）
- 基-阿迪-芒迪（`ki-adi-mundi-leader`；正面词条）
- 克拉肯（`kraken`；正面词条）
- 卢克·天行者（`luke-skywalker`；正面词条）
- 梅斯·温杜（`mace-windu-leader`；正面词条）
- 欧比-旺·克诺比（`obiwan-heavy`；正面词条）
- 帕兹·维兹拉（`paz-vizzla`；正面词条）
- 黑日维戈（`personnel-blacksun-vigo`；正面词条）
- 派克辛迪加头目（`personnel-pyke-capo`；正面词条）
- 普洛·孔（`plo-koon-leader`；正面词条）
- 义军士兵上尉（`rebel-captain`；正面词条）
- 义军军官（`rebel-officer`；正面词条）
- 鲁克·卡斯特（`rook-kast-clan`；正面词条）
- 萨宾·雷恩（`sabine-wren`；正面词条）
- 七妹（`seventh-sister`；正面词条、正面规则授予）
- 莎克·蒂（`shaak-ti`；正面词条）
- 阿索卡·塔诺，绝地学徒（`squad-leader-ahsoka`；正面词条）
- 冲锋队上尉（`stormtrooper-captain`；正面词条）
- T系列战术机器人（`t-series-tactical`；正面词条）
- 军械师（`the-armorer`；正面词条）
- 特里斯坦·雷恩（`tristan-wren-clan`；正面词条）
- 厄萨·雷恩（`ursa-wren-clan`；正面词条）
- 打蜡（`waxer`；正面词条）
- 威奎船长（`weequay-captain`；正面词条）
- 汉·索罗，亡命走私犯（`upstream-23420`；正面词条）


## 18. 随身武器 ：近战/远程 · sidearm

**升级卡**

- 暗剑（`armament-maul-darksaber`；正面词条）
- 阿萨吉·文崔斯（`asajj-heavy`；正面词条）
- 电杖海盗（`electrostaff-pirate`；正面武器：电杖）
- 五弟（`fifth-brother`；正面词条）
- 格里弗斯将军（`grievous-heavy`；正面词条）
- 琴·厄索（`jyn-erso`；正面词条）
- 卡勒斯特工（`kallus`；正面词条）
- 基-阿迪-芒迪（`ki-adi-mundi-leader`；正面词条）
- 卢克·天行者（`luke-skywalker`；正面词条）
- 梅斯·温杜（`mace-windu-leader`；正面词条）
- 欧比-旺·克诺比（`obiwan-heavy`；正面词条）
- 普洛·孔（`plo-koon-leader`；正面词条）
- 七妹（`seventh-sister`；正面词条、正面规则授予）
- 莎克·蒂（`shaak-ti`；正面词条）
- T系列战术机器人（`t-series-tactical`；正面词条）
- 蝰蛇侦察机器人（`viper-droid`；正面词条）


## 19. 统率 ：单位名称 · entourage

**单位**

- 特伦奇上将 · 舰队指挥官（`separatists-admiral-trench`；正面词条）
- 格里弗斯将军 · 轮式摩托军阀（`separatists-grievous-wheelbike`；正面词条）
- 格里弗斯将军 · 邪恶的半机器人（`separatists-grievous`；正面词条）
- 下等人波格尔 · 吉奥诺西斯人公开领袖（`separatists-poggle`；正面词条）
- 星区总督吉迪恩 · 帝国万岁（`empire-gideon`；正面词条）
- 高级星区总督塔金 · 帝国最高统帅部（`empire-grand-moff-tarkin`；正面词条）
- 奥尔森·克伦尼克总监 · 恐怖筑星者（`empire-orson-krennic`；正面词条）
- 厄莎·雷恩 · 雷恩氏族领袖（`mercenary-clan-wren-ursa-wren`；正面词条）
- 欧比-旺·克诺比 · 绝地飞车将军（`new-unit-mw9obgc9`；正面词条）


## 20. 缓慢 · plodding

**单位**

- 帝国黑暗士兵（`empire-dark-troopers`；正面词条）


## 21. 无所顾忌 · unconcerned

**单位**

- 水陆两栖机器人（`separatists-aqua-droids`；正面词条）
- 机器佣兵（`separatists-droidekas`；正面词条）
- 帝国黑暗士兵（`empire-dark-troopers`；正面词条）


## 22. 指挥载具X · command_vehicle

**单位**

- 格里弗斯将军 · 轮式摩托军阀（`separatists-grievous-wheelbike`；正面词条）
- 绝地武士 · 骑乘绝地将军（`republic-jedi-barc`；正面词条）
- 欧比-旺·克诺比 · 绝地飞车将军（`new-unit-mw9obgc9`；正面词条）

**升级卡**

- 帮派头目（`gangster-boss`；正面词条、正面规则授予）


## 23. 负重 · weighed_down

**单位**

- 吉奥诺西斯工程兵 · 战士（`separatists-geonosian-engineer`；正面词条）
- 吉奥诺西斯战士 · 巢穴战士（`separatists-geonosian`；正面词条）
- 下等人波格尔 · 吉奥诺西斯人公开领袖（`separatists-poggle`；正面词条）
- 森·法克 · 无情的副官（`separatists-sun-fac`；正面词条）


## 24. 程序 · programmed

**单位**

- DSD1矮蜘蛛机器人（`separatists-dsd1-dwarf`；正面词条）
- LM-432蟹型机器人（`separatists-lm-432-crab`；正面词条）
- “说服者级”坦克机器人（`separatists-persuader`；正面词条）
- “说服者级”坦克机器人 · 原型坦克机器人（`separatists-persuader-prototype`；正面词条）
- IG-11 · 照料与保护（`mercenary-rogue-ig-11`；正面词条）


## 25. 坚守战线 · hold_the_line

**单位**

- 冲锋队镇暴小队（`empire-riot-squad`；正面词条）

**指挥卡**

- 面对我！（`99`；正面词条）


## 26. 我也是小队的一员 · pending_i_m_part_of_the_squad_too

**单位**

- 欧米伽 · 99号部队的吉祥物（`mercenary-rogue-omega`；正面词条）

**升级卡**

- 欧米伽（`upstream-15628`；正面词条）


## 27. 搭档 · counterpart

**单位**

- 伊登的ID10搜索机器人 · “机器人”（`empire-id10-seeker`；正面词条）
- C-3PO · 人机关系机器人（`republic-c3po`；正面词条）
- 古古 · 小朋友（`mercenary-clan-covert-grogu-covert`；正面词条）
- 欧米伽 · 99号部队的吉祥物（`mercenary-rogue-omega`；正面词条）
- C-3PO · 人机关系机器人（`rebels-c-3po-cyborg`；正面词条）

**升级卡**

- “保姆”程序（`programming-nanny`；正面词条）
- C-3PO（`upstream-131`；正面词条）
- 古古（`upstream-22586`；正面词条）
- 古古（`upstream-3649`；正面词条）
- 伊登的ID10搜索机器人（`upstream-167`；正面词条）
- 欧米伽（`upstream-15628`；正面词条）


## 28. 灵活响应 · flexible_response

**单位**

- 冲锋队 · 重型反应单位（`empire-stormtroopers-hwu`；正面词条）
- 游击队士兵（`rebels-guerilla-troopers`；正面词条）

**升级卡**

- 嘉奖：灵活应对（`tod-flexible-response`；正面词条）
