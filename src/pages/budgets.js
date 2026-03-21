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
import { monthStats } from '../stats.js';

function renderBudgets(){
  const ms=monthStats(State.txs,0);
  const items=State.budgets.map(b=>{const cat=getCat(b.categoryId),spent=ms.byCat[b.categoryId]||0,pct=b.amount>0?(spent/b.amount)*100:0;return{...b,cat,spent,pct}}).sort((a,b)=>b.pct-a.pct);
  const totalBudgeted=State.budgets.reduce((s,b)=>s+b.amount,0),totalSpent=State.budgets.reduce((s,b)=>s+(ms.byCat[b.categoryId]||0),0);
  const pctOverall=totalBudgeted>0?(totalSpent/totalBudgeted)*100:0;
  const over=items.filter(b=>b.pct>100).length;
  const usedCats=State.budgets.map(b=>b.categoryId);
  const availCats=CATS.filter(c=>c.id!=='income'&&!usedCats.includes(c.id));

  render(`
  <div class="ph">
    <div><div class="pt">Budgets</div><div class="ps">${new Date().toLocaleDateString('en-US',{month:'long',year:'numeric'})} · ${over>0?`<span style="color:var(--red)">${over} over budget</span>`:'All on track 🎉'}</div></div>
    <div class="flex gap8">
      <button class="btn btn-ghost btn-sm" id="btn-sg">📊 Style Guide</button>
      ${availCats.length?`<button class="btn btn-primary" id="btn-new-bud">${IC.plus} New Budget</button>`:''}
    </div>
  </div>
  <div class="card mb16">
    <div class="fbc mb8">
      <div><div style="font-size:13px;color:var(--text2);font-weight:700">Total Monthly Budget</div><div style="font-size:30px;font-weight:900;letter-spacing:-1px;margin-top:4px"><span style="color:var(--red)">${fmtK(totalSpent)}</span><span style="font-size:15px;color:var(--text3);font-weight:500"> / ${fmtK(totalBudgeted)}</span></div></div>
      <div style="text-align:right"><div style="font-size:28px;font-weight:900;color:${pctOverall>100?'var(--red)':pctOverall>80?'var(--orange)':'var(--green)'}">${pctOverall.toFixed(0)}%</div><div style="font-size:12px;color:var(--text2)">used</div></div>
    </div>
    <div class="pbar" style="height:8px"><div class="pfill" style="width:${Math.min(pctOverall,100)}%;background:${pctOverall>100?'var(--red)':pctOverall>80?'var(--orange)':'var(--green)'}"></div></div>
    <div class="fbc mt8" style="font-size:12px;color:var(--text2)"><span>${fmtK(totalBudgeted-totalSpent)} remaining</span><span>Day ${new Date().getDate()} of month</span></div>
  </div>
  ${renderHouseholdBudgetSection()}
  <div class="card">
    ${items.length?items.map(b=>`<div class="bc">
      <div class="bc-dot" style="background:${b.cat.color}"></div>
      <div class="bc-info">
        <div class="bc-name">${b.cat.emoji} ${b.cat.name}${b.pct>100?`<span class="badge b-red">${IC.warn} Over</span>`:b.pct>80?`<span class="badge b-orange">Nearly full</span>`:''}
        </div>
        <div class="bc-sub">${fmtK(b.spent)} of ${fmtK(b.amount)}</div>
        <div class="pbar"><div class="pfill" style="width:${Math.min(b.pct,100)}%;background:${b.pct>100?'var(--red)':b.pct>80?'var(--orange)':b.cat.color}"></div></div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px">
        <div style="text-align:right"><div style="font-size:15px;font-weight:800;color:${b.pct>100?'var(--red)':b.pct>80?'var(--orange)':'var(--text)'}">${b.pct.toFixed(0)}%</div><div style="font-size:11px;color:var(--text3)">${fmtK(b.amount)} budget</div></div>
        <div class="fac gap8"><button class="btn btn-ghost btn-xs" data-edit="${b.categoryId}">Edit</button><button class="btn btn-danger btn-xs" data-remove="${b.categoryId}">${IC.trash}</button></div>
      </div>
    </div>`).join(''):`<div class="empty"><div class="empty-icon">📊</div><div class="empty-title">No budgets set</div><div class="empty-sub">Add budget categories to track spending</div></div>`}
  </div>`,
  ()=>{
    $('#btn-new-bud')?.addEventListener('click',()=>showAddBudgetModal(availCats));
    $('#btn-sg')?.addEventListener('click',()=>{const ms=monthStats(State.txs,0);showStyleGuideModal(ms.income||0)});
    $$('[data-edit]').forEach(b=>b.addEventListener('click',()=>showEditBudgetModal(b.dataset.edit)));
    $$('[data-remove]').forEach(b=>b.addEventListener('click',()=>{State.budgets=State.budgets.filter(bud=>bud.categoryId!==b.dataset.remove);saveAndSync('budgets',State.budgets,()=>SB.saveBudgets(State.user.id,State.budgets));renderBudgets();showToast('Budget removed')}));
  });
}

function showEditBudgetModal(categoryId){
  const b=State.budgets.find(b=>b.categoryId===categoryId);if(!b)return;
  const cat=getCat(categoryId),modal=document.createElement('div');modal.className='overlay';
  modal.innerHTML=`<div class="modal" role="dialog" aria-modal="true"><div class="mh"><div class="mt-modal">Edit Budget · ${esc(cat.emoji)} ${esc(cat.name)}</div><button class="xbtn" aria-label="Close" id="xm">✕</button></div>
    <div class="ig"><label class="il">Monthly Budget Amount</label><div class="amt-wrap"><span class="amt-prefix">$</span><input class="input" id="edit-amt" type="number" min="0" value="${b.amount}" inputmode="decimal"></div></div>
    <div class="fac gap10"><button class="btn btn-ghost w100" id="cancel-e" style="justify-content:center">Cancel</button><button class="btn btn-primary w100" id="save-e" style="justify-content:center">Save</button></div>
  </div>`;
  openModal(modal);
  modal.addEventListener('click',e=>{if(e.target===modal)closeModal(modal)});
  $('#xm',modal).addEventListener('click',()=>closeModal(modal));
  $('#cancel-e',modal).addEventListener('click',()=>closeModal(modal));
  $('#save-e',modal).addEventListener('click',()=>{
    const amt=parseFloat($('#edit-amt',modal).value);if(isNaN(amt)||amt<0)return;
    State.budgets=State.budgets.map(bud=>bud.categoryId===categoryId?{...bud,amount:amt}:bud);
    saveAndSync('budgets',State.budgets,()=>SB.saveBudgets(State.user.id,State.budgets));
    closeModal(modal);showToast('Budget updated ✓');renderBudgets();
  });
  $('#edit-amt',modal).focus();
}

function showAddBudgetModal(availCats){
  if(!availCats.length)return;
  const modal=document.createElement('div');modal.className='overlay';
  modal.innerHTML=`<div class="modal" role="dialog" aria-modal="true"><div class="mh"><div class="mt-modal">New Budget Category</div><button class="xbtn" aria-label="Close" id="xm">✕</button></div>
    <div class="ig"><label class="il">Category</label><select class="input" id="new-cat">${availCats.map(c=>`<option value="${c.id}">${esc(c.emoji)} ${esc(c.name)}</option>`).join('')}</select></div>
    <div class="ig"><label class="il">Monthly Amount</label><div class="amt-wrap"><span class="amt-prefix">$</span><input class="input" id="new-amt" type="number" min="0" placeholder="0" inputmode="decimal"></div></div>
    <div class="fac gap10"><button class="btn btn-ghost w100" id="cancel-nb" style="justify-content:center">Cancel</button><button class="btn btn-primary w100" id="save-nb" style="justify-content:center">Add Budget</button></div>
  </div>`;
  openModal(modal);
  modal.addEventListener('click',e=>{if(e.target===modal)closeModal(modal)});
  $('#xm',modal).addEventListener('click',()=>closeModal(modal));
  $('#cancel-nb',modal).addEventListener('click',()=>closeModal(modal));
  $('#save-nb',modal).addEventListener('click',()=>{
    const amt=parseFloat($('#new-amt',modal).value),cat=$('#new-cat',modal).value;
    if(isNaN(amt)||amt<=0)return;
    State.budgets=[...State.budgets,{categoryId:cat,amount:amt}];
    saveAndSync('budgets',State.budgets,()=>SB.saveBudgets(State.user.id,State.budgets));
    closeModal(modal);showToast('Budget added ✓');renderBudgets();
  });
  $('#new-amt',modal).focus();
}

function showRecurringModal(){
  const modal=document.createElement('div');modal.className='overlay';
  const listHTML=()=>State.recurring.length?State.recurring.map((r,i)=>{const cat=getCat(r.category);return`<div class="rec-item"><div class="rec-icon" style="background:${cat.color}22">${cat.emoji}</div><div class="rec-info"><div class="rec-name">${esc(r.name)}</div><div class="rec-meta">${r.amount<0?'Expense':'Income'} · ${fmtK(Math.abs(r.amount))}/mo · Day ${r.dayOfMonth}</div></div><button class="btn btn-danger btn-xs" data-del-rec="${i}">${IC.trash}</button></div>`}).join(''):`<div class="empty" style="padding:20px 0"><div class="empty-icon">🔄</div><div class="empty-title">No recurring transactions</div></div>`;
  modal.innerHTML=`<div class="modal" role="dialog" aria-modal="true"><div class="mh"><div class="mt-modal">${IC.repeat} Recurring Transactions</div><button class="xbtn" aria-label="Close" id="xm">✕</button></div>
    <div id="rec-list">${listHTML()}</div><div class="divider"></div>
    <div style="font-size:13px;font-weight:800;color:var(--text2);margin-bottom:12px">Add New Recurring</div>
    <div class="type-sel"><button class="type-btn exp-active" id="rec-exp">📤 Expense</button><button class="type-btn" id="rec-inc">📥 Income</button></div>
    <div class="ig"><label class="il">Description</label><input class="input" id="rec-name" type="text" placeholder="e.g. Netflix, Rent, Salary"></div>
    <div class="g2"><div class="ig"><label class="il">Amount</label><div class="amt-wrap"><span class="amt-prefix">$</span><input class="input" id="rec-amt" type="number" min="0" placeholder="0" inputmode="decimal"></div></div><div class="ig"><label class="il">Day of Month</label><input class="input" id="rec-day" type="number" min="1" max="28" value="1"></div></div>
    <div class="ig"><label class="il">Category</label><select class="input" id="rec-cat">${CATS.filter(c=>c.id!=='income').map(c=>`<option value="${c.id}">${esc(c.emoji)} ${esc(c.name)}</option>`).join('')}</select></div>
    <button class="btn btn-primary w100" id="add-rec" style="justify-content:center">${IC.plus} Add Recurring</button>
  </div>`;
  openModal(modal);
  let recType='expense';
  modal.addEventListener('click',e=>{if(e.target===modal)closeModal(modal)});
  $('#xm',modal).addEventListener('click',()=>closeModal(modal));
  const setRT=t=>{recType=t;$('#rec-exp',modal).className='type-btn'+(t==='expense'?' exp-active':'');$('#rec-inc',modal).className='type-btn'+(t==='income'?' inc-active':'');const cs=$('#rec-cat',modal);if(t==='income')cs.innerHTML=`<option value="income">💰 Income</option><option value="other">📦 Other</option>`;else cs.innerHTML=CATS.filter(c=>c.id!=='income').map(c=>`<option value="${c.id}">${esc(c.emoji)} ${esc(c.name)}</option>`).join('')};
  $('#rec-exp',modal).addEventListener('click',()=>setRT('expense'));
  $('#rec-inc',modal).addEventListener('click',()=>setRT('income'));
  const rebind=()=>$$('[data-del-rec]',modal).forEach(b=>b.addEventListener('click',()=>{State.recurring.splice(parseInt(b.dataset.delRec),1);saveAndSync('recurring',State.recurring,()=>SB.saveRecurring(State.user.id,State.recurring));$('#rec-list',modal).innerHTML=listHTML();rebind();showToast('Removed')}));
  rebind();
  $('#add-rec',modal).addEventListener('click',()=>{
    const name=$('#rec-name',modal).value.trim(),amt=parseFloat($('#rec-amt',modal).value),day=parseInt($('#rec-day',modal).value)||1,cat=$('#rec-cat',modal).value;
    if(!name||isNaN(amt)||amt<=0)return showToast('Fill in all fields','var(--red)');
    const r={id:genId(),name,amount:recType==='expense'?-amt:amt,category:cat,dayOfMonth:Math.min(Math.max(day,1),28)};
    State.recurring.push(r);saveAndSync('recurring',State.recurring,()=>SB.saveRecurring(State.user.id,State.recurring));
    $('#rec-name',modal).value='';$('#rec-amt',modal).value='';$('#rec-list',modal).innerHTML=listHTML();rebind();showToast('Recurring added ✓');
  });
}

function showStyleGuideModal(income=0){
  const guides=[
    {id:'503020',name:'50/30/20 Rule',icon:'📊',color:'#3b82f6',tag:'Popular',tagColor:'var(--green)',
     desc:'Split your income: 50% on needs, 30% on wants, 20% on savings.',
     splits:[{cat:'housing',pct:25},{cat:'food',pct:12},{cat:'transport',pct:8},{cat:'utilities',pct:5},{cat:'entertainment',pct:12},{cat:'shopping',pct:10},{cat:'personal',pct:8},{cat:'health',pct:5}]},
    {id:'zerobased',name:'Zero-Based',icon:'🎯',color:'#8b78f5',tag:'Detailed',tagColor:'var(--purple)',
     desc:'Give every dollar a job. Income minus all budgets equals zero.',
     splits:[{cat:'housing',pct:30},{cat:'food',pct:15},{cat:'transport',pct:10},{cat:'utilities',pct:6},{cat:'entertainment',pct:8},{cat:'shopping',pct:8},{cat:'personal',pct:5},{cat:'health',pct:5},{cat:'savings',pct:13}]},
    {id:'envelope',name:'Envelope Method',icon:'✉️',color:'#ff9f43',tag:'Cash-focused',tagColor:'var(--orange)',
     desc:'Allocate cash to physical envelopes for each category. Digital version here.',
     splits:[{cat:'food',pct:20},{cat:'entertainment',pct:10},{cat:'shopping',pct:15},{cat:'personal',pct:8},{cat:'transport',pct:12},{cat:'health',pct:5}]},
    {id:'payself',name:'Pay Yourself First',icon:'💰',color:'#ff4d6a',tag:'Savings-focused',tagColor:'var(--red)',
     desc:'Save first, spend what\'s left. Savings come out before anything else.',
     splits:[{cat:'savings',pct:25},{cat:'housing',pct:28},{cat:'food',pct:12},{cat:'transport',pct:8},{cat:'utilities',pct:5},{cat:'entertainment',pct:8},{cat:'shopping',pct:7},{cat:'health',pct:4},{cat:'personal',pct:3}]},
  ];

  let selected=null;
  const modal=document.createElement('div');modal.className='overlay';

  const renderGuides=()=>`
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px">
      ${guides.map(g=>`<div class="style-guide-card ${selected===g.id?'active':''}" data-guide="${g.id}" style="${selected===g.id?`border-color:${g.color};background:${g.color}15`:''}">
        <div class="sg-icon">${g.icon}</div>
        <div class="sg-name">${esc(g.name)}</div>
        <div class="sg-desc">${g.desc}</div>
        <div class="sg-tag" style="background:${g.color}22;color:${g.color}">${g.tag}</div>
      </div>`).join('')}
    </div>`;

  const updateModal=()=>{
    const body=$('#guide-body',modal);if(!body)return;
    const g=guides.find(x=>x.id===selected);
    const previewHTML=g&&income>0?`<div class="card2 mb14">
      <div style="font-size:12px;font-weight:800;color:var(--text3);letter-spacing:.5px;text-transform:uppercase;margin-bottom:10px">Budget Preview (based on ${fmtK(income)}/mo)</div>
      ${g.splits.map(s=>{const cat=getCat(s.cat),amt=Math.round(income*(s.pct/100));return`<div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:1px solid var(--border)"><span style="font-size:13px">${esc(cat.emoji)} ${esc(cat.name)}</span><span style="font-size:13px;font-weight:800;color:${cat.color}">${fmtK(amt)}</span></div>`}).join('')}
    </div>`:'';
    body.innerHTML=renderGuides()+previewHTML+`<div class="fac gap10"><button class="btn btn-ghost w100" id="cancel-guide" style="justify-content:center">Cancel</button><button class="btn btn-primary w100" id="apply-guide" style="justify-content:center" ${!selected?'disabled':''}>Apply to Budgets</button></div>`;
    $$('[data-guide]',modal).forEach(b=>b.addEventListener('click',()=>{selected=b.dataset.guide;updateModal()}));
    $('#cancel-guide',modal)?.addEventListener('click',()=>closeModal(modal));
    $('#apply-guide',modal)?.addEventListener('click',()=>{
      const g=guides.find(x=>x.id===selected);if(!g||!income)return;
      g.splits.forEach(s=>{const amt=Math.round(income*(s.pct/100));const b=State.budgets.find(b=>b.categoryId===s.cat);if(b)b.amount=amt;else State.budgets.push({categoryId:s.cat,amount:amt});});
      saveAndSync('budgets',State.budgets,()=>SB.saveBudgets(State.user.id,State.budgets));
      closeModal(modal);showToast('Budget style applied ✓');renderBudgets();
    });
  };

  modal.innerHTML=`<div class="modal" role="dialog" aria-modal="true" style="max-width:520px"><div class="mh"><div class="mt-modal">📊 Budget Style Guides</div><button class="xbtn" aria-label="Close" id="xm">✕</button></div>
    ${income===0?`<div class="ig"><label class="il">Your monthly income (to calculate amounts)</label><div class="amt-wrap"><span class="amt-prefix">$</span><input class="input" id="guide-income" type="number" placeholder="e.g. 4500" inputmode="decimal"></div><button class="btn btn-ghost btn-sm mt8" id="income-ok">Set Income →</button></div>`:''}
    <div id="guide-body"></div>
  </div>`;
  openModal(modal);
  modal.addEventListener('click',e=>{if(e.target===modal)closeModal(modal)});
  $('#xm',modal).addEventListener('click',()=>closeModal(modal));
  if(income===0){
    $('#income-ok',modal)?.addEventListener('click',()=>{
      const v=parseFloat($('#guide-income',modal).value)||0;
      closeModal(modal);showStyleGuideModal(v);
    });
    $('#guide-income',modal)?.addEventListener('keydown',e=>{if(e.key==='Enter')$('#income-ok',modal).click()});
    $('#guide-income',modal)?.focus();
  } else {
    updateModal();
  }
}

function renderHouseholdBudgetSection(){
  const hh=State.household;
  if(!hh.length)return'';

  const ms=monthStats(State.txs,0);
  const totalBudgeted=State.budgets.reduce((s,b)=>s+b.amount,0);
  const totalSpent=State.budgets.reduce((s,b)=>s+(ms.byCat[b.categoryId]||0),0);

  return`<div class="card mb16" style="border-color:var(--purple-dim)">
    <div class="fbc mb14">
      <div class="card-title" style="margin:0">👨‍👩‍👧 Household Budget</div>
      <span class="badge b-purple">${IC.users} ${hh.length+1} members</span>
    </div>
    <div style="font-size:13px;color:var(--text2);margin-bottom:12px">Shared budget visible to all household members. Each member's spending counts toward these limits.</div>
    <div class="fbc mb8">
      <div style="font-size:13px;color:var(--text2)">Combined spending</div>
      <div style="font-size:18px;font-weight:900">${fmtK(totalSpent)} <span style="font-size:13px;color:var(--text3)">/ ${fmtK(totalBudgeted)}</span></div>
    </div>
    <div class="pbar" style="height:8px"><div class="pfill" style="width:${Math.min(totalBudgeted>0?(totalSpent/totalBudgeted)*100:0,100)}%;background:${totalSpent>totalBudgeted?'var(--red)':'var(--green)'}"></div></div>
    <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">
      ${hh.map(m=>`<div style="display:flex;align-items:center;gap:6px;padding:5px 10px;background:var(--card2);border-radius:20px;font-size:12px;font-weight:700"><div class="avatar" style="width:20px;height:20px;font-size:9px;background:${avatarColor(m.name)}">${initials(m.name)}</div>${esc(m.name)}</div>`).join('')}
    </div>
  </div>`;
}

export { renderBudgets, renderHouseholdBudgetSection };
