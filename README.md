# SWLArmyBuilderCN

军团中文写表器由两个应用组成，**共用同一份 `data/*.json` 数据**：
一个纯静态写表器（GitHub Pages 部署）和一个本地数据编辑器（Python 服务）。

## 两个应用

### 1. 写表器（静态，GitHub Pages 部署）

纯静态、只读，无需 Python。发布流程：

```powershell
python tools/build_public.py   # 生成 dist/
```

`dist/` 只包含写表器需要的文件：`index.html`、`builder.js`、`rules-core.js`、
`builder.css`、`style.css`、`data/*.json`、`assets/`。推送 `main` 分支后，
`.github/workflows/deploy-pages.yml` 会自动构建并发布到 GitHub Pages；
发布版不含数据编辑器入口链接。

本地预览静态版：

```powershell
python -m http.server 8765 --directory dist
```

或直接用 VS Code Live Server 打开 `dist/index.html`。

### 2. 数据编辑器（本地，需要 Python）

编辑器需要写回源文件并保留历史，只能本地启动：

```powershell
python server.py --port 8770
```

需要 Python 3.11+ 和 Pillow。然后访问：

- http://127.0.0.1:8770/ — 写表器（与静态版读同一份数据）
- http://127.0.0.1:8770/maintenance — 数据维护中心入口
- `/units` 单位卡、`/upgrades` 升级卡、`/armies` 军表、`/rules` 规则库

**日常开发一条命令**：在项目目录打开 PowerShell，运行：

```powershell
.\start.ps1        # 等价于 python server.py --port 8770，也可以 npm start
```

它会启动本地完整应用（写表器 + 数据编辑器都在 http://127.0.0.1:8770/ 下）。
想同时把「静态发布版预览」（http://127.0.0.1:8765/）也开起来，用：

```powershell
.\start-all.ps1    # 一键起 8770 + 8765，并自动打开两个浏览器标签页
.\stop-all.ps1     # 一键关闭 8770 和 8765
```

双击 HTML 或 Live Server 只能浏览，保存、历史恢复和冲突检测必须通过
上述本地服务。

### 数据是同一份，本地保存后刷新即生效

编辑器保存时直接写回源 `data/units.json`、`data/upgrades.json`、`data/armies.json`、
`data/slot-rules.json`（并自动备份到 `history/`）。写表器始终读取同一份源数据，
所以本地用 `python server.py --port 8770` 打开 http://127.0.0.1:8770/ 时，
**编辑器保存后，写表器刷新就能看到新数据，不需要任何重建**。

用 VS Code Live Server 以**项目根目录**打开 `index.html` 也是实时读源数据；
只有打开 `dist/index.html` 才是旧发布快照，本地预览不要用 dist。

`python tools/build_public.py` 只用于生成要发布到 GitHub Pages 的 `dist/` 静态快照。
Pages 是静态托管，无法读你本地的 `data/*.json`，所以**只有更新线上数据时**
才需要重建 `dist/` 并推送 `main`。

## 维护中心（编辑器模块）

启动后分别进入 `/units`、`/upgrades`、`/armies`、`/rules`。

- 单位卡：185 张原图与立绘、中文名称、属性/武器/词条、基础/条件槽、伙伴身份和限制编辑。
- 升级卡：539 条记录、503 张本地原图、槽位/点数/宿主限制、中文卡文、词条与武器编辑。
- 军表：单位和升级实例、命令卡 ID、基础费用与问题预览、保存/历史恢复。失效选择保留。
- 规则库：语义槽位注册表、专用槽授予、角色限定与唯一性/互斥、模式配额、战斗部队骨架，支持原始 JSON 编辑与保存。
- 未完整执行的规则返回 unknown，不把维护预览作为合法军表证明。

439 条原升级记录已匹配参考，64 条保留待匹配，新增 36 条仅上游记录。
完整说明、文件格式和部署边界见 [维护系统说明](docs/MAINTENANCE_SYSTEM.md)。
“独立部署”是单独入口/发布目录，不需要独立服务器；当前本地维护服务不等于已发布的静态写表器。

## 单位卡使用

- 左侧按中文、英文、称号、ID 搜索，可筛选阵营与校对状态。
- 字段编辑支持所有现有 JSON 字段，武器/词条可增删，词条 ID 可从现有词典选择。
- 原始 JSON 标签支持直接编辑当前单位的完整对象，再应用到表单或直接保存。
- 点击“保存到源文件”写入 `data/units.json`，同时先备份完整旧文件至 `history/`。
- 文件历史可将当前单位恢复到指定快照，其他单位保持当前版本；恢复本身也创建备份。
- 服务用 SHA256 检查源文件版本；其他窗口或外部程序修改后返回冲突，不覆盖旧草稿。
- 修改 `portraitCrop` / 裁剪输入后保存，会生成内容寻址的立绘文件；旧版本的裁图不删除。
- 未保存离开页面或切换单位会提示；导出按钮只导出已保存的数据。

## 当前 v2 数据

已接入用户提供的 legion.json，版本 2026.11.04.0。185 张卡都有对应来源，
点数、基础升级槽和必选标记已补齐。速度以现有卡图为优先，上游差异列入报告。

`data/units.json` 使用 ID 引用，解释统一在 `data/catalog-definitions.json`。
`data/slot-rules.json` 是手编语义规则包（`swl-rules/v1`）：运行规则使用 `personnel`、`gear` 等语义 ID，
上游数字仅保留为 `sourceId`；专用槽授予、角色限定、唯一性/互斥、模式配额与战斗部队骨架都在这一个文件里，
在 `/rules` 页维护，不再由脚本从上游自动重建。
原 OCR 和武器 source 已归档到 `data/extraction-evidence.json`，没有丢弃。
编辑器的“ID 对照 / 数据差异”可查看 26 类槽位、当前单位差异及提取依据。
导出按钮生成包含解释表的完整数据包；历史 v1 快照恢复时自动转换。

查看 `docs/UPSTREAM_COMPARISON.md` 和 `docs/UPGRADE_SLOT_IDS.md`。

## 数据与图片（原提取阶段说明）

`data/units.json` 是可编辑源文件，每张图片独立一条记录；不按名称合并异版卡。
`assets/unit-cards/` 保存 185 张原始正面图；`assets/portraits/` 保存裁图。
所有图片使用项目相对路径。提取初稿均标为 `needs_review`，不是校对完成的组军数据库。

原提取阶段只有正面图片；现在点数与升级槽已从指定参考补齐；
OCR/图形匹配不能保证符号与数字准确，所有字段要与原图校对。
伙伴卡采用独立区域配置，未印出的速度、激增转换等保持 `null`。

`references/` 是当前转换器映射文件的独立快照，修改本项目不会回写旧项目；
现有名称/称号/武器英文大小写以快照中的原值为准。查不到的词条保留原文和空 ruleId。
查看 `docs/DATA_CONTRACT.md` 与 `data/extraction-report.json` 了解提取边界和覆盖率。

以下是迁移前 v1 流程记录；v2 已禁止这类旧脚本覆盖现有数据。
已有 v1 卡库增量补全名称和卡牌行动类型时，运行 `python action_icons.py`，再运行
`python enrich_catalog.py`。该流程先备份、仅补空译名、保留手工行动类型及武器 source，
不会重建单位其他属性。实心箭头表示卡牌行动，双箭头表示免费卡牌行动。

## 重新提取

以下 OCR 重建命令仅用于新建 v1 数据；禁止重建覆盖已迁移 v2。
仅重新提取时需要 Node.js 与 `npm ci`。Tesseract.js 第一次运行下载英文模型，
之后识别均在本机完成，不向远程 OCR 服务发送卡图。

```powershell
python prepare.py
node ocr.cjs
python prepare_weapons.py
node ocr_weapons.cjs
python image_fields.py
node ocr_digits.cjs
node ocr_numbers.cjs
python materialize.py
```

已有源文件时，`materialize.py` 拒绝覆盖；显式加 `--replace` 才会备份后重建。
提取工作文件留在 `work/`，不要用于生产资料库或公开发布。

## 发布边界

写表器 `dist/` 由 GitHub Actions 在推送 `main` 时自动构建并发布到 Pages；
本地编辑器、`history/` 备份、OCR 与提取工作文件不会进入 `dist/`。
卡图随写表器发布是项目所有者的决定；代码不表示获得官方素材或规则文字的
公开再分发许可。`.gitignore` 已挡住 `history/`、`work/`、`dist/` 等目录。

原图库来自项目所有者已有的私人素材副本，图片内容未修改；原始文件哈希记录在每张卡中。
