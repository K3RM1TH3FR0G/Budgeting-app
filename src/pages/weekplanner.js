import { $, $$, esc, fmt, fmtK, fmtDate, fmtAxisVal, genId, todayStr,
          initials, avatarColor, hexToRgba } from '../utils.js';
import { IC }                               from '../icons.js';
import { SB }                               from '../db.js';
import { State, Cache, saveAndSync, queueSync,
          DEFAULT_BUDGETS, getDebts, saveDebts,
          getNWHistory, saveNWHistory,
          saveSplits, saveBills }            from '../state.js';
import { getCat, CATS }                     from '../categories.js';
import { render, showToast, openModal, closeModal,
          bedrockLogo, setSyncIndicator }     from '../ui.js';
import { navigate }                          from '../router.js';
import { getPayPlannerSettings }             from './payplanner.js';
import { drawAreaChart } from '../charts.js';

function getWeekPlanData(){ return State.user ? Cache.get(State.user.id,'week_plan',{}) : {}; }

function saveWeekPlanData(d){ if(State.user) Cache.set(State.user.id,'week_plan',d); }

function renderWeekPlanner(){ State._wpOffset=0; _renderWeekPlannerAt(0); }

function navigateWeek(delta){ State._wpOffset=(State._wpOffset||0)+delta; _renderWeekPlannerAt(State._wpOffset); }

function _renderWeekPlannerAt(offsetDays){
  const sunStart = State.settings?.weekStart==='sunday';
  const today    = new Date(); today.setHours(12,0,0,0);
  const target   = new Date(today); target.setDate(today.getDate()+offsetDays);

  /* Build the 7 days of the target week */
  const dow         = target.getDay();
  const startOffset = sunStart ? dow : (dow===0?6:dow-1);
  const weekStart   = new Date(target); weekStart.setDate(target.getDate()-startOffset);
  const days = Array.from({length:7},(_,i)=>{
    const d=new Date(weekStart); d.setDate(weekStart.getDate()+i);
    return {
      date:    d.toISOString().split('T')[0],
      label:   d.toLocaleDateString('en-US',{weekday:'short'}),
      isToday: d.toISOString().split('T')[0]===today.toISOString().split('T')[0],
    };
  });

  const allData  = getWeekPlanData();
  /* Use Monday date as the week key — simple, unambiguous, no year-boundary edge cases */
  const wk       = days[0].date;
  const weekData = allData[wk]||{};

  const dayTotal  = d=>(weekData[d]||[]).reduce((s,i)=>s+i.amt,0);
  const weekTotal = days.reduce((s,d)=>s+dayTotal(d.date),0);
  const catTotals = {};
  days.forEach(d=>(weekData[d.date]||[]).forEach(i=>{catTotals[i.cat]=(catTotals[i.cat]||0)+i.amt;}));

  const weekEndDate = new Date(weekStart.getTime()+6*86400000);

  const dayCard = day=>{
    const items=weekData[day.date]||[];
    const total=items.reduce((s,i)=>s+i.amt,0);
    return`<div class="wp-day ${day.isToday?'today-day':''}" data-day="${day.date}"
      role="region" aria-label="${esc(day.label)}${day.isToday?' (Today)':''}">
      <div class="wp-day-hdr">
        <span class="wp-day-name">${esc(day.label)}${day.isToday?' · Today':''}</span>
        <span class="wp-day-total ${items.length?'has-items':''}">${items.length?fmt(total):'—'}</span>
      </div>
      ${items.map(item=>{
        const cat=WP_CATS.find(c=>c.id===item.cat)||WP_CATS[7];
        return`<div class="wp-item">
          <span class="wp-item-cat" title="${esc(cat.label)}">${cat.emoji}</span>
          <span class="wp-item-desc">${esc(item.desc)}</span>
          <span class="wp-item-amt">${fmt(item.amt)}</span>
          <button class="wp-item-del" data-edit-wp="${day.date}|${item.id}" aria-label="Edit ${esc(item.desc)}" style="color:var(--text3);background:none;border:none;cursor:pointer;padding:2px 4px;border-radius:4px;font-size:11px;transition:color .15s" title="Edit">${IC.edit}</button>
          <button class="wp-item-del" data-del-wp="${day.date}|${item.id}" aria-label="Remove ${esc(item.desc)}">✕</button>
        </div>`;
      }).join('')}
      <button class="wp-add-btn" data-add-wp="${day.date}">+ Add expense</button>
    </div>`;
  };

  /* Prune week data older than 12 weeks to prevent unbounded growth */
  const cutoff = new Date(today); cutoff.setDate(today.getDate()-84);
  const cutoffKey = cutoff.toISOString().split('T')[0];
  const pruned = Object.fromEntries(Object.entries(allData).filter(([k])=>k>=cutoffKey));
  if(Object.keys(pruned).length < Object.keys(allData).length) saveWeekPlanData(pruned);

  /* Pay planner context — how much free-to-spend per day */
  const ppSettings = getPayPlannerSettings();
  const ppFreqs = {Weekly:52,'Bi-Weekly':26,'Twice a Month':24,Monthly:12};
  const ppPerYear = ppFreqs[ppSettings.payFreq||'Bi-Weekly']||26;
  const ppAmt = parseFloat(ppSettings.payAmt)||0;
  const ppPct = parseInt(ppSettings.savePct)||20;
  const ppBillsMo = (State.bills||[]).filter(b=>b.amount>0).reduce((s,b)=>s+b.amount,0)
                  + (State.recurring||[]).filter(r=>r.amount<0).reduce((s,r)=>s+Math.abs(r.amount),0);
  const ppFreePerDay = ppAmt>0 ? Math.max(0,(ppAmt*(1-ppPct/100))*ppPerYear/365 - ppBillsMo*12/365) : 0;
  const ppBudgetHint = ppFreePerDay>0
    ? `<div style="font-size:11px;color:var(--text2);margin-top:6px">Pay Planner: ~${fmt(ppFreePerDay)}/day free to spend · <span class="link" id="wp-go-pp" style="font-size:11px">view Pay Planner</span></div>`
    : `<div style="font-size:11px;color:var(--text2);margin-top:6px"><span class="link" id="wp-go-pp" style="font-size:11px">Set up Pay Planner</span> to see your daily budget here</div>`;
  render(`
  <div class="ph">
    <div>
      <div class="pt">Week Planner</div>
      <div class="ps">${weekStart.toLocaleDateString('en-US',{month:'short',day:'numeric'})} – ${weekEndDate.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}</div>
    </div>
    <div style="display:flex;gap:8px">
      <button class="btn btn-ghost btn-sm" id="wp-prev">← Prev</button>
      <button class="btn btn-ghost btn-sm" id="wp-today" ${offsetDays===0?'disabled style="opacity:.4"':''}>Today</button>
      <button class="btn btn-ghost btn-sm" id="wp-next">Next →</button>
    </div>
  </div>
  ${weekTotal>0?`<div class="nw-banner mb16" style="padding:18px 22px">
    <div class="nw-label">Planned this week</div>
    <div class="nw-val" style="color:var(--purple);font-size:32px">${fmt(weekTotal)}</div>
    ${Object.keys(catTotals).length?`<div class="nw-row" style="margin-top:12px">
      ${Object.entries(catTotals).sort((a,b)=>b[1]-a[1]).slice(0,4).map(([catId,amt])=>{
        const cat=WP_CATS.find(c=>c.id===catId)||WP_CATS[7];
        return`<div class="nw-item"><div class="nw-item-label">${cat.emoji} ${esc(cat.label)}</div><div class="nw-item-val" style="font-size:14px">${fmt(amt)}</div></div>`;
      }).join('')}
    </div>`:''}
    ${ppBudgetHint}
  </div>`:`<div class="nw-banner mb16" style="padding:14px 22px">${ppBudgetHint}</div>`}
  <div class="wp-grid" style="display:grid;grid-template-columns:repeat(7,1fr);gap:10px;margin-bottom:16px">
    ${days.map(dayCard).join('')}
  </div>
  ${weekTotal>0?`<div class="card">
    <div class="card-title">Category Breakdown</div>
    ${WP_CATS.filter(c=>catTotals[c.id]).map(c=>{
      const amt=catTotals[c.id]||0;
      const pct=weekTotal>0?(amt/weekTotal*100):0;
      return`<div class="wp-summary-row">
        <div style="display:flex;align-items:center;gap:8px"><span style="font-size:16px">${c.emoji}</span><span style="font-size:13px;font-weight:600">${esc(c.label)}</span></div>
        <div style="display:flex;align-items:center;gap:12px">
          <div style="width:80px;height:5px;background:var(--card2);border-radius:3px;overflow:hidden"><div style="height:100%;width:${pct.toFixed(0)}%;background:var(--accent);border-radius:3px"></div></div>
          <span style="font-size:13px;font-weight:800;min-width:60px;text-align:right">${fmt(amt)}</span>
        </div>
      </div>`;
    }).join('')}
  </div>`:`<div class="card"><div class="empty"><div class="empty-icon">📅</div><div class="empty-title">No expenses planned yet</div><div class="empty-sub">Tap "+ Add expense" on any day to start planning your week</div></div></div>`}`,
  ()=>{
    $('#wp-prev')?.addEventListener('click',()=>navigateWeek(-7));
    $('#wp-next')?.addEventListener('click',()=>navigateWeek(7));
    $('#wp-today')?.addEventListener('click',()=>renderWeekPlanner());
    $('#wp-go-pp')?.addEventListener('click',()=>navigate('payplanner'));
    $$('[data-add-wp]').forEach(b=>b.addEventListener('click',()=>showAddWpItemModal(b.dataset.addWp, wk)));

    /* Edit existing item */
    $$('[data-edit-wp]').forEach(b=>b.addEventListener('click',()=>{
      const [date,id]=b.dataset.editWp.split('|');
      const data=getWeekPlanData();
      const item=data[wk]&&data[wk][date]&&data[wk][date].find(i=>i.id===id);
      if(!item)return;
      showAddWpItemModal(date,wk,item); // pass item to pre-fill
    }));

    /* Delete with undo toast */
    $$('[data-del-wp]').forEach(b=>b.addEventListener('click',()=>{
      const [date,id]=b.dataset.delWp.split('|');
      const data=getWeekPlanData();
      if(!data[wk]||!data[wk][date])return;
      const removed=data[wk][date].find(i=>i.id===id);
      data[wk][date]=data[wk][date].filter(i=>i.id!==id);
      if(!data[wk][date].length) delete data[wk][date];
      if(!Object.keys(data[wk]).length) delete data[wk];
      saveWeekPlanData(data);
      _renderWeekPlannerAt(offsetDays);
      /* Undo toast */
      if(removed){
        const ut=document.createElement('div');ut.className='undo-toast';
        ut.innerHTML=`<span>Removed ${esc(removed.desc)}</span><button class="btn btn-ghost btn-xs" id="wp-undo-btn">${IC.undo} Undo</button>`;
        document.body.appendChild(ut);
        const t=setTimeout(()=>ut.remove(),3500);
        $('#wp-undo-btn',ut)?.addEventListener('click',()=>{
          clearTimeout(t);ut.remove();
          const d2=getWeekPlanData();
          if(!d2[wk])d2[wk]={};
          if(!d2[wk][date])d2[wk][date]=[];
          d2[wk][date].push(removed);
          d2[wk][date].sort((a,b)=>a.id.localeCompare(b.id));
          saveWeekPlanData(d2);
          _renderWeekPlannerAt(offsetDays);
        });
      }
    }));

    /* Responsive grid — run now and re-run on resize */
    const applyGrid=()=>{
      const grid=$('.wp-grid');
      if(!grid)return;
      if(window.innerWidth<600)      grid.style.gridTemplateColumns='1fr 1fr';
      else if(window.innerWidth<900) grid.style.gridTemplateColumns='repeat(4,1fr)';
      else                           grid.style.gridTemplateColumns='repeat(7,1fr)';
    };
    applyGrid();
    /* Debounced resize — remove old listener first to avoid stacking */
    window.removeEventListener('resize',window._wpGridResize||null);
    window._wpGridResize=()=>{ clearTimeout(window._wpGridResizeT); window._wpGridResizeT=setTimeout(applyGrid,100); };
    window.addEventListener('resize',window._wpGridResize);
  });
}

function showAddWpItemModal(date, wk, existingItem){
  const isEdit = !!existingItem;
  const dayLabel = new Date(date+'T12:00:00').toLocaleDateString('en-US',{weekday:'long',month:'short',day:'numeric'});
  let selCat = isEdit ? (existingItem.cat||'food') : (State._wpLastCat||'food');
  const modal = document.createElement('div'); modal.className='overlay';
  modal.innerHTML=`<div class="modal" role="dialog" aria-modal="true">
    <div class="mh"><div class="mt-modal">${isEdit?'Edit':'Add'} Expense · ${esc(dayLabel)}</div><button class="xbtn" aria-label="Close" id="xm">✕</button></div>
    <div class="ig"><label class="il" for="wp-desc">Description</label>
      <input class="input" id="wp-desc" type="text" placeholder="e.g. Lunch, Whole Foods run…" value="${esc(isEdit?existingItem.desc:'')}"></div>
    <div class="ig"><label class="il" for="wp-amt-inp">Amount</label>
      <div class="amt-wrap"><span class="amt-prefix">$</span>
        <input class="input" id="wp-amt-inp" type="number" min="0" step="0.01" inputmode="decimal"
          placeholder="0.00" value="${isEdit?existingItem.amt:''}"
          style="font-size:20px;font-weight:800;padding:10px 10px 10px 24px"></div></div>
    <div class="ig"><label class="il">Category</label>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:4px" id="wp-cats">
        ${WP_CATS.map(c=>`<button class="wp-cat-pill ${c.id===selCat?'sel':''}" data-wcat="${c.id}">${c.emoji} ${esc(c.label)}</button>`).join('')}
      </div>
    </div>
    <div class="fac gap10 mt16">
      <button class="btn btn-ghost w100" id="cancel-wp" style="justify-content:center">Cancel</button>
      <button class="btn btn-primary w100" id="save-wp" style="justify-content:center">${isEdit?'Save Changes':'Add'}</button>
    </div>
  </div>`;
  openModal(modal);
  modal.addEventListener('click',e=>{if(e.target===modal)closeModal(modal)});
  $('#xm',modal).addEventListener('click',()=>closeModal(modal));
  $('#cancel-wp',modal).addEventListener('click',()=>closeModal(modal));
  $$('[data-wcat]',modal).forEach(b=>b.addEventListener('click',()=>{
    selCat=b.dataset.wcat;
    $$('[data-wcat]',modal).forEach(x=>x.classList.remove('sel'));
    b.classList.add('sel');
  }));
  const doSave=()=>{
    const desc=$('#wp-desc',modal).value.trim();
    const amt =parseFloat($('#wp-amt-inp',modal).value);
    if(!desc||!amt||amt<=0)return showToast('Enter a description and amount','var(--red)');
    State._wpLastCat = selCat; // remember for next time
    const data=getWeekPlanData();
    if(!data[wk])data[wk]={};
    if(!data[wk][date])data[wk][date]=[];
    if(isEdit){
      /* Update in place */
      const idx=data[wk][date].findIndex(i=>i.id===existingItem.id);
      if(idx>=0) data[wk][date][idx]={...existingItem,desc,amt,cat:selCat};
    } else {
      data[wk][date].push({id:genId(),desc,amt,cat:selCat});
    }
    saveWeekPlanData(data);
    closeModal(modal);
    _renderWeekPlannerAt(State._wpOffset||0);
  };
  $('#save-wp',modal).addEventListener('click',doSave);
  $('#wp-amt-inp',modal).addEventListener('keydown',e=>{if(e.key==='Enter')doSave()});
  /* Pre-select desc or amount for faster editing */
  if(isEdit){ $('#wp-amt-inp',modal).focus(); $('#wp-amt-inp',modal).select(); }
  else $('#wp-desc',modal).focus();
}


export { renderWeekPlanner };
