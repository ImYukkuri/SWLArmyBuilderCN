/* One live unit summary for the roster column. No per-card sticky layers or
 * copied roster state: resolve the active instance against the current groups. */
window.BuilderSticky = (() => {
  const page = document.querySelector('#editor-page');
  const info = document.querySelector('#roster-info');
  const dock = document.querySelector('#current-unit-dock');
  const summary = document.querySelector('#current-unit-summary');
  const tools = document.querySelector('#roster-heading-tools');
  const list = document.querySelector('#army-units');
  let activeUnit = null, frame = 0, dirty = true, cards = [];

  function schedule() {
    if (!frame) frame = requestAnimationFrame(update);
  }

  function update() {
    frame = 0;
    if (page.hidden || !army) {
      activeUnit = null;
      summary.replaceChildren();
      summary.hidden = true;
      tools.hidden = false;
      dock.classList.remove('past-units');
      delete summary.dataset.instance;
      return;
    }
    // Fixed-body modal locking temporarily changes viewport coordinates. Keep
    // the current selection until the page has been unlocked and restored.
    if (document.documentElement.classList.contains('page-overlay-open')) return;
    const infoRect = info.getBoundingClientRect();
    const height = Math.ceil(infoRect.height);
    if (page.style.getPropertyValue('--roster-info-height') !== height + 'px')
      page.style.setProperty('--roster-info-height', height + 'px');
    const dockRect = dock.getBoundingClientRect();
    const line = height + 8 + dockRect.height;
    let next = null;
    const pinned = infoRect.top <= 1 && dockRect.top <= height + 9;
    let lastBottom = Infinity;
    if (pinned) {
      for (const card of cards) {
        const rect = card.getBoundingClientRect();
        lastBottom = rect.bottom;
        if (rect.top <= line + 1) next = card.dataset.instance;
      }
      if (lastBottom <= line) next = null;
    }
    dock.classList.toggle('past-units', pinned && cards.length > 0 && lastBottom <= line);
    if (next === activeUnit && !dirty) return;
    activeUnit = next;
    dirty = false;
    const group = next && groupedUnits().find(g => g.instances[0].instanceId === next);
    summary.hidden = !group?.unit;
    tools.hidden = !!group?.unit;
    summary.replaceChildren();
    delete summary.dataset.instance;
    if (!group?.unit) return;
    summary.dataset.instance = next;
    const header = briefHeader(group.unit, group.instances[0], group, {summaryOnly: true});
    const first = header.querySelector('.brief-first');
    first.tabIndex = 0;
    first.setAttribute('role', 'button');
    first.setAttribute('aria-label', '查看' + named(group.unit.name) + '完整详情');
    first.onclick = () => showUnitDetail(group, first);
    first.onkeydown = e => {
      if (e.target === first && ['Enter', ' '].includes(e.key)) {
        e.preventDefault();showUnitDetail(group, first);
      }
    };
    summary.append(header);
  }

  function refresh() {
    cards = [...list.querySelectorAll(':scope > .roster-unit')];
    dirty = true;
    schedule();
  }
  // Reads are coalesced to one animation frame, including reverse scrolling,
  // large jumps and variable card heights after expanding rules or loading art.
  window.addEventListener('scroll', schedule, {passive: true});
  window.addEventListener('resize', schedule, {passive: true});
  const sizes = new ResizeObserver(schedule);
  for (const element of [info, list, dock]) sizes.observe(element);
  const visibility = new MutationObserver(schedule);
  visibility.observe(page, {attributes: true, attributeFilter: ['hidden']});
  visibility.observe(document.documentElement, {attributes: true, attributeFilter: ['class']});
  return {refresh};
})();
