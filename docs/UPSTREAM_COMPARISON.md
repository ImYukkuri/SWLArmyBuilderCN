# 与 legion.json 的对比及采用范围

来源：https://nowforwrath.github.io/legion.json

本地快照：`references/upstream/legion.json`，contentVersion 为 `2026.11.04.0`。
这是用户指定的社区数据参考，不表示官方数据或全部字段经过核验。
原文件包含规则书、战役、打印配置等；这些仅在私有参考快照保存，不进入精简运行数据。

## 覆盖与身份

上游 data.units 有 183 条，本地卡图有 185 张。180 张对应上游单位，5 张伙伴卡
对应上游 data.upgrades；C-3PO 两张不同阵营卡共用同一个升级 ID，仍保留两个本地 ID。
全部 185 张都有唯一的上游来源引用。不会因上游不存在独立伙伴单位而删除本地卡图。

优先按英文名称、称号、所属阵营匹配；AT-RT、LAAT、Bad Batch、A-A5 等必须按阵营区分。
少量差异显式处理，包含 Geonosian Engineers、Delta Squad、C-3P0/C-3PO、Logray、
共和国 R2-D2 的新版称号、Sleeper Cell 的新增称号。匹配依据逐条记录在 comparison.json。
ARF Troopers 原来被 OCR 错配到 ARC Troopers，现按 ARF 卡图文件和上游 28861 修正；
普通 ARC 的上游 ID 仍为 62，没有把两张卡合并。

## 字段取舍

| 项目 | 原卡图 JSON | 上游 | 当前处理 |
| --- | --- | --- | --- |
| 点数 | 全部缺失 | points | 全部补齐；伙伴卡用对应升级价格 |
| 速度 | 已有卡图识别值 | speed | 缺失才补，冲突保留卡图值 |
| 升级槽 | 缺失 | upgradeTypes | 导入基础槽、必选标记；条件槽分开记录 |
| 军阶 | 字符串 | rank ID 与显示顺序分开 | 使用 rankId；按军队保留不同军阶 |
| 阵营 | 图库文件夹名 | faction 与 factions 含义不同 | factionId 为卡牌所属阵营，factions 为可加入军队+军阶 |
| 组织 | 字符串文件夹名 | affiliation | 使用 affiliationIds 对照表 |
| 单位类型 | 较详细的卡面类型 | 8 类 unitTypes | 使用 ID；保留 local: 命名空间的伍基/重型机器人/飞行载具细分类 |
| 单位/武器词条 | 原文、译名、OCR 匹配信息重复 | 数字 ID，常混合单位和武器关键词 | 本地 rule ID + 数值/参数/行动；解释集中存一份，记录 upstreamIds 对照 |
| 武器属性 | 名称、射程、骰池和武器专属词条 | 没有逐武器结构 | 保留本地数据，不用上游混合关键词猜武器归属 |
| 立绘和原图 | 本地相对路径 | 外部图片 URL | 保留原图及本地裁图 |
| OCR/source | 每条记录重复 | 无同类字段 | 原样归档至 extraction-evidence.json，不进入运行单位 JSON |
| 组军特殊条件 | 未实现 | quantityLimitedBy / ignoreMinimum 等 | 暂不引入、不执行 |

上游的 figures 经常为 1，而对应卡图明显有多个模型；health 也存在不同值。
速度有 39 处与现有卡图数据不同，包括 Yoda 的 1→2、固定炮台的 0→2。
这些差异不等于确认卡图或上游哪一方全部正确，因此不批量覆盖，逐条列出供校对。
源文件中的命令卡、整本规则书、战役、库存包、TTS 字段没有加入运行库。

## 文件与结构

- `data/units.json`：v2 单位与武器记录，保留原本地 ID，新增 upstream 引用。
- `data/catalog-definitions.json`：关键词、阵营、军队、军阶、单位类型、组织、升级槽和条件解锁所需升级名称。
- `data/comparison.json`：导入时版本、校验摘要、匹配方法、变更前后值和未采用字段。
- `data/extraction-evidence.json`：迁移前的 source、名称匹配、词条识别依据及每个武器 source。
- `history/`：迁移前完整备份，编辑器可恢复单个单位；旧结构会自动转换成 v2。

关键词 ID 沿用已有中文词典的 identifier，例如 jump、direct、armor，
不把与本地含义不同的上游数字直接当作本地 ID；上游数字存在定义的 upstreamIds 中。
未识别规则也有 pending_ ID，释义是否已匹配使用 status 表示，不以空 ID 破坏引用。
action 缺省为 none；只有卡牌行动/免费卡牌行动才存 action 或 free-action。

导出按钮生成含单位和定义的完整 JSON 数据包，避免只有 ID 却缺解释表。
编辑器支持按 ID 选择并显示中文名称，另有“ID 对照 / 数据差异”查看槽位、来源和归档证据。
