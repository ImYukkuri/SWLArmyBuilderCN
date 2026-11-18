# 词条参数精校清单

检查日期：2026-11-16。以下依据当前本地 JSON 与写表器代码，不是对官方词条时机的重新裁定。

## 当前全局／组军词条

共 28 条，以 `timing` 包含 `global` 为准；包含同时归属其他时机的词条。Independent 的当前时机为激活开始，不在此表。

| 中文名称 | 英文名称 | ID | 其他时机 |
| --- | --- | --- | --- |
| 紧盯奖赏：词条 | EYES ON THE PRIZE: KEYWORD | `eyes_on_the_prize` | — |
| 永久 | PERMANENT | `permanent` | 回合结束 |
| 悬停：地面/空中X | HOVER: GROUND/AIR X | `hover_ground` | — |
| 副手：单位名称 | ASSOCIATE: UNIT NAME | `associate` | — |
| 配备 | EQUIP | `equip` | — |
| 我们可不是一般货色 | WE'RE NOT REGS | `were_not_regs` | — |
| 援助：联盟/单位类型 | AID: AFFILIATION/UNIT TYPE | `aid` | — |
| 权宜之盟 | ALLIES OF CONVENIENCE | `allies_of_convenience` | 命令阶段 |
| 雇佣兵：阵营 | MERCENARY: FACTION | `mercenary` | — |
| 附属：单位名称/类型 | DETACHMENT: UNIT NAME/TYPE | `detachment` | 部署 |
| 重武器小组 | HEAVY WEAPON TEAM | `heavy_weapon_team` | — |
| 伪装 | INCOGNITO | `incognito` | 激活 |
| 激怒X | ENRAGE X | `enrage` | 移动 |
| 典范 | EXEMPLAR | `exemplar` | — |
| 战地指挥官 | FIELD COMMANDER | `field_commander` | 命令阶段 |
| 团队合作：单位名称 | TEAMWORK: UNIT NAME | `teamwork` | — |
| 队长 | LEADER | `leader` | — |
| 随身武器 ：近战/远程 | SIDEARM: MELEE/RANGED | `sidearm` | — |
| 统率 ：单位名称 | ENTOURAGE: UNIT NAME | `entourage` | 命令阶段 |
| 缓慢 | PLODDING | `plodding` | — |
| 无所顾忌 | UNCONCERNED | `unconcerned` | 防御 |
| 指挥载具X | COMMAND VEHICLE X | `command_vehicle` | — |
| 负重 | WEIGHED DOWN | `weighed_down` | — |
| 程序 | PROGRAMMED | `programmed` | — |
| 坚守战线 | HOLD THE LINE | `hold_the_line` | — |
| 我也是小队的一员 | I'm Part of the Squad Too | `pending_i_m_part_of_the_squad_too` | — |
| 搭档 | Counterpart | `counterpart` | — |
| 灵活响应 | Flexible Response | `flexible_response` | — |

## 本次参数输入调整

- 佣兵、援助（AID）、独立（Independent）保留词条名称、ID、数值与释义，只将参数改为自由输入。
- 所有非全局词条（包括时机尚未分类者）使用文本参数输入；单位、升级卡正反面与武器复用控件。
- 空输入保存为 `null`。文字原样保存，不按数字、单位名称或 JSON 自动解释。
- 手填或更换词条 ID 会清除旧 `parameterRef`，防止隐藏引用覆盖显示文字。仅打开编辑器不改变旧数据。
- 其他全局词条继续提供目标选择，同时允许保留／手填原文；单位目标使用稳定本地 ID，单位类型保留数字或本地字符串 ID。下拉显示中文，引用辅助文字使用英文以兼容既有附属单位解析。
- 移除单位规则页重复参数入口；原始 JSON 仍可查看。没有批量改写卡牌源数据。

## 非全局词条能否与写表器引擎脱钩

参数文字可以自由输入；词条 ID 不能全部删去或从规则上下文中排除。当前组军规则不直接解释非全局词条的 `parameter` 文本，但会判断单位是否具有某个词条。

| 非全局词条 | 现有选择条件 |
| --- | --- |
| 运输 Transport | 舱门枪手 Door Gunners（`crew-door-gunner`） |
| 渗透 Infiltrate | 卧倒待命 Lying in Wait（`lying-in-wait`） |
| 预设阵地 Prepared Position | 卧倒待命、掘壕固守 Dug In（`training-dug-in`） |
| 飞艇 Speeder | 打带跑 Strike and Fade（`training-strike-and-fade`） |

这些条件读取词条 ID，不读取参数文字或数值，因此开放参数手填不会移除选择约束。当前条件是否符合官方卡文需另行精校；此改动不重写条件。

另外，许多升级通过 `addProperties`／`replaceProperties` 授予词条，规则会把它们合并进单位的有效词条集合，供上述条件判断。Independent 就存在于这些授予效果中。词条 ID 也用于释义、时机、行动分类及展示去重。

佣兵虽允许手填参数，其 ID 仍用于需要佣兵单位的指挥卡判定；军队归属和佣兵配额另由 `factions`／`tierPools` 等结构化数据控制。不要依据参数文字推导所属势力。

全局／组军标签混合持续能力与组军能力，不能直接作为引擎参与开关。Entourage 的参数目标影响军阶上限豁免；Detachment 在选择器中仍有按参数查找母单位的兼容逻辑；Equip 已由 `equipUpgradeIds` 独立控制。后续逐词条精校应分别记录“显示参数”和“规则用途”。

### 灵活响应的数值契约

`flexible_response` 使用单位词条的 `value` 作为 X，须为非负整数；不解析自由输入的 `parameter`。现有重武器冲锋队和游击队士兵均为 2。编辑器中的“数值”直接供前后端引擎读取，不是写死两个槽。

灵活响应提供至少 X 个必选重武器槽，不设槽位或装备数量上限。保留所有基础槽，不足 X 时补足；升级授予槽和战斗部队槽位修正正常执行。任意 X 个已装有重武器升级的槽可满足最低要求，额外槽不因灵活响应变成必选。游击队士兵原有两个槽的重复 `required` 标记已移除，由词条统一计算必选数。其他独立的必选槽要求仍保留。

未完成配置可逐槽或批量选择，缺少时沿用 `required_slot` 校验；第三张及更多合法重武器升级不报超额。战斗部队禁槽造成不足 X 个槽时报告无法满足最低要求，不绕过禁槽规则。无效槽位中的已存装备保留并报错，不静默删除。缺失／无效 X 显示待确认，不擅自推断为 2。词条时机保持 `army_building`（组军）；战役升级 `tod-flexible-response` 的 X 由卡文动态定义且无标准槽位，不把该卡的无数值引用误当作单位的固定 X。

## 性能与复核

参数词典复用页面进入时已加载的 JSON。单位／类型目标选项在 `EditorOptions.create` 中建立一次；普通文字参数无需创建单位下拉，也不会在输入时整页重绘。

持续校对时需保留词条 ID、行动类型和已有规则结构。新增规则若开始读取某个参数，应先增加明确的参数契约和前后端一致性测试，不能按时机分类自动假设其仍然仅供显示。

本次验证：

- 编辑器选项、写表器模型与双面卡的 47 项 JavaScript 测试通过；涵盖四个非全局词条的实际升级条件：手填／清空参数不改变结果，移除词条 ID 后限制仍生效。
- 单位保存、规则、词条编辑器及维护模块的 50 项 Python 测试通过。维护模块依赖外部上游原始资料的覆盖率检查未运行；未宣称完整测试套件通过。
- 浏览器实际验证单位、升级卡正反面、武器、缺省参数、切换词条及目标选择后手填；检查桌面和 390px 手机截图，无参数控件横向溢出。
- JavaScript 语法检查与 `npm run build` 通过。浏览器测试只修改未保存草稿，保存回读使用临时文件。
