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
import { drawAreaChart, drawDonut } from '../charts.js';
import { monthStats } from '../stats.js';

let _undoTx = null, _undoTimer = null;

function txHTML(t){
  const cat=getCat(t.category);
  const acc=State.accounts.find(a=>a.id===t.accountId);
  const accBadge=acc?`<span style="font-size:10px;font-weight:700;padding:1px 6px;border-radius:8px;background:var(--card3);color:var(--text2)">💳 ${esc(accLabel(acc))}</span>`:'';
  return`<div class="tx-item" data-txid="${esc(t.id)}">
    <div class="tx-swipe-del" data-swipe-del="${esc(t.id)}">🗑</div>
    <div class="tx-icon" style="background:${cat.color}22">${cat.emoji}</div>
    <div class="tx-info"><div class="tx-name">${esc(t.name)}</div>
    <div class="tx-meta"><span>${fmtDate(t.date)}</span><span class="cat-badge" style="background:${cat.color}22;color:${cat.color}">${esc(cat.name)}</span>${t.recurring?'<span class="rec-badge">↻</span>':''}${accBadge}</div></div>
    <div style="display:flex;align-items:center;gap:8px;margin-left:auto;flex-shrink:0">
      <div class="tx-amt ${t.amount<0?'exp':'inc'}" aria-label="${t.amount<0?'Expense':'Income'}: ${fmtK(Math.abs(t.amount))}">${t.amount<0?'-':'+'} ${fmtK(Math.abs(t.amount))}</div>
      <button class="del-btn" data-id="${esc(t.id)}" aria-label="Delete transaction: ${esc(t.name)}">${IC.trash}</button>
    </div></div>`;
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

function renderTransactions(filterType, filterCat, search){
  /* Restore last filter if none provided */
  if(filterType===undefined) filterType=State.lastFilter.type||'all';
  if(filterCat===undefined)  filterCat=State.lastFilter.cat||'all';
  if(search===undefined)     search=State.lastFilter.search||'';
  /* Remember for next time */
  State.lastFilter={type:filterType,cat:filterCat,search};
  const filtered=State.txs.filter(t=>{
    if(filterType==='income'&&t.amount<=0)return false;
    if(filterType==='expense'&&t.amount>=0)return false;
    if(filterCat!=='all'&&t.category!==filterCat)return false;
    if(search&&!t.name.toLowerCase().includes(search.toLowerCase()))return false;
    return true;
  });
  const groups={};filtered.forEach(t=>{if(!groups[t.date])groups[t.date]=[];groups[t.date].push(t)});
  const sortedGroups=Object.entries(groups).sort((a,b)=>b[0].localeCompare(a[0]));
  const total=filtered.reduce((s,t)=>s+t.amount,0);
  const typChips=['all','income','expense'].map(f=>`<button class="chip ${filterType===f?'active':''}" data-ftype="${f}">${f.charAt(0).toUpperCase()+f.slice(1)}</button>`).join('');
  const catChips=[{id:'all',name:'All'},...CATS.slice(0,7)].map(c=>`<button class="chip ${filterCat===c.id?'active':''}" data-fcat="${c.id}">${'emoji' in c?c.emoji+' ':''}${esc(c.name)}</button>`).join('');

  render(`
  <div class="ph">
    <div><div class="pt">Transactions</div><div class="ps">${filtered.length} transaction${filtered.length!==1?'s':''} · Net ${total>=0?'+':''}${fmt(total)}</div></div>
    <div class="flex gap8">
      <button class="btn btn-ghost btn-sm" id="btn-bulk-edit">${IC.edit} Bulk Edit</button>
      <button class="btn btn-primary" id="btn-add-tx">${IC.plus} Add</button>
    </div>
  </div>
  <div class="card mb16" style="padding:14px 16px">
    <div style="font-size:11px;font-weight:800;color:var(--text3);letter-spacing:.8px;text-transform:uppercase;margin-bottom:10px">⚡ Quick Add <span class="kbd-hint" style="margin-left:6px;text-transform:none">press N</span></div>
    ${State.templates.length?`<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;overflow-x:auto;padding-bottom:4px">
      ${State.templates.map((t,i)=>`<button class="template-btn" data-tmpl="${i}" title="${esc(t.name)} · ${fmt(Math.abs(t.amount))}">${getCat(t.category).emoji} ${esc(t.name)} <strong>${fmtK(Math.abs(t.amount))}</strong><span class="t-del" data-del-tmpl="${i}">✕</span></button>`).join('')}
    </div>`:''}
    <div class="qa-row">
      <div class="type-sel" style="margin:0;gap:6px;flex-shrink:0">
        <button class="type-btn exp-active" id="qa-exp" style="padding:7px 12px;font-size:12px">📤</button>
        <button class="type-btn" id="qa-inc" style="padding:7px 12px;font-size:12px">📥</button>
      </div>
      <div class="amt-wrap" style="width:110px;flex-shrink:0"><span class="amt-prefix" style="font-size:13px">$</span><input class="input" id="qa-amt" type="number" placeholder="0.00" min="0" step="0.01" inputmode="decimal" style="font-size:15px;font-weight:800;padding:9px 9px 9px 22px"></div>
      <input class="input" id="qa-name" type="text" placeholder="Description…" style="flex:1;min-width:100px;padding:9px 12px">
      <select class="input qa-desktop" id="qa-cat" style="width:130px;padding:9px 28px 9px 10px;font-size:13px">${CATS.filter(c=>c.id!=='income').map(c=>`<option value="${c.id}">${esc(c.emoji)} ${esc(c.name)}</option>`).join('')}</select>
      ${State.accounts.length?`<select class="input qa-desktop" id="qa-acc" style="width:130px;padding:9px 28px 9px 10px;font-size:13px"><option value="">No account</option>${State.accounts.map(a=>`<option value="${a.id}">${esc(accLabel(a))}</option>`).join('')}</select>`:''}
      <button class="btn btn-primary" id="qa-save" style="padding:9px 14px;white-space:nowrap;flex-shrink:0">${IC.plus} Add</button>
    </div>
    <div class="qa-mobile-row">
      <select class="input" id="qa-cat-m" style="flex:1;padding:8px 28px 8px 10px;font-size:13px">${CATS.filter(c=>c.id!=='income').map(c=>`<option value="${c.id}">${esc(c.emoji)} ${esc(c.name)}</option>`).join('')}</select>
      ${State.accounts.length?`<select class="input" id="qa-acc-m" style="flex:1;padding:8px 28px 8px 10px;font-size:13px"><option value="">No account</option>${State.accounts.map(a=>`<option value="${a.id}">${esc(accLabel(a))}</option>`).join('')}</select>`:''}
    </div>
  </div>
  <div class="fac gap10 mb14" style="flex-wrap:wrap"><div class="search-wrap"><span class="search-icon">${IC.search}</span><input class="input" id="tx-search" type="text" placeholder="Search transactions…" value="${search}"></div></div>
  <div class="chips">${typChips}<div style="width:1px;height:26px;background:var(--border);margin:0 4px"></div>${catChips}</div>
  ${sortedGroups.length===0?`<div class="card"><div class="empty"><div class="empty-icon">🔍</div><div class="empty-title">${State.txs.length===0?'No transactions yet':'No results found'}</div><div class="empty-sub">${State.txs.length===0?'Use the quick-add bar above to add your first transaction':'Try adjusting your filters'}</div>${State.txs.length===0?`<button class="btn btn-primary" id="empty-add" style="justify-content:center;margin-top:14px">${IC.plus} Add Transaction</button>`:''}</div></div>`
    :sortedGroups.map(([date,items])=>`<div class="mb14"><div style="font-size:11px;font-weight:800;color:var(--text3);letter-spacing:.8px;text-transform:uppercase;margin-bottom:8px;padding:0 2px">${fmtDate(date)} · <span style="color:var(--text2)">${fmtK(Math.abs(items.reduce((s,t)=>s+t.amount,0)))}</span></div><div class="card" style="padding:4px 16px">${items.map(txHTML).join('')}</div></div>`).join('')}`,
  ()=>{
    $('#btn-add-tx')?.addEventListener('click',showAddTxModal);
    $('#empty-add')?.addEventListener('click',showAddTxModal);
    $('#btn-bulk-edit')?.addEventListener('click',()=>showBulkEditModal(filtered));
    $('#tx-search')?.addEventListener('input',e=>renderTransactions(filterType,filterCat,e.target.value));
    $$('[data-ftype]').forEach(b=>b.addEventListener('click',()=>renderTransactions(b.dataset.ftype,filterCat,search)));
    $$('[data-fcat]').forEach(b=>b.addEventListener('click',()=>renderTransactions(filterType,b.dataset.fcat,search)));
    $$('.del-btn').forEach(b=>b.addEventListener('click',()=>{delTxWithUndo(b.dataset.id)}));

    /* ── Template buttons ── */
    $$('[data-tmpl]').forEach(b=>b.addEventListener('click',(e)=>{
      if(e.target.dataset.delTmpl!==undefined)return; // handled below
      const t=State.templates[parseInt(b.dataset.tmpl)];if(!t)return;
      const tx={id:genId(),name:t.name,category:t.category,amount:t.amount,date:todayStr(),note:'From template',recurring:false,accountId:t.accountId||undefined};
      State.txs=[tx,...State.txs].sort((a,b)=>b.date.localeCompare(a.date));
      saveAndSync('txs',State.txs,()=>SB.addTx(State.user.id,tx));
      showToast(`${getCat(t.category).emoji} ${esc(t.name)} added ✓`);
      renderTransactions(filterType,filterCat,search);
    }));
    $$('[data-del-tmpl]').forEach(b=>b.addEventListener('click',(e)=>{
      e.stopPropagation();
      State.templates.splice(parseInt(b.dataset.delTmpl),1);
      saveTemplates();
      renderTransactions(filterType,filterCat,search);
    }));

    /* ── Quick-add ── */
    let qaType='expense';
    /* Pre-select last used category and account */
    if(State.lastCat&&$('#qa-cat')) $('#qa-cat').value=State.lastCat;
    if(State.lastAccId&&$('#qa-acc')) $('#qa-acc').value=State.lastAccId;

    const catOpts=(income)=>income?`<option value="income">💰 Income</option><option value="other">📦 Other</option>`:CATS.filter(c=>c.id!=='income').map(c=>`<option value="${c.id}">${esc(c.emoji)} ${esc(c.name)}</option>`).join('');
    const setQaType=t=>{
      qaType=t;
      const isInc=t==='income';
      $('#qa-exp')&&($('#qa-exp').className='type-btn'+(isInc?'':' exp-active'));
      $('#qa-inc')&&($('#qa-inc').className='type-btn'+(isInc?' inc-active':''));
      [$('#qa-cat'),$('#qa-cat-m')].forEach(el=>{if(el){el.innerHTML=catOpts(isInc);if(State.lastCat&&!isInc)el.value=State.lastCat;}});
    };
    $('#qa-exp')?.addEventListener('click',()=>setQaType('expense'));
    $('#qa-inc')?.addEventListener('click',()=>setQaType('income'));

    const doQA=async()=>{
      const amt=parseFloat($('#qa-amt')?.value),name=($('#qa-name')?.value||'').trim();
      if(!amt||amt<=0||!name)return;
      /* Read from whichever dropdown is visible — desktop or mobile */
      const cat=$('#qa-cat')?.value||$('#qa-cat-m')?.value||'other';
      const accId=$('#qa-acc')?.value||$('#qa-acc-m')?.value||'';
      /* Remember for next time */
      State.lastCat=cat; State.lastAccId=accId;
      const tx={id:genId(),name,category:cat,amount:qaType==='expense'?-amt:amt,date:todayStr(),note:'',recurring:false,accountId:accId||undefined};
      State.txs=[tx,...State.txs].sort((a,b)=>b.date.localeCompare(a.date));
      /* Clear inputs */
      $('#qa-amt').value=''; $('#qa-name').value='';
      renderTransactions(filterType,filterCat,search);
      showToast('Added ✓');
      saveAndSync('txs',State.txs,()=>SB.addTx(State.user.id,tx));
    };
    $('#qa-save')?.addEventListener('click',doQA);
    $('#qa-name')?.addEventListener('keydown',e=>{if(e.key==='Enter')doQA()});

    /* ── Save as template button (appears after typing in quick-add) ── */
    $('#qa-name')?.addEventListener('input',()=>{
      const name=($('#qa-name')?.value||'').trim();
      const amt=parseFloat($('#qa-amt')?.value)||0;
      const existing=$('#qa-tmpl-btn');
      if(name&&amt>0&&!existing){
        const btn=document.createElement('button');btn.id='qa-tmpl-btn';btn.className='btn btn-ghost btn-xs';btn.style.whiteSpace='nowrap';btn.textContent='⭐ Save template';btn.title='Save as one-tap template';
        $('#qa-save')?.parentNode?.insertBefore(btn,$('#qa-save'));
        btn.addEventListener('click',()=>{
          const t={id:genId(),name:name.trim(),amount:(qaType==='expense'?-1:1)*(parseFloat($('#qa-amt')?.value)||0),category:$('#qa-cat')?.value||'other',accountId:$('#qa-acc')?.value||undefined};
          if(!State.templates.find(x=>x.name===t.name&&x.amount===t.amount)){
            State.templates.push(t);saveTemplates();showToast('⭐ Template saved');
          }
          btn.remove();
        });
      } else if(!name||!amt){existing?.remove();}
    });

    /* ── Swipe to delete (touch devices) ── */
    wireSwipeDelete();
  });
}

function delTxWithUndo(id){
  const tx=State.txs.find(t=>t.id===id);
  if(!tx)return;
  applyTxToAccount(tx,true);  // reverse from account immediately
  State.txs=State.txs.filter(t=>t.id!==id);
  if(State.page==='dashboard')renderDashboard();
  else if(State.page==='transactions')renderTransactions();
  // Show undo toast
  $$('.undo-toast,.toast').forEach(t=>t.remove());
  clearTimeout(_undoTimer);
  _undoTx=tx;
  const ut=document.createElement('div');ut.className='undo-toast';
  ut.innerHTML=`<span>Deleted <strong>${esc(tx.name)}</strong></span><button class="btn btn-ghost btn-xs" id="undo-btn">↩ Undo</button>`;
  document.body.appendChild(ut);
  $('#undo-btn').addEventListener('click',()=>{
    clearTimeout(_undoTimer);
    if(_undoTx){applyTxToAccount(_undoTx);State.txs=[_undoTx,...State.txs].sort((a,b)=>b.date.localeCompare(a.date));_undoTx=null;}
    ut.remove();
    if(State.page==='dashboard')renderDashboard();
    else if(State.page==='transactions')renderTransactions();
  });
  _undoTimer=setTimeout(()=>{
    ut.remove();
    if(_undoTx){SB.deleteTx(id).catch(()=>{});_undoTx=null;}
  },5000);
}

function applyTxToAccount(tx,reverse=false){
  if(!tx||!tx.accountId)return;
  const acc=State.accounts.find(a=>a.id===tx.accountId);
  if(!acc)return;
  /* tx.amount is signed: positive=income, negative=expense */
  acc.balance=Math.round((acc.balance+(reverse?-tx.amount:tx.amount))*100)/100;
  saveAndSync('accounts',State.accounts,()=>SB.updateAccount(acc.id,acc.balance));
}

function delTx(id){
  const _tx=State.txs.find(t=>t.id===id);
  if(_tx)applyTxToAccount(_tx,true);
  State.txs=State.txs.filter(t=>t.id!==id);
  showToast('Deleted');
  saveAndSync('txs',State.txs,()=>SB.deleteTx(id));
}

function showAddTxModal(){
  let type='expense';
  const accOpts=State.accounts.length?`<option value="">No account</option>`+State.accounts.map(a=>`<option value="${a.id}">${esc(accLabel(a))}</option>`).join(''):'';
  const modal=document.createElement('div');modal.className='overlay';
  modal.innerHTML=`<div class="modal" role="dialog" aria-modal="true"><div class="mh"><div class="mt-modal">Add Transaction</div><button class="xbtn" aria-label="Close" id="xm">✕</button></div>
    <div class="type-sel"><button class="type-btn exp-active" id="btn-exp">📤 Expense</button><button class="type-btn" id="btn-inc">📥 Income</button></div>
    <div class="ig"><label class="il">Amount</label><div class="amt-wrap"><span class="amt-prefix">$</span><input class="input" id="tx-amt" type="number" placeholder="0.00" step="0.01" min="0" inputmode="decimal"></div></div>
    <div class="ig"><label class="il">Description</label><input class="input" id="tx-name" type="text" placeholder="e.g. Whole Foods Market"></div>
    <div class="g2">
      <div class="ig"><label class="il">Category</label><select class="input" id="tx-cat">${CATS.filter(c=>c.id!=='income').map(c=>`<option value="${c.id}">${esc(c.emoji)} ${esc(c.name)}</option>`).join('')}</select></div>
      ${State.accounts.length?`<div class="ig"><label class="il">Account</label><select class="input" id="tx-acc">${accOpts}</select></div>`:''}
    </div>
    <div class="g2"><div class="ig"><label class="il">Date</label><input class="input" id="tx-date" type="date" value="${todayStr()}"></div><div class="ig"><label class="il">Note (optional)</label><input class="input" id="tx-note" type="text" placeholder="Optional note"></div></div>
    <div class="fac gap10 mb16"><label class="toggle"><input type="checkbox" id="tx-rec"><span class="tslider"></span></label><span class="muted">Recurring monthly</span></div>
    <div class="fac gap10"><button class="btn btn-ghost w100" id="cancel-tx" style="justify-content:center">Cancel</button><button class="btn btn-primary w100" id="save-tx" style="justify-content:center">Save Transaction</button></div>
  </div>`;
  openModal(modal);
  modal.addEventListener('click',e=>{if(e.target===modal)closeModal(modal)});
  $('#xm',modal).addEventListener('click',()=>closeModal(modal));
  $('#cancel-tx',modal).addEventListener('click',()=>closeModal(modal));
  const setType=t=>{type=t;$('#btn-exp',modal).className='type-btn'+(t==='expense'?' exp-active':'');$('#btn-inc',modal).className='type-btn'+(t==='income'?' inc-active':'');const cs=$('#tx-cat',modal);if(t==='income')cs.innerHTML=`<option value="income">💰 Income</option><option value="other">📦 Other</option>`;else cs.innerHTML=CATS.filter(c=>c.id!=='income').map(c=>`<option value="${c.id}">${esc(c.emoji)} ${esc(c.name)}</option>`).join('')};
  $('#btn-exp',modal).addEventListener('click',()=>setType('expense'));
  $('#btn-inc',modal).addEventListener('click',()=>setType('income'));
  $('#save-tx',modal).addEventListener('click',()=>{
    const amt=parseFloat($('#tx-amt',modal).value),name=$('#tx-name',modal).value.trim();
    if(!amt||!name)return;
    const isRec=$('#tx-rec',modal).checked,cat=$('#tx-cat',modal).value,finalAmt=type==='expense'?-amt:amt;
    const accId=$('#tx-acc',modal)?.value||undefined;
    const tx={id:genId(),name,category:cat,amount:finalAmt,date:$('#tx-date',modal).value,note:$('#tx-note',modal).value||'',recurring:isRec,accountId:accId};
    State.txs=[tx,...State.txs].sort((a,b)=>b.date.localeCompare(a.date));
    closeModal(modal);showToast('Transaction added ✓');navigate(State.page);
    saveAndSync('txs', State.txs, ()=>SB.addTx(State.user.id,tx));
    applyTxToAccount(tx);
    if(isRec){const day=parseInt(tx.date.split('-')[2])||1;const r={id:genId(),name,amount:finalAmt,category:cat,dayOfMonth:Math.min(day,28)};tx.recurringId=r.id;State.recurring.push(r);saveAndSync('recurring',State.recurring,()=>SB.saveRecurring(State.user.id,State.recurring));}
  });
  $('#tx-amt',modal).focus();
}

function showImportModal(){
  const modal=document.createElement('div');modal.className='overlay';
  modal.innerHTML=`<div class="modal" role="dialog" aria-modal="true" style="max-width:520px"><div class="mh"><div class="mt-modal">${IC.upload} Import CSV</div><button class="xbtn" aria-label="Close" id="xm">✕</button></div>
    <div class="alert-strip info" style="margin-bottom:14px">💡 Accepts CSV exports from most banks. Needs <strong>Date, Description, Amount</strong> columns.</div>
    <div class="dropzone" id="dz"><div class="dropzone-icon">📂</div><div class="dropzone-label">Drop your CSV file here</div><div class="dropzone-sub">or click to browse</div><input type="file" id="csv-file" accept=".csv" style="display:none"></div>
    <div id="csv-prev" style="display:none"><div class="fbc mt16 mb8"><div style="font-size:13px;font-weight:700" id="csv-sum"></div><button class="btn btn-ghost btn-sm" id="resel">Change file</button></div><div style="overflow-x:auto"><table class="csv-tbl" id="csv-tbl"><thead></thead><tbody></tbody></table></div><div class="ig mt16"><label class="il">Category (applied to all imports)</label><select class="input" id="csv-cat">${CATS.filter(c=>c.id!=='income').map(c=>`<option value="${c.id}">${esc(c.emoji)} ${esc(c.name)}</option>`).join('')}</select></div></div>
    <div class="fac gap10 mt16"><button class="btn btn-ghost w100" id="cancel-imp" style="justify-content:center">Cancel</button><button class="btn btn-primary w100" id="save-imp" style="display:none;justify-content:center">${IC.download} Import</button></div>
  </div>`;
  openModal(modal);
  let parsedRows=[];
  modal.addEventListener('click',e=>{if(e.target===modal)closeModal(modal)});
  $('#xm',modal).addEventListener('click',()=>closeModal(modal));
  $('#cancel-imp',modal).addEventListener('click',()=>closeModal(modal));
  const dz=$('#dz',modal);
  dz.addEventListener('click',()=>$('#csv-file',modal).click());
  dz.addEventListener('dragover',e=>{e.preventDefault();dz.classList.add('over')});
  dz.addEventListener('dragleave',()=>dz.classList.remove('over'));
  dz.addEventListener('drop',e=>{e.preventDefault();dz.classList.remove('over');processFile(e.dataTransfer.files[0])});
  $('#csv-file',modal).addEventListener('change',e=>processFile(e.target.files[0]));
  $('#resel',modal)?.addEventListener('click',()=>{$('#csv-prev',modal).style.display='none';dz.style.display='';$('#save-imp',modal).style.display='none';parsedRows=[]});
  function processFile(file){
    if(!file||!file.name.endsWith('.csv'))return showToast('Please select a .csv file','var(--red)');
    const reader=new FileReader();
    reader.onload=e=>{
      const lines=e.target.result.trim().split('\n').filter(l=>l.trim());if(lines.length<2)return;
      const headers=lines[0].split(',').map(h=>h.trim().replace(/^"|"$/g,'').toLowerCase());
      const dateIdx=headers.findIndex(h=>h.includes('date')),descIdx=headers.findIndex(h=>['desc','name','memo','narration','description','payee'].some(k=>h.includes(k))),amtIdx=headers.findIndex(h=>['amount','debit','credit','sum','value'].some(k=>h.includes(k)));
      if(dateIdx<0||amtIdx<0)return showToast('Could not detect columns','var(--red)');
      parsedRows=[];
      lines.slice(1,201).forEach(line=>{const cols=line.split(',').map(c=>c.trim().replace(/^"|"$/g,''));const rawAmt=parseFloat((cols[amtIdx]||'').replace(/[$,()]/g,''));if(isNaN(rawAmt))return;let ds=cols[dateIdx]||todayStr();try{const d=new Date(ds);if(!isNaN(d))ds=d.toISOString().split('T')[0]}catch{}parsedRows.push({date:ds,name:(descIdx>=0?cols[descIdx]:'Transaction')||'Transaction',amount:rawAmt})});
      if(!parsedRows.length)return showToast('No valid rows found','var(--red)');
      const thead=$('#csv-tbl thead',modal),tbody=$('#csv-tbl tbody',modal);
      if(thead)thead.innerHTML=`<tr><th>Date</th><th>Description</th><th>Amount</th></tr>`;
      if(tbody)tbody.innerHTML=parsedRows.slice(0,8).map(r=>`<tr><td>${fmtDate(r.date)}</td><td style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(r.name)}</td><td style="color:${r.amount<0?'var(--red)':'var(--green)'};font-weight:700">${r.amount<0?'-':'+'} $${Math.abs(r.amount).toFixed(2)}</td></tr>`).join('')+(parsedRows.length>8?`<tr><td colspan="3" style="color:var(--text3);font-size:11px">…and ${parsedRows.length-8} more</td></tr>`:'');
      $('#csv-sum',modal).textContent=`${parsedRows.length} transactions found`;
      dz.style.display='none';$('#csv-prev',modal).style.display='';$('#save-imp',modal).style.display='flex';
    };
    reader.readAsText(file);
  }
  $('#save-imp',modal).addEventListener('click',async()=>{
    if(!parsedRows.length)return;
    const cat=$('#csv-cat',modal).value;
    const newTxs=parsedRows.map(r=>({id:genId(),name:r.name,category:cat,amount:r.amount,date:r.date,note:'Imported from CSV',recurring:false}));
    State.txs=[...newTxs,...State.txs].sort((a,b)=>b.date.localeCompare(a.date));
    closeModal(modal);showToast(`${newTxs.length} transactions imported ✓`);navigate(State.page);
    saveAndSync('txs',State.txs,()=>SB.addTxsBatch(State.user.id,newTxs));
  });
}

function showBulkEditModal(txs){
  if(!txs.length)return showToast('No transactions to edit','var(--red)');
  const modal=document.createElement('div');modal.className='overlay';
  let selected=new Set();
  const renderList=()=>{
    const listEl=$('#bulk-list',modal);if(!listEl)return;
    listEl.innerHTML=txs.slice(0,50).map(t=>{const cat=getCat(t.category);return`<label style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--border);cursor:pointer"><input type="checkbox" ${selected.has(t.id)?'checked':''} data-cid="${t.id}" style="accent-color:var(--green);width:16px;height:16px;flex-shrink:0"><div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(t.name)}</div><div style="font-size:11px;color:var(--text2)">${fmtDate(t.date)}</div></div><div style="font-size:13px;font-weight:800;color:${t.amount<0?'var(--red)':'var(--green)'};white-space:nowrap">${t.amount<0?'-':'+'} ${fmtK(Math.abs(t.amount))}</div></label>`}).join('');
    $$('[data-cid]',modal).forEach(cb=>cb.addEventListener('change',()=>{if(cb.checked)selected.add(cb.dataset.cid);else selected.delete(cb.dataset.cid);$('#bulk-count',modal).textContent=selected.size+' selected';}));
  };
  modal.innerHTML=`<div class="modal" role="dialog" aria-modal="true" style="max-width:500px">
    <div class="mh"><div class="mt-modal">Bulk Edit Transactions</div><button class="xbtn" aria-label="Close" id="xm">✕</button></div>
    <div class="fac gap10 mb12">
      <button class="btn btn-ghost btn-sm" id="sel-all">Select All</button>
      <button class="btn btn-ghost btn-sm" id="sel-none">Clear</button>
      <span style="font-size:13px;color:var(--text2);margin-left:auto" id="bulk-count">0 selected</span>
    </div>
    <div id="bulk-list" style="max-height:280px;overflow-y:auto"></div>
    <div class="ig mt16"><label class="il">Change Category To</label><select class="input" id="bulk-cat">${CATS.filter(c=>c.id!=='income').map(c=>`<option value="${c.id}">${esc(c.emoji)} ${esc(c.name)}</option>`).join('')}</select></div>
    <div class="fac gap10 mt8">
      <button class="btn btn-danger btn-sm" id="bulk-del" style="white-space:nowrap">${IC.trash} Delete Selected</button>
      <button class="btn btn-primary w100" id="bulk-apply" style="justify-content:center">Apply Category</button>
    </div>
  </div>`;
  openModal(modal);
  renderList();
  modal.addEventListener('click',e=>{if(e.target===modal)closeModal(modal)});
  $('#xm',modal).addEventListener('click',()=>closeModal(modal));
  $('#sel-all',modal).addEventListener('click',()=>{txs.slice(0,50).forEach(t=>selected.add(t.id));renderList();$('#bulk-count',modal).textContent=selected.size+' selected';});
  $('#sel-none',modal).addEventListener('click',()=>{selected.clear();renderList();$('#bulk-count',modal).textContent='0 selected';});
  $('#bulk-apply',modal).addEventListener('click',()=>{
    if(!selected.size)return showToast('Select at least one transaction','var(--red)');
    const cat=$('#bulk-cat',modal).value;
    State.txs.forEach(t=>{if(selected.has(t.id))t.category=cat;});
    saveAndSync('txs',State.txs,()=>SB.addTxsBatch(State.user.id,State.txs.filter(t=>selected.has(t.id))));
    closeModal(modal);showToast(selected.size+' transactions updated ✓');renderTransactions();
  });
  $('#bulk-del',modal).addEventListener('click',()=>{
    if(!selected.size)return;
    if(!confirm('Delete '+selected.size+' transactions?'))return;
    State.txs=State.txs.filter(t=>!selected.has(t.id));
    saveAndSync('txs',State.txs,()=>Promise.all([...selected].map(id=>SB.deleteTx(id))));
    closeModal(modal);showToast(selected.size+' transactions deleted');renderTransactions();
  });
}

function exportCSV(){
  const rows=[['Date','Description','Category','Amount','Note']];
  const csvEsc = s => '"' + String(s||'').replace(/"/g, '""') + '"';
  State.txs.forEach(t=>rows.push([t.date, csvEsc(t.name), getCat(t.category).name, t.amount, csvEsc(t.note||'')]));
  const blob=new Blob([rows.map(r=>r.join(',')).join('\n')],{type:'text/csv'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`bedrock-${todayStr()}.csv`;a.click();
  showToast('CSV exported ✓');
}

function wireSwipeDelete(){
  $$('.tx-item').forEach(row=>{
    let startX=0,startY=0,swiped=false;
    row.addEventListener('touchstart',e=>{
      startX=e.touches[0].clientX;
      startY=e.touches[0].clientY;
      swiped=false;
    },{passive:true});
    row.addEventListener('touchmove',e=>{
      const dx=startX-e.touches[0].clientX;
      const dy=Math.abs(startY-e.touches[0].clientY);
      if(dy>dx)return; // vertical scroll — ignore
      if(dx>30){row.classList.add('swiping');swiped=true;}
      else if(dx<-10){row.classList.remove('swiping');swiped=false;}
    },{passive:true});
    row.addEventListener('touchend',()=>{
      if(!swiped) row.classList.remove('swiping');
    });
    /* Tap the red area to confirm delete */
    row.querySelector('[data-swipe-del]')?.addEventListener('click',()=>{
      const id=row.dataset.txid;
      row.style.transition='transform .2s, opacity .2s';
      row.style.transform='translateX(-100%)';row.style.opacity='0';
      setTimeout(()=>delTxWithUndo(id),200);
    });
  });
}

export { renderTransactions, delTxWithUndo, delTx, applyTxToAccount,
         showAddTxModal, showImportModal, txHTML, accLabel, accSelectHTML,
         wireSwipeDelete, exportCSV };
