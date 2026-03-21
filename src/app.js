/* ══════════════════════════════════════════
   Bedrock — Budget Smarter
   app.js — boot sequence only
   All application logic lives in modules.
══════════════════════════════════════════ */
import { supa }                              from './config.js';
import { Cache }                             from './state.js';
import { State }                             from './state.js';
import { loadUserData, syncFromCloud,
         initSyncHandlers, initDataHandlers } from './state.js';
import { applyTheme, getTheme }              from './theme.js';
import { applyRecurring }                    from './stats.js';
import { loadCustomCats }                    from './categories.js';
import { showGlobalLoading, setSyncIndicator,
         showToast }                         from './ui.js';
import { initApp, logout,
         startInactivityWatcher,
         stopInactivityWatcher,
         loadTemplates, loadNavPins }        from './shell.js';
import { renderAuth }                        from './pages/auth.js';
import { navigate }                          from './router.js';

/* ════════════════════════════════════
   BOOT — session check + app init
════════════════════════════════════ */
(async function boot() {
  /* ── Wire up state.js callbacks ──
     state.js needs UI functions but can't import them directly
     (would create circular deps). We inject them at boot instead. */
  initSyncHandlers(setSyncIndicator, showToast);
  initDataHandlers({
    applyRecurring,
    loadCustomCats,
    loadTemplates,
    loadNavPins,
    applyTheme,
    getTheme,
    navigate,
  });

  /* ── HTTPS check ── */
  if (location.protocol === 'http:' &&
      location.hostname !== 'localhost' &&
      location.hostname !== '127.0.0.1') {
    document.getElementById('app').innerHTML = `
      <div style="position:fixed;inset:0;display:flex;align-items:center;
                  justify-content:center;background:#07101f;padding:24px">
        <div style="max-width:400px;text-align:center">
          <div style="font-size:48px;margin-bottom:16px">🔒</div>
          <div style="font-size:20px;font-weight:900;color:#ff4d6a;margin-bottom:10px">
            Insecure Connection</div>
          <div style="font-size:14px;color:#7a90b8;line-height:1.6;margin-bottom:20px">
            Bedrock is being loaded over HTTP. Please use the HTTPS version.</div>
          <button onclick="location.href=location.href.replace('http://','https://')"
            style="background:#0ec99a;color:#07101f;border:none;padding:12px 24px;
                   border-radius:8px;font-size:14px;font-weight:800;cursor:pointer;">
            Switch to HTTPS →</button>
        </div>
      </div>`;
    return;
  }

  /* Apply saved theme immediately to avoid flash */
  applyTheme(getTheme());

  const { data: { session } } = await supa.auth.getSession()
    .catch(() => ({ data: { session: null } }));

  if (session?.user) {
    const sbUser = session.user;
    const uid    = sbUser.id;
    const hasCachedData = Cache.get(uid, 'txs', null) !== null;

    if (hasCachedData) {
      await loadUserData(sbUser);
      initApp();
    } else {
      showGlobalLoading('Loading your data…');
      await loadUserData(sbUser);
      initApp();
    }
  } else {
    renderAuth('login');
  }
})();
