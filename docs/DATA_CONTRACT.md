# 单位卡提取与编辑约定

当前运行 schema 为 swl-unit-catalog/v2，以 UPSTREAM_COMPARISON.md 的 ID 结构为准。
以下 v1 字段说明用于理解原图提取和历史记录，已经归档；v2 不再在每个单位或武器内
重复保留 OCR/source、raw、label、mappingMethod。source 保存在 extraction-evidence.json。
点数与升级槽已导入，factionId/rankId/unitTypeId/affiliationIds 引用统一字典；
伙伴用 isCounterpart 表示。factions 保存可加入军队的 id 和对应 rankId。


## 身份与映射

每个原始图文件生成一个稳定 ID：阵营、组织和文件名组合。一个名字可有多个称号、
军阶或卡面版本，禁止只按 name 合并。同名跨阵营也不合并。

映射匹配使用 NFKD、忽略大小写/空格/标点的搜索键；写入数据时保留映射中的准确英文、
中文与标点。单位名称及称号都要匹配，避免把 B2 Super Rocket Battle Droids 当成普通 B2。
弱匹配写入 candidate 供人工参考，不自动认定为正式关联。

`references/unit-names.zh.json` 保留既有 117 条名称/称号/武器映射，并追加本地缺失名称/称号组合，不含属性。
`references/keywords*.json` 使用既有 identifier、中文标题、简写、完整规则与时机。
`references/upgrades-slim.json` 只提供已有的武器名称候选；不会用升级卡数值覆盖单位武器。

词条保留 raw、ruleId、label、value、parameter、action、mappingMethod。
ruleId 引用词典，参数独立保留（如 Direct: Vehicle）。
无匹配项保留原文且 ruleId 为 null；不能为了导入成功而强行匹配相近规则。
文本中的同一个数字不等于所有 X 参数：Repair X: Capacity Y 等保留原文供校对。

## 15 个规则书字段

1. 名称：`name.en/zh`
2. 副标题：`title.en/zh`
3. 阵营：`factions`；佣兵组织另有 `affiliations`
4. 军阶：`rank`，用卡面军阶形状与本地样本比对
5. 分值：`points`，本批只有正面，缺背面统一为 null
6. 模型数：`stats.models`
7. 单位类型：`unitType.en/zh`
8. 升级栏：`upgradeSlots`，缺背面为 null，不能用 [] 表示没有升级槽
9. 单位关键词：`keywords`
10. 伤害阈值：`stats.wounds`（每模型）
11. 勇气/韧性：`stats.courage/resilience`，依类型区分
12. 速度：`stats.speed`
13. 武器：`weapons`，各有 name/range/dice/keywords/source
14. 防御：`stats.defenseDie` 为 red、white 或 null
15. 激增转换：attackSurge 为 none/hit/critical/null；defenseSurge 为 none/block/null

null 表示资料缺失或提取失败；none 表示确认卡面无转换；0 表示确认零。
不能用 0、空数组或 none 伪装无法读取的字段。
卡面明确印出的横线或 X 另记于 woundsSymbol/courageSymbol/resilienceSymbol，
对应数值仍为 null，避免把“—”误读成 0 或无穷大。visualCorrections 仅代表所列字段
已对照原图复核，不代表整张卡完成校对。
佣兵卡的 factions/affiliations 当前表示图库分组，尚未校对可加入各阵营的合法性；
不得拿文件夹名或未识别的阵营图标直接判定组军资格。

## 版式

统一相对坐标 `[left, top, right, bottom]`，图片左上为 (0,0)，右下为 (1,1)。
普通卡的标题在上、词条左、立绘右、武器左下、属性右下。
普通立绘初始裁剪 `[0.669,0.174,0.998,0.725]`，避开标题、生命行及大部分边框。

伙伴卡：ID10、共和国 C-3PO、义军 C-3PO、Grogu、Omega，共 5 张，左立绘、右词条、
底部左生命行。通过左右区域白底比例识别，使用独立坐标；伙伴军阶为 counterpart。
其立绘初始裁剪 `[0.005,0.20,0.333,0.915]`。
裁剪可在编辑器逐卡调整。原图永不覆盖；裁图名含原图和裁剪坐标的摘要。

武器通过暗色矩形横带定位，不按 OCR 文字猜测“几把武器”。
分别裁切武器名、规则、射程、骰池，词条区域在第一个武器面板之前截止。
骰面数字分离后识别；红/黑/白按卡面颜色和白色菱形判断。
OCR 不是视觉真值；形状匹配和数字识别仍需人工复核。
`source` 保留区域、OCR 文本、置信度、图形匹配分数、原图 SHA256。

词条行动以原图中的符号判断：实心箭头 → action（卡牌行动），双箭头 → free-action
（免费卡牌行动），没有箭头 → none。同一个 Jump 在不同卡上可以有不同类型，
不能按词条名称统一推导。识别按 OCR 行坐标定位图形，支持普通/伙伴版式，
并记录 actionDetection 的图形框、相似度及原始行文字供复核。
一行包含多个词条时，只有紧随箭头的首个词条继承行动类型。
编辑器手工选择行动类型后清除自动识别标记，增量处理不会覆盖手工选择。
无法关联原图行的项仍可保留 null；不会以词典中的通用规则代替卡面图标。

中文名称增量补全使用原名称映射优先、本地补充其次，只填空值，不覆盖用户译名。
新增名字和称号的初译位于 references/name-translations.local.json；
名称映射新增记录标 local_draft，原 117 条记录保持不变。映射变更先备份到
history/mappings/，单位源文件同样保存完整历史版本。武器 source 不因增量补全而改变。

## 保存

本地服务绑定 127.0.0.1。只允许同源 JSON 写入；源文件路径固定，不能让请求提供任意写入路径。
所有修改先校验结构，再验证源文件 SHA256、备份原文件、生成裁图、原子替换源文件。
多窗口冲突返回 409。语法错误、越界裁剪、非法枚举和不存在图片不会覆盖源文件。
不自动删除历史或旧裁图，不在浏览器将“下载副本”冒充“写入源文件”。
