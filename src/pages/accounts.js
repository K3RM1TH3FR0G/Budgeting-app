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

function getEffectiveBalance(account){
  if(!State.settings.autoBalance) return account.balance;
  const flow=State.txs
    .filter(t=>t.accountId===account.id)
    .reduce((s,t)=>s+t.amount,0);
  return account.balance+flow;
}

function getTotalBalance(){
  if(!State.accounts.length) return 0;
  return State.accounts.reduce((s,a)=>s+getEffectiveBalance(a),0);
}

function accLabel(a){
  if(!a) return '';
  if(!a.name || a.name===a.type) return esc(a.type); // no nickname, just show type
  return esc(a.name)+' · '+esc(a.type);
}

function accSelectHTML(id='tx-acc', selectedId=''){
  if(!State.accounts.length) return '';
  const opts=`<option value="">No account</option>`+State.accounts.map(a=>`<option value="${a.id}" ${selectedId===a.id?'selected':''}>${esc(accLabel(a))}</option>`).join('');
  return `<div class="ig"><label class="il">Account</label><select class="input" id="${id}">${opts}</select></div>`;
}

function renderAccounts(){
  const ms=monthStats(State.txs,0),accounts=State.accounts;
  const autoOn=State.settings.autoBalance||false;
  const totalBalance=getTotalBalance();

  const accountsHTML=accounts.length?accounts.map(a=>{
    const displayBal=getEffectiveBalance(a);
    const taggedFlow=State.txs.filter(t=>t.accountId===a.id).reduce((s,t)=>s+t.amount,0);
    const taggedCount=State.txs.filter(t=>t.accountId===a.id).length;
    return`<div class="acc-card" style="background:${a.gradient||'linear-gradient(135deg,#7c3aed,#4f46e5)'}">
      <div class="acc-card-lbl">${esc(a.type)}</div>
      <div class="acc-card-val">${fmt(displayBal)}</div>
      ${autoOn&&taggedCount>0?`<div style="font-size:10px;opacity:.7;margin-top:2px">Base ${fmt(a.balance)} ${taggedFlow>=0?'+':'-'} ${fmtK(Math.abs(taggedFlow))} (${taggedCount} txns)</div>`:''}
      ${autoOn&&taggedCount===0?`<div style="font-size:10px;opacity:.6;margin-top:2px">No transactions tagged to this account</div>`:''}
      <div class="acc-card-sub" style="display:flex;justify-content:space-between;align-items:center">
        <span>${esc(a.name||'My Account')}</span>
        <div style="display:flex;gap:6px;align-items:center">
          <button data-edit-acc="${a.id}" style="background:rgba(255,255,255,.15);border:none;color:white;border-radius:6px;padding:3px 8px;cursor:pointer;font-size:11px;font-family:inherit;font-weight:700">Edit</button>
          <button data-del-acc="${a.id}" style="background:rgba(255,77,106,.3);border:none;color:white;border-radius:6px;padding:3px 8px;cursor:pointer;font-size:11px;font-family:inherit;font-weight:700">✕</button>
        </div>
      </div>
    </div>`;
  }).join('')
    :`<div class="card" style="grid-column:1/-1"><div class="empty"><div class="empty-icon">💳</div><div class="empty-title">No accounts yet</div><div class="empty-sub">Add your checking and savings balances to track your net worth</div></div></div>`;

  render(`
  <div class="ph">
    <div><div class="pt">Accounts</div><div class="ps">${accounts.length} account${accounts.length!==1?'s':''} · ${autoOn?'<span style="color:var(--green)">⚡ Auto-adjusting</span>':'Manual balances'}</div></div>
    <div class="flex gap8">
      <button class="btn btn-ghost btn-sm" style="opacity:.5;cursor:not-allowed">🔗 Link Bank (Soon)</button>
      <button class="btn btn-primary" id="btn-add-acc">${IC.plus} Add Account</button>
    </div>
  </div>
  ${autoOn?`<div class="alert-strip info mb16" style="padding:12px 14px">
    <div style="display:flex;align-items:center;gap:10px">
      <span style="font-size:18px">⚡</span>
      <div>
        <div style="font-weight:800;font-size:13px">Auto-Balance is ON</div>
        <div style="font-size:12px;color:var(--text2);margin-top:2px">Balances update automatically based on your transactions. Transaction flow this month: <strong style="color:${txFlow>=0?'var(--green)':'var(--red)'}">${txFlow>=0?'+':''}${fmt(txFlow)}</strong></div>
      </div>
    </div>
  </div>`:''}
  <div class="g2 mb16">${accountsHTML}</div>
  <div class="g3 mb16">
    <div class="rstat"><div class="rstat-lbl">Total Balance</div><div class="rstat-val" style="color:var(--green)">${fmt(totalBalance)}</div></div>
    <div class="rstat"><div class="rstat-lbl">This Month Net</div><div class="rstat-val" style="color:${ms.savings>=0?'var(--green)':'var(--red)'}">${ms.savings>=0?'+':''}${fmt(ms.savings)}</div></div>
    <div class="rstat"><div class="rstat-lbl">Accounts</div><div class="rstat-val">${accounts.length}</div></div>
  </div>
  <div class="card" style="background:linear-gradient(135deg,rgba(139,120,245,.12),rgba(14,201,154,.06));border-color:rgba(139,120,245,.2)">
    <div class="fac gap16">
      <div style="font-size:32px">🏦</div>
      <div style="flex:1">
        <div style="font-size:15px;font-weight:900;margin-bottom:3px">Bank Linking — Coming Soon</div>
        <div style="font-size:13px;color:var(--text2);line-height:1.5">Auto-import transactions via Plaid. Toggle this in <span class="link" id="go-settings">Settings → Balance Mode</span>.</div>
      </div>
    </div>
  </div>`,
  ()=>{
    $('#btn-add-acc')?.addEventListener('click',showAddAccountModal);
    $('#go-settings')?.addEventListener('click',()=>navigate('settings'));
    $$('[data-del-acc]').forEach(b=>b.addEventListener('click',async()=>{
      const id=b.dataset.delAcc;State.accounts=State.accounts.filter(a=>a.id!==id);
      saveAndSync('accounts',State.accounts,()=>SB.deleteAccount(id));renderAccounts();showToast('Account removed');
    }));
    $$('[data-edit-acc]').forEach(b=>b.addEventListener('click',()=>showEditAccountModal(b.dataset.editAcc)));
  });
}

function showEditAccountModal(accId){
  const acc=State.accounts.find(a=>a.id===accId);
  if(!acc){ showToast('Account not found','var(--red)'); return; }
  const gradients=['linear-gradient(135deg,#7c3aed,#4f46e5)','linear-gradient(135deg,#0ec99a,#0891b2)','linear-gradient(135deg,#ff9f43,#ee5a24)','linear-gradient(135deg,#ff4d6a,#c0392b)','linear-gradient(135deg,#8b78f5,#c56cf0)','linear-gradient(135deg,#4ec9ff,#1e90ff)'];
  const ACC_TYPES=['Checking Account','Savings Account','Credit Card','Investment Account','Retirement (401k/IRA)','Cash','Other'];
  let selGrad=acc.gradient||gradients[0];
  const modal=document.createElement('div');modal.className='overlay';
  modal.innerHTML=`<div class="modal" role="dialog" aria-modal="true">
    <div class="mh"><div class="mt-modal">Edit Account</div><button class="xbtn" aria-label="Close" id="xm">✕</button></div>
    <div class="ig"><label class="il" for="ea-type">Account Type</label><select class="input" id="ea-type">${ACC_TYPES.map(t=>`<option ${acc.type===t?'selected':''}>${esc(t)}</option>`).join('')}</select></div>
    <div class="ig"><label class="il" for="ea-name">Nickname (optional)</label><input class="input" id="ea-name" type="text" placeholder="e.g. Chase Checking" value="${esc(acc.name||'')}"></div>
    <div class="ig"><label class="il" for="ea-bal">Current Balance</label><div class="amt-wrap"><span class="amt-prefix">$</span><input class="input" id="ea-bal" type="number" step="0.01" value="${acc.balance}" inputmode="decimal" style="font-size:20px;font-weight:800"></div></div>
    <div class="ig"><label class="il">Card Colour</label><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px">${gradients.map(g=>`<div class="grad-opt" data-g="${g}" style="width:32px;height:32px;border-radius:8px;background:${g};cursor:pointer;border:3px solid ${g===selGrad?'white':'transparent'};transition:transform .15s;flex-shrink:0"></div>`).join('')}</div></div>
    <div class="fac gap10 mt16">
      <button class="btn btn-ghost w100" id="cancel-ea" style="justify-content:center">Cancel</button>
      <button class="btn btn-primary w100" id="save-ea" style="justify-content:center">Save Changes</button>
    </div>
  </div>`;
  openModal(modal);
  modal.addEventListener('click',e=>{if(e.target===modal)closeModal(modal)});
  $('#xm',modal).addEventListener('click',()=>closeModal(modal));
  $('#cancel-ea',modal).addEventListener('click',()=>closeModal(modal));
  $$('.grad-opt',modal).forEach(d=>d.addEventListener('click',()=>{
    selGrad=d.dataset.g;
    $$('.grad-opt',modal).forEach(x=>{x.style.border='3px solid transparent';x.style.transform='scale(1)'});
    d.style.border='3px solid white';d.style.transform='scale(1.15)';
  }));
  $('#save-ea',modal).addEventListener('click',async()=>{
    const newBal=parseFloat($('#ea-bal',modal).value);
    if(isNaN(newBal))return showToast('Enter a valid balance','var(--red)');
    acc.type    = $('#ea-type',modal).value;
    acc.name    = $('#ea-name',modal).value.trim()||acc.type;
    acc.balance = newBal;
    acc.gradient= selGrad;
    saveAndSync('accounts',State.accounts,()=>SB.updateAccount(acc.id,acc.balance,acc.type,acc.name,acc.gradient));
    closeModal(modal);showToast('Account updated ✓');renderAccounts();
  });
  $('#ea-bal',modal).focus();
  $('#ea-bal',modal).select();
}

function showAddAccountModal(){
  const gradients=['linear-gradient(135deg,#7c3aed,#4f46e5)','linear-gradient(135deg,#0ec99a,#0891b2)','linear-gradient(135deg,#ff9f43,#ee5a24)','linear-gradient(135deg,#ff4d6a,#c0392b)','linear-gradient(135deg,#8b78f5,#c56cf0)','linear-gradient(135deg,#4ec9ff,#1e90ff)'];
  let selGrad=gradients[0];
  const modal=document.createElement('div');modal.className='overlay';
  modal.innerHTML=`<div class="modal" role="dialog" aria-modal="true"><div class="mh"><div class="mt-modal">Add Account</div><button class="xbtn" aria-label="Close" id="xm">✕</button></div>
    <div class="ig"><label class="il">Account Type</label><select class="input" id="acc-type"><option>Checking Account</option><option>Savings Account</option><option>Credit Card</option><option>Investment Account</option><option>Cash</option><option>Other</option></select></div>
    <div class="ig"><label class="il">Nickname (optional)</label><input class="input" id="acc-name" type="text" placeholder="e.g. Chase Checking"></div>
    <div class="ig"><label class="il">Current Balance</label><div class="amt-wrap"><span class="amt-prefix">$</span><input class="input" id="acc-bal" type="number" placeholder="0.00" step="0.01" inputmode="decimal" style="font-size:20px;font-weight:800"></div></div>
    <div class="ig"><label class="il">Card Color</label><div style="display:flex;gap:8px;margin-top:6px">${gradients.map((g,i)=>`<div class="grad-opt" data-g="${g}" style="width:32px;height:32px;border-radius:8px;background:${g};cursor:pointer;border:2px solid ${i===0?'white':'transparent'};transition:transform .15s;flex-shrink:0"></div>`).join('')}</div></div>
    <div class="fac gap10 mt16"><button class="btn btn-ghost w100" id="cancel-acc" style="justify-content:center">Cancel</button><button class="btn btn-primary w100" id="save-acc" style="justify-content:center">Add Account</button></div>
  </div>`;
  openModal(modal);
  modal.addEventListener('click',e=>{if(e.target===modal)closeModal(modal)});
  $('#xm',modal).addEventListener('click',()=>closeModal(modal));
  $('#cancel-acc',modal).addEventListener('click',()=>closeModal(modal));
  $$('.grad-opt',modal).forEach(d=>d.addEventListener('click',()=>{selGrad=d.dataset.g;$$('.grad-opt',modal).forEach(x=>{x.style.border='2px solid transparent';x.style.transform='scale(1)'});d.style.border='2px solid white';d.style.transform='scale(1.15)'}));
  $('#save-acc',modal).addEventListener('click',async()=>{
    const bal=parseFloat($('#acc-bal',modal).value)||0,type=$('#acc-type',modal).value,name=$('#acc-name',modal).value.trim()||type;
    const acc={type,name,balance:bal,gradient:selGrad};
    setSyncIndicator(true);
    const saved=await SB.addAccount(State.user.id,acc).catch(()=>null);
    setSyncIndicator(false);
    State.accounts.push(saved||{...acc,id:genId()});
    closeModal(modal);showToast('Account added ✓');renderAccounts();
  });
  $('#acc-bal',modal).focus();
}


export { renderAccounts, getEffectiveBalance, getTotalBalance, accLabel, accSelectHTML };
