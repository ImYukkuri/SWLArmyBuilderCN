# UI 风格规范 · Imperial Starfleet Terminal

依据 `skills/frontend-design/SKILL.md` 制定，全局生效于写表器与维护编辑器。

## 视觉方向

**帝国星际舰队终端**：深空黑蓝底 + 甲板灰面板 + 帝国琥珀强调 + 帝国红警示。面板做切角（右上/左下 14px 斜切），细发光描边，扫描线/网格纹理氛围。字符层级类似舰队战术屏：信息密度高但分区清晰。

## 设计令牌（style.css :root）

| 令牌 | 值 | 用途 |
|---|---|---|
| `--sw-bg` | `#0b1119` | 页面底 |
| `--sw-panel` | `#151c26` | 面板 |
| `--sw-panel-2` | `#1d2633` | 凸起控件/tag |
| `--sw-ink` | `#eaf0f6` | 主文字 |
| `--sw-muted` | `#8fa3b8` | 次级文字 |
| `--sw-accent` | `#f0b429` | 帝国琥珀 |
| `--sw-danger` | `#c23b3b` | 帝国红 |
| `--sw-line` | `rgba(143,163,184,.18)` | 细线 |
| `--sw-radius` | `8px` / 12px | 圆角 |
| `--sw-glow` | 琥珀微光 | hover |

## 字体

- **展示标题**：`Rajdhani` → `DIN Condensed` → `Segoe UI`（大写 + 0.05em 字距，科幻感）
- **正文/中文**：`Noto Sans SC` → `Microsoft YaHei` → `Segoe UI`（保证中文兼容）
- **数据/ID**：`Cascadia Mono` / `Consolas` 等宽
- 图标：LegionSymbols（本地 ttf，已含）

不依赖网络字体：Rajdhani 仅作优先项，缺省回退本地系统字体，离线可用。

## 组件规范

| 组件 | 处理 |
|---|---|
| 面板（card-browser / deck-section / pick-box） | 切角 + 1px 细线 + 深色渐变底 |
| 按钮 primary | 琥珀描边 + 暗金渐变底，hover 发光 |
| tag（chip / kw-chip / slot-chip / rank-tag） | 可点击：hover 上浮 + 琥珀描边；选中态反色 |
| 战术卡槽 | 原卡图铺底 + 底部深色遮罩（前文四段式） |
| 词条徽章 | hover 提示 summary；后续点开浮层 |
| 移动端 | <900px 主/选择栏上下堆叠 |

## 交互原则

1. 所有 tag 可点（至少 hover 反馈 + title 提示）；
2. 信息分层：名称 > 数值 > 词条/来源 > 弱化说明；
3. 内容收进展开/悬浮：词条完整规则进浮层、单位行可折叠、过滤可收起；
4. 动效克制：hover 上浮、面板加载错落显现，不做无意义动画。

## 落地顺序

1. 令牌 + 全局基础（已完成）
2. 写表器主界面（下一步）
3. 维护编辑器（units/upgrades/commands/rules/armies）
4. 移动端复核
