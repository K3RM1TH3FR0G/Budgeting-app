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
import { drawLoanChart, drawDonut } from '../charts.js';

function renderLoans(){
  render(`
  <div class="ph">
    <div><div class="pt">Loan Calculator</div><div class="ps">Mortgage, auto, personal — see total cost & monthly payment</div></div>
  </div>

  <!-- LOAN TYPE TABS -->
  <div class="tabs mb16" id="loan-tabs">
    <button class="tab active" data-ltype="mortgage">🏠 Mortgage</button>
    <button class="tab" data-ltype="auto">🚗 Auto Loan</button>
    <button class="tab" data-ltype="personal">💰 Personal Loan</button>
  </div>

  <!-- INPUTS -->
  <div class="card mb16">
    <div class="card-title" id="loan-card-title">Mortgage Details</div>
    <div class="fc-input-grid">
      <div class="ig" style="margin:0">
        <label class="il">Loan Amount</label>
        <div class="amt-wrap"><span class="amt-prefix">$</span><input class="input" id="ln-amount" type="number" min="0" placeholder="e.g. 300000" inputmode="decimal"></div>
      </div>
      <div class="ig" style="margin:0">
        <label class="il">Annual Interest Rate (%)</label>
        <input class="input" id="ln-rate" type="number" min="0" max="30" step="0.01" placeholder="e.g. 6.5" inputmode="decimal">
      </div>
      <div class="ig" style="margin:0">
        <label class="il">Loan Term</label>
        <select class="input" id="ln-term">
          <option value="360">30 years</option>
          <option value="240">20 years</option>
          <option value="180">15 years</option>
          <option value="120">10 years</option>
          <option value="84">7 years</option>
          <option value="60">5 years</option>
          <option value="48">4 years</option>
          <option value="36">3 years</option>
          <option value="24">2 years</option>
          <option value="12">1 year</option>
        </select>
      </div>
      <div class="ig" style="margin:0" id="ln-down-wrap">
        <label class="il">Down Payment</label>
        <div class="amt-wrap"><span class="amt-prefix">$</span><input class="input" id="ln-down" type="number" min="0" placeholder="e.g. 60000" inputmode="decimal"></div>
      </div>
    </div>

    <!-- PREFERRED MONTHLY PAYMENT -->
    <div class="divider"></div>
    <div style="font-size:12px;font-weight:800;color:var(--text3);letter-spacing:.8px;text-transform:uppercase;margin-bottom:10px">— Or work backwards from a monthly payment —</div>
    <div class="fc-input-grid">
      <div class="ig" style="margin:0">
        <label class="il">Preferred Monthly Payment</label>
        <div class="amt-wrap"><span class="amt-prefix">$</span><input class="input" id="ln-pref-payment" type="number" min="0" placeholder="e.g. 1500" inputmode="decimal"></div>
      </div>
      <div style="display:flex;align-items:flex-end;padding-bottom:13px">
        <button class="btn btn-ghost btn-sm" id="ln-calc-term" style="white-space:nowrap">Calculate Term →</button>
      </div>
    </div>
    <div id="ln-term-result" style="display:none" class="alert-strip info" style="margin-top:0"></div>

    <button class="btn btn-primary mt16" id="ln-calc" style="width:100%;justify-content:center">Calculate</button>
  </div>

  <!-- RESULTS -->
  <div id="ln-results" style="display:none">
    <!-- SUMMARY -->
    <div class="g3 mb16" id="ln-summary"></div>

    <!-- WHAT IF I PAY MORE? -->
    <div class="card mb16">
      <div class="card-title">💡 What If I Pay More Each Month?</div>
      <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">
        <div style="flex:1;min-width:200px">
          <label class="il">Extra monthly payment</label>
          <div class="amt-wrap"><span class="amt-prefix">$</span><input class="input" id="ln-extra" type="number" min="0" value="0" placeholder="0" inputmode="decimal"></div>
        </div>
        <div id="ln-extra-result" style="flex:2;min-width:200px;font-size:13px;color:var(--text2)">Enter an extra amount to see how much you'd save</div>
      </div>
    </div>

    <!-- AMORTISATION CHART -->
    <div class="card mb16">
      <div class="fbc mb14">
        <div class="card-title" style="margin:0">Balance Over Time</div>
        <div class="legend">
          <span class="legend-item"><span class="legend-dot" style="background:var(--red)"></span>Remaining Balance</span>
          <span class="legend-item"><span class="legend-dot" style="background:var(--purple)"></span>Total Interest Paid</span>
          <span class="legend-item"><span class="legend-dot" style="background:var(--green)"></span>Principal Paid</span>
        </div>
      </div>
      <canvas id="ln-chart" role="img" aria-label="Loan balance over time chart" style="width:100%;height:240px"></canvas>
    </div>

    <!-- BREAKDOWN PIE + STATS -->
    <div class="g2 mb16">
      <div class="card">
        <div class="card-title">Payment Breakdown</div>
        <canvas id="ln-donut" role="img" aria-label="Loan payment breakdown chart" style="width:130px;height:130px;display:block;margin:0 auto 14px"></canvas>
        <div id="ln-breakdown"></div>
      </div>
      <div class="card">
        <div class="card-title">Key Milestones</div>
        <div id="ln-milestones"></div>
      </div>
    </div>

    <!-- AMORTISATION TABLE (collapsed by default) -->
    <div class="card">
      <div class="fbc mb14">
        <div class="card-title" style="margin:0">Amortisation Schedule</div>
        <div class="flex gap8">
          <button class="btn btn-ghost btn-sm" id="ln-toggle-table">Show Full Table</button>
          <button class="btn btn-ghost btn-sm" id="ln-export">📄 CSV</button>
        </div>
      </div>
      <div style="overflow-x:auto"><table class="fc-table" id="ln-table"></table></div>
    </div>
  </div>`,
  ()=>{
    // Tab switching
    $$('[data-ltype]').forEach(b=>b.addEventListener('click',()=>{
      $$('[data-ltype]').forEach(x=>x.classList.remove('active'));
      b.classList.add('active');
      const t=b.dataset.ltype;
      // Set sensible defaults per loan type
      if(t==='mortgage'){$('#ln-amount').value='300000';$('#ln-rate').value='6.5';$('#ln-term').value='360';$('#ln-down').value='60000';$('#ln-down-wrap').style.display='';$('#loan-card-title').textContent='Mortgage Details';}
      else if(t==='auto'){$('#ln-amount').value='35000';$('#ln-rate').value='7.5';$('#ln-term').value='60';$('#ln-down').value='5000';$('#ln-down-wrap').style.display='';$('#loan-card-title').textContent='Auto Loan Details';}
      else{$('#ln-amount').value='15000';$('#ln-rate').value='12.0';$('#ln-term').value='48';$('#ln-down').value='0';$('#ln-down-wrap').style.display='none';$('#loan-card-title').textContent='Personal Loan Details';}
      runLoanCalc();
    }));

    $('#ln-calc').addEventListener('click',runLoanCalc);
    ['ln-amount','ln-rate','ln-term','ln-down'].forEach(id=>$('#'+id)?.addEventListener('change',runLoanCalc));
    $('#ln-extra')?.addEventListener('input',updateExtraPayment);

    // Work-backwards from preferred payment
    $('#ln-calc-term')?.addEventListener('click',()=>{
      const pref=parseFloat($('#ln-pref-payment')?.value)||0;
      const principal=(parseFloat($('#ln-amount')?.value)||0)-(parseFloat($('#ln-down')?.value)||0);
      const rate=(parseFloat($('#ln-rate')?.value)||0)/100/12;
      if(!pref||!principal||!rate){showToast('Fill in loan amount, rate, and preferred payment','var(--red)');return;}
      if(pref<=principal*rate){$('#ln-term-result').style.display='';$('#ln-term-result').className='alert-strip danger';$('#ln-term-result').textContent='⚠️ Payment too low — doesn\'t cover monthly interest of '+fmt(principal*rate);return;}
      const n=Math.ceil(-Math.log(1-(principal*rate/pref))/Math.log(1+rate));
      const years=Math.floor(n/12),months=n%12;
      const totalCost=pref*n,totalInterest=totalCost-principal;
      $('#ln-term-result').style.display='';
      $('#ln-term-result').className='alert-strip info';
      $('#ln-term-result').textContent=`✓ ${fmt(pref)}/mo pays off in ${years>0?years+'y ':''} ${months>0?months+'mo':''}  ·  Total interest: ${fmt(totalInterest)}`;
    });

    runLoanCalc();
  });
}

function runLoanCalc(){
  const loanAmt=(parseFloat($('#ln-amount')?.value)||0);
  const downAmt=(parseFloat($('#ln-down')?.value)||0);
  const principal=Math.max(0,loanAmt-downAmt);
  const annualRate=parseFloat($('#ln-rate')?.value)||0;
  const termMonths=parseInt($('#ln-term')?.value)||360;
  const monthlyRate=annualRate/100/12;

  if(principal<=0||annualRate<=0){$('#ln-results').style.display='none';return;}

  // Monthly payment formula
  let monthlyPayment;
  if(monthlyRate===0){
    monthlyPayment=principal/termMonths;
  } else {
    monthlyPayment=principal*(monthlyRate*Math.pow(1+monthlyRate,termMonths))/(Math.pow(1+monthlyRate,termMonths)-1);
  }

  const totalPaid=monthlyPayment*termMonths;
  const totalInterest=totalPaid-principal;
  const termYears=termMonths/12;

  // Build full amortisation schedule
  const schedule=[];
  let balance=principal;
  let cumInterest=0,cumPrincipal=0;
  for(let m=1;m<=termMonths;m++){
    const intPayment=balance*monthlyRate;
    const prinPayment=Math.min(monthlyPayment-intPayment,balance);
    balance=Math.max(0,balance-prinPayment);
    cumInterest+=intPayment;
    cumPrincipal+=prinPayment;
    schedule.push({month:m,payment:monthlyPayment,interest:intPayment,principal:prinPayment,balance,cumInterest,cumPrincipal});
  }

  // Store for extra payment updates
  window._lnSchedule=schedule;
  window._lnPrincipal=principal;
  window._lnMonthlyPayment=monthlyPayment;
  window._lnRate=monthlyRate;
  window._lnTermMonths=termMonths;

  // Summary cards
  const sumEl=$('#ln-summary');
  if(sumEl) sumEl.innerHTML=`
    <div class="fc-result-box" style="background:var(--green-dim);border-color:rgba(14,201,154,.25)">
      <div class="fc-result-label">Monthly Payment</div>
      <div class="fc-result-val" style="color:var(--green)">${fmt(monthlyPayment)}</div>
      <div class="fc-result-sub">${termYears % 1===0?termYears+' year':termMonths+' month'} term</div>
    </div>
    <div class="fc-result-box" style="background:var(--red-dim);border-color:rgba(255,77,106,.25)">
      <div class="fc-result-label">Total Interest</div>
      <div class="fc-result-val" style="color:var(--red)">${fmt(totalInterest)}</div>
      <div class="fc-result-sub">${((totalInterest/principal)*100).toFixed(0)}% of loan amount</div>
    </div>
    <div class="fc-result-box" style="background:var(--card2)">
      <div class="fc-result-label">Total Cost</div>
      <div class="fc-result-val">${fmt(totalPaid)}</div>
      <div class="fc-result-sub">${downAmt>0?'+ '+fmt(downAmt)+' down payment':fmt(principal)+' principal'}</div>
    </div>`;

  // Chart — sample down to ~60 points
  const canvas=$('#ln-chart');
  if(canvas){
    const step=Math.max(1,Math.floor(termMonths/60));
    const labels=[],dBal=[],dInt=[],dPrin=[];
    labels.push('Now');dBal.push(Math.round(principal));dInt.push(0);dPrin.push(0);
    for(let i=step-1;i<schedule.length;i+=step){
      const s=schedule[i];const yr=s.month/12;
      labels.push(yr%1===0?'Yr '+yr:'');
      dBal.push(Math.round(s.balance));
      dInt.push(Math.round(s.cumInterest));
      dPrin.push(Math.round(s.cumPrincipal));
    }
    drawLoanChart(canvas,labels,dBal,dInt,dPrin);
  }

  // Donut breakdown
  const donutEl=$('#ln-donut');
  if(donutEl) drawDonut(donutEl,[{value:Math.round(principal),color:'#3b82f6'},{value:Math.round(totalInterest),color:'#ff4d6a'}]);

  // Breakdown text
  const bkEl=$('#ln-breakdown');
  if(bkEl){
    const pPct=((principal/totalPaid)*100).toFixed(0);
    const iPct=((totalInterest/totalPaid)*100).toFixed(0);
    bkEl.innerHTML=`
      <div style="margin-bottom:12px"><div class="fbc mb6" style="font-size:13px"><span style="color:var(--green);font-weight:700">Principal</span><span style="font-weight:800">${fmt(principal)} (${pPct}%)</span></div><div class="pbar" style="height:8px"><div class="pfill" style="width:${pPct}%;background:var(--green)"></div></div></div>
      <div><div class="fbc mb6" style="font-size:13px"><span style="color:var(--red);font-weight:700">Interest</span><span style="font-weight:800">${fmt(totalInterest)} (${iPct}%)</span></div><div class="pbar" style="height:8px"><div class="pfill" style="width:${iPct}%;background:var(--red)"></div></div></div>
      ${downAmt>0?`<div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border);font-size:12px;color:var(--text2)">Down payment: <strong style="color:var(--text)">${fmt(downAmt)}</strong> (${((downAmt/loanAmt)*100).toFixed(0)}% of purchase price)</div>`:''}`;
  }

  // Milestones — when is 25%, 50%, 75% paid off
  const msEl=$('#ln-milestones');
  if(msEl){
    const targets=[0.25,0.5,0.75,1.0];
    const icons=['🥉','🥈','🥇','🎉'];
    msEl.innerHTML=targets.map((t,i)=>{
      const target=principal*t;
      const mo=schedule.findIndex(s=>s.cumPrincipal>=target);
      if(mo<0)return'';
      const s=schedule[mo];
      const yr=Math.floor(s.month/12),mn=s.month%12;
      const timeStr=yr>0?yr+'y'+(mn>0?' '+mn+'m':''):mn+'mo';
      return`<div class="fc-milestone"><div class="fc-m-dot" style="background:${['#ff9f43','#4ec9ff','#8b78f5','#3b82f6'][i]}"></div><div style="flex:1"><div style="font-size:13px;font-weight:700">${(t*100).toFixed(0)}% paid off ${icons[i]}</div><div style="font-size:11px;color:var(--text2)">After ${timeStr} · Balance ${fmt(s.balance)}</div></div></div>`;
    }).filter(Boolean).join('');
  }

  // Amortisation table — show yearly summary by default
  renderLoanTable(schedule,false);
  $('#ln-results').style.display='';

  // Wire export
  $('#ln-export')?.addEventListener('click',()=>{
    const rows=[['Month','Payment','Principal','Interest','Balance','Cumulative Interest']];
    schedule.forEach(s=>rows.push([s.month,s.payment.toFixed(2),s.principal.toFixed(2),s.interest.toFixed(2),s.balance.toFixed(2),s.cumInterest.toFixed(2)]));
    const blob=new Blob([rows.map(r=>r.join(',')).join('\n')],{type:'text/csv'});
    const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='flo-loan-schedule.csv';a.click();
    showToast('Schedule exported ✓');
  });

  let tableExpanded=false;
  $('#ln-toggle-table')?.addEventListener('click',()=>{
    tableExpanded=!tableExpanded;
    renderLoanTable(schedule,tableExpanded);
    $('#ln-toggle-table').textContent=tableExpanded?'Show Yearly Summary':'Show Full Table';
  });

  updateExtraPayment();
}

function renderLoanTable(schedule,full){
  const tEl=$('#ln-table');if(!tEl)return;
  const rows=full?schedule:schedule.filter((_,i)=>(i+1)%12===0);
  tEl.innerHTML=`<thead><tr>
    <th>${full?'Month':'Year'}</th>
    <th>Payment</th>
    <th>Principal</th>
    <th>Interest</th>
    <th>Balance</th>
  </tr></thead>
  <tbody>${rows.map(s=>`<tr>
    <td style="font-weight:700;color:var(--text2)">${full?s.month:'Yr '+(s.month/12).toFixed(0)}</td>
    <td style="font-weight:700">${fmt(s.payment)}</td>
    <td style="color:var(--green)">${fmt(s.principal)}</td>
    <td style="color:var(--red)">${fmt(s.interest)}</td>
    <td style="font-weight:800">${fmt(s.balance)}</td>
  </tr>`).join('')}</tbody>`;
}

function updateExtraPayment(){
  const extra=parseFloat($('#ln-extra')?.value)||0;
  const schedule=window._lnSchedule;
  const principal=window._lnPrincipal;
  const monthlyPayment=window._lnMonthlyPayment;
  const rate=window._lnRate;
  const termMonths=window._lnTermMonths;
  if(!schedule||!principal){return;}

  const resEl=$('#ln-extra-result');if(!resEl)return;
  if(extra<=0){resEl.textContent='Enter an extra amount to see how much you\'d save';return;}

  // Recalculate with extra payment
  let balance=principal,month=0,totalInt=0;
  while(balance>0&&month<termMonths*2){
    const intPmt=balance*rate;
    const prinPmt=Math.min(monthlyPayment+extra-intPmt,balance);
    if(prinPmt<=0)break;
    balance=Math.max(0,balance-prinPmt);
    totalInt+=intPmt;month++;
  }

  const origTotalInt=schedule[schedule.length-1].cumInterest;
  const savedInt=origTotalInt-totalInt;
  const origMonths=termMonths;
  const savedMonths=origMonths-month;
  const savedYrs=Math.floor(savedMonths/12),savedMo=savedMonths%12;

  resEl.innerHTML=`<div style="background:var(--green-dim);border:1px solid rgba(14,201,154,.2);border-radius:var(--rsm);padding:12px 14px">
    <div style="font-size:13px;font-weight:700;color:var(--green);margin-bottom:4px">You'd save ${fmt(savedInt)} in interest</div>
    <div style="font-size:12px;color:var(--text2)">Paid off ${savedYrs>0?savedYrs+'y ':''} ${savedMo>0?savedMo+'mo ':''} earlier · Total: ${fmt(totalInt+principal)}</div>
  </div>`;
}


export { renderLoans };
