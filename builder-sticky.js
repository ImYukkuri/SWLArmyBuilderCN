/* Unit headers stick within their own cards in CSS. This module only measures
 * the shared top bar and handles the two-step rank navigation. */
window.BuilderSticky = (() => {
  const page = document.querySelector('#editor-page');
  const info = document.querySelector('#roster-info');
  const ranks = document.querySelector('#rank-bar');
  const list = document.querySelector('#army-units');
  let selectedRank = null, selectedY = null, frame = 0;

  function refreshNavigation() {
    for (const button of ranks.querySelectorAll('button')) {
      const rank = Number(button.dataset.rank), selected = rank === selectedRank;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-pressed', String(selected));
      button.setAttribute('aria-label', (selected ? '添加' : '定位') + RANK_SHORT[rank] + '单位，当前 ' + button.dataset.count + ' 个');
      const icon = button.querySelector('.rank-icon');
      icon.classList.toggle('rank-plus', selected);
      if (selected) icon.textContent = '+';
      else setRankIcon(icon, rank);
    }
  }

  function reset() {
    selectedRank = null;
    selectedY = null;
    refreshNavigation();
  }

  function measure() {
    frame = 0;
    if (page.hidden) return;
    const height = Math.ceil(info.getBoundingClientRect().height);
    if (page.style.getPropertyValue('--roster-info-height') !== height + 'px')
      page.style.setProperty('--roster-info-height', height + 'px');
  }

  function refresh() {
    if (!frame) frame = requestAnimationFrame(measure);
  }

  function selectRank(rank, trigger) {
    if (rank === selectedRank) {
      selectContext({mode: 'units', rank}, trigger);
      return;
    }
    selectedRank = rank;
    refreshNavigation();
    measure();
    const target = list.querySelector(`:scope > .roster-unit[data-rank="${rank}"]`);
    if (target) {
      // An instant jump keeps the button under the finger for the second tap.
      // Capture its result so this intentional scroll retains the selection.
      const top = scrollY + target.getBoundingClientRect().top - info.getBoundingClientRect().height;
      window.scrollTo({top, behavior: 'instant'});
    }
    selectedY = scrollY;
  }

  window.addEventListener('scroll', () => {
    // Modal body locking/restoration is not a navigation gesture.
    if (document.documentElement.classList.contains('page-overlay-open')) return;
    if (selectedY !== null && Math.abs(scrollY - selectedY) > 1) reset();
  }, {passive: true});
  window.addEventListener('resize', refresh, {passive: true});
  new ResizeObserver(refresh).observe(info);
  new MutationObserver(refresh).observe(page, {attributes: true, attributeFilter: ['hidden']});
  return {refresh, refreshNavigation, selectRank, reset};
})();
