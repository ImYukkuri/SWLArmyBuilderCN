/* Keep the page and parent panels still while modal surfaces open and close. */
window.BuilderOverlays = (() => {
  const sessions = new Map();
  let page = null, revision = 0;
  const root = document.documentElement;

  function rememberFocus(element) {
    const parts = [];
    for (let n = element; n && n !== document.body; n = n.parentElement) {
      if (n.id) { parts.unshift('#' + CSS.escape(n.id)); break; }
      const key = ['data-instance', 'data-slot-index', 'data-choice-id', 'data-rule-key', 'data-kind', 'data-index']
        .find(k => n.hasAttribute(k));
      const index = [...(n.parentElement?.children || [])].filter(s => s.tagName === n.tagName).indexOf(n) + 1;
      parts.unshift(n.localName + (key ? `[${key}="${CSS.escape(n.getAttribute(key))}"]` : `:nth-of-type(${index})`));
    }
    return () => element?.isConnected ? element : parts.length ? document.querySelector(parts.join(' > ')) : null;
  }

  function focus(target) {
    if (target?.isConnected && !target.closest('[inert]') && target.getClientRects().length)
      target.focus?.({ preventScroll: true });
  }

  function preserveScroll(update, containers = []) {
    const position = page ? null : {left: scrollX, top: scrollY, behavior: 'instant'};
    const offsets = containers.map(node => ({node, left: node.scrollLeft, top: node.scrollTop}));
    update();
    for (const {node, left, top} of offsets) {
      if (node.scrollLeft !== left || node.scrollTop !== top)
        node.scrollTo({left, top, behavior: 'instant'});
    }
    if (position && !page && (scrollX !== position.left || scrollY !== position.top)) window.scrollTo(position);
  }

  function parents() {
    return [...document.querySelectorAll('dialog[open], #card-grid, #card-browser')]
      .filter(n => n.getClientRects().length)
      .map(node => ({node, x: node.scrollLeft, y: node.scrollTop}));
  }

  function open(surface, opener = document.activeElement) {
    if (sessions.has(surface)) return;
    revision++;
    const session = {focus: typeof opener === 'function' ? opener : rememberFocus(opener), parents: parents()};
    if (!page) {
      page = {x: scrollX, y: scrollY, route: location.hash};
      root.style.setProperty('--overlay-page-top', -page.y + 'px');
      root.style.setProperty('--overlay-page-left', -page.x + 'px');
      root.style.setProperty('--overlay-page-gutter', Math.max(0, innerWidth - root.clientWidth) + 'px');
      // Fixed body also prevents background touch scrolling on mobile Safari.
      root.classList.add('page-overlay-open');
    }
    sessions.set(surface, session);
  }

  function unlock() {
    const saved = page;
    page = null;
    root.classList.remove('page-overlay-open');
    for (const key of ['top', 'left', 'gutter']) root.style.removeProperty('--overlay-page-' + key);
    return saved;
  }

  function close(surface, {restoreFocus = true} = {}) {
    const session = sessions.get(surface);
    if (!session) return;
    const top = [...sessions.keys()].at(-1) === surface;
    sessions.delete(surface);
    const saved = sessions.size ? null : unlock();
    const version = ++revision, route = location.hash;
    const restore = () => {
      if (version !== revision || route !== location.hash) return;
      for (const {node, x, y} of session.parents) {
        if (node.isConnected && node.getClientRects().length) node.scrollTo({left: x, top: y, behavior: 'instant'});
      }
      if (saved && saved.route === location.hash) window.scrollTo({left: saved.x, top: saved.y, behavior: 'instant'});
    };
    if (top && restoreFocus && (!saved || saved.route === location.hash)) focus(session.focus());
    restore();
    // Native dialog focus restoration and mobile keyboard layout may finish on
    // the following frame. Cancel this correction as soon as the user interacts.
    requestAnimationFrame(() => { restore(); requestAnimationFrame(restore); });
  }

  function reset() {
    revision++;
    sessions.clear();
    if (page) unlock();
  }
  for (const event of ['pointerdown', 'touchstart', 'wheel', 'keydown'])
    document.addEventListener(event, () => revision++, {capture: true, passive: true});
  function replaceRoute(previous) {
    if (page?.route === previous) page.route = location.hash;
  }
  return {open, close, reset, focus, rememberFocus, replaceRoute, preserveScroll};
})();
