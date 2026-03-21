import { $, $$, esc, initials, avatarColor } from './utils.js';
import { IC }                                 from './icons.js';
import { SB }                                 from './db.js';
import { State, Cache, loadUserData, syncFromCloud,
         initSyncHandlers, initDataHandlers }  from './state.js';
import { render, showToast, showGlobalLoading,
         setSyncIndicator, bedrockLogo }        from './ui.js';
import { applyTheme, getTheme }                from './theme.js';
import { applyRecurring, getBudgetAlerts }      from './stats.js';
import { loadCustomCats }                       from './categories.js';
import { renderAuth }                           from './pages/auth.js';
import { navigate, registerPages }              from './router.js';
import { renderDashboard }                      from './pages/dashboard.js';
import { renderTransactions }                   from './pages/transactions.js';
import { renderBudgets }                        from './pages/budgets.js';
import { renderReports }                        from './pages/reports.js';
import { renderGoals }                          from './pages/goals.js';
import { renderAccounts }                       from './pages/accounts.js';
import { renderSettings }                       from './pages/settings.js';
import { renderCategories }                     from './pages/categories.js';
import { renderForecast }                       from './pages/forecast.js';
import { renderDebts }                          from './pages/debts.js';
import { renderLoans }                          from './pages/loans.js';
import { renderBills }                          from './pages/bills.js';
import { renderSplits }                         from './pages/splits.js';
import { renderPayPlanner }                     from './pages/payplanner.js';
import { renderWeekPlanner }                    from './pages/weekplanner.js';

const NAV=[
  /* ── OVERVIEW ── */
  {id:'dashboard',   label:'Dashboard',     icon:'dash',     group:'Overview'},
  {id:'accounts',    label:'Accounts',      icon:'acc',      group:'Overview'},
  /* ── MONEY IN / OUT ── */
  {id:'transactions',label:'Transactions',  icon:'tx',       group:'Money'},
  {id:'bills',       label:'Bills',         icon:'bill',     group:'Money'},
  {id:'budgets',     label:'Budgets',       icon:'bud',      group:'Money'},
  /* ── PLANNING ── */
  {id:'goals',       label:'Goals',           icon:'goals',    group:'Planning'},
  {id:'forecast',    label:'Forecast',        icon:'forecast', group:'Planning'},
  {id:'payplanner',  label:'Pay Planner',     icon:'payplan',  group:'Planning'},
  {id:'weekplanner', label:'Week Planner',    icon:'weekplan', group:'Planning'},
  {id:'debts',       label:'Debt Tracker',    icon:'debt',     group:'Planning'},
  /* ── TOOLS ── */
  {id:'reports',     label:'Reports',       icon:'rep',      group:'Tools'},
  {id:'loans',       label:'Loan Calc',     icon:'loan',     group:'Tools'},
  {id:'splits',      label:'Split Expenses',icon:'split',    group:'Tools'},
  {id:'categories',  label:'Categories',    icon:'tag',      group:'Tools'},
];

function getDismissed(){return JSON.parse(localStorage.getItem('bedrock_dismissed_alerts')||'[]');}

function setDismissed(arr){localStorage.setItem('bedrock_dismissed_alerts',JSON.stringify(arr));}

function initApp(){
  startInactivityWatcher();
  const u=State.user;
  $('#app').innerHTML=`
  <nav class="sidebar" aria-label="Main navigation">
    <div class="logo-wrap" style="justify-content:space-between">
      <div style="display:flex;align-items:center;gap:10px">${bedrockLogo(36)}</div>
      <button id="alert-bell-btn" class="alert-center-btn" aria-label="View alerts" style="background:none;border:none;padding:5px;cursor:pointer;color:var(--text2);display:flex;align-items:center;border-radius:var(--rsm);transition:background .15s;flex-shrink:0" title="Alerts">${IC.bell}${getBudgetAlerts().length?'<div class="alert-dot"></div>':''}</button>
    </div>
    <div class="s-label">Menu</div>
    ${(()=>{
      let lastGroup='';
      return NAV.map(n=>{
        const groupLabel=n.group!==lastGroup?`<div class="s-label" style="margin-top:10px">${n.group}</div>`:'';
        lastGroup=n.group;
        return groupLabel+`<button class="nav-btn ${State.page===n.id?'active':''}" data-page="${n.id}" aria-current="${State.page===n.id?'page':'false'}">${IC[n.icon]||''}${n.label}${n.badge?`<span class="new-badge">${n.badge}</span>`:''}</button>`;
      }).join('');
    })()}
    <div class="s-label">Account</div>
    <button class="nav-btn ${State.page==='settings'?'active':''}" data-page="settings" aria-current="${State.page==='settings'?'page':'false'}">${IC.set}Settings</button>
    <div class="s-bottom">

      <div class="user-pill" id="logout-btn" role="button" tabindex="0" aria-label="Sign out (${esc(u.email)})">
        <div class="avatar" style="background:${avatarColor(esc(u.name))}">${initials(esc(u.name))}</div>
        <div class="u-info"><div class="u-name">${esc(u.name)}</div><div class="u-email">${esc(u.email)}</div></div>
        ${IC.out}
      </div>
    </div>
  </nav>
  <main class="main-area" role="main">
    <div style="display:flex;justify-content:flex-end;align-items:center;padding:0 0 16px 0">
      <div id="sync-ind" style="opacity:0;transition:opacity .3s;background:var(--accent-dim);border:1px solid var(--accent);border-radius:var(--rsm);padding:6px 10px;font-size:11px;font-weight:700;color:var(--accent);display:flex;align-items:center;gap:5px" aria-live="polite" aria-label="Sync status">${IC.sync} Syncing…</div>
    </div>
    <div id="main-content" class="page"></div>
  </main>
  <nav class="mnav" aria-label="Mobile navigation"><div class="mnav-inner">
    ${State.navPins.slice(0,4).map(id=>{
      const n=NAV.find(x=>x.id===id)||{id,label:id,icon:'dash'};
      const shortLabels={dashboard:'Home',transactions:'Txns',budgets:'Budget',reports:'Reports',forecast:'Forecast',loans:'Loans',goals:'Goals',debts:'Debts',splits:'Splits',accounts:'Accounts',settings:'Settings',categories:'Cats',bills:'Bills'};
      const label=shortLabels[id]||n.label;
      return`<button class="mni ${State.page===id?'active':''}" data-page="${id}" aria-current="${State.page===id?'page':'false'}">${IC[n.icon]||''}${label}</button>`;
    }).join('')}
    <button class="mni ${State.page==='settings'?'active':''}" data-page="settings" aria-current="${State.page==='settings'?'page':'false'}">${IC.set}More</button>
  </div></nav>`;
  $$('[data-page]').forEach(b=>b.addEventListener('click',()=>navigate(b.dataset.page)));
  $('#logout-btn').addEventListener('click',logout);
  $('#logout-btn').addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();logout();}});
  $('#alert-bell-btn')?.addEventListener('click',showAlertCenter);
  /* Register all pages with the router */
  registerPages({dashboard:renderDashboard,transactions:()=>renderTransactions(),
    budgets:renderBudgets,reports:()=>renderReports('month'),goals:renderGoals,
    forecast:renderForecast,payplanner:renderPayPlanner,weekplanner:renderWeekPlanner,
    loans:renderLoans,bills:renderBills,debts:renderDebts,splits:renderSplits,
    accounts:renderAccounts,settings:renderSettings,categories:renderCategories});
  navigate(State.page);
}


async function logout(){
  stopInactivityWatcher();
  if(State.user) Cache.clear(State.user.id);
  await SB.signOut();
  State.user=null;State.txs=[];State.budgets=[];State.goals=[];State.recurring=[];State.settings={};State.accounts=[];State.household=[];State.debts=[];State.splits=[];State.bills=[];State.page='dashboard';
  renderAuth('login');
}

async function syncToCloud(label,fn){
  /* Legacy shim — routes through new debounced queue */
  queueSync(label, fn, 800);
}

function showAlertCenter(){
  const budgetAlerts=getBudgetAlerts();
  const goals=State.goals.filter(g=>g.target>0&&(g.saved/g.target)>=0.9&&g.saved<g.target);
  const savePct=()=>{const ms=monthStats(State.txs,0);return ms.income>0?((ms.savings/ms.income)*100):0};
  const dismissed=getDismissed();

  let allAlerts=[
    ...budgetAlerts.map(a=>({
      id:`budget-${a.cat.id}`,icon:a.pct>=100?'🚨':'⚠️',
      title:`${esc(a.cat.name)} ${a.pct>=100?'over budget':'at '+Math.round(a.pct)+'%'}`,
      sub:`${fmtK(a.spent)} spent of ${fmtK(a.budget)} budget`,
      color:a.pct>=100?'var(--red)':'var(--orange)',
      page:'budgets'
    })),
    ...goals.map(g=>({
      id:`goal-${g.id}`,icon:'🎯',
      title:`${esc(g.name)} is almost complete!`,
      sub:`${fmtK(g.saved)} of ${fmtK(g.target)} saved — just ${fmtK(g.target-g.saved)} to go`,
      color:'var(--green)',page:'goals'
    })),
    ...(savePct()<0?[{id:'overspend',icon:'📉',title:'Spending exceeds income this month',sub:'Check your budget to find where to cut back',color:'var(--red)',page:'reports'}]:[]),
    ...(State.recurring.length>0?[{id:'recurring',icon:'🔄',title:`${State.recurring.length} recurring payment${State.recurring.length>1?'s':''} this month`,sub:'Review in Settings → Recurring Transactions',color:'var(--purple)',page:'settings'}]:[]),
    ...(State.bills.filter(b=>!b.paidDate?.startsWith(new Date().toISOString().slice(0,7))).length>0?[{id:'bills',icon:'📄',title:`${State.bills.filter(b=>!b.paidDate?.startsWith(new Date().toISOString().slice(0,7))).length} unpaid bill${State.bills.filter(b=>!b.paidDate?.startsWith(new Date().toISOString().slice(0,7))).length>1?'s':''} this month`,sub:'Tap to view your bills',color:'var(--orange)',page:'bills'}]:[]),
  ].filter(a=>!dismissed.includes(a.id));

  const modal=document.createElement('div');modal.className='overlay';
  const isMobile=window.innerWidth<769;

  function renderAlertRows(){
    const rows=modal.querySelector('#alert-rows');
    if(!rows)return;
    rows.innerHTML=allAlerts.length?allAlerts.map((a,i)=>`
      <div class="alert-row" data-idx="${i}" style="cursor:pointer;position:relative;overflow:hidden;user-select:none">
        <div class="alert-row-icon">${a.icon}</div>
        <div class="alert-row-info" style="flex:1">
          <div class="alert-row-title" style="color:${a.color}">${esc(a.title)}</div>
          <div class="alert-row-sub">${esc(a.sub)}</div>
        </div>
        <button class="btn btn-ghost btn-xs alert-dismiss" data-idx="${i}" title="Dismiss" style="flex-shrink:0;color:var(--text3)">✕</button>
      </div>`).join('')
    :`<div class="empty" style="padding:32px 20px"><div class="empty-icon">✅</div><div class="empty-title">All clear!</div><div class="empty-sub">No alerts right now.</div></div>`;

    /* Click row to navigate */
    rows.querySelectorAll('.alert-row').forEach(row=>{
      row.addEventListener('click',e=>{
        if(e.target.classList.contains('alert-dismiss'))return;
        const a=allAlerts[parseInt(row.dataset.idx)];
        if(a?.page){closeModal(modal);navigate(a.page);}
      });
    });

    /* Dismiss single */
    rows.querySelectorAll('.alert-dismiss').forEach(btn=>{
      btn.addEventListener('click',e=>{
        e.stopPropagation();
        const a=allAlerts[parseInt(btn.dataset.idx)];
        const d=getDismissed();d.push(a.id);setDismissed(d);
        allAlerts.splice(parseInt(btn.dataset.idx),1);
        renderAlertRows();
      });
    });

    /* Mobile swipe-to-dismiss */
    if(isMobile){
      rows.querySelectorAll('.alert-row').forEach(row=>{
        let startX=0,dx=0;
        row.addEventListener('touchstart',e=>{startX=e.touches[0].clientX;dx=0;},{passive:true});
        row.addEventListener('touchmove',e=>{
          dx=e.touches[0].clientX-startX;
          if(dx<0)row.style.transform=`translateX(${Math.max(dx,-100)}px)`;
        },{passive:true});
        row.addEventListener('touchend',()=>{
          if(dx<-60){
            const a=allAlerts[parseInt(row.dataset.idx)];
            const d=getDismissed();d.push(a.id);setDismissed(d);
            allAlerts.splice(parseInt(row.dataset.idx),1);
            renderAlertRows();
          } else {
            row.style.transform='';
          }
        });
      });
    }
  }

  modal.innerHTML=`<div class="modal" role="dialog" aria-modal="true" style="max-width:420px;padding:0;overflow:hidden">
    <div class="alert-panel-header">
      <div class="alert-panel-title">🔔 Notifications</div>
      <div style="display:flex;gap:8px;align-items:center">
        ${allAlerts.length?`<button class="btn btn-ghost btn-xs" id="clear-all-alerts" style="font-size:11px">Clear all</button>`:''}
        <button class="xbtn" aria-label="Close" id="xm">✕</button>
      </div>
    </div>
    <div id="alert-rows"></div>
  </div>`;
  openModal(modal);
  renderAlertRows();
  modal.addEventListener('click',e=>{if(e.target===modal)closeModal(modal)});
  $('#xm',modal).addEventListener('click',()=>closeModal(modal));
  $('#clear-all-alerts',modal)?.addEventListener('click',()=>{
    const d=getDismissed();
    allAlerts.forEach(a=>d.push(a.id));
    setDismissed(d);allAlerts=[];renderAlertRows();
    modal.querySelector('#clear-all-alerts')?.remove();
  });
}

function saveTemplates(){
  if(State.user) Cache.set(State.user.id,'templates',State.templates);
}

function loadTemplates(){
  if(State.user) State.templates=Cache.get(State.user.id,'templates',[])||[];
}

function loadNavPins(){
  if(State.user){
    const saved=Cache.get(State.user.id,'nav_pins',null);
    if(saved&&Array.isArray(saved)) State.navPins=saved;
  }
}

function saveNavPins(){
  if(State.user) Cache.set(State.user.id,'nav_pins',State.navPins);
}

function showNavPinModal(){
  const modal=document.createElement('div');modal.className='overlay';
  const allPages=[...NAV,{id:'settings',label:'Settings',icon:'set'}];
  modal.innerHTML=`<div class="modal" role="dialog" aria-modal="true">
    <div class="mh"><div class="mt-modal">📌 Customize Nav Bar</div><button class="xbtn" aria-label="Close" id="xm">✕</button></div>
    <div style="font-size:13px;color:var(--text2);margin-bottom:14px">Choose up to 4 pages to pin to the bottom nav bar.</div>
    <div style="display:flex;flex-direction:column;gap:8px" id="pin-list">
      ${allPages.filter(p=>p.id!=='settings').map(p=>{
        const pinned=State.navPins.includes(p.id);
        return`<label style="display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:var(--rsm);border:1.5px solid ${pinned?'var(--green)':'var(--border2)'};background:${pinned?'var(--green-dim)':'var(--card2)'};cursor:pointer;transition:all .15s">
          <input type="checkbox" data-pin="${p.id}" ${pinned?'checked':''} style="accent-color:var(--green);width:16px;height:16px;flex-shrink:0">
          <span style="font-size:14px;margin-right:4px">${IC[p.icon]||''}</span>
          <span style="font-weight:700">${esc(p.label)}</span>
        </label>`;
      }).join('')}
    </div>
    <button class="btn btn-primary w100 mt16" id="save-pins" style="justify-content:center">Save</button>
  </div>`;
  openModal(modal);
  modal.addEventListener('click',e=>{if(e.target===modal)closeModal(modal)});
  $('#xm',modal).addEventListener('click',()=>closeModal(modal));
  $('#save-pins',modal).addEventListener('click',()=>{
    const checked=[...$$('[data-pin]:checked',modal)].map(cb=>cb.dataset.pin).slice(0,4);
    if(!checked.length)return showToast('Pin at least one page','var(--red)');
    State.navPins=checked;
    saveNavPins();
    closeModal(modal);
    showToast('Nav bar updated ✓');
    initApp(); // re-render shell with new pins
  });
}

const INACTIVITY_MS = 30 * 60 * 1000; // 30 minutes
let _inactivityTimer = null;

function resetInactivityTimer(){
  clearTimeout(_inactivityTimer);
  if(!State.user) return;
  _inactivityTimer = setTimeout(async ()=>{
    if(!State.user) return;
    showToast('Signed out due to inactivity', 'var(--orange)');
    await logout();
  }, INACTIVITY_MS);
}

function startInactivityWatcher(){
  ['click','keydown','touchstart','scroll','mousemove'].forEach(evt=>{
    document.addEventListener(evt, resetInactivityTimer, {passive:true});
  });
  resetInactivityTimer();
}

function stopInactivityWatcher(){
  clearTimeout(_inactivityTimer);
}


export { initApp, logout, showAlertCenter,
         saveTemplates, loadTemplates, loadNavPins, saveNavPins,
         startInactivityWatcher, stopInactivityWatcher, NAV };
