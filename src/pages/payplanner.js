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

function getPayPlannerSettings(){ return State.user ? Cache.get(State.user.id,'pay_planner',{payAmt:'',payFreq:'Bi-Weekly',savePct:20}) : {}; }

function savePayPlannerSettings(s){ if(State.user) Cache.set(State.user.id,'pay_planner',s); }

function renderPayPlanner(){
  const saved = getPayPlannerSettings();

  /* ── Bills: split into those with known amounts and those without ── */
  const allBills        = State.bills||[];
  const billsWithAmt    = allBills.filter(b=>b.amount>0);
  const billsWithoutAmt = allBills.filter(b=>!(b.amount>0));
  const monthlyBills    = billsWithAmt.reduce((s,b)=>s+b.amount, 0);

  /* ── Recurring expenses (negative amounts = expenses) ── */
  const recurringExpenses = (State.recurring||[]).filter(r=>r.amount<0);
  const monthlyRecurring  = recurringExpenses.reduce((s,r)=>s+Math.abs(r.amount), 0);

  /* ── Budgets: useful fallback — shows what the user planned to spend ── */
  const monthlyBudgeted = (State.budgets||[])
    .filter(b=>!['savings','income'].includes(b.categoryId))
    .reduce((s,b)=>s+b.amount, 0);

  const totalMonthlyFixed = monthlyBills + monthlyRecurring;

  const PAY_FREQS = [
    {label:'Weekly',        perYear:52},
    {label:'Bi-Weekly',     perYear:26},
    {label:'Twice a Month', perYear:24},
    {label:'Monthly',       perYear:12},
  ];

  /* Source detail lines for the info strip */
  const sourceLines = [];
  if(billsWithAmt.length)    sourceLines.push(`${billsWithAmt.length} bill${billsWithAmt.length>1?'s':''} with amounts: <strong>${fmt(monthlyBills)}/mo</strong>`);
  if(recurringExpenses.length) sourceLines.push(`${recurringExpenses.length} recurring expense${recurringExpenses.length>1?'s':''}: <strong>${fmt(monthlyRecurring)}/mo</strong>`);
  if(billsWithoutAmt.length) sourceLines.push(`<span style="color:var(--orange)">${billsWithoutAmt.length} bill${billsWithoutAmt.length>1?'s':''} have no amount set yet — open the Bills page to add them</span>`);

  render(`
  <div class="ph">
    <div><div class="pt">Pay Planner</div><div class="ps">See how far each paycheck really goes</div></div>
  </div>

  <!-- INPUTS -->
  <div class="card mb16">
    <div class="card-title">Your Income</div>
    <div class="g2" style="margin-bottom:14px">
      <div class="ig" style="margin:0">
        <label class="il" for="pp-amt">Take-home pay per paycheck (after tax)</label>
        <div class="amt-wrap"><span class="amt-prefix">$</span>
          <input class="input" id="pp-amt" type="number" min="0" step="0.01" inputmode="decimal"
            placeholder="e.g. 2250" value="${saved.payAmt||''}" style="font-size:22px;font-weight:800;padding:12px 12px 12px 26px">
        </div>
      </div>
      <div class="ig" style="margin:0">
        <label class="il" for="pp-freq">Pay frequency</label>
        <select class="input" id="pp-freq" style="height:54px">
          ${PAY_FREQS.map(f=>`<option ${(saved.payFreq||'Bi-Weekly')===f.label?'selected':''}>${esc(f.label)}</option>`).join('')}
        </select>
      </div>
    </div>
    <!-- Fixed bills notice -->
    ${totalMonthlyFixed>0 ? `
    <div class="alert-strip info" style="margin:0;font-size:12px;flex-direction:column;align-items:flex-start;gap:4px">
      <div>📋 <strong>${fmt(totalMonthlyFixed)}/mo</strong> in fixed expenses detected:</div>
      ${sourceLines.map(l=>`<div style="margin-left:20px">• ${l}</div>`).join('')}
    </div>` : `
    <div class="alert-strip warn" style="margin:0;font-size:12px;flex-direction:column;align-items:flex-start;gap:6px">
      <div><strong>No fixed expenses found yet.</strong> Bills will appear here once you set amounts for them.</div>
      ${billsWithoutAmt.length ? `<div>• ${billsWithoutAmt.length} bill${billsWithoutAmt.length>1?'s':''} exist but have no amount — <span class="link" id="pp-go-bills" style="font-size:12px">open Bills to add amounts</span></div>` : ''}
      ${recurringExpenses.length===0&&allBills.length===0 ? `<div>• Add bills on the <span class="link" id="pp-go-bills2" style="font-size:12px">Bills page</span> or recurring expenses in Settings</div>` : ''}
      ${monthlyBudgeted>0 ? `<div style="margin-top:4px;color:var(--text2)">💡 Your budgets total <strong>${fmt(monthlyBudgeted)}/mo</strong> — you can use that as a rough estimate of monthly spending.</div>` : ''}
    </div>`}
  </div>

  <!-- SAVINGS SLIDER -->
  <div class="card mb16" id="pp-results" style="${saved.payAmt?'':'display:none'}">
    <div class="fbc mb4">
      <div class="card-title" style="margin:0">Savings Rate</div>
      <div style="font-size:22px;font-weight:900;color:var(--accent)" id="pp-pct-label">${saved.savePct||20}%</div>
    </div>
    <div style="font-size:12px;color:var(--text2);margin-bottom:10px">Drag to set how much of your paycheck goes straight to savings before anything else.</div>
    <input type="range" class="pay-slider" id="pp-slider" min="0" max="50" step="1" value="${saved.savePct||20}"
      aria-label="Savings rate" aria-valuemin="0" aria-valuemax="50" aria-valuenow="${saved.savePct||20}" aria-valuetext="${saved.savePct||20}% savings rate">
    <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--text3);margin-top:2px"><span>0% (save nothing)</span><span>50% (save half)</span></div>

    <!-- VISUAL BREAKDOWN BAR -->
    <div class="pay-breakdown-bar" id="pp-bar" style="margin-top:16px"></div>
    <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:18px" id="pp-legend"></div>

    <!-- STAT CARDS -->
    <div class="g2 mb8" id="pp-stats"></div>

    <!-- MONTHLY VIEW -->
    <div id="pp-monthly" style="margin-top:8px"></div>
  </div>

  <!-- EMPTY state shown until pay amount is entered -->
  <div id="pp-empty" class="card" style="${saved.payAmt?'display:none':''}">
    <div class="empty"><div class="empty-icon">💵</div>
      <div class="empty-title">Enter your paycheck above</div>
      <div class="empty-sub">Fill in your take-home pay and frequency to see your breakdown</div>
    </div>
  </div>`,
  ()=>{
    const recalc = ()=>{
      const amt   = parseFloat($('#pp-amt')?.value)||0;
      const freq  = $('#pp-freq')?.value||'Bi-Weekly';
      const pct   = parseInt($('#pp-slider')?.value)||0;
      const freqObj = PAY_FREQS.find(f=>f.label===freq)||PAY_FREQS[1];

      /* Persist */
      savePayPlannerSettings({payAmt:amt||'', payFreq:freq, savePct:pct});

      /* Update pct label + slider aria */
      const lbl=$('#pp-pct-label'); if(lbl)lbl.textContent=pct+'%';
      const sl=$('#pp-slider');
      if(sl){ sl.setAttribute('aria-valuenow',pct); sl.setAttribute('aria-valuetext',pct+'% savings rate'); }

      if(!amt){
        const r=$('#pp-results'),e=$('#pp-empty');
        if(r)r.style.display='none'; if(e)e.style.display='';
        return;
      }
      const r=$('#pp-results'),e=$('#pp-empty');
      if(r)r.style.display=''; if(e)e.style.display='none';

      /* ── NEW ORDER: savings off the full paycheck first,
            bills eat into the spendable remainder ── */
      const billsPerPay   = totalMonthlyFixed * 12 / freqObj.perYear;
      const savingsAmt    = amt * (pct / 100);            // savings = % of full paycheck
      const spendablePool = amt - savingsAmt;             // everything not saved
      const freeToSpend   = Math.max(0, spendablePool - billsPerPay); // after bills
      const billsOverflow = Math.max(0, billsPerPay - spendablePool); // bills exceed spendable

      /* Breakdown bar — order: Savings | Bills | Free to spend */
      const total = amt;
      const sPct  = total>0?(savingsAmt/total*100).toFixed(1):0;
      const bPct  = total>0?(Math.min(billsPerPay,spendablePool)/total*100).toFixed(1):0;
      const fPct  = total>0?(freeToSpend/total*100).toFixed(1):0;

      const bar = $('#pp-bar');
      if(bar) bar.innerHTML = [
        {label:'Savings',      pct:sPct, color:'#3b82f6', amt:savingsAmt},
        {label:'Bills',        pct:bPct, color:'#f87171', amt:billsPerPay},
        {label:'Free to spend',pct:fPct, color:'#a78bfa', amt:freeToSpend},
      ].filter(seg=>parseFloat(seg.pct)>0)
       .map(seg=>`<div class="pay-breakdown-seg" style="width:${seg.pct}%;background:${seg.color}">${parseFloat(seg.pct)>8?seg.label:''}</div>`).join('');

      const legend = $('#pp-legend');
      if(legend) legend.innerHTML = [
        {label:'Savings',       color:'#3b82f6', amt:savingsAmt},
        {label:'Bills',         color:'#f87171', amt:billsPerPay},
        {label:'Free to spend', color:'#a78bfa', amt:freeToSpend},
      ].map(s=>`<div style="display:flex;align-items:center;gap:6px;font-size:12px;font-weight:700">
        <div style="width:10px;height:10px;border-radius:3px;background:${s.color};flex-shrink:0"></div>
        <span style="color:var(--text2)">${s.label}</span>
        <span style="color:var(--text)">${fmt(s.amt)}</span>
      </div>`).join('')+(billsOverflow>0?`<div style="font-size:11px;color:var(--red);font-weight:700;width:100%;margin-top:4px">⚠️ Bills exceed spendable by ${fmt(billsOverflow)} — consider reducing savings rate or cutting a bill</div>`:'');

      /* Stat cards */
      const stats = $('#pp-stats');
      if(stats) stats.innerHTML = `
        <div class="pay-stat">
          <div class="pay-stat-lbl">Free to spend per paycheck</div>
          <div class="pay-stat-val" style="color:var(--purple)">${fmt(freeToSpend)}</div>
          <div class="pay-stat-sub">After ${pct}% savings &amp; bills</div>
        </div>
        <div class="pay-stat">
          <div class="pay-stat-lbl">Savings per paycheck</div>
          <div class="pay-stat-val" style="color:var(--accent)">${fmt(savingsAmt)}</div>
          <div class="pay-stat-sub">${pct}% of your full paycheck</div>
        </div>
        <div class="pay-stat">
          <div class="pay-stat-lbl">Bills &amp; recurring per paycheck</div>
          <div class="pay-stat-val" style="color:var(--red)">${fmt(billsPerPay)}</div>
          <div class="pay-stat-sub">${totalMonthlyFixed>0?`${fmt(totalMonthlyFixed)}/mo across ${billsWithAmt.length+recurringExpenses.length} source${billsWithAmt.length+recurringExpenses.length!==1?'s':''}${billsWithoutAmt.length?` · <span style="color:var(--orange)">${billsWithoutAmt.length} missing amounts</span>`:''}`:billsWithoutAmt.length?`<span style="color:var(--orange)">${billsWithoutAmt.length} bill${billsWithoutAmt.length>1?'s':''} need amounts set</span>`:'No bills detected yet'}</div>
        </div>
        <div class="pay-stat">
          <div class="pay-stat-lbl">Free to spend per day</div>
          <div class="pay-stat-val" style="color:var(--purple)">${fmt(freeToSpend * freqObj.perYear / 365)}</div>
          <div class="pay-stat-sub">If spread evenly over the year</div>
        </div>`;

      /* Monthly view */
      const monthly = $('#pp-monthly');
      if(monthly){
        const perMonth   = amt * freqObj.perYear / 12;
        const saveMo     = perMonth * (pct / 100);
        const spendMoPool= perMonth - saveMo;
        const billsMo    = totalMonthlyFixed;
        const freeMo     = Math.max(0, spendMoPool - billsMo);
        const overflowMo = Math.max(0, billsMo - spendMoPool);
        monthly.innerHTML = `
          <div style="background:var(--card2);border-radius:var(--rsm);padding:14px">
            <div style="font-size:11px;font-weight:800;letter-spacing:.8px;text-transform:uppercase;color:var(--text3);margin-bottom:12px">Monthly Equivalent</div>
            <div class="wp-summary-row"><span>Income/mo</span><span style="font-weight:800">${fmt(perMonth)}</span></div>
            <div class="wp-summary-row"><span style="color:var(--accent)">− Savings (${pct}%)</span><span style="font-weight:800;color:var(--accent)">−${fmt(saveMo)}</span></div>
            <div class="wp-summary-row"><span style="color:var(--text2)">= Spendable pool</span><span style="font-weight:800">${fmt(spendMoPool)}</span></div>
            <div class="wp-summary-row"><span style="color:var(--red)">− Bills &amp; recurring</span><span style="font-weight:800;color:var(--red)">−${fmt(billsMo)}</span></div>
            <div class="wp-summary-row" style="border-top:2px solid var(--border2);padding-top:10px;margin-top:2px">
              <span style="font-weight:800;font-size:14px">Free to spend</span>
              <span style="font-weight:900;font-size:18px;color:var(--purple)">${fmt(freeMo)}</span>
            </div>
            ${overflowMo>0?`<div style="font-size:11px;color:var(--red);font-weight:700;margin-top:8px">⚠️ Bills exceed your spendable pool by ${fmt(overflowMo)}/mo</div>`:''}
          </div>`;
      }
    };

    $('#pp-amt')?.addEventListener('input', recalc);
    $('#pp-amt')?.addEventListener('keydown', e=>{if(e.key==='Enter') recalc();});
    $('#pp-freq')?.addEventListener('change', recalc);
    $('#pp-slider')?.addEventListener('input', recalc);
    $('#pp-go-bills')?.addEventListener('click',()=>navigate('bills'));
    $('#pp-go-bills2')?.addEventListener('click',()=>navigate('bills'));
    recalc();
  });
}


export { renderPayPlanner, getPayPlannerSettings, savePayPlannerSettings };
