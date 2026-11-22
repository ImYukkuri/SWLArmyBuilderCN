# 雇佣兵军阶配额

单位的 `factions[]` 成员关系决定该单位在某军队是否计入雇佣兵池；词条参数文字不参与势力推断。优先读取当前战斗部队成员关系，缺失时递归读取母势力。显式成员关系未设置 `tierPools` 表示在该部队不计入此池，不继续向母势力取值。

`mode.pools.mercenary.max` 是每个军阶的默认上限，`perTierMax` 按军阶覆盖。现有标准与侦察配置均为核心 2、其他军阶 1，包括飞机占位。统计使用各单位实例在当前军队的有效军阶，包含 V2 军阶修改及升级卡 `replaceTier`。

先分别求各军阶超出通常雇佣兵上限的数量，再相加。军表存在 `allies_of_convenience` 时，允许这个合计最多为 1；没有时必须为 0。这是全军共享的一个名额，多个单位、多个升级或同张卡上的重复表达不会叠加。例如，有该词条时可带 3 个核心雇佣兵或 2 个特工雇佣兵，但不能同时使用这两个超额名额。

词条来源读取单位有效词条、装备卡词条和 `addProperties`／`replaceProperties` 的结果，同时兼容单位与升级的 `rules.poolBonuses: ["extraMercenary"]`。V2 通过临时属性修改添加的标准词条 ID 同样生效。武器词条不作为来源。

额外名额不增加军阶总上限，不豁免最低军阶要求，也不开放原本不允许加入该战斗部队的单位。曼达洛扩展的现有豁免和暗影集会、亮树村等部队的显式成员关系继续有效。

浏览器单位候选、复制与升级选择均复用 `RulesCore.validateArmy`。Python V1 校验使用相同计算方式；V2 API 继续调用 JS bridge。超限报告使用 `mercenary_pool`，带 `rank` 或 `ranks` 以标红相应军阶；不再产生旧的“叠加语义待核验”警告。

依据：项目现有雇佣兵池配置与词条文本；多份“地下联系”不叠加的结论亦见 [AMG 官方答疑](https://forums.atomicmassgames.com/topic/17210-multiple-copies-of-underworld-connections/)。
