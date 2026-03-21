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
import { drawBarChart, drawLineChart, drawStackedBar,
          drawHorizBars, drawPieChart, drawTreemap,
          drawRadar, drawSankey }   from '../charts.js';
import { monthStats, generateInsights,
          detectSubscriptions }     from '../stats.js';

function renderReports(period='month', chartType='bar'){
  const now=new Date();let labels=[],spent=[],earned=[];
  if(period==='week'){for(let i=6;i>=0;i--){const d=new Date(now);d.setDate(d.getDate()-i);const ds=d.toISOString().split('T')[0];const day=State.txs.filter(t=>t.date===ds);labels.push(d.toLocaleDateString('en-US',{weekday:'short'}));spent.push(Math.round(Math.abs(day.filter(t=>t.amount<0).reduce((s,t)=>s+t.amount,0))));earned.push(Math.round(day.filter(t=>t.amount>0).reduce((s,t)=>s+t.amount,0)))}}
  else if(period==='month'){const days=new Date(now.getFullYear(),now.getMonth()+1,0).getDate();for(let i=1;i<=days;i++){const ds=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(i).padStart(2,'0')}`;const day=State.txs.filter(t=>t.date===ds);labels.push(String(i));spent.push(Math.round(Math.abs(day.filter(t=>t.amount<0).reduce((s,t)=>s+t.amount,0))));earned.push(Math.round(day.filter(t=>t.amount>0).reduce((s,t)=>s+t.amount,0)))}}
  else{for(let i=11;i>=0;i--){const target=new Date(now.getFullYear(),now.getMonth()-i,1),ym=`${target.getFullYear()}-${String(target.getMonth()+1).padStart(2,'0')}`;const mTxs=State.txs.filter(t=>t.date.startsWith(ym));labels.push(target.toLocaleDateString('en-US',{month:'short'}));spent.push(Math.round(Math.abs(mTxs.filter(t=>t.amount<0).reduce((s,t)=>s+t.amount,0))));earned.push(Math.round(mTxs.filter(t=>t.amount>0).reduce((s,t)=>s+t.amount,0)))}}
  const tIncome=earned.reduce((a,b)=>a+b,0),tExpenses=spent.reduce((a,b)=>a+b,0),tSavings=tIncome-tExpenses;
  let startDs='';
  if(period==='week'){const d=new Date(now);d.setDate(d.getDate()-7);startDs=d.toISOString().split('T')[0]}
  else if(period==='month')startDs=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`;
  else{const d=new Date(now.getFullYear()-1,now.getMonth(),1);startDs=d.toISOString().split('T')[0]}
  const catTotals={};State.txs.filter(t=>t.date>=startDs&&t.amount<0).forEach(t=>{catTotals[t.category]=(catTotals[t.category]||0)+Math.abs(t.amount)});
  const catData=Object.entries(catTotals).sort((a,b)=>b[1]-a[1]).slice(0,8).map(([cat,val])=>({id:cat,name:getCat(cat).emoji+' '+getCat(cat).name,shortName:getCat(cat).name,value:Math.round(val),color:getCat(cat).color}));
  const tabs=['week','month','year'].map(p=>`<button class="tab ${period===p?'active':''}" data-period="${p}">${p.charAt(0).toUpperCase()+p.slice(1)}</button>`).join('');
  const nwHistHTML=renderNWHistoryHTML();

  // Chart type definitions
  const CHARTS=[
    {id:'bar',       label:'Bar',        icon:'📊', desc:'Income vs Expenses'},
    {id:'line',      label:'Line',       icon:'📈', desc:'Trend over time'},
    {id:'stacked',   label:'Stacked',    icon:'🗂️', desc:'Income / Expense / Saved'},
    {id:'pie',       label:'Pie',        icon:'🥧', desc:'Spending by category'},
    {id:'treemap',   label:'Treemap',    icon:'🌳', desc:'Category proportions'},
    {id:'radar',     label:'Radar',      icon:'🕸️', desc:'Category spending shape'},
    {id:'sankey',    label:'Sankey',     icon:'🔀', desc:'Money flow'},
  ];

  const chartPicker=`<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px">
    ${CHARTS.map(c=>`<button class="chart-pick-btn ${chartType===c.id?'active':''}" data-chart="${c.id}" title="${c.desc}">
      <span>${c.icon}</span><span>${c.label}</span>
    </button>`).join('')}
  </div>`;

  // Legend for current chart
  const legends={
    bar:`<div class="legend"><span class="legend-item"><span class="legend-dot" style="background:#0ec99a"></span>Income</span><span class="legend-item"><span class="legend-dot" style="background:#ff4d6a"></span>Expenses</span></div>`,
    line:`<div class="legend"><span class="legend-item"><span class="legend-dot" style="background:#0ec99a"></span>Income</span><span class="legend-item"><span class="legend-dot" style="background:#ff4d6a"></span>Expenses</span></div>`,
    stacked:`<div class="legend"><span class="legend-item"><span class="legend-dot" style="background:#0ec99a"></span>Income</span><span class="legend-item"><span class="legend-dot" style="background:#ff4d6a"></span>Expenses</span><span class="legend-item"><span class="legend-dot" style="background:#4ec9ff"></span>Savings</span></div>`,
    pie:catData.length?`<div class="legend" style="flex-wrap:wrap">${catData.map(c=>`<span class="legend-item"><span class="legend-dot" style="background:${c.color}"></span>${esc(c.name)}</span>`).join('')}</div>`:'',
    treemap:catData.length?`<div style="font-size:12px;color:var(--text2)">Size = spending amount · Click a cell to highlight</div>`:'',
    radar:catData.length?`<div style="font-size:12px;color:var(--text2)">Each axis = a spending category · Outer = higher spend</div>`:'',
    sankey:`<div style="font-size:12px;color:var(--text2)">Follow the flow: Income → Spending Categories</div>`,
  };

  const chartTitle=CHARTS.find(c=>c.id===chartType)?.desc||'Chart';
  const needsHeight={bar:220,line:220,stacked:220,pie:320,treemap:320,radar:300,sankey:360};

  render(`
  <div class="ph"><div><div class="pt">Reports</div><div class="ps">Your financial breakdown</div></div>
  <div class="flex gap8" style="flex-wrap:wrap">
    <div class="tabs">${tabs}</div>
    <button class="btn btn-ghost btn-sm" id="btn-compare">📅 Compare</button>
    <button class="btn btn-ghost btn-sm" id="btn-pdf">📄 PDF</button>
  </div></div>
  <div class="g3 mb16">
    <div class="rstat"><div class="rstat-lbl">Total Income</div><div class="rstat-val" style="color:var(--green)">$${tIncome.toLocaleString()}</div></div>
    <div class="rstat"><div class="rstat-lbl">Total Spent</div><div class="rstat-val" style="color:var(--red)">$${tExpenses.toLocaleString()}</div></div>
    <div class="rstat"><div class="rstat-lbl">Net Savings</div><div class="rstat-val" style="color:${tSavings>=0?'var(--green)':'var(--red)'}">${tSavings>=0?'+':''}$${Math.abs(tSavings).toLocaleString()}</div></div>
  </div>
  <div class="card mb16">
    <div class="fbc mb12">
      <div class="card-title" style="margin:0">${chartTitle}</div>
      ${legends[chartType]||''}
    </div>
    ${chartPicker}
    ${catData.length===0&&['pie','treemap','sankey'].includes(chartType)?
      `<div class="empty" style="padding:40px 0"><div class="empty-icon">📊</div><div class="empty-title">No spending data yet</div><div class="empty-sub">Add some transactions to see this chart</div></div>`
      :`<canvas id="main-chart" role="img" aria-label="Monthly income and expenses chart" style="width:100%;height:${needsHeight[chartType]||220}px"></canvas>`
    }
  </div>
  <div class="card mb16"><div class="card-title">Category Breakdown</div><canvas class="chart" id="horiz-chart" role="img" aria-label="Category spending horizontal bar chart" style="width:100%"></canvas></div>
  ${nwHistHTML}
  ${renderBillCalendarHTML()}
  <div class="card">
    <div class="card-title">Planning Tools</div>
    <div class="g2">
      <button class="btn btn-ghost" id="btn-emergency" style="justify-content:flex-start;gap:10px;padding:14px">🛡️ Emergency Fund</button>
      <button class="btn btn-ghost" id="btn-retirement" style="justify-content:flex-start;gap:10px;padding:14px">🏖️ Retirement</button>
      <button class="btn btn-ghost" id="btn-whatif" style="justify-content:flex-start;gap:10px;padding:14px">🔮 What-If</button>
      <button class="btn btn-ghost" id="btn-debt-nav" style="justify-content:flex-start;gap:10px;padding:14px">💳 Debt Tracker</button>
    </div>
  </div>`,
  ()=>{
    $$('[data-period]').forEach(b=>b.addEventListener('click',()=>renderReports(b.dataset.period,chartType)));
    $$('[data-chart]').forEach(b=>b.addEventListener('click',()=>renderReports(period,b.dataset.chart)));
    $('#btn-pdf')?.addEventListener('click',()=>setTimeout(()=>window.print(),150));
    $('#btn-compare')?.addEventListener('click',showMonthComparisonModal);
    $('#btn-emergency')?.addEventListener('click',showEmergencyFundCalculator);
    $('#btn-retirement')?.addEventListener('click',showRetirementEstimator);
    $('#btn-whatif')?.addEventListener('click',showWhatIfModal);
    $('#btn-debt-nav')?.addEventListener('click',()=>navigate('debts'));

    const mc=$('#main-chart');
    if(mc){
      if(chartType==='bar')     drawBarChart(mc,{labels,datasets:[{data:earned,color:'#3b82f6'},{data:spent,color:'#ff4d6a'}]});
      else if(chartType==='line')    drawLineChart(mc,labels,earned,spent);
      else if(chartType==='stacked') drawStackedBar(mc,labels,earned,spent);
      else if(chartType==='pie')     {mc.style.height='320px';drawPieChart(mc,catData);}
      else if(chartType==='treemap') drawTreemap(mc,catData);
      else if(chartType==='radar')   drawRadar(mc,catData);
      else if(chartType==='sankey')  drawSankey(mc,tIncome,catData,tSavings);
    }
    const hc=$('#horiz-chart');if(hc&&catData.length)drawHorizBars(hc,catData);
    const nhc=$('#nw-hist-chart');
    if(nhc){const hist=getNWHistory();drawAreaChart(nhc,{labels:hist.map(h=>h.month.slice(5)),datasets:[{data:hist.map(h=>h.value),color:'#8b78f5'}]});}
  });
}

function renderBillCalendarHTML(){
  const now=new Date(),year=now.getFullYear(),month=now.getMonth();
  const firstDay=new Date(year,month,1).getDay();
  const daysInMonth=new Date(year,month+1,0).getDate();
  const today=now.getDate();
  const days=['Su','Mo','Tu','We','Th','Fr','Sa'];
  // Bill days from recurring
  const billDays={};
  State.recurring.filter(r=>r.amount<0).forEach(r=>{
    const d=r.dayOfMonth||1;
    if(!billDays[d])billDays[d]=[];
    billDays[d].push(r);
  });
  const headerCells=days.map(d=>`<div class="cal-header">${d}</div>`).join('');
  const emptyCells=Array(firstDay).fill('<div></div>').join('');
  const dayCells=Array.from({length:daysInMonth},(_,i)=>{
    const d=i+1;const bills=billDays[d]||[];const past=d<today;const isToday=d===today;
    return`<div class="cal-day ${isToday?'today':''} ${bills.length?'has-bill':''} ${past&&d!==today?'past':''}">
      <span style="font-size:11px;font-weight:${isToday?'900':'600'}">${d}</span>
      ${bills.length?`<div class="cal-bill-dot" title="${bills.map(b=>b.name).join(', ')}"></div>`:''}
    </div>`;
  }).join('');
  const upcomingBills=State.recurring.filter(r=>r.amount<0&&r.dayOfMonth>=today).sort((a,b)=>a.dayOfMonth-b.dayOfMonth).slice(0,4);
  return`<div class="card mb16">
    <div class="fbc mb12"><div class="card-title" style="margin:0">📅 Bill Calendar — ${now.toLocaleDateString('en-US',{month:'long'})}</div><span class="badge b-red">${Object.keys(billDays).length} bills</span></div>
    <div class="cal-grid">${headerCells}${emptyCells}${dayCells}</div>
    ${upcomingBills.length?`<div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--border)"><div style="font-size:11px;font-weight:800;color:var(--text3);letter-spacing:.8px;text-transform:uppercase;margin-bottom:8px">Upcoming</div>${upcomingBills.map(b=>`<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;font-size:13px"><span>Day ${b.dayOfMonth} · ${esc(b.name)}</span><span style="font-weight:800;color:var(--red)">${fmtK(Math.abs(b.amount))}</span></div>`).join('')}</div>`:''}
  </div>`;
}

function renderNWHistoryHTML(){
  const history=getNWHistory();
  if(history.length<2)return'';
  const labels=history.map(h=>h.month.slice(5)),values=history.map(h=>h.value);
  return`<div class="card mb16">
    <div class="card-title">Net Worth History</div>
    <canvas id="nw-hist-chart" role="img" aria-label="Net worth history chart" style="width:100%;height:180px"></canvas>
  </div>`;
}

function renderSpendingTrendsHTML(){
  const {narratives,highMonths}=generateSpendingNarrative();
  if(!narratives.length&&!highMonths.length)return'';

  const items=[
    ...narratives.map(n=>{
      const dir=n.pct>0?'up':'down';
      const color=n.pct>0?'var(--orange)':'var(--green)';
      const month=new Date().toLocaleDateString('en-US',{month:'long'});
      return`<div class="insight-row">
        <div class="insight-ico" style="background:${n.cat.color}22">${n.pct>0?'📈':'📉'}</div>
        <div><div class="insight-title" style="color:${color}">${esc(n.cat.name)} is ${dir} ${Math.abs(n.pct).toFixed(0)}% vs last ${month}</div>
        <div class="insight-body">${fmtK(n.thisSpend)} this month vs ${fmtK(n.lastYearSpend)} same month last year</div></div>
      </div>`;
    }),
    ...highMonths.map(h=>`<div class="insight-row">
      <div class="insight-ico" style="background:${h.cat.color}22">🔥</div>
      <div><div class="insight-title">${esc(h.cat.name)} spending is unusually high</div>
      <div class="insight-body">${fmtK(h.topAmt)} this month vs ${fmtK(Math.round(h.avgAmt))} average — ${((h.topAmt/h.avgAmt-1)*100).toFixed(0)}% above normal</div></div>
    </div>`),
  ];

  if(!items.length)return'';
  return`<div class="card mb16">
    <div class="fbc mb12"><div class="card-title" style="margin:0">📊 Spending Trends</div></div>
    ${items.join('')}
  </div>`;
}

function showMonthComparisonModal(){
  const now=new Date();
  const months=[];
  for(let i=0;i<12;i++){
    const d=new Date(now.getFullYear(),now.getMonth()-i,1);
    months.push({value:`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`,label:d.toLocaleDateString('en-US',{month:'long',year:'numeric'})});
  }
  const modal=document.createElement('div');modal.className='overlay';
  modal.innerHTML=`<div class="modal" role="dialog" aria-modal="true" style="max-width:560px">
    <div class="mh"><div class="mt-modal">📅 Month Comparison</div><button class="xbtn" aria-label="Close" id="xm">✕</button></div>
    <div class="g2 mb14">
      <div class="ig" style="margin:0"><label class="il">Month A</label><select class="input" id="cmp-a">${months.map((m,i)=>`<option value="${m.value}" ${i===1?'selected':''}>${m.label}</option>`).join('')}</select></div>
      <div class="ig" style="margin:0"><label class="il">Month B</label><select class="input" id="cmp-b">${months.map((m,i)=>`<option value="${m.value}" ${i===0?'selected':''}>${m.label}</option>`).join('')}</select></div>
    </div>
    <div id="cmp-results"></div>
    <button class="btn btn-ghost w100 mt16" id="close-cmp" style="justify-content:center">Close</button>
  </div>`;
  openModal(modal);
  modal.addEventListener('click',e=>{if(e.target===modal)closeModal(modal)});
  $('#xm',modal).addEventListener('click',()=>closeModal(modal));
  $('#close-cmp',modal).addEventListener('click',()=>closeModal(modal));
  const runCmp=()=>{
    const mA=$('#cmp-a',modal).value,mB=$('#cmp-b',modal).value;
    const txA=State.txs.filter(t=>t.date.startsWith(mA));
    const txB=State.txs.filter(t=>t.date.startsWith(mB));
    const stA={income:txA.filter(t=>t.amount>0).reduce((s,t)=>s+t.amount,0),expenses:Math.abs(txA.filter(t=>t.amount<0).reduce((s,t)=>s+t.amount,0))};
    const stB={income:txB.filter(t=>t.amount>0).reduce((s,t)=>s+t.amount,0),expenses:Math.abs(txB.filter(t=>t.amount<0).reduce((s,t)=>s+t.amount,0))};
    stA.savings=stA.income-stA.expenses; stB.savings=stB.income-stB.expenses;
    const labelA=months.find(m=>m.value===mA)?.label||mA;
    const labelB=months.find(m=>m.value===mB)?.label||mB;
    const row=(label,a,b)=>{const diff=b-a,pct=a!==0?((diff/Math.abs(a))*100).toFixed(0):0;const color=diff>0?'var(--green)':diff<0?'var(--red)':'var(--text2)';return`<tr><td style="font-weight:700;padding:8px 10px;border-bottom:1px solid var(--border)">${label}</td><td style="padding:8px 10px;border-bottom:1px solid var(--border);text-align:right">${fmt(a)}</td><td style="padding:8px 10px;border-bottom:1px solid var(--border);text-align:right">${fmt(b)}</td><td style="padding:8px 10px;border-bottom:1px solid var(--border);text-align:right;color:${color};font-weight:700">${diff>0?'+':''}${fmt(diff)} (${pct}%)</td></tr>`;};
    $('#cmp-results',modal).innerHTML=`<table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr><th style="padding:8px 10px;text-align:left;font-size:10px;color:var(--text3);font-weight:800;letter-spacing:.8px;border-bottom:1px solid var(--border)">METRIC</th><th style="padding:8px 10px;text-align:right;font-size:10px;color:var(--text3);font-weight:800;letter-spacing:.8px;border-bottom:1px solid var(--border)">${labelA.split(' ')[0]}</th><th style="padding:8px 10px;text-align:right;font-size:10px;color:var(--text3);font-weight:800;letter-spacing:.8px;border-bottom:1px solid var(--border)">${labelB.split(' ')[0]}</th><th style="padding:8px 10px;text-align:right;font-size:10px;color:var(--text3);font-weight:800;letter-spacing:.8px;border-bottom:1px solid var(--border)">CHANGE</th></tr></thead><tbody>${row('Income',stA.income,stB.income)}${row('Expenses',stA.expenses,stB.expenses)}${row('Saved',stA.savings,stB.savings)}</tbody></table>`;
  };
  $('#cmp-a',modal).addEventListener('change',runCmp);
  $('#cmp-b',modal).addEventListener('change',runCmp);
  runCmp();
}

function showEmergencyFundCalculator(){
  const ms=monthStats(State.txs,0);
  const monthlyExpenses=ms.expenses||0;
  const currentSavings=State.accounts.filter(a=>a.type==='Savings Account').reduce((s,a)=>s+a.balance,0);
  const modal=document.createElement('div');modal.className='overlay';
  modal.innerHTML=`<div class="modal" role="dialog" aria-modal="true">
    <div class="mh"><div class="mt-modal">🛡️ Emergency Fund Calculator</div><button class="xbtn" aria-label="Close" id="xm">✕</button></div>
    <div class="ig"><label class="il">Monthly Expenses</label><div class="amt-wrap"><span class="amt-prefix">$</span><input class="input" id="ef-exp" type="number" value="${Math.round(monthlyExpenses)}" inputmode="decimal"></div></div>
    <div class="ig"><label class="il">Current Emergency Savings</label><div class="amt-wrap"><span class="amt-prefix">$</span><input class="input" id="ef-saved" type="number" value="${Math.round(currentSavings)}" inputmode="decimal"></div></div>
    <div class="ig"><label class="il">Target Coverage (months)</label><select class="input" id="ef-months"><option value="3">3 months (minimum)</option><option value="6" selected>6 months (recommended)</option><option value="9">9 months (conservative)</option><option value="12">12 months (max security)</option></select></div>
    <div id="ef-result" style="margin-top:14px"></div>
    <button class="btn btn-ghost w100 mt12" id="close-ef" style="justify-content:center">Close</button>
  </div>`;
  openModal(modal);
  modal.addEventListener('click',e=>{if(e.target===modal)closeModal(modal)});
  $('#xm',modal).addEventListener('click',()=>closeModal(modal));
  $('#close-ef',modal).addEventListener('click',()=>closeModal(modal));
  const calc=()=>{
    const exp=parseFloat($('#ef-exp',modal).value)||0;
    const saved=parseFloat($('#ef-saved',modal).value)||0;
    const target=parseInt($('#ef-months',modal).value)||6;
    const goal=exp*target,gap=Math.max(0,goal-saved),monthsSaved=exp>0?saved/exp:0;
    const color=monthsSaved>=target?'var(--green)':monthsSaved>=3?'var(--orange)':'var(--red)';
    $('#ef-result',modal).innerHTML=`
      <div style="background:${color}22;border:1px solid ${color}44;border-radius:var(--rsm);padding:16px;text-align:center;margin-bottom:12px">
        <div style="font-size:11px;font-weight:800;color:var(--text3);text-transform:uppercase;letter-spacing:.8px;margin-bottom:4px">Current Coverage</div>
        <div style="font-size:36px;font-weight:900;color:${color}">${monthsSaved.toFixed(1)} months</div>
        <div style="font-size:12px;color:var(--text2);margin-top:4px">${monthsSaved>=target?'✅ You\'re fully covered!':gap>0?'Need '+fmt(gap)+' more to reach '+target+' months':''}</div>
      </div>
      <div class="pbar" style="height:10px"><div class="pfill" style="width:${Math.min((monthsSaved/target)*100,100)}%;background:${color}"></div></div>
      <div class="fbc mt8" style="font-size:12px;color:var(--text2)"><span>${fmt(saved)} saved</span><span>Goal: ${fmt(goal)}</span></div>`;
  };
  ['ef-exp','ef-saved','ef-months'].forEach(id=>$('#'+id,modal)?.addEventListener('input',calc));
  calc();
}

function showRetirementEstimator(){
  const ms=monthStats(State.txs,0);
  const modal=document.createElement('div');modal.className='overlay';
  modal.innerHTML=`<div class="modal" role="dialog" aria-modal="true">
    <div class="mh"><div class="mt-modal">🏖️ Retirement Estimator</div><button class="xbtn" aria-label="Close" id="xm">✕</button></div>
    <div class="g2">
      <div class="ig"><label class="il">Current Age</label><input class="input" id="re-age" type="number" min="18" max="80" value="30" inputmode="numeric"></div>
      <div class="ig"><label class="il">Target Retirement Age</label><input class="input" id="re-ret" type="number" min="40" max="80" value="65" inputmode="numeric"></div>
    </div>
    <div class="g2">
      <div class="ig"><label class="il">Current Savings</label><div class="amt-wrap"><span class="amt-prefix">$</span><input class="input" id="re-saved" type="number" min="0" value="${Math.round(State.accounts.reduce((s,a)=>s+a.balance,0))}" inputmode="decimal"></div></div>
      <div class="ig"><label class="il">Monthly Contribution</label><div class="amt-wrap"><span class="amt-prefix">$</span><input class="input" id="re-contrib" type="number" min="0" value="${Math.max(0,Math.round(ms.savings))}" inputmode="decimal"></div></div>
    </div>
    <div class="g2">
      <div class="ig"><label class="il">Expected Annual Return (%)</label><input class="input" id="re-return" type="number" min="0" max="20" step="0.1" value="7"></div>
      <div class="ig"><label class="il">Annual Expenses in Retirement</label><div class="amt-wrap"><span class="amt-prefix">$</span><input class="input" id="re-need" type="number" min="0" value="${Math.round(ms.expenses*12)}" inputmode="decimal"></div></div>
    </div>
    <div id="re-result" style="margin-top:14px"></div>
    <button class="btn btn-ghost w100 mt12" id="close-re" style="justify-content:center">Close</button>
  </div>`;
  openModal(modal);
  modal.addEventListener('click',e=>{if(e.target===modal)closeModal(modal)});
  $('#xm',modal).addEventListener('click',()=>closeModal(modal));
  $('#close-re',modal).addEventListener('click',()=>closeModal(modal));
  const calc=()=>{
    const age=parseInt($('#re-age',modal).value)||30;
    const retAge=parseInt($('#re-ret',modal).value)||65;
    const saved=parseFloat($('#re-saved',modal).value)||0;
    const contrib=parseFloat($('#re-contrib',modal).value)||0;
    const annualReturn=parseFloat($('#re-return',modal).value)/100||0.07;
    const annualNeed=parseFloat($('#re-need',modal).value)||0;
    const years=Math.max(0,retAge-age);
    const monthlyRate=annualReturn/12;
    const months=years*12;
    let fv=saved*Math.pow(1+monthlyRate,months);
    if(monthlyRate>0)fv+=contrib*(Math.pow(1+monthlyRate,months)-1)/monthlyRate;
    else fv+=contrib*months;
    const nestegg=annualNeed*25; // 4% rule
    const onTrack=fv>=nestegg;
    const color=onTrack?'var(--green)':fv>nestegg*0.7?'var(--orange)':'var(--red)';
    const shortfall=Math.max(0,nestegg-fv);
    const extraMonthly=shortfall>0&&months>0&&monthlyRate>0?Math.round(shortfall*monthlyRate/(Math.pow(1+monthlyRate,months)-1)):0;
    $('#re-result',modal).innerHTML=`
      <div style="background:${color}22;border:1px solid ${color}44;border-radius:var(--rsm);padding:16px;text-align:center;margin-bottom:12px">
        <div style="font-size:11px;font-weight:800;color:var(--text3);text-transform:uppercase;letter-spacing:.8px;margin-bottom:4px">Projected at ${retAge}</div>
        <div style="font-size:32px;font-weight:900;color:${color}">${fmtK(fv)}</div>
        <div style="font-size:12px;color:var(--text2);margin-top:4px">${onTrack?'✅ On track for retirement!':'Target: '+fmtK(nestegg)+' (25× annual expenses)'}</div>
      </div>
      <div class="pbar" style="height:10px"><div class="pfill" style="width:${Math.min((fv/nestegg)*100,100).toFixed(0)}%;background:${color}"></div></div>
      <div class="fbc mt8" style="font-size:12px;color:var(--text2)"><span>Projected: ${fmtK(fv)}</span><span>Goal: ${fmtK(nestegg)}</span></div>
      ${!onTrack&&extraMonthly>0?`<div class="alert-strip warn mt12" style="font-size:12px">💡 Save ${fmt(extraMonthly)} more/month to close the gap</div>`:''}`;
  };
  ['re-age','re-ret','re-saved','re-contrib','re-return','re-need'].forEach(id=>$('#'+id,modal)?.addEventListener('input',calc));
  calc();
}

function showWhatIfModal(){
  const ms=monthStats(State.txs,0);
  const modal=document.createElement('div');modal.className='overlay';
  modal.innerHTML=`<div class="modal" role="dialog" aria-modal="true">
    <div class="mh"><div class="mt-modal">🔮 What-If Scenarios</div><button class="xbtn" aria-label="Close" id="xm">✕</button></div>
    <div class="ig"><label class="il">Scenario Type</label>
      <select class="input" id="wi-type">
        <option value="raise">💰 I got a raise</option>
        <option value="cut">✂️ I cut a spending category</option>
        <option value="expense">💸 New monthly expense</option>
        <option value="debt">💳 I paid off a debt</option>
      </select>
    </div>
    <div id="wi-inputs" style="margin-top:4px"></div>
    <div id="wi-result" style="margin-top:14px"></div>
    <button class="btn btn-ghost w100 mt12" id="close-wi" style="justify-content:center">Close</button>
  </div>`;
  openModal(modal);
  modal.addEventListener('click',e=>{if(e.target===modal)closeModal(modal)});
  $('#xm',modal).addEventListener('click',()=>closeModal(modal));
  $('#close-wi',modal).addEventListener('click',()=>closeModal(modal));
  const scenarios={
    raise:()=>`<div class="ig"><label class="il">Monthly raise amount</label><div class="amt-wrap"><span class="amt-prefix">$</span><input class="input" id="wi-v1" type="number" min="0" placeholder="e.g. 500" inputmode="decimal"></div></div>`,
    cut:()=>`<div class="ig"><label class="il">Category to cut</label><select class="input" id="wi-cat">${CATS.filter(c=>c.id!=='income').map(c=>`<option value="${c.id}">${esc(c.emoji)} ${esc(c.name)}</option>`).join('')}</select></div><div class="ig"><label class="il">Cut by (%)</label><input class="input" id="wi-v1" type="range" min="5" max="100" step="5" value="25" style="accent-color:var(--green)"><div id="wi-pct-lbl" style="text-align:center;font-weight:700;margin-top:4px">25%</div></div>`,
    expense:()=>`<div class="ig"><label class="il">New monthly expense</label><div class="amt-wrap"><span class="amt-prefix">$</span><input class="input" id="wi-v1" type="number" min="0" placeholder="e.g. 200" inputmode="decimal"></div></div>`,
    debt:()=>`<div class="ig"><label class="il">Monthly payment freed up</label><div class="amt-wrap"><span class="amt-prefix">$</span><input class="input" id="wi-v1" type="number" min="0" placeholder="e.g. 300" inputmode="decimal"></div></div>`,
  };
  const calc=()=>{
    const type=$('#wi-type',modal).value;
    const v1=parseFloat($('#wi-v1',modal)?.value)||0;
    const catId=$('#wi-cat',modal)?.value;
    let delta=0,desc='';
    if(type==='raise'){delta=v1;desc=`+${fmt(v1)}/mo income`;}
    else if(type==='cut'){const spent=ms.byCat[catId]||0;delta=spent*(v1/100);desc=`-${fmt(delta)}/mo on ${getCat(catId).name} (${v1}% cut)`;}
    else if(type==='expense'){delta=-v1;desc=`-${fmt(v1)}/mo new expense`;}
    else if(type==='debt'){delta=v1;desc=`+${fmt(v1)}/mo freed from debt payment`;}
    const newSavings=ms.savings+delta;
    const newRate=ms.income+Math.max(0,delta)>0?((newSavings/(ms.income+Math.max(0,delta)))*100).toFixed(0):0;
    const color=delta>=0?'var(--green)':'var(--red)';
    $('#wi-result',modal).innerHTML=`
      <div class="whatif-result ${delta<0?'whatif-neg-bg':''}">
        <div style="font-size:12px;color:var(--text2);margin-bottom:4px">${desc}</div>
        <div class="whatif-delta ${delta<0?'whatif-neg':''}">${delta>=0?'+':''}${fmt(delta)}/mo</div>
        <div style="font-size:13px;margin-top:8px">New monthly savings: <strong style="color:${newSavings>=0?'var(--green)':'var(--red)'}">${fmt(newSavings)}</strong> (${newRate}% rate)</div>
        <div style="font-size:12px;color:var(--text2);margin-top:4px">Over 1 year: ${fmt(delta*12)} · Over 5 years: ${fmt(delta*60)}</div>
      </div>`;
    if($('#wi-pct-lbl',modal))$('#wi-pct-lbl',modal).textContent=v1+'%';
  };
  const updateInputs=()=>{const type=$('#wi-type',modal).value;$('#wi-inputs',modal).innerHTML=scenarios[type]();$('#wi-inputs',modal).querySelectorAll('input,select').forEach(el=>el.addEventListener('input',calc));calc();};
  $('#wi-type',modal).addEventListener('change',updateInputs);
  updateInputs();
}

export { renderReports, renderBillCalendarHTML };
