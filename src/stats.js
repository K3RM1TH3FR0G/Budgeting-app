import { genId, esc, fmt, fmtK, todayStr } from './utils.js';
import { State, Cache, getNWHistory, saveNWHistory } from './state.js';
import { SB } from './db.js';
import { getCat } from './categories.js';

function monthStats(txs,offset=0){
  const now=new Date(),y=now.getFullYear(),m=now.getMonth()-offset;
  const start=new Date(y,m,1).toISOString().split('T')[0],end=new Date(y,m+1,0).toISOString().split('T')[0];
  const month=txs.filter(t=>t.date>=start&&t.date<=end);
  const income=month.filter(t=>t.amount>0).reduce((s,t)=>s+t.amount,0);
  const expenses=Math.abs(month.filter(t=>t.amount<0).reduce((s,t)=>s+t.amount,0));
  const byCat={};month.filter(t=>t.amount<0).forEach(t=>{byCat[t.category]=(byCat[t.category]||0)+Math.abs(t.amount)});
  return{income,expenses,savings:income-expenses,byCat};
}

function applyRecurring(){
  if(!State.recurring.length)return;
  const now=new Date(),ym=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const newTxs=[];
  State.recurring.forEach(r=>{
    const alreadyThis=State.txs.some(t=>t.recurringId===r.id&&t.date.startsWith(ym));
    if(!alreadyThis){
      const day=Math.min(r.dayOfMonth||1,new Date(now.getFullYear(),now.getMonth()+1,0).getDate());
      const ds=`${ym}-${String(day).padStart(2,'0')}`;
      const tx={id:genId(),name:r.name,category:r.category,amount:r.amount,date:ds,note:'Auto (recurring)',recurring:true,recurringId:r.id};
      State.txs.unshift(tx);newTxs.push(tx);
    }
  });
  if(newTxs.length){
    State.txs.sort((a,b)=>b.date.localeCompare(a.date));
    newTxs.forEach(tx=>SB.addTx(State.user.id,tx).catch(()=>{}));
  }
}

function getBudgetAlerts(){
  const ms=monthStats(State.txs,0);
  return State.budgets.map(b=>{const spent=ms.byCat[b.categoryId]||0,pct=b.amount>0?(spent/b.amount)*100:0;return{cat:getCat(b.categoryId),spent,budget:b.amount,pct}}).filter(a=>a.pct>=80).sort((a,b)=>b.pct-a.pct);
}

function alertsHTML(){
  const alerts=getBudgetAlerts();if(!alerts.length)return'';
  return`<div style="margin-bottom:14px">`+alerts.slice(0,3).map(a=>`<div class="alert-strip ${a.pct>=100?'danger':'warn'}"><span style="font-size:16px">${a.pct>=100?'🚨':'⚠️'}</span><span>${a.cat.emoji} <strong>${esc(a.cat.name)}</strong> is ${a.pct>=100?'over budget':'at '+Math.round(a.pct)+'%'} — ${fmtK(a.spent)} of ${fmtK(a.budget)}</span></div>`).join('')+'</div>';
}

function generateInsights(ms,lm){
  const insights=[];
  const now=new Date();

  /* ── 1. Top category this month ── */
  const topCat=Object.entries(ms.byCat).sort((a,b)=>b[1]-a[1])[0];
  if(topCat){
    const c=getCat(topCat[0]);
    const lastMonthAmt=lm.byCat[topCat[0]]||0;
    const pctChg=lastMonthAmt>0?((topCat[1]-lastMonthAmt)/lastMonthAmt*100).toFixed(0):null;
    insights.push({icon:c.emoji,color:c.color,
      title:`${esc(c.name)} is your top spend`,
      body:`${fmtK(topCat[1])} this month${pctChg!==null?' — '+(pctChg>0?'+':'')+pctChg+'% vs last month':''}.`
    });
  }

  /* ── 2. Savings rate narrative ── */
  if(ms.income>0){
    const rate=(ms.savings/ms.income)*100;
    if(rate>20)insights.push({icon:'🌟',color:'var(--green)',title:'Great savings rate!',body:`Saving ${rate.toFixed(0)}% of income. You're ${(rate-20).toFixed(0)} points above the 20% benchmark.`});
    else if(rate<0)insights.push({icon:'📉',color:'var(--red)',title:'Spending exceeds income',body:`You're ${fmtK(Math.abs(ms.savings))} over budget this month. Check your top categories.`});
    else insights.push({icon:'💡',color:'var(--yellow)',title:`${rate.toFixed(0)}% savings rate`,body:`${(20-rate).toFixed(0)} points below the 20% benchmark. Try trimming one category.`});
  }

  /* ── 3. Spending trend narratives (3-month window per category) ── */
  const trendStories=[];
  Object.keys(ms.byCat).forEach(catId=>{
    const m0=ms.byCat[catId]||0;
    const m1=monthStats(State.txs,1).byCat[catId]||0;
    const m2=monthStats(State.txs,2).byCat[catId]||0;
    if(m0>0&&m2>0){
      const pct=((m0-m2)/m2)*100;
      if(Math.abs(pct)>=25)trendStories.push({catId,pct,m0,m2,trend:m1>m2&&m0>m1?'accelerating':m1<m2&&m0<m1?'decelerating':'mixed'});
    }
  });
  trendStories.sort((a,b)=>Math.abs(b.pct)-Math.abs(a.pct));
  if(trendStories.length){
    const t=trendStories[0],c=getCat(t.catId);
    const dir=t.pct>0?'risen':'fallen',arrow=t.pct>0?'📈':'📉';
    const color=t.pct>0?'var(--orange)':'var(--green)';
    const story=t.trend==='accelerating'?'and the pace is increasing':t.trend==='decelerating'?'but slowing down':'with some fluctuation';
    insights.push({icon:arrow,color,
      title:`${esc(c.name)} has ${dir} ${Math.abs(t.pct).toFixed(0)}% in 3 months`,
      body:`From ${fmtK(t.m2)}/mo to ${fmtK(t.m0)}/mo — ${story}.`
    });
  }

  /* ── 4. Unusual single transaction ── */
  const avgTx=ms.expenses>0&&State.txs.length>0?ms.expenses/State.txs.filter(t=>{const ym=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;return t.date.startsWith(ym)&&t.amount<0;}).length:0;
  const bigTx=State.txs.find(t=>{const ym=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;return t.date.startsWith(ym)&&t.amount<0&&Math.abs(t.amount)>avgTx*3&&Math.abs(t.amount)>50;});
  if(bigTx&&avgTx>0)insights.push({icon:'👀',color:'var(--blue)',title:'Unusually large transaction',body:`"${esc(bigTx.name)}" for ${fmtK(Math.abs(bigTx.amount))} — ${(Math.abs(bigTx.amount)/avgTx).toFixed(0)}× your average purchase.`});

  /* ── 5. Recurring cost ── */
  if(State.recurring.length>0){
    const recTotal=State.recurring.reduce((s,r)=>s+Math.abs(r.amount),0);
    const recPct=ms.income>0?(recTotal/ms.income*100).toFixed(0):null;
    insights.push({icon:'🔄',color:'var(--purple)',title:`${State.recurring.length} recurring payments`,body:`${fmtK(recTotal)}/month${recPct?' — '+recPct+'% of your income':''}.`});
  }

  /* ── 6. Daily spend limit ── */
  const limit=State.settings.dailyLimit;
  if(limit>0){
    const today=todayStr();
    const todaySpend=Math.abs(State.txs.filter(t=>t.date===today&&t.amount<0).reduce((s,t)=>s+t.amount,0));
    if(todaySpend>limit)insights.push({icon:'🚨',color:'var(--red)',title:'Daily spend limit exceeded',body:`${fmtK(todaySpend)} spent today vs ${fmtK(limit)} limit.`});
    else if(todaySpend>limit*0.8)insights.push({icon:'⚠️',color:'var(--orange)',title:'Approaching daily limit',body:`${fmtK(todaySpend)} of ${fmtK(limit)} daily limit used (${((todaySpend/limit)*100).toFixed(0)}%).`});
  }

  /* ── 7. Weekend vs weekday spending ── */
  const thisMonthTxs=State.txs.filter(t=>{const ym=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;return t.date.startsWith(ym)&&t.amount<0;});
  if(thisMonthTxs.length>=6){
    const wkend=thisMonthTxs.filter(t=>{const d=new Date(t.date+'T12:00:00').getDay();return d===0||d===6;});
    const wkday=thisMonthTxs.filter(t=>{const d=new Date(t.date+'T12:00:00').getDay();return d>0&&d<6;});
    const wkendAvg=wkend.length>0?Math.abs(wkend.reduce((s,t)=>s+t.amount,0))/wkend.length:0;
    const wkdayAvg=wkday.length>0?Math.abs(wkday.reduce((s,t)=>s+t.amount,0))/wkday.length:0;
    if(wkendAvg>wkdayAvg*1.5&&wkend.length>=2)insights.push({icon:'🎉',color:'var(--orange)',title:'Weekend spending is higher',body:`You spend ${(wkendAvg/wkdayAvg).toFixed(1)}× more per transaction on weekends vs weekdays.`});
  }

  return insights.slice(0,5);
}

function detectSubscriptions(txs){
  // Find transactions with the same name appearing multiple months in a row
  const counts={};
  txs.filter(t=>t.amount<0&&!t.recurring).forEach(t=>{
    const key=t.name.toLowerCase().trim();
    if(!counts[key])counts[key]={name:t.name,amount:t.amount,months:new Set()};
    counts[key].months.add(t.date.slice(0,7));
  });
  return Object.values(counts)
    .filter(c=>c.months.size>=2&&Math.abs(c.amount)<150)
    .filter(c=>!State.recurring.some(r=>r.name.toLowerCase()===c.name.toLowerCase()))
    .slice(0,4);
}

function recordNWSnapshot(netWorth){
  const uid=State.user?.id; if(!uid)return;
  const history=getNWHistory();
  const ym=new Date().toISOString().slice(0,7);
  const existing=history.findIndex(h=>h.month===ym);
  if(existing>=0)history[existing].value=netWorth;
  else history.push({month:ym,value:netWorth});
  const trimmed=history.slice(-24); // keep 2 years
  saveNWHistory(trimmed);
}


export { monthStats, applyRecurring, getBudgetAlerts, alertsHTML, generateInsights, detectSubscriptions, recordNWSnapshot };
