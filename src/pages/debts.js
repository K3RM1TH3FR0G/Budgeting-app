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

function renderDebts(){
  const debts=State.debts;
  const totalDebt=debts.reduce((s,d)=>s+d.balance,0);
  const totalMinPayment=debts.reduce((s,d)=>s+(d.minPayment||0),0);

  const debtCards=debts.length?debts.map((d,i)=>{
    const dt=getDebtType(d.type);
    const paidPct=d.originalBalance>0?(1-(d.balance/d.originalBalance))*100:0;
    // Payoff estimate
    const monthlyRate=(d.apr||0)/100/12;
    const mp=d.minPayment||0;
    let monthsLeft=0;
    if(mp>0&&d.balance>0){
      if(monthlyRate>0){
        const interest=d.balance*monthlyRate;
        if(mp>interest) monthsLeft=Math.ceil(Math.log(mp/(mp-interest))/Math.log(1+monthlyRate));
        else monthsLeft=999;
      } else monthsLeft=Math.ceil(d.balance/mp);
    }
    const payoffStr=monthsLeft>0&&monthsLeft<999?monthsLeft<12?monthsLeft+'mo':(Math.floor(monthsLeft/12)+'y '+(monthsLeft%12)+'m'):'—';
    const totalInterest=monthsLeft<999&&monthlyRate>0?Math.round((mp*monthsLeft)-d.balance):0;
    return`<div class="debt-card">
      <div class="fbc mb8">
        <div>
          <span class="debt-type" style="background:${dt.color}22;color:${dt.color}">${esc(dt.emoji)} ${esc(dt.name)}</span>
          <div class="debt-name">${esc(d.name)}</div>
        </div>
        <div style="display:flex;gap:6px;align-items:flex-start">
          <button class="btn btn-ghost btn-xs" data-edit-debt="${i}">${IC.edit}</button>
          <button class="btn btn-danger btn-xs" data-del-debt="${i}">${IC.trash}</button>
        </div>
      </div>
      <div style="font-size:28px;font-weight:900;letter-spacing:-1px;color:var(--red);margin-bottom:10px">${fmt(d.balance)}</div>
      <div class="pbar" style="height:6px;margin-bottom:10px"><div class="pfill" style="width:${paidPct.toFixed(0)}%;background:${dt.color}"></div></div>
      <div class="debt-row"><span>APR</span><span class="debt-val">${d.apr||0}%</span></div>
      <div class="debt-row"><span>Min Payment</span><span class="debt-val">${fmt(d.minPayment||0)}/mo</span></div>
      <div class="debt-row"><span>Original Balance</span><span class="debt-val">${fmt(d.originalBalance||d.balance)}</span></div>
      ${monthsLeft>0?`<div class="debt-payoff">⏱ Payoff in ~${payoffStr}${totalInterest>0?' · '+fmt(totalInterest)+' in interest':''}</div>`:''}
      <button class="btn btn-primary btn-sm mt8" style="width:100%;justify-content:center" data-pay-debt="${i}">💳 Make Payment</button>
    </div>`;
  }).join(''):null;

  render(`
  <div class="ph">
    <div><div class="pt">Debt Tracker</div><div class="ps">Track balances, payments & payoff dates</div></div>
    <button class="btn btn-primary" id="btn-add-debt">${IC.plus} Add Debt</button>
  </div>
  ${debts.length?`<div class="g3 mb16">
    <div class="rstat"><div class="rstat-lbl">Total Debt</div><div class="rstat-val" style="color:var(--red)">${fmt(totalDebt)}</div></div>
    <div class="rstat"><div class="rstat-lbl">Monthly Payments</div><div class="rstat-val">${fmt(totalMinPayment)}</div></div>
    <div class="rstat"><div class="rstat-lbl">Debts Tracked</div><div class="rstat-val">${debts.length}</div></div>
  </div>`:''}
  ${debts.length?`<div class="g2 mb16">${debtCards}</div>`:`<div class="card"><div class="empty"><div class="empty-icon">💳</div><div class="empty-title">No debts tracked</div><div class="empty-sub">Add credit cards, loans, and any other debts to track payoff progress</div></div></div>`}
  ${debts.length?`<div class="card">
    <div class="card-title">Payoff Strategy</div>
    <div class="g2">
      <div style="padding:14px;border-radius:var(--rsm);border:1px solid var(--border2);cursor:pointer" id="btn-avalanche">
        <div style="font-size:15px;font-weight:800;margin-bottom:4px">❄️ Avalanche Method</div>
        <div style="font-size:12px;color:var(--text2)">Pay highest interest rate first. Saves the most money overall.</div>
      </div>
      <div style="padding:14px;border-radius:var(--rsm);border:1px solid var(--border2);cursor:pointer" id="btn-snowball">
        <div style="font-size:15px;font-weight:800;margin-bottom:4px">⛄ Snowball Method</div>
        <div style="font-size:12px;color:var(--text2)">Pay smallest balance first. Builds momentum with quick wins.</div>
      </div>
    </div>
  </div>`:''}`,
  ()=>{
    $('#btn-add-debt')?.addEventListener('click',()=>showDebtModal());
    $$('[data-edit-debt]').forEach(b=>b.addEventListener('click',()=>showDebtModal(parseInt(b.dataset.editDebt))));
    $$('[data-del-debt]').forEach(b=>b.addEventListener('click',()=>{State.debts.splice(parseInt(b.dataset.delDebt),1);saveDebts(State.debts);renderDebts();showToast('Debt removed')}));
    $$('[data-pay-debt]').forEach(b=>b.addEventListener('click',()=>showDebtPaymentModal(parseInt(b.dataset.payDebt))));
    $('#btn-avalanche')?.addEventListener('click',()=>showPayoffStrategyModal('avalanche'));
    $('#btn-snowball')?.addEventListener('click',()=>showPayoffStrategyModal('snowball'));
  });
}

function showDebtModal(editIdx=null){
  const d=editIdx!==null?State.debts[editIdx]:null;
  if(editIdx!==null&&!d){ showToast('Debt not found','var(--red)'); return; }
  const modal=document.createElement('div');modal.className='overlay';
  modal.innerHTML=`<div class="modal" role="dialog" aria-modal="true">
    <div class="mh"><div class="mt-modal">${d?'Edit Debt':'Add Debt'}</div><button class="xbtn" aria-label="Close" id="xm">✕</button></div>
    <div class="ig"><label class="il" for="dt-type">Debt Type</label><select class="input" id="dt-type">${DEBT_TYPES.map(t=>`<option value="${t.id}" ${d&&d.type===t.id?'selected':''}>${esc(t.emoji)} ${esc(t.name)}</option>`).join('')}</select></div>
    <div class="ig"><label class="il" for="dt-name">Name / Lender</label><input class="input" id="dt-name" placeholder="e.g. Chase Sapphire, Navient" value="${esc(d?d.name:'')}"></div>
    <div class="g2">
      <div class="ig"><label class="il" for="dt-bal">Current Balance</label><div class="amt-wrap"><span class="amt-prefix">$</span><input class="input" id="dt-bal" type="number" min="0" value="${d?d.balance:''}" inputmode="decimal"></div></div>
      <div class="ig"><label class="il" for="dt-orig">Original Balance</label><div class="amt-wrap"><span class="amt-prefix">$</span><input class="input" id="dt-orig" type="number" min="0" value="${d?d.originalBalance:''}" inputmode="decimal"></div></div>
    </div>
    <div class="g2">
      <div class="ig"><label class="il" for="dt-apr">APR (%)</label><input class="input" id="dt-apr" type="number" min="0" max="100" step="0.01" value="${d?d.apr:''}" placeholder="e.g. 19.99"></div>
      <div class="ig"><label class="il" for="dt-mp">Min Monthly Payment</label><div class="amt-wrap"><span class="amt-prefix">$</span><input class="input" id="dt-mp" type="number" min="0" value="${d?d.minPayment:''}" inputmode="decimal"></div></div>
    </div>
    <div class="fac gap10 mt8">
      <button class="btn btn-ghost w100" id="cancel-d" style="justify-content:center">Cancel</button>
      <button class="btn btn-primary w100" id="save-d" style="justify-content:center">${d?'Save Changes':'Add Debt'}</button>
    </div>
  </div>`;
  openModal(modal);
  modal.addEventListener('click',e=>{if(e.target===modal)closeModal(modal)});
  $('#xm',modal).addEventListener('click',()=>closeModal(modal));
  $('#cancel-d',modal).addEventListener('click',()=>closeModal(modal));
  $('#save-d',modal).addEventListener('click',()=>{
    const name=$('#dt-name',modal).value.trim();
    const balance=parseFloat($('#dt-bal',modal).value)||0;
    if(!name||balance<=0)return showToast('Fill in name and balance','var(--red)');
    const debt={
      id: d?.id||genId(),   // preserve existing id, or generate new one
      type:$('#dt-type',modal).value,
      name,balance,
      originalBalance:parseFloat($('#dt-orig',modal).value)||balance,
      apr:parseFloat($('#dt-apr',modal).value)||0,
      minPayment:parseFloat($('#dt-mp',modal).value)||0
    };
    if(editIdx!==null)State.debts[editIdx]=debt;else State.debts.push(debt);
    saveDebts(State.debts);closeModal(modal);showToast(editIdx!==null?'Debt updated ✓':'Debt added ✓');renderDebts();
  });
  $('#dt-name',modal).focus();
}

function showDebtPaymentModal(idx){
  const d=State.debts[idx];if(!d)return;
  const modal=document.createElement('div');modal.className='overlay';
  modal.innerHTML=`<div class="modal" role="dialog" aria-modal="true">
    <div class="mh"><div class="mt-modal">💳 Make Payment · ${esc(d.name)}</div><button class="xbtn" aria-label="Close" id="xm">✕</button></div>
    <div style="background:var(--card2);border-radius:var(--rsm);padding:14px;margin-bottom:16px;text-align:center">
      <div style="font-size:12px;color:var(--text2);margin-bottom:4px">Current Balance</div>
      <div style="font-size:28px;font-weight:900;color:var(--red)">${fmt(d.balance)}</div>
    </div>
    <div class="ig"><label class="il">Payment Amount</label><div class="amt-wrap"><span class="amt-prefix">$</span><input class="input" id="pay-amt" type="number" min="0" value="${d.minPayment||''}" inputmode="decimal"></div></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px">
      ${[d.minPayment,d.minPayment*2,Math.round(d.balance/12)].filter(v=>v>0).map(v=>`<button class="btn btn-ghost btn-xs quick-pay" data-v="${v}">${fmt(v)}</button>`).join('')}
      <button class="btn btn-ghost btn-xs quick-pay" data-v="${d.balance}">Pay Off</button>
    </div>
    <div class="fac gap10">
      <button class="btn btn-ghost w100" id="cancel-p" style="justify-content:center">Cancel</button>
      <button class="btn btn-primary w100" id="save-p" style="justify-content:center">Record Payment</button>
    </div>
  </div>`;
  openModal(modal);
  modal.addEventListener('click',e=>{if(e.target===modal)closeModal(modal)});
  $('#xm',modal).addEventListener('click',()=>closeModal(modal));
  $('#cancel-p',modal).addEventListener('click',()=>closeModal(modal));
  $$('.quick-pay',modal).forEach(b=>b.addEventListener('click',()=>{$('#pay-amt',modal).value=b.dataset.v}));
  $('#save-p',modal).addEventListener('click',()=>{
    const amt=parseFloat($('#pay-amt',modal).value);if(!amt||amt<=0)return;
    State.debts[idx].balance=Math.max(0,State.debts[idx].balance-amt);
    saveDebts(State.debts);
    // Also log as a transaction
    const tx={id:genId(),name:'Payment: '+d.name,category:'other',amount:-amt,date:todayStr(),note:'Debt payment',recurring:false};
    State.txs=[tx,...State.txs].sort((a,b)=>b.date.localeCompare(a.date));
    saveAndSync('txs',State.txs,()=>SB.addTx(State.user.id,tx));
    closeModal(modal);
    const done=State.debts[idx].balance===0;
    showToast(done?'🎉 Debt paid off!':fmt(amt)+' payment recorded');
    renderDebts();
  });
  $('#pay-amt',modal).focus();
}

function showPayoffStrategyModal(method){
  const sorted=[...State.debts].sort((a,b)=>method==='avalanche'?(b.apr||0)-(a.apr||0):(a.balance-b.balance));
  const modal=document.createElement('div');modal.className='overlay';
  modal.innerHTML=`<div class="modal" role="dialog" aria-modal="true">
    <div class="mh"><div class="mt-modal">${method==='avalanche'?'❄️ Avalanche':'⛄ Snowball'} Payoff Order</div><button class="xbtn" aria-label="Close" id="xm">✕</button></div>
    <div style="margin-bottom:14px;font-size:13px;color:var(--text2)">${method==='avalanche'?'Pay these in order to minimize total interest paid:':'Pay these in order to get quick wins and build momentum:'}</div>
    ${sorted.map((d,i)=>{const dt=getDebtType(d.type);return`<div style="display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid var(--border)"><div style="width:28px;height:28px;border-radius:50%;background:${dt.color}22;display:flex;align-items:center;justify-content:center;font-weight:900;color:${dt.color};font-size:13px;flex-shrink:0">${i+1}</div><div style="flex:1"><div style="font-weight:700">${esc(d.name)}</div><div style="font-size:12px;color:var(--text2)">${fmt(d.balance)} · ${d.apr||0}% APR</div></div></div>`;}).join('')}
    <button class="btn btn-ghost w100 mt16" id="close-s" style="justify-content:center">Got it</button>
  </div>`;
  openModal(modal);
  modal.addEventListener('click',e=>{if(e.target===modal)closeModal(modal)});
  $('#xm',modal).addEventListener('click',()=>closeModal(modal));
  $('#close-s',modal).addEventListener('click',()=>closeModal(modal));
}


export { renderDebts };
