import { supa } from './config.js';
import { genId } from './utils.js';

/* ════════════════════════════════════
   SUPABASE DATA LAYER (SB)
   All direct Supabase calls live here.
   Pages and state management import
   from this module — never call supa
   directly from UI code.
════════════════════════════════════ */
export const SB = {

  /* ── AUTH ── */
  signUp: async (email, pass, name) => {
    const { data, error } = await supa.auth.signUp({ email, password: pass, options: { data: { name } } });
    if (error) throw new Error(error.message);
    if (data.user) await supa.from('settings').upsert({ user_id: data.user.id, notifs: true, week_start: 'monday' });
    return data.user;
  },
  signIn: async (email, pass) => {
    const { data, error } = await supa.auth.signInWithPassword({ email, password: pass });
    if (error) throw new Error(error.message);
    return data.user;
  },
  signOut:    () => supa.auth.signOut(),
  getSession: async () => { const { data } = await supa.auth.getSession(); return data.session?.user || null; },
  updateName: async name => { await supa.auth.updateUser({ data: { name } }); },

  /* ── TRANSACTIONS ── */
  getTxs: async uid => {
    const { data } = await supa.from('transactions').select('*').eq('user_id', uid).order('date', { ascending: false });
    return (data || []).map(t => ({
      id: t.id, name: t.name, category: t.category,
      amount: parseFloat(t.amount), date: t.date,
      note: t.note || '', recurring: t.recurring || false,
      recurringId: t.recurring_id, accountId: t.account_id || undefined,
    }));
  },
  addTx: async (uid, tx) => {
    await supa.from('transactions').insert({
      id: tx.id, user_id: uid, name: tx.name, category: tx.category,
      amount: tx.amount, date: tx.date, note: tx.note || '',
      recurring: tx.recurring || false, recurring_id: tx.recurringId || null,
      account_id: tx.accountId || null,
    });
  },
  deleteTx: async id => { await supa.from('transactions').delete().eq('id', id); },
  addTxsBatch: async (uid, txs) => {
    const rows = txs.map(t => ({
      id: t.id, user_id: uid, name: t.name, category: t.category,
      amount: t.amount, date: t.date, note: t.note || '',
      recurring: false, account_id: t.accountId || null,
    }));
    await supa.from('transactions').upsert(rows);
  },
  updateTx: async (id, fields) => {
    await supa.from('transactions').update(fields).eq('id', id);
  },

  /* ── BUDGETS ── */
  getBudgets: async uid => {
    const { data } = await supa.from('budgets').select('*').eq('user_id', uid);
    return (data || []).map(b => ({ categoryId: b.category_id, amount: parseFloat(b.amount) }));
  },
  saveBudgets: async (uid, budgets) => {
    await supa.from('budgets').delete().eq('user_id', uid);
    if (budgets.length)
      await supa.from('budgets').insert(budgets.map(b => ({ user_id: uid, category_id: b.categoryId, amount: b.amount })));
  },

  /* ── GOALS ── */
  getGoals: async uid => {
    const { data } = await supa.from('goals').select('*').eq('user_id', uid);
    return (data || []).map(g => ({
      id: g.id, name: g.name, target: parseFloat(g.target),
      saved: parseFloat(g.saved), emoji: g.emoji, color: g.color, deadline: g.deadline,
    }));
  },
  saveGoals: async (uid, goals) => {
    const { data: existing } = await supa.from('goals').select('id').eq('user_id', uid);
    const existIds = (existing || []).map(g => g.id);
    const keepIds  = goals.map(g => g.id).filter(Boolean);
    const toDelete = existIds.filter(id => !keepIds.includes(id));
    if (toDelete.length) await supa.from('goals').delete().in('id', toDelete);
    if (goals.length) {
      const rows = goals.map(g => ({
        id: g.id || genId(), user_id: uid, name: g.name,
        target: g.target, saved: g.saved, emoji: g.emoji,
        color: g.color, deadline: g.deadline || null,
      }));
      await supa.from('goals').upsert(rows);
      goals.forEach((g, i) => { if (!g.id) g.id = rows[i].id; });
    }
  },

  /* ── RECURRING ── */
  getRecurring: async uid => {
    const { data } = await supa.from('recurring').select('*').eq('user_id', uid);
    return (data || []).map(r => ({
      id: r.id, name: r.name, amount: parseFloat(r.amount),
      category: r.category, dayOfMonth: r.day_of_month,
    }));
  },
  saveRecurring: async (uid, recs) => {
    await supa.from('recurring').delete().eq('user_id', uid);
    if (recs.length)
      await supa.from('recurring').insert(recs.map(r => ({
        id: r.id, user_id: uid, name: r.name, amount: r.amount,
        category: r.category, day_of_month: r.dayOfMonth || 1,
      })));
  },

  /* ── SETTINGS ── */
  getSettings: async uid => {
    const { data } = await supa.from('settings').select('*').eq('user_id', uid).maybeSingle();
    return data ? { notifs: data.notifs, weekStart: data.week_start } : { notifs: true, weekStart: 'monday' };
  },
  saveSettings: async (uid, s) => {
    await supa.from('settings').upsert({ user_id: uid, notifs: s.notifs, week_start: s.weekStart });
  },

  /* ── ACCOUNTS ── */
  getAccounts: async uid => {
    const { data } = await supa.from('accounts').select('*').eq('user_id', uid);
    return (data || []).map(a => ({
      id: a.id, type: a.type, name: a.name,
      balance: parseFloat(a.balance), gradient: a.gradient,
    }));
  },
  addAccount: async (uid, acc) => {
    const { data } = await supa.from('accounts')
      .insert({ user_id: uid, type: acc.type, name: acc.name, balance: acc.balance, gradient: acc.gradient })
      .select().single();
    return data;
  },
  updateAccount: async (id, balance, type, name, gradient) => {
    await supa.from('accounts').update({ balance, type, name, gradient }).eq('id', id);
  },
  deleteAccount: async id => { await supa.from('accounts').delete().eq('id', id); },

  /* ── HOUSEHOLD ── */
  getHousehold: async uid => {
    const { data } = await supa.from('household').select('*').eq('owner_id', uid);
    return (data || []).map(m => ({
      id: m.id, email: m.member_email,
      name: m.member_name || m.member_email.split('@')[0],
    }));
  },
  addMember: async (uid, email, name) => {
    const { data } = await supa.from('household')
      .insert({ owner_id: uid, member_email: email, member_name: name })
      .select().single();
    return data;
  },
  removeMember: async id => { await supa.from('household').delete().eq('id', id); },

  /* ── BILLS ── */
  getBills: async uid => {
    const { data } = await supa.from('bills').select('*').eq('user_id', uid);
    return (data || []).map(b => ({
      id: b.id, name: b.name, emoji: b.emoji || '💳',
      category: b.category || 'other', type: b.type || 'other',
      amount: b.amount != null ? parseFloat(b.amount) : null,
      dueDay: b.due_day || null, paid: b.paid || false, paidDate: b.paid_date || null,
    }));
  },
  saveBills: async (uid, bills) => {
    await supa.from('bills').delete().eq('user_id', uid);
    if (bills.length)
      await supa.from('bills').insert(bills.map(b => ({
        id: b.id, user_id: uid, name: b.name, emoji: b.emoji || '💳',
        category: b.category || 'other', type: b.type || 'other',
        amount: b.amount ?? null, due_day: b.dueDay ?? null,
        paid: b.paid || false, paid_date: b.paidDate || null,
      })));
  },

  /* ── SPLITS ── */
  getSplits: async uid => {
    const { data } = await supa.from('splits').select('*').eq('user_id', uid);
    return (data || []).map(s => ({
      id: s.id, description: s.description, amount: parseFloat(s.amount),
      people: JSON.parse(s.people || '[]'), owedToMe: s.owed_to_me || false,
      date: s.date || '', settled: s.settled || false,
    }));
  },
  saveSplits: async (uid, splits) => {
    await supa.from('splits').delete().eq('user_id', uid);
    if (splits.length)
      await supa.from('splits').insert(splits.map(s => ({
        id: s.id, user_id: uid, description: s.description, amount: s.amount,
        people: JSON.stringify(s.people || []), owed_to_me: s.owedToMe || false,
        date: s.date || '', settled: s.settled || false,
      })));
  },
};
