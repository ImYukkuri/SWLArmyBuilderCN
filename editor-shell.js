/* Keep existing controls and handlers in one measured fixed maintenance toolbar. */
document.addEventListener("DOMContentLoaded", () => {
  document.body.classList.add("maintenance-editor");
  const header = document.querySelector("header"),
    editor = document.querySelector(".editbar,.detail-head");
  if (!header) return;
  const shell = document.createElement("div");
  shell.className = "editor-fixed-tools";
  const line = document.createElement("div");
  line.className = "editor-action-line";
  const identity = document.createElement("div");
  identity.className = "editor-current";
  const title = document.querySelector("#title"),
    subtitle = document.querySelector("#subtitle");
  if (title) identity.append(title);
  if (subtitle) identity.append(subtitle);
  const actions = document.createElement("div");
  actions.className = "editor-global-actions";
  for (const button of [
    ...header.querySelectorAll("button"),
    ...(editor?.querySelectorAll("button") || []),
  ])
    actions.append(button);
  const dirty = document.querySelector("#dirty");
  if (dirty) line.append(identity, dirty, actions);
  else line.append(identity, actions);
  const tabs = document.querySelector(".tabs");
  header.classList.add("editor-navigation");
  shell.append(header, line);
  if (tabs) shell.append(tabs);
  const status = document.querySelector("#status");
  if (status) {
    status.classList.add("editor-feedback");
    shell.append(status);
  }
  document.body.prepend(shell);
  editor?.remove();
  const measure = () =>
    document.documentElement.style.setProperty(
      "--editor-tools-height",
      Math.ceil(shell.getBoundingClientRect().height) + "px",
    );
  new ResizeObserver(measure).observe(shell);
  measure();
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
      e.preventDefault();
      const save = document.querySelector("#save");
      if (save && !save.disabled) save.click();
    }
  });
});
