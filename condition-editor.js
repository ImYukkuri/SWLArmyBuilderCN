/* Expression condition editor for card.restrictions.condition.
 * Shared catalog selectors retain unknown values and allow manual input. */
window.ConditionEditor = (() => {
  const E = (tag, text) => {
    const n = document.createElement(tag);
    if (text !== undefined) n.textContent = text;
    return n;
  };
  const FIELDS = [
    ["unit.unitTypeId", "单位类型"],
    ["unit.factionId", "阵营"],
    ["unit.affiliationIds", "组织"],
    ["unit.title", "称号（含匹配用 contains）"],
    ["unit.name", "单位名称"],
    ["unit.keywords", "关键词"],
    ["unit.rankId", "军阶"],
    ["unit.upstreamId", "上游单位 ID"],
    ["unit.defenseDie", "防御骰"],
    ["unit.divisions", "光暗标签"],
    ["unit.id", "单位内部 ID"],
  ];
  const OPS = [
    ["eq", "等于"],
    ["in", "属于"],
    ["contains", "包含"],
    ["gte", "大于等于"],
    ["lte", "小于等于"],
  ];

  function tableFor(field, defs, op) {
    return defs.editorOptions.condition(field, op);
  }
  function parseValue(raw, op) {
    const toVal = (t) => {
      const s = String(t).trim();
      if (/^-?\d+$/.test(s)) return Number(s);
      if (s === "true") return true;
      if (s === "false") return false;
      return s;
    };
    if (op === "in")
      return String(raw)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .map(toVal);
    return toVal(raw);
  }

  function renderNode(box, node, defs, onChange, rerender, removeSelf) {
    const item = E("div");
    item.className = "rule-item";
    if (node && typeof node === "object" && ("all" in node || "any" in node)) {
      const key = "all" in node ? "all" : "any";
      const sel = E("select");
      for (const [v, t] of [
        ["all", "全部满足 AND"],
        ["any", "任一满足 OR"],
      ]) {
        const op = E("option", t);
        op.value = v;
        sel.append(op);
      }
      sel.value = key;
      sel.onchange = () => {
        node[sel.value] = node[key];
        if (sel.value !== key) delete node[key];
        onChange();
        rerender();
      };
      item.append(sel);
      (node[key] || []).forEach((child, i) => {
        renderNode(item, child, defs, onChange, rerender, () => {
          node[key].splice(i, 1);
          onChange();
          rerender();
        });
      });
      const add = E("button", "＋ 条件");
      add.type = "button";
      add.onclick = () => {
        node[key].push({ field: "unit.unitTypeId", op: "eq", value: 1 });
        onChange();
        rerender();
      };
      const addGroup = E("button", "＋ 分组");
      addGroup.type = "button";
      addGroup.onclick = () => {
        node[key].push({ all: [{ field: "unit.unitTypeId", op: "eq", value: 1 }] });
        onChange();
        rerender();
      };
      const addNot = E("button", "＋ NOT");
      addNot.type = "button";
      addNot.onclick = () => {
        node[key].push({ not: { field: "unit.unitTypeId", op: "eq", value: 1 } });
        onChange();
        rerender();
      };
      const addRef = E("button", "＋ 引用");
      addRef.type = "button";
      addRef.onclick = () => {
        node[key].push({ ref: "trooperUnitType" });
        onChange();
        rerender();
      };
      item.append(add, addGroup, addNot, addRef);
      if (removeSelf) {
        const del = E("button", "删除");
        del.type = "button";
        del.className = "minor";
        del.onclick = removeSelf;
        item.append(del);
      }
      box.append(item);
      return;
    }
    if (node && typeof node === "object" && "not" in node) {
      const label = E("strong", "NOT");
      item.append(label);
      renderNode(item, node.not, defs, onChange, rerender, () => {
        delete node.not;
        onChange();
        rerender();
      });
      if (removeSelf) {
        const del = E("button", "删除");
        del.type = "button";
        del.className = "minor";
        del.onclick = removeSelf;
        item.append(del);
      }
      box.append(item);
      return;
    }
    if (node && typeof node === "object" && "ref" in node) {
      item.append(
        E("strong", "引用"),
        EditorOptions.control(
          node.ref,
          defs.editorOptions.table("predicates"),
          (v) => {
            node.ref = v;
            onChange();
          },
          { label: "引用谓词", custom: true, nullable: false },
        ),
      );
      if (removeSelf) {
        const del = E("button", "删除");
        del.type = "button";
        del.className = "minor";
        del.onclick = removeSelf;
        item.append(del);
      }
      box.append(item);
      return;
    }
    if (node && typeof node === "object" && "field" in node) {
      const f = { input: E("select"), dl: null };
      f.input.className = "cond-field";
      for (const [v, label] of FIELDS) {
        const op = E("option", v + " · " + label);
        op.value = v;
        f.input.append(op);
      }
      if (!FIELDS.some(([v]) => v === node.field)) {
        const op = E("option", "待确认：" + node.field);
        op.value = node.field;
        f.input.append(op);
      }
      f.input.value = node.field;
      f.input.onchange = () => {
        node.field = f.input.value;
        onChange();
        rerender();
      };
      const o = { input: E("select"), dl: null };
      o.input.className = "cond-op";
      for (const [v, label] of OPS) {
        const op = E("option", label + " · " + v);
        op.value = v;
        o.input.append(op);
      }
      if (!OPS.some(([v]) => v === node.op)) {
        const op = E("option", "待确认：" + node.op);
        op.value = node.op || "";
        o.input.append(op);
      }
      o.input.value = node.op || "eq";
      o.input.onchange = () => {
        const next = o.input.value;
        if (next === "in" && !Array.isArray(node.value)) node.value = [node.value];
        else if (node.op === "in" && next !== "in") node.value = node.value[0] ?? "";
        node.op = next;
        onChange();
        rerender();
      };

      item.append(E("strong", "字段"), f.input, E("strong", "操作"), o.input);
      const values = E("div");
      values.className = "condition-values";
      const options = tableFor(node.field, defs, node.op);
      function operand(value, change, index) {
        if (options.length)
          return EditorOptions.control(value, options, change, {
            label: "条件值 " + (index + 1),
            custom: true,
            nullable: false,
            preserveType: false,
          });
        const input = E("input");
        input.className = "cond-value";
        input.value = value ?? "";
        input.setAttribute("aria-label", "条件值 " + (index + 1));
        input.onchange = () => change(parseValue(input.value, "eq"));
        return input;
      }
      if (node.op === "in") {
        const current = Array.isArray(node.value) ? node.value : [node.value];
        current.forEach((value, index) => {
          const row = E("div");
          row.className = "condition-value-row";
          row.append(
            operand(
              value,
              (next) => {
                node.value = Array.isArray(node.value) ? [...node.value] : [node.value];
                node.value[index] = next;
                onChange();
              },
              index,
            ),
          );
          const del = E("button", "移除");
          del.onclick = () => {
            node.value = (Array.isArray(node.value) ? node.value : [node.value]).filter((_, i) => i !== index);
            onChange();
            rerender();
          };
          row.append(del);
          values.append(row);
        });
        const add = E("button", "＋ 可接受的值");
        add.onclick = () => {
          node.value = [...(Array.isArray(node.value) ? node.value : [node.value]), options[0]?.value ?? ""];
          onChange();
          rerender();
        };
        values.append(add);
      } else
        values.append(
          operand(
            node.value,
            (next) => {
              node.value = next;
              onChange();
            },
            0,
          ),
        );
      item.append(values);
      const del = E("button", "删除");
      del.type = "button";
      del.className = "minor";
      del.onclick = () => {
        if (removeSelf) removeSelf();
        else {
          delete node.field;
          delete node.op;
          delete node.value;
          onChange();
          rerender();
        }
      };
      item.append(del);
      box.append(item);
      return;
    }
    const raw = E("textarea");
    raw.value = JSON.stringify(node, null, 1);
    raw.onchange = () => {
      try {
        const v = JSON.parse(raw.value);
        Object.keys(node).forEach((k) => delete node[k]);
        Object.assign(node, v);
        onChange();
        rerender();
      } catch (e) {}
    };
    item.append(raw);
    if (removeSelf) {
      const del = E("button", "删除");
      del.type = "button";
      del.className = "minor";
      del.onclick = removeSelf;
      item.append(del);
    }
    box.append(item);
  }

  function render(container, restrictions, defs, onChange, rerender) {
    container.replaceChildren();
    const field = E("fieldset");
    field.className = "restriction-section";
    field.append(E("legend", "卡面限制条件（表达式）"));
    const hint = E(
      "p",
      "先选择条件字段，再从对应目录选择值；“属于”可逐项添加多个值。需要部分名称匹配时可切换手动输入。",
    );
    hint.className = "hint";
    field.append(hint);
    if (!restrictions.condition) {
      field.append(E("p", "当前未设置条件。"));
      const add = E("button", "添加条件");
      add.type = "button";
      add.onclick = () => {
        restrictions.condition = { all: [{ field: "unit.unitTypeId", op: "eq", value: 1 }] };
        onChange();
        rerender();
      };
      field.append(add);
    } else {
      renderNode(field, restrictions.condition, defs, onChange, rerender, () => {
        delete restrictions.condition;
        onChange();
        rerender();
      });
    }
    container.append(field);
  }

  return { render, FIELDS, OPS };
})();
