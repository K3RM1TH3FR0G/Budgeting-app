/* ── ROUTER ──
   navigate() lives here — separate from shell.js — so page modules
   can import it without creating a circular dependency with shell.js.
   shell.js imports pages; pages import router; router imports nothing
   from shell or pages. */

import { State } from './state.js';

/* Page registry — populated by shell.js at boot via registerPages() */
let _pages = {};

export function registerPages(pageMap) {
  _pages = pageMap;
}

export function navigate(page) {
  State.page = page;
  document.querySelectorAll('[data-page]').forEach(b =>
    b.classList.toggle('active', b.dataset.page === page)
  );
  document.querySelectorAll('[aria-current]').forEach(b =>
    b.setAttribute('aria-current', b.dataset.page === page ? 'page' : 'false')
  );
  const fn = _pages[page] || _pages['dashboard'];
  if (fn) fn();
}
