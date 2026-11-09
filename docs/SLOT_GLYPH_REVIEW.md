# 槽位字形视觉核对

日期：2026-11-07。只修改显示数据，不修改槽位 ID、组军规则或引擎。

核对来源是本地 assets/legion-icons.ttf 及 work/slot-glyph-ref 下的字形图片，
并与本地升级卡左上角的槽位符号逐项比对。字体来自
[Owen-A/Legion-font](https://github.com/Owen-A/Legion-font)，沿用项目现存 MIT 许可。
README 能证明版本加入过图标，但没有字母映射表；以下映射来自实际字形与卡图。

## 17 个大写字形

| 字母 | 确认含义 | 槽位来源 ID |
| --- | --- | --- |
| A | Crew / 乘员（驾驶员胸像） | 13 |
| B | Armament / 武装（爆能手枪） | 12 |
| C | Command / 指挥（三点面板） | 9 |
| D | 白色防御骰（空心方体），不是槽位 | — |
| E | 红色防御骰（实心方体），不是槽位 | — |
| F | Force / 原力 | 5 |
| G | Gear / 装备（背包） | 2 |
| H | Hardpoint / 挂载点 | 8 |
| I | Generator / 发生器 | 11 |
| L | 卡牌韧性阈值形框，不用于槽位 | — |
| M | Training / 训练（双 V） | 10 |
| N | Grenades / 手雷 | 3 |
| O | Comms / 通讯（圆柱设备） | 6 |
| P | Pilot / 驾驶员（操纵杆） | 7 |
| U | Personnel / 人员（持枪士兵） | 1 |
| V | 普通齿轮形；没有与本批槽位图标确认对应，含义暂不认定 | — |
| W | Heavy Weapon / 重武器（扛重武器士兵） | 4 |

V 与程序卡左上角的环形、中央星形图标不同，不能因都是齿轮就映射到 Protocol。
13 种槽位得到确认，并不是 17 种。

## 缺失图标的 13 项

字体缺少可确认的通用槽位字形：14 弹药、18 程序、19 小队队长、24 学说、25 头盔。
保留既有 iconUrl 作为来源线索；此前获取状态为 upstream_403，不把它当可用资源加载。
本次没有新增远程依赖或下载官方图标；页面保留名称显示。

另外 8 项是伙伴或专用匹配通道：15、16、17、20、21、22、23、26。
上游没有为这些项提供独立图标 URL，不应强行各找一个图标，或借用其他槽图标冒充。

data/catalog-definitions.json 的 upgradeSlots 每项新增 iconReview，区分
visually_verified 与 missing_font_glyph，并记录文字回退策略。
修改前完整定义文件保存在私有 history/catalog-definitions；不覆盖字体和许可文件。

## 核对样本

work/slot-glyph-ref/contact-sheet.png 汇总 17 个大写字形；
all-glyphs.png 汇总完整字符映射；card-slot-samples.png 汇总各类卡图左上角。
这些卡图裁切和截图只作私有核对，不进入 LegionHelper 公开仓库。

样本包括：2-1B Medical Droid（人员）、Combat Armor（装备）、Concussion Grenades（手雷）、
DC-15x ARC Trooper Gunner（重武器）、Annul（原力）、Adaptive Combat Network（通讯）、
Aayla Secura（驾驶员）、Heavy Laser Retrofit（挂载点）、Caught in a Web（指挥）、
Agile Climber（训练）、Barrage Generator（发生器）、Amban Rifle（武装）、Backworld Medic（乘员）。
