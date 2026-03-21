import { $, $$, esc, fmt, fmtK, fmtDate, genId, todayStr } from '../utils.js';
import { IC }                                from '../icons.js';
import { SB }                                from '../db.js';
import { State, saveAndSync }                from '../state.js';
import { getCat, CATS }                      from '../categories.js';
import { render, showToast, openModal,
         closeModal, bedrockLogo }            from '../ui.js';
import { navigate }                           from '../router.js';
import { drawAreaChart, drawDonut }           from '../charts.js';
import { monthStats, generateInsights,
         detectSubscriptions, recordNWSnapshot,
         getBudgetAlerts, alertsHTML }         from '../stats.js';
import { showAddTxModal, showImportModal,
         txHTML, delTxWithUndo }              from './transactions.js';
import { getTotalBalance, getEffectiveBalance } from './accounts.js';

function renderDashboard(){
  const ms=monthStats(State.txs,0),lm=monthStats(State.txs,1);
  const netWorth=getTotalBalance();
  const savePct=ms.income>0?((ms.savings/ms.income)*100).toFixed(0):0;
  const incChg=lm.income>0?(((ms.income-lm.income)/lm.income)*100).toFixed(0):0;
  const expChg=lm.expenses>0?(((ms.expenses-lm.expenses)/lm.expenses)*100).toFixed(0):0;
  const monthName=new Date().toLocaleDateString('en-US',{month:'long',year:'numeric'});
  const firstName=esc(State.user.name.split(' ')[0]);
  const recent=State.txs.slice(0,6);
  const topCats=Object.entries(ms.byCat).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([cat,val])=>({name:getCat(cat).emoji+' '+getCat(cat).name,value:Math.round(val),color:getCat(cat).color}));
  const insights=generateInsights(ms,lm);
  const insightsHTML=insights.length?insights.map(ins=>`<div class="insight-row"><div class="insight-ico" style="background:${ins.color}22">${ins.icon}</div><div><div class="insight-title">${esc(ins.title)}</div><div class="insight-body">${esc(ins.body)}</div></div></div>`).join(''):'<div class="muted" style="padding:10px 0;text-align:center">Add transactions to unlock insights</div>';

  /* Projected end-of-month balance */
  const now=new Date(),dayOfMonth=now.getDate(),daysInMonth=new Date(now.getFullYear(),now.getMonth()+1,0).getDate();
  const dailySpend=dayOfMonth>0?ms.expenses/dayOfMonth:0;
  const projectedMonthSpend=Math.round(dailySpend*daysInMonth);
  const projectedBalance=ms.income-projectedMonthSpend;
  const spendPace=daysInMonth>0?(ms.expenses/(dayOfMonth/daysInMonth*ms.income||projectedMonthSpend))*100:0;

  /* Subscription detector — recurring small charges */
  const potentialSubs=detectSubscriptions(State.txs);

  /* Save net worth snapshot */
  recordNWSnapshot(netWorth);

  render(`
  <div class="ph">
    <div><div class="pt">👋 Hey, ${esc(firstName)}</div><div class="ps">${monthName} overview</div></div>
    <div class="flex gap8" style="flex-wrap:wrap">
      <button class="btn btn-ghost btn-sm" id="btn-import">${IC.upload} Import CSV</button>
      <button class="btn btn-primary" id="btn-add-tx">${IC.plus} Add Transaction</button>
    </div>
  </div>
  ${alertsHTML()}
  <div class="nw-banner mb16">
    <div class="nw-label">Total Balance</div>
    <div class="nw-val" style="color:var(--green)">${fmt(netWorth)}</div>
    <div class="nw-row">
      <div class="nw-item"><div class="nw-item-label">Income</div><div class="nw-item-val" style="color:var(--green)">${fmt(ms.income)}</div></div>
      <div class="nw-item"><div class="nw-item-label">Spent</div><div class="nw-item-val" style="color:var(--red)">${fmt(ms.expenses)}</div></div>
      <div class="nw-item"><div class="nw-item-label">Saved</div><div class="nw-item-val" style="color:var(--blue)">${fmt(ms.savings)}</div></div>
      <div class="nw-item"><div class="nw-item-label">Save Rate</div><div class="nw-item-val">${savePct}%</div></div>
    </div>
  </div>
  <div class="g4 mb16">
    <div class="card"><div class="stat-label">Income</div><div class="stat-val">${fmt(ms.income)}</div><div class="stat-badge ${incChg>=0?'pos':'neg'}">${incChg>=0?'↑':'↓'} ${Math.abs(incChg)}% vs last month</div></div>
    <div class="card"><div class="stat-label">Expenses</div><div class="stat-val">${fmt(ms.expenses)}</div><div class="stat-badge ${expChg<=0?'pos':'neg'}">${expChg<=0?'↓':'↑'} ${Math.abs(expChg)}% vs last month</div></div>
    <div class="card"><div class="stat-label">Saved</div><div class="stat-val">${fmt(ms.savings)}</div><div class="stat-badge ${ms.savings>=0?'pos':'neg'}">${ms.savings>=0?'On track 🎯':'Deficit ⚠️'}</div></div>
    <div class="card">
      <div class="stat-label">Projected Month-End</div>
      <div class="stat-val" style="color:${projectedBalance>=0?'var(--green)':'var(--red)'}">${fmt(projectedBalance)}</div>
      <div class="projected-bar"><div class="projected-fill" style="width:${Math.min(spendPace,100)}%;background:${spendPace>100?'var(--red)':spendPace>80?'var(--orange)':'var(--green)'}"></div></div>
      <div style="font-size:10px;color:var(--text3);margin-top:4px">Day ${dayOfMonth} of ${daysInMonth} · ${fmtK(projectedMonthSpend)} projected spend</div>
    </div>
  </div>
  <div class="g-main mb16">
    <div style="display:flex;flex-direction:column;gap:16px">
      <div class="card">
        <div class="fbc mb14"><div class="card-title" style="margin:0">30-Day Activity</div>
        <div class="legend"><span class="legend-item"><span class="legend-dot" style="background:var(--red)"></span>Spent</span><span class="legend-item"><span class="legend-dot" style="background:var(--green)"></span>Earned</span></div></div>
        <canvas class="chart" id="area-chart" role="img" aria-label="30-day spending and income activity chart" style="width:100%;height:200px"></canvas>
      </div>
      <div class="card"><div class="fbc mb14"><div class="card-title" style="margin:0">Smart Insights</div>${IC.bulb}</div>${insightsHTML}</div>
    </div>
    <div style="display:flex;flex-direction:column;gap:14px">
      <div class="card"><div class="card-title">Spending by Category</div>
        <div class="fac gap12">
          <div style="width:90px;height:90px;flex-shrink:0;overflow:visible">
            <canvas id="donut-chart" role="img" aria-label="Spending by category donut chart" style="width:90px;height:90px;display:block;overflow:visible"></canvas>
          </div>
          <div style="flex:1;min-width:0">
            ${topCats.map(c=>`<div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:1px solid var(--border)"><div style="display:flex;align-items:center;gap:6px;font-size:12px"><div style="width:8px;height:8px;border-radius:50%;background:${c.color};flex-shrink:0"></div><span style="color:var(--text2)">${esc(c.name)}</span></div><span style="font-size:13px;font-weight:800">$${c.value.toLocaleString()}</span></div>`).join('')}
            ${topCats.length===0?'<div class="muted" style="padding:16px 0;text-align:center">No spending yet</div>':''}
          </div>
        </div>
      </div>
      ${State.goals.length?`<div class="card"><div class="fbc mb12"><div class="card-title" style="margin:0">Goals</div><button class="btn btn-ghost btn-sm" id="btn-see-goals">View all →</button></div>${State.goals.slice(0,2).map(g=>{const pct=g.target>0?Math.min((g.saved/g.target)*100,100):0;return`<div style="margin-bottom:12px"><div class="fbc" style="font-size:13px;margin-bottom:5px"><span style="font-weight:700">${esc(g.emoji)} ${esc(g.name)}</span><span style="color:var(--text2)">${fmtK(g.saved)} / ${fmtK(g.target)}</span></div><div class="pbar"><div class="pfill" style="width:${pct}%;background:${g.color||'var(--green)'}"></div></div></div>`}).join('')}</div>`:''}
    </div>
  </div>
  <div class="card">
    <div class="fbc mb14"><div class="card-title" style="margin:0">Recent Transactions</div><button class="btn btn-ghost btn-sm" id="btn-see-all">See all →</button></div>
    ${recent.length?recent.map(txHTML).join(''):`<div class="empty"><div class="empty-icon">💳</div><div class="empty-title">No transactions yet</div><div class="empty-sub">Use the quick-add bar on Transactions to get started</div></div>`}
  </div>
  ${potentialSubs.length?`<div class="card mt16">
    <div class="fbc mb14"><div class="card-title" style="margin:0">🔍 Possible Subscriptions Detected</div><span class="badge b-purple">${potentialSubs.length} found</span></div>
    ${potentialSubs.map(s=>`<div class="tx-item"><div class="tx-icon" style="background:var(--purple-dim)">🔄</div><div class="tx-info"><div class="tx-name">${esc(s.name)}</div><div class="tx-meta"><span>${fmtK(Math.abs(s.amount))}/mo</span><span class="rec-badge">Recurring</span></div></div><button class="btn btn-ghost btn-xs" data-mark-rec="${s.name}">Mark Recurring</button></div>`).join('')}
  </div>`:''}`,
  ()=>{
    $('#btn-add-tx')?.addEventListener('click',showAddTxModal);
    $('#btn-import')?.addEventListener('click',showImportModal);
    $('#btn-see-all')?.addEventListener('click',()=>navigate('transactions'));
    $('#btn-see-goals')?.addEventListener('click',()=>navigate('goals'));
    $$('[data-mark-rec]').forEach(b=>b.addEventListener('click',()=>{
      const name=b.dataset.markRec;
      const tx=State.txs.find(t=>t.name===name&&t.amount<0);
      if(tx){const r={id:genId(),name:tx.name,amount:tx.amount,category:tx.category,dayOfMonth:parseInt(tx.date.split('-')[2])||1};State.recurring.push(r);saveAndSync('recurring',State.recurring,()=>SB.saveRecurring(State.user.id,State.recurring));showToast(esc(name)+' added to recurring ✓');renderDashboard();}
    }));
    const ac=$('#area-chart');
    if(ac){const now=new Date(),labels=[],spent=[],earned=[];
      for(let i=29;i>=0;i--){const d=new Date(now);d.setDate(d.getDate()-i);const ds=d.toISOString().split('T')[0];const day=State.txs.filter(t=>t.date===ds);labels.push(d.toLocaleDateString('en-US',{month:'short',day:'numeric'}));spent.push(Math.round(Math.abs(day.filter(t=>t.amount<0).reduce((s,t)=>s+t.amount,0))));earned.push(Math.round(day.filter(t=>t.amount>0).reduce((s,t)=>s+t.amount,0)));}
      drawAreaChart(ac,{labels,datasets:[{data:spent,color:'#ff4d6a'},{data:earned,color:'#3b82f6'}]});
    }
    const dc=$('#donut-chart');if(dc)drawDonut(dc,topCats);
    $$('.del-btn').forEach(b=>b.addEventListener('click',()=>{delTxWithUndo(b.dataset.id)}));
  });
}


export { renderDashboard };
