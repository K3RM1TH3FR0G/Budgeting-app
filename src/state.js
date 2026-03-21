import { SB }        from './db.js';
import { genId }     from './utils.js';

/* ════════════════════════════════════
   APPLICATION STATE
   A single mutable object shared across
   all modules. Import State directly and
   mutate its properties — no setters needed
   for a vanilla JS app at this scale.
════════════════════════════════════ */
export const State = {
  user:           null,
  page:           'dashboard',
  txs:            [],
  budgets:        [],
  settings:       {},
  household:      [],
  goals:          [],
  recurring:      [],
  accounts:       [],
  debts:          [],
  netWorthHistory:[],
  splits:         [],
  bills:          [],
  syncing:        false,
  toastT:         null,

  /* UX memory — persists within a session */
  lastCat:    'other',
  lastAccId:  '',
  lastFilter: { type: 'all', cat: 'all', search: '' },
  templates:  [],   /* [{ id, name, amount, category, accountId, type }] */
  navPins:    ['dashboard', 'transactions', 'forecast', 'accounts'],
};

/* ════════════════════════════════════
   DEFAULT DATA
════════════════════════════════════ */
export const DEFAULT_BUDGETS = [
  { categoryId: 'housing',       amount: 2000 },
  { categoryId: 'food',          amount: 600  },
  { categoryId: 'transport',     amount: 300  },
  { categoryId: 'entertainment', amount: 150  },
  { categoryId: 'shopping',      amount: 200  },
  { categoryId: 'health',        amount: 100  },
  { categoryId: 'utilities',     amount: 250  },
];

/* ════════════════════════════════════
   LOCAL CACHE LAYER
   All reads hit localStorage instantly.
   Supabase is the source of truth but is
   only consulted in the background.

   NOTE: localStorage stores financial data
   in plaintext, scoped per user ID. Physical
   device access or XSS could expose it.
   RLS in Supabase is the primary server-side
   guard.
════════════════════════════════════ */
export const Cache = {
  key: (uid, table) => `bedrock_v1_${uid}_${table}`,

  get: (uid, table, def = null) => {
    try {
      const v = localStorage.getItem(Cache.key(uid, table));
      return v ? JSON.parse(v) : def;
    } catch { return def; }
  },

  set: (uid, table, data) => {
    try {
      localStorage.setItem(Cache.key(uid, table), JSON.stringify(data));
    } catch {}
  },

  clear: uid => {
    ['txs','budgets','goals','recurring','settings','accounts','household','bills','splits']
      .forEach(t => { try { localStorage.removeItem(Cache.key(uid, t)); } catch {} });
  },
};

/* ════════════════════════════════════
   SYNC QUEUE
   Debounced write queue — batches rapid
   saves into one cloud write per table.
   setSyncIndicator and showToast are
   injected at init to avoid circular deps.
════════════════════════════════════ */
const SyncQ = {};
let _setSyncIndicator = () => {};
let _showToast        = () => {};

export function initSyncHandlers(setSyncIndicator, showToast) {
  _setSyncIndicator = setSyncIndicator;
  _showToast        = showToast;
}

export function queueSync(table, fn, delay = 1200) {
  clearTimeout(SyncQ[table]);
  SyncQ[table] = setTimeout(async () => {
    _setSyncIndicator(true);
    try {
      await fn();
    } catch (e) {
      console.warn('Sync failed:', table, e.message);
      _showToast('Sync failed — data saved locally. Will retry on next action.', 'var(--orange)');
    }
    setTimeout(() => _setSyncIndicator(false), 600);
  }, delay);
}

/* Write-through: save to cache immediately, queue cloud write */
export function saveAndSync(table, data, cloudFn) {
  if (State.user) Cache.set(State.user.id, table, data);
  queueSync(table, cloudFn);
}

/* ════════════════════════════════════
   DATA LOAD & CLOUD SYNC
════════════════════════════════════ */

/* Forward references — injected at boot to avoid circular imports */
let _applyRecurring  = () => {};
let _loadCustomCats  = () => {};
let _loadTemplates   = () => {};
let _loadNavPins     = () => {};
let _applyTheme      = () => {};
let _getTheme        = () => 'dark';
let _navigate        = () => {};

export function initDataHandlers({ applyRecurring, loadCustomCats, loadTemplates, loadNavPins, applyTheme, getTheme, navigate }) {
  _applyRecurring = applyRecurring;
  _loadCustomCats = loadCustomCats;
  _loadTemplates  = loadTemplates;
  _loadNavPins    = loadNavPins;
  _applyTheme     = applyTheme;
  _getTheme       = getTheme;
  _navigate       = navigate;
}

export async function loadUserData(sbUser) {
  State.user = {
    id:        sbUser.id,
    name:      sbUser.user_metadata?.name || sbUser.email.split('@')[0],
    email:     sbUser.email,
    createdAt: sbUser.created_at || new Date().toISOString(),
  };
  const uid = sbUser.id;

  /* Step 1 — load from cache instantly (zero network) */
  State.txs       = Cache.get(uid, 'txs', []);
  State.budgets   = Cache.get(uid, 'budgets', null) || DEFAULT_BUDGETS.map(b => ({ ...b }));
  State.goals     = Cache.get(uid, 'goals', []);
  State.recurring = Cache.get(uid, 'recurring', []);
  State.settings  = Cache.get(uid, 'settings', null) || { notifs: true, weekStart: 'monday' };
  State.accounts  = Cache.get(uid, 'accounts', []);
  State.household = Cache.get(uid, 'household', []);
  State.bills     = Cache.get(uid, 'bills', []);
  State.splits    = Cache.get(uid, 'splits', []);
  State.debts     = Cache.get(uid, 'debts', []);

  _applyRecurring();
  _loadCustomCats();
  _loadTemplates();
  _loadNavPins();
  _applyTheme(State.settings.theme || _getTheme());

  /* Step 2 — sync from Supabase in background (non-blocking) */
  syncFromCloud(sbUser).catch(() => {});
}

export async function syncFromCloud(sbUser) {
  const uid = sbUser.id;
  _setSyncIndicator(true);
  try {
    const [txs, budgets, goals, recurring, settings, accounts, household, bills, splits] =
      await Promise.all([
        SB.getTxs(uid),      SB.getBudgets(uid),  SB.getGoals(uid),
        SB.getRecurring(uid),SB.getSettings(uid),  SB.getAccounts(uid),
        SB.getHousehold(uid),SB.getBills(uid),      SB.getSplits(uid),
      ]);

    /* Update cache */
    Cache.set(uid, 'txs',       txs);
    Cache.set(uid, 'budgets',   budgets.length ? budgets : DEFAULT_BUDGETS);
    Cache.set(uid, 'goals',     goals);
    Cache.set(uid, 'recurring', recurring);
    Cache.set(uid, 'settings',  settings);
    Cache.set(uid, 'accounts',  accounts);
    Cache.set(uid, 'household', household);
    Cache.set(uid, 'bills',     bills);
    Cache.set(uid, 'splits',    splits);

    /* Update state with authoritative cloud data */
    State.txs       = txs;
    State.budgets   = budgets.length ? budgets : DEFAULT_BUDGETS.map(b => ({ ...b }));
    State.goals     = goals;
    State.recurring = recurring;
    State.settings  = settings;
    State.accounts  = accounts;
    State.household = household;
    State.bills     = bills;
    State.splits    = splits;

    /* Seed default budgets for brand-new accounts */
    if (!budgets.length) SB.saveBudgets(uid, State.budgets).catch(() => {});

    _applyRecurring();

    /* Re-render if the app is visible */
    if (!document.hidden && State.page) _navigate(State.page);

  } finally {
    setTimeout(() => _setSyncIndicator(false), 600);
  }
}

/* ════════════════════════════════════
   LOCAL-ONLY STORE HELPERS
   Debts and NW history never leave the
   device. Splits and bills sync to cloud.
════════════════════════════════════ */
export const getDebts     = ()  => State.user ? Cache.get(State.user.id, 'debts',      []) : [];
export const saveDebts    = d   => { if (State.user) { State.debts = d; Cache.set(State.user.id, 'debts', d); } };
export const getNWHistory = ()  => State.user ? Cache.get(State.user.id, 'nw_history', []) : [];
export const saveNWHistory= h   => { if (State.user) Cache.set(State.user.id, 'nw_history', h); };

export function saveSplits(s) {
  if (!State.user) return;
  State.splits = s;
  Cache.set(State.user.id, 'splits', s);
  queueSync('splits', () => SB.saveSplits(State.user.id, s));
}

export function saveBills(b) {
  if (!State.user) return;
  State.bills = b;
  Cache.set(State.user.id, 'bills', b);
  queueSync('bills', () => SB.saveBills(State.user.id, b));
}
