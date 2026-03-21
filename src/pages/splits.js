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

function renderSplits(){
  const splits=State.splits;
  render(`
  <div class="ph"><div><div class="pt">Split Expenses</div><div class="ps">Track shared costs with friends and family</div></div><button class="btn btn-primary" id="btn-add-split">${IC.plus} Add Split</button></div>
  ${splits.length?`<div class="g2 mb16">
    <div class="rstat"><div class="rstat-lbl">You're Owed</div><div class="rstat-val" style="color:var(--green)">${fmt(splits.filter(s=>!s.settled&&s.owedToMe).reduce((t,s)=>t+s.amount/s.people.length*(s.people.length-1),0))}</div></div>
    <div class="rstat"><div class="rstat-lbl">You Owe</div><div class="rstat-val" style="color:var(--red)">${fmt(splits.filter(s=>!s.settled&&!s.owedToMe).reduce((t,s)=>t+s.amount/s.people.length,0))}</div></div>
  </div>`:''}
  <div class="card">
    ${splits.length?splits.map((s,i)=>{
      const perPerson=Math.round(s.amount/s.people.length*100)/100;
      return`<div class="split-item">
        <div style="flex:1;min-width:0">
          <div style="font-size:14px;font-weight:700">${esc(s.description||"")}</div>
          <div style="font-size:12px;color:var(--text2);margin-top:3px">${s.people.join(', ')} · ${fmtK(s.amount)} total · ${fmtK(perPerson)} each</div>
          <div style="font-size:11px;color:var(--text3);margin-top:2px">${fmtDate(s.date)}</div>
        </div>
        <span class="split-status ${s.settled?'split-settled':'split-pending'}">${s.settled?'✓ Settled':'Pending'}</span>
        <div style="display:flex;gap:6px">
          ${!s.settled?`<button class="btn btn-ghost btn-xs" data-settle="${i}">Settle</button>`:''}
          <button class="btn btn-danger btn-xs" data-del-split="${i}">${IC.trash}</button>
        </div>
      </div>`;
    }).join(''):`<div class="empty"><div class="empty-icon">🤝</div><div class="empty-title">No splits yet</div><div class="empty-sub">Add a shared expense and track who owes what</div></div>`}
  </div>`,
  ()=>{
    $('#btn-add-split')?.addEventListener('click',showAddSplitModal);
    $$('[data-settle]').forEach(b=>b.addEventListener('click',()=>{State.splits[parseInt(b.dataset.settle)].settled=true;saveSplits(State.splits);renderSplits();showToast('Marked as settled ✓')}));
    $$('[data-del-split]').forEach(b=>b.addEventListener('click',()=>{State.splits.splice(parseInt(b.dataset.delSplit),1);saveSplits(State.splits);renderSplits();}));
  });
}

function showAddSplitModal(){
  const modal=document.createElement('div');modal.className='overlay';
  modal.innerHTML=`<div class="modal" role="dialog" aria-modal="true">
    <div class="mh"><div class="mt-modal">Add Split Expense</div><button class="xbtn" aria-label="Close" id="xm">✕</button></div>
    <div class="ig"><label class="il">Description</label><input class="input" id="sp-desc" type="text" placeholder="e.g. Dinner at Mario's, Airbnb"></div>
    <div class="ig"><label class="il">Total Amount</label><div class="amt-wrap"><span class="amt-prefix">$</span><input class="input" id="sp-amt" type="number" min="0" placeholder="0.00" inputmode="decimal"></div></div>
    <div class="ig"><label class="il">Date</label><input class="input" id="sp-date" type="date" value="${todayStr()}"></div>
    <div class="ig"><label class="il">Split With (names, comma separated)</label><input class="input" id="sp-people" type="text" placeholder="e.g. Alex, Sam, Jordan"></div>
    <div class="ig"><label class="il">Who paid?</label>
      <select class="input" id="sp-payer"><option value="me">Me (I'm owed)</option><option value="them">Someone else (I owe)</option></select>
    </div>
    <div class="fac gap10 mt8">
      <button class="btn btn-ghost w100" id="cancel-sp" style="justify-content:center">Cancel</button>
      <button class="btn btn-primary w100" id="save-sp" style="justify-content:center">Add Split</button>
    </div>
  </div>`;
  openModal(modal);
  modal.addEventListener('click',e=>{if(e.target===modal)closeModal(modal)});
  $('#xm',modal).addEventListener('click',()=>closeModal(modal));
  $('#cancel-sp',modal).addEventListener('click',()=>closeModal(modal));
  $('#save-sp',modal).addEventListener('click',()=>{
    const desc=$('#sp-desc',modal).value.trim();
    const amt=parseFloat($('#sp-amt',modal).value)||0;
    const peopleStr=$('#sp-people',modal).value.trim();
    if(!desc||amt<=0||!peopleStr)return showToast('Fill in all fields','var(--red)');
    const people=peopleStr.split(',').map(p=>p.trim()).filter(Boolean);
    const owedToMe=$('#sp-payer',modal).value==='me';
    State.splits.push({id:genId(),description:desc,amount:amt,people,owedToMe,date:$('#sp-date',modal).value,settled:false});
    saveSplits(State.splits);closeModal(modal);showToast('Split added ✓');renderSplits();
  });
  $('#sp-desc',modal).focus();
}

function generateSpendingNarrative(){
  const now=new Date();
  const narratives=[];

  // Compare each category this month vs same month last year
  const thisMonth=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const lastYearMonth=`${now.getFullYear()-1}-${String(now.getMonth()+1).padStart(2,'0')}`;

  CATS.filter(c=>c.id!=='income'&&c.id!=='other').forEach(cat=>{
    const thisSpend=Math.abs(State.txs.filter(t=>t.date.startsWith(thisMonth)&&t.category===cat.id&&t.amount<0).reduce((s,t)=>s+t.amount,0));
    const lastYearSpend=Math.abs(State.txs.filter(t=>t.date.startsWith(lastYearMonth)&&t.category===cat.id&&t.amount<0).reduce((s,t)=>s+t.amount,0));
    if(thisSpend>0&&lastYearSpend>0){
      const pct=((thisSpend-lastYearSpend)/lastYearSpend)*100;
      if(Math.abs(pct)>15) narratives.push({cat,thisSpend,lastYearSpend,pct});
    }
  });

  // Month with highest spend per category (last 6 months)
  const highMonths=[];
  CATS.filter(c=>c.id!=='income').forEach(cat=>{
    const monthly={};
    State.txs.filter(t=>t.category===cat.id&&t.amount<0).forEach(t=>{
      const ym=t.date.slice(0,7);
      monthly[ym]=(monthly[ym]||0)+Math.abs(t.amount);
    });
    const entries=Object.entries(monthly).sort((a,b)=>b[1]-a[1]);
    if(entries.length>=3){
      const [topMonth,topAmt]=entries[0];
      const avgAmt=entries.slice(0,6).reduce((s,[,v])=>s+v,0)/Math.min(6,entries.length);
      if(topAmt>avgAmt*1.4&&topMonth===thisMonth){
        highMonths.push({cat,topAmt,avgAmt,month:topMonth});
      }
    }
  });

  return{narratives:narratives.slice(0,3),highMonths:highMonths.slice(0,2)};
}


export { renderSplits };
