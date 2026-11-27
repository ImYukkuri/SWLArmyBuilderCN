# 游玩界面修改

从写表器打开一份军表，点击「游玩」进入对局选择页。每场对局都有独立的军表快照与链接。

进入游玩页面会显示对局入口，可选择开始设置流程或跳过设置进入计分页。下方显示该军表的对局记录。记录中的载入按钮保留为后续功能入口，目前不可用。

设置流程分为对手军表与地形、玩家颜色、组建任务三个页面。步骤条始终允许回看，地址栏保留当前页面和步骤。双方骰池每边四颗黑色攻击骰，刷新会清零结果和投掷次数。任务牌组弹窗按主任务、次要任务、优势卡三行显示，每行三张。正式 BP 开始后，牌组保留场上和已弃置的标记。换边后，由持有下一步所示颜色的玩家操作。完成后进入计分页。

## 对局档案

对局进度暂存在当前标签页，刷新可继续。计分页的「存档」保存当前快照，「结束游戏」将对局标记为已结束并存档。对局选择页显示此军表的已存记录，可逐条删除。「对局备份与管理」支持导出、恢复和删除，恢复 JSON 会建立独立对局。旧单场存档会列入档案，缺失卡牌按原 ID 显示。

## 移动元素与调整样式

修改 `play.html` 和 `play.css`。保留需要显示和操作的 `data-*` 属性，即可移动计分、任务卡、轮次和军表元素。可以给多个元素绑定同一个值，或让多个按钮执行同一个动作。

| 属性 | 用法 |
| --- | --- |
| `data-text="phase"` | 读取阶段名称并设置文本 |
| `data-show="playing"`、`data-hide="playing"` | 根据字段显示或隐藏 |
| `data-with="mission.primary"` | 子元素可直接使用该主任务的 `name`、`card` 等字段 |
| `template data-use="play-mission-card"` | 在固定位置复用卡牌模板，沿用外层的绑定字段 |
| `template data-each="scorePlayers"` | 按数组重复模板，模板内字段取自当前条目 |
| `data-attr="aria-pressed=current data-focus-key=key"` | 绑定 HTML 属性 |
| `data-src="card.image"`、`data-model="selected"` | 绑定图片路径与表单当前值 |
| `data-action="score" data-category="other" data-value="1" data-args="player=id"` | 使用固定参数和数据字段发送加分动作 |

表单使用 `data-action` 和带 `name` 的控件提交。重复项里如需在更新后保留键盘焦点，可绑定唯一的 `data-focus-key`。标记拖放使用 `data-drag-token` 和 `data-token-drop`，其余参数仍通过 `data-action` 与 `data-args` 声明。

`.match-panel` 的四行顺序由 `play.html` 控制。主任务、次要任务和双方优势卡共用 `#play-mission-card`，两方分数控件共用 `#play-player-score`。

得分明细使用 `scoreEvents`，每条记录的原值保存在 `revisions`。`roundScores` 提供各回合净得分和累计分。`retreat` 和 `advance` 移动流程位置，得分修正分别使用 `amendScore` 和 `undoScore`。筛选与选中待修改的记录由 `setView` 控制。

## 双方军表

我方与对方共用 `play.html` 的 `#play-roster`，页签决定 `roster` 指向哪位玩家。单位和升级卡布局共用 `.unit-grid`、`.roster-art` 和 `.card-state-tabs` 样式。

单位与升级卡的 `stateOptions` 提供可绑定到按钮的状态。双面升级卡还提供 `faceOptions` 和详情的 `pages`。状态和朝向按玩家及卡牌实例保存，切换我方／对方页签会切换这些数据。详情弹窗也由双方共用。使用 `data-prose` 可以按写表器的规则符号显示卡文。

完整卡图在 `play.html` 的详情弹窗中排在最前。图下的单位资料、属性、词条和武器与写表器共用 `unit-card-view.js` 和 `unit-card.css`。调整这些组件的排版或样式时，改共用文件即可同时更新两个页面。

## 指挥卡

任务与计分里的 `blueCommand` 和 `redCommand` 共用 `#play-command-slot`。卡槽、选牌、弃牌堆、揭露区和大图共用 `#play-command-face`。修改卡槽或遮罩的布局可以直接调整这两个模板及其 CSS。对局按玩家和手牌位置记录暗置、弃置和揭露状态。

## 提醒与标记

- `reminders` 提供当前阶段的提醒。计分页显示双方，军表页显示当前一方。处理状态按回合、时机、来源卡牌及相关单位的激活次数保存。若同一单位有额外激活，用 `repeatActivation` 记录新的次数。
- `rulesProfile` 保存本局采用的版本，`commandHints` 给出该版本的优先权与跳过池提示。旧对局缺少版本字段时沿用 2026 年 12 月前版。
- `freeTokens`、单位的 `tokens` 及 `tokenTargets` 共享标记数据。标记的归属和所在单位可以分别修改。操作记录使用 `activity`，其中标记移动保存起点和终点。

## 模块

- `play-match.js` 接收对局和动作，返回更新后的对局。它负责军表快照、三阶段页面、玩家颜色、六步任务构建、轮次、得分和卡牌状态。
- `play-store.js` 负责本地档案、旧单场存档、单场备份与恢复。
- `play-data.js` 接入写表器数据和导入器，并计算页面读取的字段。任务可逐张使用 `mission.primary`、`mission.secondary`、`mission.blueAdvantage` 和 `mission.redAdvantage`。有部署图时用 `mission.primary.card.map`。计分可按 `bluePlayer`、`redPlayer` 或 `scorePlayers` 使用，`rounds` 和 `track` 分别提供轮次格与计分格。
- `play-page.js` 负责模板绑定、事件委托、详情弹窗和存档提交。改标签、卡片位置、布局与配色时，沿用现有字段和动作即可。新增对局规则在 `play-match.js` 实现，新增页面所需的数据在 `play-data.js` 提供。
