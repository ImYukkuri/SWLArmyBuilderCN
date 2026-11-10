# 指挥卡（战术卡）数据标准

数据源：`data/catalog-definitions.json` → 顶层 `"commands"` 数组（251 张）。

每张卡的最小完整结构：

```json
{
  "id": "35",
  "name": { "en": "Covering Fire", "zh": "掩护射击" },
  "pips": 3,
  "slotPips": 3,
  "factions": [1, 13, 18],
  "unlockedBy": null,
  "titleMatch": "",
  "owner": "Rebel Alliance",
  "orders": { "en": "3 {@icon.rank-corps} Units", "zh": "3 {@icon.rank-corps} 支单位" },
  "description": { "en": "...", "zh": "..." },
  "image": "assets/command-cards/35.webp"
}
```

## 字段说明

| 字段 | 类型 | 约束 / 说明 |
|---|---|---|
| `id` | string | 唯一 ID，新建卡用 `cmd-<时间戳>`；已有卡不可改 |
| `name.en` | string | 必填，卡面英文名 |
| `name.zh` | string | 中文名，可空 |
| `pips` | int | 卡面印刷的游戏点数，0–9 均可（0/4 等特殊值按卡面保留） |
| `slotPips` | int / null | 写表占用槽位点数（1–4），null 表示跟随 pips；卡面写「写表时视作 X pip」才填 X |
| `factions` | int[] | 可用军队/战斗部队 ID；**空数组 = 不限制军队** |
| `unlockedBy` | null 或 `[{id, propertyName:"units"}]` | 解锁单位（上游单位 ID）；**多个单位 = 全部在场才能用** |
| `titleMatch` | string | 称号包含匹配；军队中任一单位称号/名字包含此词即可；留空不使用 |
| `owner` | string | 卡面归属文字（显示用） |
| `orders` | {en, zh} | 下令单位文本 |
| `description` | {en, zh} | 效果文本 |
| `image` | string | 卡图路径，`assets/command-cards/<id>.webp` |

## 图标标记（必须保留，不能翻成中文删掉）

```
{@icon.rank-commander}    指挥官   → ⑤
{@icon.rank-operative}    特工     → ⓑ
{@icon.rank-corps}        核心     → ⑥
{@icon.rank-special-forces} 特种   → ⑦
{@icon.rank-support}      支援     → ⑧
{@icon.rank-heavy}        重型     → ⑨
```

其它标记（`{@icon.range-2}`、`{@icon.clan-wren}` 等）渲染时会忽略，不会显示花括号。

## 匹配语义

1. 先查 `factions`：非空时，军队/战斗部队 ID 必须在列表里。
2. 再查 `titleMatch`：非空时，军队里任一单位「称号包含词 / 词包含称号 / 名字包含词」即通过。
3. 最后查 `unlockedBy`：非空时，**每个** `units` 项对应的上游 ID 都必须出现在军表里。
4. 若 factions、titleMatch、unlockedBy 全空 → 通用卡。

军队留空 + unlockedBy 有单位 = 只跟随这些单位。
军队留空 + titleMatch 有词 = 只跟随称号命中的单位。

## 军队 ID 表

见 `data/catalog-definitions.json` → `armies`（1 义军、2 帝国、4 共和国、5 分离主义、7 帝国残部、8 曼达洛、9 暗影集团、10 冲锋队营、11 分离入侵、12 212营、13 回声基地、14 奥纳卡帮、15 快速拦截、16 501、17 暴雪、18 亮树村、19 暴风部队、20 实验机器人、21 伍基守军）。

## 补卡流程（给 OCR agent）

1. 读 `docs/command-cards-fill-template.json`，里面是 57 张文本不完整的卡（id、名称、pips、factions 已就位）。
2. 只填 `orders` 与 `description` 的 en / zh；`name.zh` 若空也补。
3. 图标按上面的标记表写，数字/单位保留原文。
4. 完成后输出一个「id → 卡」的 JSON，导入时逐字段覆盖 `catalog-definitions.json` 里对应卡，不改其它字段。
5. 校验：`python -X utf8 -m unittest discover -s tests -q`；重建：`python tools/build_public.py`。
