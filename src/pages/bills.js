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
import { renderBillCalendarHTML } from './reports.js';

function renderBills(){
  const bills=State.bills||[];
  const now=new Date();
  const thisMonth=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const subs=bills.filter(b=>b.type==='subscription');
  const utils=bills.filter(b=>b.type==='utility');
  const other=bills.filter(b=>b.type==='other');
  const allBills=[...subs,...utils,...other];

  const totalKnown=allBills.filter(b=>b.amount).reduce((s,b)=>s+b.amount,0);
  const paidThisMonth=allBills.filter(b=>b.paidDate?.startsWith(thisMonth)).reduce((s,b)=>s+(b.amount||0),0);
  const unpaidCount=allBills.filter(b=>!b.paidDate?.startsWith(thisMonth)).length;

  const billCard=(b)=>{
    const isPaid=b.paidDate?.startsWith(thisMonth);
    const cat=getCat(b.category);
    return`<div class="bill-item ${isPaid?'paid':''}">
      <div class="bill-icon">${b.emoji}</div>
      <div class="bill-info">
        <div class="bill-name">${esc(b.name)}</div>
        <div class="bill-meta">
          <span class="cat-badge" style="background:${cat.color}22;color:${cat.color}">${esc(cat.name)}</span>
          ${b.dueDay?`<span style="color:var(--text3);font-size:11px">Due day ${b.dueDay}</span>`:'<span style="color:var(--text3);font-size:11px">No due date</span>'}
          ${isPaid?`<span style="color:var(--green);font-size:11px;font-weight:700">✓ Paid ${fmtDate(b.paidDate)}</span>`:''}
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;flex-shrink:0">
        <div style="text-align:right">
          ${b.amount?`<div style="font-size:15px;font-weight:800;color:${isPaid?'var(--text2)':'var(--text)'}">${fmt(b.amount)}</div>`
            :`<button class="btn btn-ghost btn-xs" data-set-amount="${b.id}" style="font-size:11px">+ Add amount</button>`}
        </div>
        ${isPaid
          ? `<button class="btn btn-ghost btn-xs" data-unpay="${b.id}" title="Mark unpaid">↩</button>`
          : `<button class="btn btn-primary btn-sm" data-pay="${b.id}" style="white-space:nowrap">Pay</button>`
        }
        <button class="btn btn-ghost btn-xs" data-edit-bill="${b.id}" title="Edit">${IC.edit}</button>
        <button class="btn btn-danger btn-xs" data-del-bill="${b.id}">${IC.trash}</button>
      </div>
    </div>`;
  };

  const section=(title,icon,items)=>items.length?`
    <div class="card mb16">
      <div class="fbc mb12">
        <div class="card-title" style="margin:0">${icon} ${title}</div>
        <span style="font-size:12px;color:var(--text2)">${items.length} bill${items.length!==1?'s':''}</span>
      </div>
      ${items.map(billCard).join('')}
    </div>`:'';

  render(`
  <div class="ph">
    <div><div class="pt">Bills & Subscriptions</div><div class="ps">Track what you owe — pay when you're ready</div></div>
    <button class="btn btn-primary" id="btn-add-bill">${IC.plus} Add Bill</button>
  </div>

  <div class="g3 mb16">
    <div class="rstat"><div class="rstat-lbl">Monthly Known</div><div class="rstat-val" style="color:var(--text)">${fmt(totalKnown)}</div></div>
    <div class="rstat"><div class="rstat-lbl">Paid This Month</div><div class="rstat-val" style="color:var(--green)">${fmt(paidThisMonth)}</div></div>
    <div class="rstat"><div class="rstat-lbl">Still Unpaid</div><div class="rstat-val" style="color:${unpaidCount>0?'var(--orange)':'var(--text2)'}">${unpaidCount}</div></div>
  </div>

  ${allBills.length===0?`<div class="card"><div class="empty">
    <div class="empty-icon">📄</div>
    <div class="empty-title">No bills yet</div>
    <div class="empty-sub">Add your subscriptions and bills — or they'll be set up during onboarding for new accounts</div>
    <button class="btn btn-primary" id="btn-add-bill2" style="justify-content:center;margin-top:14px">${IC.plus} Add Your First Bill</button>
  </div></div>`:
  `${section('Subscriptions','📺',subs)}
   ${section('Utilities','⚡',utils)}
   ${section('Other Bills','📄',other)}`
  }

  <div class="alert-strip info" style="margin-top:8px;padding:12px 14px">
    <div style="font-size:13px">💡 <strong>Nothing is paid automatically.</strong> Tap <em>Pay</em> after you've made a payment — it logs a transaction and marks the bill paid for this month.</div>
  </div>`,
  ()=>{
    $('#btn-add-bill,#btn-add-bill2')&&$$('#btn-add-bill,#btn-add-bill2').forEach(b=>b?.addEventListener('click',showAddBillModal));

    /* Pay button — logs transaction + marks paid */
    $$('[data-pay]').forEach(b=>b.addEventListener('click',()=>{
      const bill=State.bills.find(x=>x.id===b.dataset.pay);if(!bill)return;
      if(bill.amount){
        // Log transaction immediately
        const tx={id:genId(),name:bill.name,category:bill.category,amount:-(bill.amount),date:todayStr(),note:'Bill payment',recurring:false};
        State.txs=[tx,...State.txs].sort((a,b)=>b.date.localeCompare(a.date));
        saveAndSync('txs',State.txs,()=>SB.addTx(State.user.id,tx));
        applyTxToAccount(tx);
        bill.paidDate=todayStr();
        saveBills(State.bills);
        showToast(`${esc(bill.emoji)} ${esc(bill.name)} marked paid · ${fmt(bill.amount)} logged`,'var(--green)');
        renderBills();
      } else {
        // No amount — open modal to set amount then pay
        showPayBillModal(bill);
      }
    }));

    /* Unpay */
    $$('[data-unpay]').forEach(b=>b.addEventListener('click',()=>{
      const bill=State.bills.find(x=>x.id===b.dataset.unpay);if(!bill)return;
      bill.paidDate=null;
      saveBills(State.bills);
      showToast(`${esc(bill.name)} marked unpaid`);
      renderBills();
    }));

    /* Set amount inline */
    $$('[data-set-amount]').forEach(b=>b.addEventListener('click',()=>{
      const bill=State.bills.find(x=>x.id===b.dataset.setAmount);if(!bill)return;
      showSetBillAmountModal(bill);
    }));

    /* Edit */
    $$('[data-edit-bill]').forEach(b=>b.addEventListener('click',()=>{
      const bill=State.bills.find(x=>x.id===b.dataset.editBill);if(!bill)return;
      showEditBillModal(bill);
    }));

    /* Delete */
    $$('[data-del-bill]').forEach(b=>b.addEventListener('click',()=>{
      State.bills=State.bills.filter(x=>x.id!==b.dataset.delBill);
      saveBills(State.bills);renderBills();showToast('Bill removed');
    }));
  });
}

function showAddBillModal(prefill={}){
  const modal=document.createElement('div');modal.className='overlay';
  modal.innerHTML=`<div class="modal" role="dialog" aria-modal="true">
    <div class="mh"><div class="mt-modal">Add Bill</div><button class="xbtn" aria-label="Close" id="xm">✕</button></div>
    <div class="g2">
      <div class="ig"><label class="il">Bill Name</label><input class="input" id="bill-name" type="text" placeholder="e.g. Netflix, Electricity" value="${prefill.name||''}"></div>
      <div class="ig"><label class="il">Emoji</label><input class="input" id="bill-emoji" type="text" maxlength="2" placeholder="💳" value="${prefill.emoji||'💳'}" style="font-size:20px;text-align:center"></div>
    </div>
    <div class="g2">
      <div class="ig"><label class="il">Category</label>
        <select class="input" id="bill-cat">
          ${CATS.filter(c=>c.id!=='income').map(c=>`<option value="${c.id}" ${prefill.category===c.id?'selected':''}>${esc(c.emoji)} ${esc(c.name)}</option>`).join('')}
        </select>
      </div>
      <div class="ig"><label class="il">Type</label>
        <select class="input" id="bill-type">
          <option value="subscription" ${prefill.type==='subscription'?'selected':''}>📺 Subscription</option>
          <option value="utility" ${prefill.type==='utility'?'selected':''}>⚡ Utility</option>
          <option value="other" ${prefill.type==='other'?'selected':''}>📄 Other Bill</option>
        </select>
      </div>
    </div>
    <div class="g2">
      <div class="ig">
        <label class="il">Amount <span style="color:var(--text3);font-weight:500">(optional)</span></label>
        <div class="amt-wrap"><span class="amt-prefix">$</span><input class="input" id="bill-amount" type="number" min="0" step="0.01" placeholder="Leave blank if unknown" value="${prefill.amount||''}" inputmode="decimal"></div>
      </div>
      <div class="ig">
        <label class="il">Due Day of Month <span style="color:var(--text3);font-weight:500">(optional)</span></label>
        <input class="input" id="bill-due" type="number" min="1" max="31" placeholder="e.g. 15" value="${prefill.dueDay||''}">
      </div>
    </div>
    <div class="fac gap10 mt16">
      <button class="btn btn-ghost w100" id="cancel-bill" style="justify-content:center">Cancel</button>
      <button class="btn btn-primary w100" id="save-bill" style="justify-content:center">Add Bill</button>
    </div>
  </div>`;
  openModal(modal);
  modal.addEventListener('click',e=>{if(e.target===modal)closeModal(modal)});
  $('#xm',modal).addEventListener('click',()=>closeModal(modal));
  $('#cancel-bill',modal).addEventListener('click',()=>closeModal(modal));
  $('#save-bill',modal).addEventListener('click',()=>{
    const name=$('#bill-name',modal).value.trim();
    if(!name)return showToast('Please enter a name','var(--red)');
    const amt=parseFloat($('#bill-amount',modal).value)||null;
    const due=parseInt($('#bill-due',modal).value)||null;
    const bill={id:prefill.id||genId(),name,emoji:$('#bill-emoji',modal).value||'💳',
      category:$('#bill-cat',modal).value,type:$('#bill-type',modal).value,
      amount:amt,dueDay:due,paid:false,paidDate:null};
    if(prefill.id){State.bills=State.bills.map(b=>b.id===prefill.id?{...b,...bill}:b);}
    else{State.bills.push(bill);}
    saveBills(State.bills);closeModal(modal);renderBills();
    showToast(`${esc(bill.emoji)} ${esc(bill.name)} added ✓`);
  });
  $('#bill-name',modal).focus();
}

function showEditBillModal(bill){showAddBillModal(bill);}

function showPayBillModal(bill){
  const modal=document.createElement('div');modal.className='overlay';
  modal.innerHTML=`<div class="modal" role="dialog" aria-modal="true">
    <div class="mh"><div class="mt-modal">${bill.emoji} Pay ${esc(bill.name)}</div><button class="xbtn" aria-label="Close" id="xm">✕</button></div>
    <div style="background:var(--card2);border-radius:var(--rsm);padding:12px;margin-bottom:16px;font-size:13px;color:var(--text2)">Enter the amount from your bill — this will be logged as a transaction.</div>
    <div class="ig"><label class="il">Amount Paid</label>
      <div class="amt-wrap"><span class="amt-prefix">$</span><input class="input" id="pay-amt" type="number" min="0" step="0.01" inputmode="decimal" style="font-size:24px;font-weight:800;padding:14px 14px 14px 28px" placeholder="0.00"></div>
    </div>
    <label style="display:flex;align-items:center;gap:8px;margin-bottom:16px;font-size:13px;cursor:pointer">
      <input type="checkbox" id="save-amount" style="accent-color:var(--green)"> Save this as the regular amount for this bill
    </label>
    <div class="fac gap10">
      <button class="btn btn-ghost w100" id="cancel-pay" style="justify-content:center">Cancel</button>
      <button class="btn btn-primary w100" id="confirm-pay" style="justify-content:center">Log Payment</button>
    </div>
  </div>`;
  openModal(modal);
  modal.addEventListener('click',e=>{if(e.target===modal)closeModal(modal)});
  $('#xm,#cancel-pay',modal)&&$$('#xm,#cancel-pay',modal).forEach(b=>b?.addEventListener('click',()=>closeModal(modal)));
  $('#confirm-pay',modal).addEventListener('click',()=>{
    const amt=parseFloat($('#pay-amt',modal).value);
    if(!amt||amt<=0)return showToast('Enter a valid amount','var(--red)');
    const tx={id:genId(),name:bill.name,category:bill.category,amount:-amt,date:todayStr(),note:'Bill payment',recurring:false};
    State.txs=[tx,...State.txs].sort((a,b)=>b.date.localeCompare(a.date));
    saveAndSync('txs',State.txs,()=>SB.addTx(State.user.id,tx));
    applyTxToAccount(tx);
    bill.paidDate=todayStr();
    if($('#save-amount',modal).checked)bill.amount=amt;
    saveBills(State.bills);
    closeModal(modal);showToast(`${bill.emoji} ${bill.name} paid · ${fmt(amt)} logged`,'var(--green)');
    renderBills();
  });
  $('#pay-amt',modal).focus();
}

function showSetBillAmountModal(bill){
  const modal=document.createElement('div');modal.className='overlay';
  modal.innerHTML=`<div class="modal" role="dialog" aria-modal="true">
    <div class="mh"><div class="mt-modal">${bill.emoji} Set Amount · ${esc(bill.name)}</div><button class="xbtn" aria-label="Close" id="xm">✕</button></div>
    <div class="ig"><label class="il">Amount</label>
      <div class="amt-wrap"><span class="amt-prefix">$</span><input class="input" id="set-amt" type="number" min="0" step="0.01" inputmode="decimal" value="${bill.amount||''}" style="font-size:22px;font-weight:800;padding:12px 12px 12px 26px"></div>
    </div>
    <div class="fac gap10 mt16">
      <button class="btn btn-ghost w100" id="cancel-sa" style="justify-content:center">Cancel</button>
      <button class="btn btn-primary w100" id="save-sa" style="justify-content:center">Save Amount</button>
    </div>
  </div>`;
  openModal(modal);
  modal.addEventListener('click',e=>{if(e.target===modal)closeModal(modal)});
  $('#xm,#cancel-sa',modal)&&$$('#xm,#cancel-sa',modal).forEach(b=>b?.addEventListener('click',()=>closeModal(modal)));
  $('#save-sa',modal).addEventListener('click',()=>{
    const amt=parseFloat($('#set-amt',modal).value);if(!amt)return;
    bill.amount=amt;saveBills(State.bills);closeModal(modal);renderBills();showToast('Amount updated ✓');
  });
  $('#set-amt',modal).focus();
}


export { renderBills };
