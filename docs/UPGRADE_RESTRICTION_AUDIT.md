# 升级卡限制 OCR 与现有规则引擎核验

日期：2026-11-07。范围：私有 SWLArmyBuilderCN 工作区的数据维护。
本轮没有写入规则引擎、编辑器或存储源代码，也没有修改 LegionHelper 公开仓库。

## 本轮完成的内容

- 539 条升级卡均新增独立 restrictions 字段。
- 503 张本地升级卡图片完成 OCR；没有卡图的 36 条明确标记 no_image / not_reviewed。
- 423 条记录提取到限制文本；其余 80 条没有保留可识别的限制文本，其中一条是人工确认并移除的旧错误限制。
- 90 张有人工逐图核对记录，包含低 OCR 相似度条目和全部带图标的限制条目；334 张文字与既有英文限制交叉匹配。
- 有限制图标的条目均对照过卡图；这不表示整张卡的效果、点数、武器已经人工复核。
- 212 个上游升级 ID 的宿主规则通过同源性检查，写入 data/slot-rules.json 的 upgradeRules。对应 214 条本地卡牌记录，其中存在同一上游 ID 的双面/别名记录。
- 26 个槽位定义及专用槽授予条件没有改变。没有新增匹配特例槽位。

## “引擎 prompt”实际对应什么

项目中没有由语言模型在运行时执行的独立规则 prompt。
需求来源仍是 写表器前期工作.md 和 开发方向与实施路线.md；它们描述目标，不代表所有能力已经实现。
当前可执行依据为 rules.py、rules-core.js 与 data/slot-rules.json。
rule_schema.py 检查 JSON 形状，不等于执行其中的游戏约束。

实际升级限制入口：

| 位置/字段 | 当前行为 |
| --- | --- |
| upgradeRules[upstreamId].host | 按字符串上游单位 ID 检查指定宿主 |
| upgradeRules[upstreamId].access | 覆盖升级可匹配的语义槽位 |
| upgradeRules[upstreamId].armyUnique | 整军唯一 |
| upgradeRules[upstreamId].conflictGroup | 整军互斥组 |
| card.rules.unique / limit | 数量与唯一性检查 |
| card.rules.factions / 上游 factions | 当前版本已检查军队/战斗部队范围；此逻辑是在本轮期间外部加入的 |
| dedicatedGrants[key].condition | 已接入 evaluate 条件解释器，控制专用槽授予 |
| card.rules.requiredProperties | 形状可保存，但升级准入没有执行通用 DNF 条件 |
| restrictions.condition | 本轮整理的条件表达式；当前引擎没有读取这个新数据字段 |
| 上游 availableIn | 作为宿主回退；其中的条件对象不会被正确求值 |

引擎文件头宣称未实现的规则应返回 unknown，但当前升级校验并没有为所有未实现字段产生 unknown。
因此，不得因 validateArmy 返回 valid 就声称本轮所有升级限制均已生效。

## 数据字段与编辑入口

在现有升级卡编辑器中打开单张卡的完整 JSON，可查看 restrictions。
本轮没有增加新的表单组件。

~~~json
{
  "restrictions": {
    "text": {
      "en": ["Trooper Only.", "{@icon.defense-die-white} Only."],
      "zh": ["既有中文限制，可能只覆盖部分英文限制"]
    },
    "zhReview": "legacy_unverified",
    "sources": ["description.en#leading-restriction"],
    "verification": "text_matched",
    "condition": {
      "all": [
        {"ref": "trooperUnitType"},
        {"ref": "whiteDefenseDie"}
      ]
    },
    "execution": "not_connected"
  }
}
~~~

- text.en 保存独立的完整限制子句，多行续接与多个限制子句分开处理。
- text.zh 复用原来的中文限制；本轮没有声称重新校对全部中文翻译。
- sources 标记来自原 requirements、正文首段还是人工校对。
- verification 区分文字匹配、人工看图、未检测到限制、缺图。
- condition 使用现有 evaluate 支持的 ref / all / any / not / field 语法；有这个字段不等于已接入升级校验。
- candidateCondition 仅在来源范围冲突时保存候选；对应 condition 为 null，避免误用不完整范围。
- execution 明确表示是否生效、尚未接入、来源待对齐或缺图。
- ocrEvidence 记录私有证据键、相似度、图标核对状态和卡图 SHA256；原始 OCR 全文独立保存在 work 中。
- slotPermissionsText 保存 B1 可以无装备槽装备望远镜/扫描仪之类的明确例外文字；它们不是全军宿主限制。

原来的 requirementsText、rules、名称、费用、槽位、武器和效果正文均保留。
唯一被移除的旧 requirementsText 是已对照卡图确认错误的 Advanced Drill 限制。

## OCR 和转换流程

1. 从 data/upgrades.json 读取卡图相对位置，校验卡图 SHA256。
2. OCR 效果区；初次使用 y=285..935，低相似度和无首段限制的卡扩展到 y=125..935。
   图标复核另使用 OCR 行框定位限制所在区域；续行比较允许最多五行，不以第一行结束作为限制结束。
3. 从 references/upgrades-slim.json 的英文 requirements 还原文字与图标；同时检查 description.en 开头的 Only 限制及装备/军队限制句。
4. 只有读到子句末尾 Only 才结束当前多行限制；连续两条 Only 限制保存为两条子句。
5. OCR 结果与原英文逐段比对，忽略比较用的大小写、标点与常见识别字误差；这些归一化不直接改写卡面原文。
6. 低相似度条目逐图复核；所有限制图标另逐图检查。OCR 的字面相似度不代替图标识别。
7. 生成条件时保留逻辑分组；不认识其中一部分时不输出“部分有效”的完整 condition。
8. 精确宿主名单必须同时等于卡牌已有 availableIn 和当前上游快照的纯 ID availableIn，且没有条件对象，才写入活动规则包。
9. 保存历史快照，再更新本地升级卡数据和活动规则包。候选、不支持及来源冲突独立保存。

当前可转换的通用条件包括单位类型、部分阵营/军阶图标、防御骰、现有关键词、精确单位名及唯一称号。
它们沿用同一套表达式，不为每次名称匹配生成新的槽位类型。
例如“核心或特种部队克隆人士兵”转换为“克隆人士兵 AND (核心 OR 特种部队)”；
“非指挥官、非特工单位”转换为两个 not 条件，不会误转成两个正向军阶。

## 人工确认的旧数据问题

- Super Commando Gunslinger 的限制漏了第一行 Mandalorian Super，已在 restrictions.text.en 补成 Mandalorian Super Commandos Only。
  该卡的当前上游匹配范围与印刷文字仍不一致，保留为来源待对齐，没有强行覆盖宿主。
- Commendation: Advanced Drill 卡面没有 Trooper Only。已清空本地误录的 requirementsText，并保留人工核对说明和修改前历史。
- Gar Saxon 的 Jetpack Rockets 卡面实际印有 Militant Commandeer，而来源单位称号为 Militant Commando，且来源允许另一个版本。
  保留印刷文字，不能靠猜测改称号或扩大/缩小宿主。

## 未完成映射清单

work/upgrade-restrictions/review-items.json 是归拢入口。

| 类别 | 本地卡牌条数 | 处理 |
| --- | --- | --- |
| source_alignment_pending | 40 | 卡面与来源允许范围不同，保留候选并停止自动生效 |
| not_connected | 94 | 已有 evaluate 可读条件，但升级准入没有接入 |
| unmapped | 74 | 如光明/黑暗面、组织、军队、战役 VR/Story Arc、需要原力槽等；当前上下文或解释入口不足 |
| existing_host_partial | 1 | Bo-Katan 暗剑已有宿主规则，但完整的 Mandalorian Clans 限制尚未表达 |
| not_reviewed | 36 | 没有本地卡图，无法 OCR 核验 |

40 处来源差异不全是卡牌错误：可能是老/新单位 ID、双面版本、称号、战斗部队例外或真实匹配错误。
例如部分帝国重武器的 availableIn 包含战斗部队条件对象，不能转成对象的字符串，更不能当无条件单位许可。
部分专用槽的印刷依据也比当前授予条件更宽，已放入 rule-proposals.json 的 dedicatedGrants 候选部分。
本轮没有激活这些授予条件，以免改变现有按 slotIndex 保存的军表槽位顺序。

## 文件、历史与复跑

- data/upgrades.json：带限制核验字段的卡牌数据。
- data/slot-rules.json：活动规则包，仅迁入确定的宿主限制。
- work/upgrade-restrictions/report.json：逐卡完整报告。
- work/upgrade-restrictions/review-items.json：按问题类别归拢的条目。
- work/upgrade-restrictions/rule-proposals.json：宿主转换结果及尚未激活的专用槽授予候选。
- work/upgrade-restrictions/manual-review.json：人工图像核对记录。
- work/upgrade-restrictions/ocr-v3.json：最终私有 OCR 证据；v2 是前一阶段输出。
- history/upgrades、history/slot-rules：修改前完整快照，文件名符合现有历史恢复格式。

在 SWLArmyBuilderCN 项目根目录运行：

~~~text
node work/ocr_upgrade_restrictions.cjs
python work/upgrade-restrictions/audit.py
~~~

OCR 按图片哈希续跑；加 --redo 可强制重跑。
先查看 report.json 和 rule-proposals.json，再运行下列命令写回本地数据并生成历史：

~~~text
python work/upgrade-restrictions/audit.py --apply
python work/upgrade-restrictions/verify.py
node work/upgrade-restrictions/verify-parity.cjs
python -m unittest discover -s tests -v
~~~

验证通过：原有 35 项测试；57,904 组 Python/浏览器条件解释结果一致；
原卡牌数据保留检查、图标核对记录、卡图哈希和历史文件格式检查均通过。

## 同期外部引擎变化

本轮开始时保存了源文件哈希。在后续检查中发现 rules.py 和 rules-core.js 于本轮期间发生外部变化，
当前版本新增 upgrade_faction 校验。此任务没有写入这两份源文件，也没有回退或覆盖外部改动。
原始哈希保留于 before.json，观察到的版本记录于 observed-source-changes.json；其他四个相关源文件哈希未变。
验证针对观察到的当前版本执行；不是通过更新 before.json 隐藏变化。

## 发布边界

以上卡图、OCR、完整卡牌限制数据与历史备份均位于公开 LegionHelper 仓库之外的私有写表器工作区。
不可把 work、history、assets、references 或本轮新增完整卡库数据复制进公开仓库。
本轮没有提交、推送或发布，也没有修改公开仓库的白名单或哈希政策。
