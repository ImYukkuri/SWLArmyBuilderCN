(function (root) {
  const KEY = "swl-builder-settings";
  const DEFAULTS = Object.freeze({ selectionListStyle: "detail" });
  let current = {...DEFAULTS};
  let loaded = false;

  function load() {
    if (loaded) return {...current};
    loaded = true;
    try {
      const value = JSON.parse(root.localStorage.getItem(KEY) || "null");
      if (value?.selectionListStyle === "detail" || value?.selectionListStyle === "large")
        current.selectionListStyle = value.selectionListStyle;
    } catch {}
    return {...current};
  }

  function update(patch) {
    load();
    const next = {...current};
    if (patch?.selectionListStyle === "detail" || patch?.selectionListStyle === "large")
      next.selectionListStyle = patch.selectionListStyle;
    try {
      root.localStorage.setItem(KEY, JSON.stringify(next));
      current = next;
      return {...current};
    } catch {
      return {...current};
    }
  }

  function selectionListStyle() {
    if (!loaded) load();
    return current.selectionListStyle;
  }

  const api = {KEY, load, update, selectionListStyle};
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.BuilderSettings = api;
})(globalThis);
