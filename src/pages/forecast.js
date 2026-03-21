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
import { drawForecastChart } from '../charts.js';
import { monthStats }         from '../stats.js';

function renderForecast(){
  const ms=monthStats(State.txs,0);
  const defContrib='';
  const defStart='';

  render(`
  <div class="ph"><div><div class="pt">Savings Forecast</div><div class="ps">See where your savings could take you</div></div></div>
  <div class="card mb16">
    <div class="card-title">Configure Your Projection</div>
    <div class="fc-input-grid">
      <div class="ig" style="margin:0"><label class="il">Starting Balance</label><div class="amt-wrap"><span class="amt-prefix">$</span><input class="input" id="fc-start" type="number" min="0" placeholder="e.g. 5000" inputmode="decimal"></div></div>
      <div class="ig" style="margin:0"><label class="il">Regular Contribution</label><div class="amt-wrap"><span class="amt-prefix">$</span><input class="input" id="fc-contrib" type="number" min="0" placeholder="e.g. 500" inputmode="decimal"></div></div>
      <div class="ig" style="margin:0"><label class="il">Contribution Frequency</label><select class="input" id="fc-period"><option value="weekly">Weekly</option><option value="biweekly">Bi-Weekly</option><option value="monthly" selected>Monthly</option><option value="yearly">Yearly</option></select></div>
      <div class="ig" style="margin:0"><label class="il">Time Horizon</label><select class="input" id="fc-years">${[1,2,3,5,10,15,20,25,30].map(y=>`<option value="${y}" ${y===5?'selected':''}>${y} year${y>1?'s':''}</option>`).join('')}</select></div>
      <div class="ig" style="margin:0"><label class="il">Annual Interest Rate (%)</label><input class="input" id="fc-rate" type="number" min="0" max="30" step="0.1" placeholder="e.g. 4.5" inputmode="decimal"></div>
      <div class="ig" style="margin:0"><label class="il">Compounding</label><select class="input" id="fc-compound"><option value="monthly" selected>Monthly</option><option value="annually">Annually</option><option value="daily">Daily</option></select></div>
    </div>
    <button class="btn btn-primary" id="fc-calc" style="margin-top:16px;justify-content:center;width:100%">📈 Calculate Projection</button>
  </div>
  <div id="fc-results" style="display:none">
    <div class="g3 mb16" id="fc-summary"></div>
    <div class="card mb16">
      <div class="fbc mb14">
        <div class="card-title" style="margin:0">Growth Over Time</div>
        <div class="legend">
          <span class="legend-item"><span class="legend-dot" style="background:var(--green)"></span>With Interest</span>
          <span class="legend-item"><span class="legend-dot" style="background:var(--purple)"></span>No Interest</span>
          <span class="legend-item"><span class="legend-dot" style="background:var(--text3)"></span>Deposits Only</span>
        </div>
      </div>
      <canvas id="fc-chart" role="img" aria-label="Savings forecast growth over time chart" style="width:100%;height:260px"></canvas>
    </div>
    <div class="g2 mb16">
      <div class="card"><div class="card-title">Milestones</div><div id="fc-milestones"></div></div>
      <div class="card"><div class="card-title">Interest Breakdown</div><div id="fc-breakdown"></div></div>
    </div>
    <div class="card">
      <div class="fbc mb14"><div class="card-title" style="margin:0">Year-by-Year Table</div><button class="btn btn-ghost btn-sm" id="fc-export">📄 Export CSV</button></div>
      <div style="overflow-x:auto"><table class="fc-table" id="fc-table"></table></div>
    </div>
  </div>`,
  ()=>{
    $('#fc-calc').addEventListener('click',runForecast);
    ['fc-start','fc-contrib','fc-period','fc-years','fc-rate','fc-compound'].forEach(id=>{
      $('#'+id)?.addEventListener('change',runForecast);
    });
    runForecast();
  });
}

function runForecast(){
  const start=parseFloat($('#fc-start')?.value)||0;
  const contrib=parseFloat($('#fc-contrib')?.value)||0;
  const period=$('#fc-period')?.value||'monthly';
  const years=parseInt($('#fc-years')?.value)||5;
  const rate=parseFloat($('#fc-rate')?.value)||0;
  const compound=$('#fc-compound')?.value||'monthly';
  const monthlyContrib=period==='weekly'?contrib*52/12:period==='biweekly'?contrib*26/12:period==='yearly'?contrib/12:contrib;
  const n=compound==='daily'?365:compound==='annually'?1:12;
  const months=years*12;

  const withInt=[],noInt=[],depOnly=[];
  let bW=start,bN=start,bD=start;
  for(let m=0;m<=months;m++){
    withInt.push(Math.round(bW));noInt.push(Math.round(bN));depOnly.push(Math.round(bD));
    if(m<months){
      if(rate>0){const pr=(rate/100)/n,pm=n/12;bW=bW*Math.pow(1+pr,pm)+monthlyContrib;}else{bW+=monthlyContrib;}
      bN+=monthlyContrib;bD+=monthlyContrib;
    }
  }

  const finalW=withInt[months],finalN=noInt[months];
  const totalDep=start+monthlyContrib*months;
  const intEarned=finalW-totalDep;

  /* Summary cards */
  const sumEl=$('#fc-summary');
  if(sumEl)sumEl.innerHTML=`
    <div class="fc-result-box" style="background:var(--green-dim);border-color:rgba(14,201,154,.25)">
      <div class="fc-result-label">Final Balance</div>
      <div class="fc-result-val" style="color:var(--green)">${fmt(finalW)}</div>
      <div class="fc-result-sub">After ${years} year${years>1?'s':''}</div>
    </div>
    <div class="fc-result-box" style="background:var(--purple-dim);border-color:rgba(139,120,245,.25)">
      <div class="fc-result-label">Interest Earned</div>
      <div class="fc-result-val" style="color:var(--purple)">${fmt(Math.max(0,intEarned))}</div>
      <div class="fc-result-sub">At ${rate}% ${compound}</div>
    </div>
    <div class="fc-result-box" style="background:var(--card2)">
      <div class="fc-result-label">Total Deposited</div>
      <div class="fc-result-val">${fmt(totalDep)}</div>
      <div class="fc-result-sub">${fmt(monthlyContrib)}/mo × ${months} months</div>
    </div>`;

  /* Chart */
  const canvas=$('#fc-chart');
  if(canvas){
    const step=Math.max(1,Math.floor(months/60));
    const labels=[],d1=[],d2=[],d3=[];
    for(let m=0;m<=months;m+=step){
      const yr=m/12;labels.push(yr%1===0?`Yr ${yr}`:'');
      d1.push(withInt[m]);d2.push(noInt[m]);d3.push(depOnly[m]);
    }
    drawForecastChart(canvas,labels,d1,d2,d3);
  }

  /* Milestones */
  const msEl=$('#fc-milestones');
  if(msEl){
    const targets=[1000,5000,10000,25000,50000,100000,250000,500000,1000000].filter(t=>t>start&&t<=finalW*1.1);
    const colors=['#3b82f6','#4ec9ff','#8b78f5','#ff9f43','#ff4d6a','#ffd166','#c56cf0','#48dbfb','#ff6b9d'];
    msEl.innerHTML=targets.length?targets.map((t,i)=>{
      const mo=withInt.findIndex(v=>v>=t);if(mo<0)return'';
      const yr=Math.floor(mo/12),mn=mo%12;
      const ts=yr>0?`${yr}y${mn>0?' '+mn+'m':''}`:mn+'mo';
      return`<div class="fc-milestone"><div class="fc-m-dot" style="background:${colors[i%colors.length]}"></div><div style="flex:1"><div style="font-size:13px;font-weight:700">${fmtK(t)}</div><div style="font-size:11px;color:var(--text2)">reached in ${ts}</div></div><span class="badge" style="background:${colors[i%colors.length]}22;color:${colors[i%colors.length]}">${ts}</span></div>`;
    }).filter(Boolean).join('')||'<div class="muted" style="padding:10px 0">Increase contributions to hit milestones</div>'
    :'<div class="muted" style="padding:10px 0">No milestones in this range yet</div>';
  }

  /* Breakdown */
  const bkEl=$('#fc-breakdown');
  if(bkEl){
    const pctC=finalW>0?((totalDep/finalW)*100).toFixed(1):100;
    const pctI=finalW>0?(Math.max(0,intEarned)/finalW*100).toFixed(1):0;
    bkEl.innerHTML=`
      <div style="margin-bottom:14px"><div class="fbc mb6" style="font-size:13px"><span style="color:var(--green);font-weight:700">Contributions</span><span style="font-weight:800">${fmt(totalDep)} (${pctC}%)</span></div><div class="pbar" style="height:10px"><div class="pfill" style="width:${pctC}%;background:var(--green)"></div></div></div>
      <div style="margin-bottom:14px"><div class="fbc mb6" style="font-size:13px"><span style="color:var(--purple);font-weight:700">Interest Earned</span><span style="font-weight:800">${fmt(Math.max(0,intEarned))} (${pctI}%)</span></div><div class="pbar" style="height:10px"><div class="pfill" style="width:${pctI}%;background:var(--purple)"></div></div></div>
      ${rate>0?`<div class="alert-strip info" style="margin-top:8px;padding:10px 12px;font-size:12px">💡 Interest adds <strong>${fmt(Math.max(0,finalW-finalN))}</strong> extra vs saving without interest</div>`:'<div class="muted" style="font-size:12px;margin-top:8px">Add an interest rate to see compound growth</div>'}`;
  }

  /* Year table */
  const tEl=$('#fc-table');
  if(tEl){
    tEl.innerHTML=`<thead><tr><th>Year</th><th>With Interest</th><th>No Interest</th><th>Deposited</th><th>Interest So Far</th></tr></thead>
    <tbody>${Array.from({length:years+1},(_,y)=>{
      const m=Math.min(y*12,months);
      return`<tr><td style="font-weight:700;color:var(--text2)">${y===0?'Now':'Yr '+y}</td><td style="font-weight:800;color:var(--green)">${fmt(withInt[m])}</td><td style="color:var(--text2)">${fmt(noInt[m])}</td><td>${fmt(depOnly[m])}</td><td style="color:${withInt[m]-depOnly[m]>0?'var(--purple)':'var(--text2)'}">${withInt[m]-depOnly[m]>0?'+':''}${fmt(withInt[m]-depOnly[m])}</td></tr>`;
    }).join('')}</tbody>`;
  }

  const res=$('#fc-results');if(res)res.style.display='';

  $('#fc-export')?.addEventListener('click',()=>{
    const rows=[['Year','With Interest','No Interest','Deposited','Interest']];
    for(let y=0;y<=years;y++){const m=Math.min(y*12,months);rows.push([y,withInt[m],noInt[m],depOnly[m],(withInt[m]-depOnly[m]).toFixed(2)]);}
    const blob=new Blob([rows.map(r=>r.join(',')).join('\n')],{type:'text/csv'});
    const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`bedrock-forecast-${years}yr.csv`;a.click();
    showToast('Exported ✓');
  });
}


export { renderForecast };
