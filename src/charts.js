import { esc, fmt, fmtAxisVal, niceNumber } from './utils.js';

// Safe hexToRgba — passes through non-hex values (e.g. CSS vars) unchanged
function hexToRgba(hex, alpha) {
  if (!hex || !hex.startsWith('#')) return hex;
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  if (isNaN(r)||isNaN(g)||isNaN(b)) return hex;
  return 'rgba('+r+','+g+','+b+','+alpha+')';
}

/* ════════════════════════════════════
   CANVAS CHARTS
   All chart drawing functions.
   Each function accepts a canvas element
   and plain data — no direct State access.
════════════════════════════════════ */

/* ── INTERNAL HELPERS (not exported) ── */
function chartBg(){return getComputedStyle(document.documentElement).getPropertyValue('--card').trim()||'#111e33';}
function chartText(){return getComputedStyle(document.documentElement).getPropertyValue('--text2').trim()||'#7a90b8';}
function chartGrid(){return getComputedStyle(document.documentElement).getPropertyValue('--border').trim()||'rgba(255,255,255,0.05)';}

/* ── CHART TOOLTIP HELPERS ── */
(function(){
  const el=document.createElement('div');
  el.id='chart-tooltip';
  document.body.appendChild(el);
})();

function ttShow(html,e){
  const t=document.getElementById('chart-tooltip');
  if(!t)return;
  t.innerHTML=html;
  t.classList.add('visible');
  ttMove(e);
}
function ttHide(){
  const t=document.getElementById('chart-tooltip');
  if(t)t.classList.remove('visible');
}
function ttMove(e){
  const t=document.getElementById('chart-tooltip');
  if(!t||!t.classList.contains('visible'))return;
  const W=window.innerWidth,H=window.innerHeight;
  const tw=t.offsetWidth+16,th=t.offsetHeight+16;
  let x=e.clientX+16,y=e.clientY-th/2;
  if(x+tw>W)x=e.clientX-tw;
  if(y<8)y=8;
  if(y+th>H-8)y=H-th-8;
  t.style.left=x+'px';t.style.top=y+'px';
}
function ttRow(color, name, value, pct) {
  // esc() protects against XSS — name/value may be user-supplied strings
  const safeName  = esc(name);
  const safeValue = esc(String(value));
  return `<div class="tt-row"><div class="tt-dot" style="background:${color}"></div><span class="tt-name">${safeName}</span><span class="tt-val">${safeValue}${pct ? `<span class="tt-pct">${pct}</span>` : ''}</span></div>`;
}

/* Attach hover to canvas — chartMeta is an array of hit-test objects set per draw call */
const _chartMeta=new WeakMap();
function attachChartHover(canvas,getMeta){
  canvas.addEventListener('mousemove',e=>{
    const rect=canvas.getBoundingClientRect();
    const dpr=window.devicePixelRatio||1;
    const mx=(e.clientX-rect.left);
    const my=(e.clientY-rect.top);
    const hit=getMeta().find(m=>mx>=m.x&&mx<=m.x+m.w&&my>=m.y&&my<=m.y+m.h);
    if(hit){
      ttShow(hit.html,e);
      canvas.style.cursor='pointer';
    } else {
      ttHide();
      canvas.style.cursor='default';
    }
    ttMove(e);
  });
  canvas.addEventListener('mouseleave',()=>{ttHide();canvas.style.cursor='default';});
}

function setupCanvas(canvas,W,H){
  const dpr=window.devicePixelRatio||1;
  canvas.width=W*dpr;canvas.height=H*dpr;
  const ctx=canvas.getContext('2d');ctx.scale(dpr,dpr);
  ctx.clearRect(0,0,W,H);return ctx;
}
function bezierLine(ctx,pts){
  if(pts.length<2)return;
  ctx.moveTo(pts[0].x,pts[0].y);
  for(let i=0;i<pts.length-1;i++){
    const cpx=(pts[i].x+pts[i+1].x)/2;
    ctx.bezierCurveTo(cpx,pts[i].y,cpx,pts[i+1].y,pts[i+1].x,pts[i+1].y);
  }
}
/* Shared glow helper — draws a wider soft copy of the current path */
function glowFill(ctx,color,alpha=0.22,extra=8){
  ctx.save();ctx.shadowColor=color;ctx.shadowBlur=extra*2;ctx.fillStyle=hexToRgba(color,alpha);ctx.fill();ctx.restore();
}
function glowStroke(ctx,color,lw,alpha=0.25,extra=6){
  ctx.save();ctx.strokeStyle=hexToRgba(color,alpha);ctx.lineWidth=lw+extra;ctx.lineCap='round';ctx.lineJoin='round';ctx.stroke();ctx.restore();
}


/* ── DRAW FUNCTIONS (exported) ── */

/* ── drawBarChart ── */
export function drawBarChart(canvas,data){
  if(!canvas)return;
  const W=canvas.offsetWidth||500,H=canvas.offsetHeight||200;
  const ctx=setupCanvas(canvas,W,H);
  const pL=56,pR=16,pT=12,pB=32,cW=W-pL-pR,cH=H-pT-pB;
  const {labels,datasets}=data,n=labels.length;
  const top=niceNumber(Math.max(...datasets.flatMap(d=>d.data),1)*1.08);
  const txt=chartText(),grid=chartGrid();
  for(let i=0;i<=4;i++){
    const y=pT+cH-(cH/4)*i;
    ctx.beginPath();ctx.moveTo(pL,y);ctx.lineTo(pL+cW,y);ctx.strokeStyle=grid;ctx.lineWidth=1;ctx.stroke();
    ctx.fillStyle=txt;ctx.font='10px -apple-system,system-ui,sans-serif';ctx.textAlign='right';ctx.textBaseline='middle';
    ctx.fillText(fmtAxisVal((top/4)*i),pL-8,y);
  }
  const barTotalW=cW/n,gap=barTotalW*0.28,barW=(barTotalW-gap)/datasets.length;
  datasets.forEach((d,di)=>{
    labels.forEach((lbl,i)=>{
      const v=d.data[i]||0,bH=Math.max(3,(v/top)*cH);
      const x=pL+i*barTotalW+gap/2+di*barW,y=pT+cH-bH,r=Math.min(4,barW/2);
      /* Sankey-style: glow halo first, then solid node */
      const buildPath=()=>{ctx.beginPath();if(bH>r*2){ctx.moveTo(x+r,y);ctx.lineTo(x+barW-r,y);ctx.arcTo(x+barW,y,x+barW,y+r,r);ctx.lineTo(x+barW,y+bH);ctx.lineTo(x,y+bH);ctx.arcTo(x,y,x+r,y,r);}else ctx.rect(x,y,barW,bH);};
      buildPath();glowFill(ctx,d.color,0.2,10);
      buildPath();ctx.fillStyle=d.color;ctx.fill();
    });
  });
  const skip=Math.max(1,Math.ceil(n/10));
  ctx.fillStyle=txt;ctx.font='10px -apple-system,system-ui,sans-serif';ctx.textAlign='center';ctx.textBaseline='top';
  labels.forEach((lbl,i)=>{if(i%skip===0)ctx.fillText(lbl,pL+i*barTotalW+barTotalW/2,pT+cH+8);});
  /* Hover hit regions */
  const barMeta=[];
  datasets.forEach((d,di)=>{
    labels.forEach((lbl,i)=>{
      const v=d.data[i]||0,bH=Math.max(3,(v/top)*cH);
      const x=pL+i*barTotalW+gap/2+di*barW,y=pT+cH-bH;
      barMeta.push({x,y,w:barW,h:bH,html:`<div class="tt-label">${lbl}</div>${ttRow(d.color,di===0?'Income':'Expenses',fmt(v),'')}`});
    });
  });
  attachChartHover(canvas,()=>barMeta);
}

/* ── drawAreaChart ── */
export function drawAreaChart(canvas,data){
  if(!canvas)return;
  const W=canvas.offsetWidth||500,H=canvas.offsetHeight||200;
  const ctx=setupCanvas(canvas,W,H);
  const pL=56,pR=16,pT=12,pB=32,cW=W-pL-pR,cH=H-pT-pB;
  const {labels,datasets}=data,n=labels.length;if(n<2)return;
  const top=niceNumber(Math.max(...datasets.flatMap(d=>d.data),1)*1.08);
  const txt=chartText(),grid=chartGrid();
  for(let i=0;i<=4;i++){
    const y=pT+cH-(cH/4)*i;
    ctx.beginPath();ctx.moveTo(pL,y);ctx.lineTo(pL+cW,y);ctx.strokeStyle=grid;ctx.lineWidth=1;ctx.stroke();
    ctx.fillStyle=txt;ctx.font='10px -apple-system,system-ui,sans-serif';ctx.textAlign='right';ctx.textBaseline='middle';
    ctx.fillText(fmtAxisVal((top/4)*i),pL-8,y);
  }
  datasets.forEach(d=>{
    const pts=d.data.map((v,i)=>({x:pL+i*(cW/(n-1)),y:pT+cH-(v/top)*cH}));
    /* Sankey-style flow fill: low opacity gradient */
    const grd=ctx.createLinearGradient(0,pT,0,pT+cH);
    grd.addColorStop(0,hexToRgba(d.color,0.28));grd.addColorStop(0.7,hexToRgba(d.color,0.1));grd.addColorStop(1,hexToRgba(d.color,0));
    ctx.beginPath();ctx.moveTo(pts[0].x,pT+cH);bezierLine(ctx,pts);ctx.lineTo(pts[pts.length-1].x,pT+cH);ctx.closePath();
    ctx.fillStyle=grd;ctx.fill();
    /* Glow line */
    ctx.beginPath();ctx.moveTo(pts[0].x,pts[0].y);bezierLine(ctx,pts);
    glowStroke(ctx,d.color,2.5,0.25,8);
    /* Main line */
    ctx.beginPath();ctx.moveTo(pts[0].x,pts[0].y);bezierLine(ctx,pts);
    ctx.strokeStyle=d.color;ctx.lineWidth=2.5;ctx.lineJoin='round';ctx.lineCap='round';ctx.stroke();
  });
  const skip=Math.max(1,Math.ceil(n/8));
  ctx.fillStyle=txt;ctx.font='10px -apple-system,system-ui,sans-serif';ctx.textAlign='center';ctx.textBaseline='top';
  labels.forEach((lbl,i)=>{if(i%skip===0)ctx.fillText(lbl,pL+i*(cW/(n-1)),pT+cH+8);});
}

/* ── drawDonut ── */
export function drawDonut(canvas,data){
  if(!canvas)return;
  const dpr=window.devicePixelRatio||1;
  const size=Math.max(90,canvas.offsetWidth||110);
  canvas.width=size*dpr;canvas.height=size*dpr;
  canvas.style.width=size+'px';canvas.style.height=size+'px';
  const ctx=canvas.getContext('2d');ctx.scale(dpr,dpr);
  const cx=size/2,cy=size/2,outerR=size/2-3,thickness=size*0.17;
  const total=data.reduce((s,d)=>s+d.value,0);
  ctx.clearRect(0,0,size,size);
  if(!total){
    ctx.beginPath();ctx.arc(cx,cy,outerR,0,Math.PI*2);
    ctx.strokeStyle='rgba(128,128,128,0.1)';ctx.lineWidth=thickness;ctx.stroke();return;
  }
  let angle=-Math.PI/2;
  const gap=0.03;
  data.forEach(d=>{
    const sweep=Math.max(0,(d.value/total)*Math.PI*2-gap);
    /* Sankey-style: glow halo first */
    ctx.beginPath();ctx.arc(cx,cy,outerR-thickness/2,angle+gap/2,angle+gap/2+sweep);
    ctx.strokeStyle=hexToRgba(d.color,0.22);ctx.lineWidth=thickness+8;ctx.lineCap='round';ctx.stroke();
    /* Solid arc on top */
    ctx.beginPath();ctx.arc(cx,cy,outerR-thickness/2,angle+gap/2,angle+gap/2+sweep);
    ctx.strokeStyle=d.color;ctx.lineWidth=thickness;ctx.lineCap='round';ctx.stroke();
    angle+=sweep+gap;
  });
}

/* ── drawHorizBars ── */
export function drawHorizBars(canvas,data){
  if(!canvas)return;
  const dpr=window.devicePixelRatio||1;
  const W=canvas.offsetWidth||400,rowH=44,H=data.length*rowH+16;
  canvas.width=W*dpr;canvas.height=H*dpr;canvas.style.height=H+'px';
  const ctx=canvas.getContext('2d');ctx.scale(dpr,dpr);
  const pL=134,pR=64,pT=8,cW=W-pL-pR;
  const maxVal=Math.max(...data.map(d=>d.value),1);
  const txt=chartText();
  ctx.clearRect(0,0,W,H);
  data.forEach((d,i)=>{
    const y=pT+i*rowH,bH=22,bW=Math.max(6,(d.value/maxVal)*cW);
    ctx.fillStyle=txt;ctx.font='12px -apple-system,system-ui,sans-serif';
    ctx.textAlign='right';ctx.textBaseline='middle';ctx.fillText(d.name,pL-10,y+bH/2);
    /* Track */
    ctx.beginPath();if(ctx.roundRect)ctx.roundRect(pL,y,cW,bH,bH/2);else ctx.rect(pL,y,cW,bH);
    ctx.fillStyle='rgba(128,144,184,0.07)';ctx.fill();
    /* Sankey-style glow halo */
    ctx.beginPath();if(ctx.roundRect)ctx.roundRect(pL,y,bW,bH,bH/2);else ctx.rect(pL,y,bW,bH);
    glowFill(ctx,d.color,0.22,10);
    /* Solid bar */
    ctx.beginPath();if(ctx.roundRect)ctx.roundRect(pL,y,bW,bH,bH/2);else ctx.rect(pL,y,bW,bH);
    ctx.fillStyle=d.color;ctx.fill();
    /* Labels — Sankey style */
    ctx.fillStyle='rgba(238,242,255,0.85)';ctx.textAlign='left';ctx.textBaseline='middle';
    ctx.font='bold 12px -apple-system,system-ui,sans-serif';
    ctx.fillText(fmtAxisVal(d.value),pL+cW+10,y+bH/2);
  });
}

/* ── drawRing ── */
export function drawRing(canvas,pct,color){
  if(!canvas)return;
  const dpr=window.devicePixelRatio||1,size=canvas.offsetWidth||70;
  canvas.width=size*dpr;canvas.height=size*dpr;
  const ctx=canvas.getContext('2d');ctx.scale(dpr,dpr);
  const cx=size/2,cy=size/2,r=size/2-5,sw=Math.max(4,size*0.09);
  ctx.clearRect(0,0,size,size);
  ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);
  ctx.strokeStyle='rgba(128,144,184,0.1)';ctx.lineWidth=sw;ctx.stroke();
  const p=Math.min(Math.max(pct/100,0),1);
  if(p>0){
    /* Sankey-style glow halo */
    ctx.beginPath();ctx.arc(cx,cy,r,-Math.PI/2,-Math.PI/2+p*Math.PI*2);
    ctx.strokeStyle=hexToRgba(color,0.22);ctx.lineWidth=sw+8;ctx.lineCap='round';ctx.stroke();
    ctx.beginPath();ctx.arc(cx,cy,r,-Math.PI/2,-Math.PI/2+p*Math.PI*2);
    ctx.strokeStyle=color;ctx.lineWidth=sw;ctx.lineCap='round';ctx.stroke();
  }
  ctx.fillStyle=pct>=100?color:'rgba(238,242,255,0.9)';
  ctx.font=`800 ${Math.max(10,Math.round(size*0.2))}px -apple-system,system-ui,sans-serif`;
  ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.fillText(Math.round(pct)+'%',cx,cy);
}

/* ── drawForecastChart ── */
export function drawForecastChart(canvas,labels,d1,d2,d3){
  if(!canvas)return;
  const W=canvas.offsetWidth||600,H=canvas.offsetHeight||260;
  const ctx=setupCanvas(canvas,W,H);
  const pL=64,pR=16,pT=12,pB=32,cW=W-pL-pR,cH=H-pT-pB;
  const n=d1.length;if(n<2)return;
  const top=niceNumber(Math.max(...d1,1)*1.06);
  const txt=chartText(),grid=chartGrid();
  for(let i=0;i<=4;i++){
    const y=pT+cH-(cH/4)*i;
    ctx.beginPath();ctx.moveTo(pL,y);ctx.lineTo(pL+cW,y);ctx.strokeStyle=grid;ctx.lineWidth=1;ctx.stroke();
    ctx.fillStyle=txt;ctx.font='10px -apple-system,system-ui,sans-serif';ctx.textAlign='right';ctx.textBaseline='middle';
    ctx.fillText(fmtAxisVal((top/4)*i),pL-8,y);
  }
  const sets=[
    {data:d1,color:'#3b82f6',lw:2.5,dash:null},
    {data:d2,color:'#8b78f5',lw:2,dash:null},
    {data:d3,color:'rgba(122,144,184,0.5)',lw:1.5,dash:[5,5]},
  ];
  sets.forEach(s=>{
    const pts=s.data.map((v,i)=>({x:pL+i*(cW/(n-1)),y:pT+cH-(v/top)*cH}));
    /* Sankey-style flow fill */
    const g=ctx.createLinearGradient(0,pT,0,pT+cH);
    g.addColorStop(0,hexToRgba(s.color,0.22));g.addColorStop(0.7,hexToRgba(s.color,0.06));g.addColorStop(1,hexToRgba(s.color,0));
    ctx.beginPath();ctx.moveTo(pts[0].x,pT+cH);ctx.lineTo(pts[0].x,pts[0].y);bezierLine(ctx,pts);
    ctx.lineTo(pts[pts.length-1].x,pT+cH);ctx.closePath();ctx.fillStyle=g;ctx.fill();
    /* Glow line */
    if(!s.dash){
      ctx.beginPath();ctx.moveTo(pts[0].x,pts[0].y);bezierLine(ctx,pts);
      glowStroke(ctx,s.color,s.lw,0.22,8);
    }
    if(s.dash)ctx.setLineDash(s.dash);else ctx.setLineDash([]);
    ctx.beginPath();ctx.moveTo(pts[0].x,pts[0].y);bezierLine(ctx,pts);
    ctx.strokeStyle=s.color;ctx.lineWidth=s.lw;ctx.lineJoin='round';ctx.lineCap='round';ctx.stroke();
    ctx.setLineDash([]);
  });
  ctx.fillStyle=txt;ctx.font='10px -apple-system,system-ui,sans-serif';ctx.textAlign='center';ctx.textBaseline='top';
  labels.forEach((l,i)=>{if(l)ctx.fillText(l,pL+i*(cW/(n-1)),pT+cH+8);});
}

/* ── drawLoanChart ── */
export function drawLoanChart(canvas,labels,dBal,dInt,dPrin){
  if(!canvas)return;
  const W=canvas.offsetWidth||600,H=canvas.offsetHeight||240;
  const ctx=setupCanvas(canvas,W,H);
  const pL=64,pR=16,pT=12,pB=32,cW=W-pL-pR,cH=H-pT-pB;
  const n=dBal.length;if(n<2)return;
  const top=niceNumber(Math.max(...dBal,...dInt,...dPrin,1)*1.05);
  const txt=chartText(),grid=chartGrid();
  for(let i=0;i<=4;i++){
    const y=pT+cH-(cH/4)*i;
    ctx.beginPath();ctx.moveTo(pL,y);ctx.lineTo(pL+cW,y);ctx.strokeStyle=grid;ctx.lineWidth=1;ctx.stroke();
    ctx.fillStyle=txt;ctx.font='10px -apple-system,system-ui,sans-serif';ctx.textAlign='right';ctx.textBaseline='middle';
    ctx.fillText(fmtAxisVal((top/4)*i),pL-8,y);
  }
  const sets=[
    {data:dBal,color:'#ff4d6a',lw:2.5},
    {data:dInt,color:'#8b78f5',lw:2},
    {data:dPrin,color:'#3b82f6',lw:2},
  ];
  sets.forEach(s=>{
    const pts=s.data.map((v,i)=>({x:pL+i*(cW/(n-1)),y:pT+cH-(v/top)*cH}));
    /* Sankey-style flow fill */
    const g=ctx.createLinearGradient(0,pT,0,pT+cH);
    g.addColorStop(0,hexToRgba(s.color,0.22));g.addColorStop(0.7,hexToRgba(s.color,0.06));g.addColorStop(1,hexToRgba(s.color,0));
    ctx.beginPath();ctx.moveTo(pts[0].x,pT+cH);ctx.lineTo(pts[0].x,pts[0].y);bezierLine(ctx,pts);
    ctx.lineTo(pts[pts.length-1].x,pT+cH);ctx.closePath();ctx.fillStyle=g;ctx.fill();
    /* Glow */
    ctx.beginPath();ctx.moveTo(pts[0].x,pts[0].y);bezierLine(ctx,pts);
    glowStroke(ctx,s.color,s.lw,0.22,8);
    /* Solid line */
    ctx.beginPath();ctx.moveTo(pts[0].x,pts[0].y);bezierLine(ctx,pts);
    ctx.strokeStyle=s.color;ctx.lineWidth=s.lw;ctx.lineJoin='round';ctx.lineCap='round';ctx.stroke();
  });
  ctx.fillStyle=txt;ctx.font='10px -apple-system,system-ui,sans-serif';ctx.textAlign='center';ctx.textBaseline='top';
  labels.forEach((l,i)=>{if(l)ctx.fillText(l,pL+i*(cW/(n-1)),pT+cH+8);});
}

/* ── drawLineChart ── */
export function drawLineChart(canvas,labels,earned,spent){
  if(!canvas)return;
  const W=canvas.offsetWidth||600,H=canvas.offsetHeight||220;
  const ctx=setupCanvas(canvas,W,H);
  const pL=56,pR=16,pT=12,pB=32,cW=W-pL-pR,cH=H-pT-pB;
  const n=labels.length;if(n<2)return;
  const maxV=Math.max(...earned,...spent,1),top=niceNumber(maxV*1.08);
  const txt=chartText(),grid=chartGrid();
  for(let i=0;i<=4;i++){
    const y=pT+cH-(cH/4)*i;
    ctx.beginPath();ctx.moveTo(pL,y);ctx.lineTo(pL+cW,y);ctx.strokeStyle=grid;ctx.lineWidth=1;ctx.stroke();
    ctx.fillStyle=txt;ctx.font='10px -apple-system,system-ui,sans-serif';ctx.textAlign='right';ctx.textBaseline='middle';
    ctx.fillText(fmtAxisVal((top/4)*i),pL-8,y);
  }
  [[earned,'#3b82f6'],[spent,'#ff4d6a']].forEach(([data,color])=>{
    const pts=data.map((v,i)=>({x:pL+i*(cW/(n-1)),y:pT+cH-(v/top)*cH}));
    /* Sankey-style flow fill */
    const grd=ctx.createLinearGradient(0,pT,0,pT+cH);
    grd.addColorStop(0,hexToRgba(color,0.28));grd.addColorStop(0.7,hexToRgba(color,0.08));grd.addColorStop(1,hexToRgba(color,0));
    ctx.beginPath();ctx.moveTo(pts[0].x,pT+cH);ctx.lineTo(pts[0].x,pts[0].y);bezierLine(ctx,pts);
    ctx.lineTo(pts[pts.length-1].x,pT+cH);ctx.closePath();ctx.fillStyle=grd;ctx.fill();
    /* Glow line */
    ctx.beginPath();ctx.moveTo(pts[0].x,pts[0].y);bezierLine(ctx,pts);
    glowStroke(ctx,color,2.5,0.25,8);
    /* Solid line */
    ctx.beginPath();ctx.moveTo(pts[0].x,pts[0].y);bezierLine(ctx,pts);
    ctx.strokeStyle=color;ctx.lineWidth=2.5;ctx.lineJoin='round';ctx.lineCap='round';ctx.stroke();
    /* Dots on small datasets — with glow */
    if(n<=14)pts.forEach(p=>{
      ctx.beginPath();ctx.arc(p.x,p.y,5,0,Math.PI*2);ctx.fillStyle=hexToRgba(color,0.25);ctx.fill();
      ctx.beginPath();ctx.arc(p.x,p.y,3,0,Math.PI*2);ctx.fillStyle=color;ctx.fill();
      ctx.strokeStyle=chartBg();ctx.lineWidth=1.5;ctx.stroke();
    });
  });
  const skip=Math.max(1,Math.ceil(n/10));
  ctx.fillStyle=txt;ctx.font='10px -apple-system,system-ui,sans-serif';ctx.textAlign='center';ctx.textBaseline='top';
  labels.forEach((l,i)=>{if(i%skip===0)ctx.fillText(l,pL+i*(cW/(n-1)),pT+cH+8);});
  /* Hover vertical bands */
  const lineMeta=labels.map((lbl,i)=>{
    const xc=pL+i*(cW/Math.max(n-1,1));
    const bw=cW/Math.max(n-1,1);
    return{x:xc-bw/2,y:pT,w:bw,h:cH,
      html:`<div class="tt-label">${lbl}</div>${ttRow('#3b82f6','Income',fmt(earned[i]||0),'')}${ttRow('#f87171','Expenses',fmt(spent[i]||0),'')}`};
  });
  attachChartHover(canvas,()=>lineMeta);
}

/* ── drawStackedBar ── */
export function drawStackedBar(canvas,labels,earned,spent){
  if(!canvas)return;
  const W=canvas.offsetWidth||600,H=canvas.offsetHeight||220;
  const ctx=setupCanvas(canvas,W,H);
  const pL=56,pR=16,pT=12,pB=32,cW=W-pL-pR,cH=H-pT-pB;
  const n=labels.length;
  const top=niceNumber(Math.max(...earned.map((e,i)=>e+spent[i]),1)*1.08);
  const txt=chartText(),grid=chartGrid();
  for(let i=0;i<=4;i++){
    const y=pT+cH-(cH/4)*i;
    ctx.beginPath();ctx.moveTo(pL,y);ctx.lineTo(pL+cW,y);ctx.strokeStyle=grid;ctx.lineWidth=1;ctx.stroke();
    ctx.fillStyle=txt;ctx.font='10px -apple-system,system-ui,sans-serif';ctx.textAlign='right';ctx.textBaseline='middle';
    ctx.fillText(fmtAxisVal((top/4)*i),pL-8,y);
  }
  const bW=Math.max(4,(cW/n)*0.55),bOff=(cW/n)*0.225,r=Math.min(4,bW/2);
  labels.forEach((_,i)=>{
    const x=pL+i*(cW/n)+bOff;
    const exp=spent[i],sav=Math.max(0,earned[i]-spent[i]);
    const expH=Math.max(0,(exp/top)*cH),savH=Math.max(0,(sav/top)*cH);
    if(expH>0){
      /* Glow then solid — Sankey node style */
      ctx.beginPath();if(ctx.roundRect)ctx.roundRect(x,pT+cH-expH,bW,expH,savH>0?[0,0,r,r]:r);else ctx.rect(x,pT+cH-expH,bW,expH);
      glowFill(ctx,'#ff4d6a',0.2,8);
      ctx.beginPath();if(ctx.roundRect)ctx.roundRect(x,pT+cH-expH,bW,expH,savH>0?[0,0,r,r]:r);else ctx.rect(x,pT+cH-expH,bW,expH);
      ctx.fillStyle='#ff4d6a';ctx.fill();
    }
    if(savH>0){
      ctx.beginPath();if(ctx.roundRect)ctx.roundRect(x,pT+cH-expH-savH,bW,savH,[r,r,0,0]);else ctx.rect(x,pT+cH-expH-savH,bW,savH);
      glowFill(ctx,'#4ec9ff',0.2,8);
      ctx.beginPath();if(ctx.roundRect)ctx.roundRect(x,pT+cH-expH-savH,bW,savH,[r,r,0,0]);else ctx.rect(x,pT+cH-expH-savH,bW,savH);
      ctx.fillStyle='#4ec9ff';ctx.fill();
    }
  });
  const skip=Math.max(1,Math.ceil(n/10));
  ctx.fillStyle=txt;ctx.font='10px -apple-system,system-ui,sans-serif';ctx.textAlign='center';ctx.textBaseline='top';
  labels.forEach((l,i)=>{if(i%skip===0)ctx.fillText(l,pL+i*(cW/n)+bW/2+bOff,pT+cH+8);});
}

/* ── drawPieChart ── */
export function drawPieChart(canvas,catData){
  if(!canvas||!catData.length)return;
  const W=canvas.offsetWidth||400,H=canvas.offsetHeight||280;
  const ctx=setupCanvas(canvas,W,H);
  const total=catData.reduce((s,d)=>s+d.value,0);if(!total)return;
  const legendRows=Math.ceil(catData.length/3);
  const legendH=legendRows*20+8;
  const cx=W/2,r=Math.min(W/2,(H-legendH)/2)-16,cy=r+16;
  const sw=r*0.38,gap=0.04;
  let angle=-Math.PI/2;
  catData.forEach(d=>{
    const sweep=Math.max(0,(d.value/total)*Math.PI*2-gap);
    /* Sankey node glow — wide soft arc first */
    ctx.beginPath();ctx.arc(cx,cy,r,angle+gap/2,angle+gap/2+sweep);
    ctx.strokeStyle=hexToRgba(d.color,0.22);ctx.lineWidth=sw+10;ctx.lineCap='round';ctx.stroke();
    /* Solid arc on top */
    ctx.beginPath();ctx.arc(cx,cy,r,angle+gap/2,angle+gap/2+sweep);
    ctx.strokeStyle=d.color;ctx.lineWidth=sw;ctx.lineCap='round';ctx.stroke();
    if(sweep>0.3){
      const mid=angle+gap/2+sweep/2;
      const lx=cx+Math.cos(mid)*r,ly=cy+Math.sin(mid)*r;
      const pct=((d.value/total)*100).toFixed(0)+'%';
      ctx.fillStyle='rgba(255,255,255,0.95)';
      ctx.font=`bold ${Math.max(9,Math.round(sw*0.32))}px -apple-system,system-ui,sans-serif`;
      ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(pct,lx,ly);
    }
    angle+=sweep+gap;
  });
  const cols=3,lW=W/cols,lY=cy+r+sw/2+18;
  ctx.font='11px -apple-system,system-ui,sans-serif';ctx.textBaseline='middle';
  catData.forEach((d,i)=>{
    const col=i%cols,row=Math.floor(i/cols);
    const lx=col*lW+8,ly=lY+row*20;
    ctx.beginPath();ctx.arc(lx+5,ly,5,0,Math.PI*2);ctx.fillStyle=hexToRgba(d.color,0.25);ctx.fill();
    ctx.beginPath();ctx.arc(lx+5,ly,3.5,0,Math.PI*2);ctx.fillStyle=d.color;ctx.fill();
    ctx.fillStyle=chartText();ctx.textAlign='left';
    ctx.fillText(d.name.slice(0,18),lx+14,ly);
  });
  /* Hover — arc hit test */
  const pieAngles=[];
  let ang=-Math.PI/2;
  catData.forEach(d=>{
    const sweep=Math.max(0,(d.value/total)*Math.PI*2-0.04);
    pieAngles.push({d,startA:ang,endA:ang+sweep});
    ang+=sweep+0.04;
  });
  canvas.addEventListener('mousemove',e=>{
    const rect=canvas.getBoundingClientRect();
    const mx=e.clientX-rect.left-cx,my=e.clientY-rect.top-cy;
    const dist=Math.sqrt(mx*mx+my*my);
    const inner=r-sw/2-4,outer=r+sw/2+4;
    if(dist>=inner&&dist<=outer){
      let a=Math.atan2(my,mx);
      const hit=pieAngles.find(p=>{
        let sa=p.startA,ea=p.endA;
        while(a<sa)a+=Math.PI*2;
        return a>=sa&&a<=ea;
      });
      if(hit){
        const pct=((hit.d.value/total)*100).toFixed(1)+'%';
        ttShow(`<div class="tt-label">${hit.d.name}</div>${ttRow(hit.d.color,'',fmt(hit.d.value),pct)}`,e);
        canvas.style.cursor='pointer';return;
      }
    }
    ttHide();canvas.style.cursor='default';
  });
  canvas.addEventListener('mouseleave',()=>{ttHide();canvas.style.cursor='default';});
}

/* ── squarify ── */
export function squarify(data,rect){
  const items=[...data].filter(d=>d.value>0).sort((a,b)=>b.value-a.value);
  if(!items.length)return[];
  const total=items.reduce((s,d)=>s+d.value,0);
  const results=[];
  function worst(row,w,total){
    const s=row.reduce((a,n)=>a+n.value,0);
    if(!s||!w)return Infinity;
    const rMax=Math.max(...row.map(n=>n.value));
    const rMin=Math.min(...row.map(n=>n.value));
    const rowArea=s/total*(w);
    if(!rowArea)return Infinity;
    return Math.max(w*rMax/s,s/(w*rMin));
  }
  function layout(nodes,x,y,w,h){
    if(!nodes.length)return;
    if(nodes.length===1){results.push({d:nodes[0],x,y,w,h});return;}
    const nodeTotal=nodes.reduce((s,n)=>s+n.value,0);
    const horiz=w>=h;
    const short=horiz?h:w;
    let row=[],rowVal=0,score=Infinity;
    let splitAt=0;
    for(let i=0;i<nodes.length;i++){
      const candidate=[...row,nodes[i]];
      const cv=rowVal+nodes[i].value;
      const s=worst(candidate,short,nodeTotal);
      if(row.length&&s>score)break;
      score=s;row=candidate;rowVal=cv;splitAt=i+1;
    }
    const rowFrac=rowVal/nodeTotal;
    const stripLen=horiz?w*rowFrac:h*rowFrac;
    let pos=horiz?y:x;
    row.forEach(n=>{
      const itemLen=(n.value/rowVal)*(horiz?h:w);
      if(horiz)results.push({d:n,x,y:pos,w:stripLen,h:itemLen});
      else     results.push({d:n,x:pos,y,w:itemLen,h:stripLen});
      pos+=itemLen;
    });
    const rest=nodes.slice(splitAt);
    if(rest.length){
      if(horiz)layout(rest,x+stripLen,y,w-stripLen,h);
      else     layout(rest,x,y+stripLen,w,h-stripLen);
    }
  }
  layout(items,rect.x,rect.y,rect.w,rect.h);
  return results;
}

/* ── drawTreemap ── */
export function drawTreemap(canvas,catData){
  if(!canvas||!catData.length)return;
  const W=canvas.offsetWidth||600,H=canvas.offsetHeight||320;
  const ctx=setupCanvas(canvas,W,H);
  const total=catData.reduce((s,d)=>s+d.value,0);if(!total)return;

  /* WizTree-style: 1px border gap between cells, background fills the gaps */
  const bg=getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()||'#090e1a';
  ctx.fillStyle=bg;
  ctx.fillRect(0,0,W,H);

  const border=1.5; // gap between cells in px
  const rects=squarify(catData,{x:0,y:0,w:W,h:H});

  rects.forEach(({d,x,y,w,h})=>{
    if(w<border*2+2||h<border*2+2)return;
    const cx=Math.ceil(x+border),cy=Math.ceil(y+border);
    const cw=Math.floor(w-border*2),ch=Math.floor(h-border*2);
    if(cw<1||ch<1)return;

    /* Base fill */
    ctx.fillStyle=d.color;
    ctx.fillRect(cx,cy,cw,ch);

    /* Subtle inner gradient — lighter at top (WizTree look) */
    const grd=ctx.createLinearGradient(cx,cy,cx,cy+ch);
    grd.addColorStop(0,'rgba(255,255,255,0.12)');
    grd.addColorStop(0.4,'rgba(255,255,255,0.03)');
    grd.addColorStop(1,'rgba(0,0,0,0.2)');
    ctx.fillStyle=grd;
    ctx.fillRect(cx,cy,cw,ch);

    /* Inner top-left highlight line (WizTree 3D edge effect) */
    ctx.strokeStyle='rgba(255,255,255,0.18)';
    ctx.lineWidth=1;
    ctx.beginPath();ctx.moveTo(cx,cy+ch);ctx.lineTo(cx,cy);ctx.lineTo(cx+cw,cy);ctx.stroke();

    /* Text */
    const pct=((d.value/total)*100).toFixed(1)+'%';
    ctx.save();
    ctx.beginPath();ctx.rect(cx,cy,cw,ch);ctx.clip();

    if(cw>50&&ch>28){
      const fs=Math.min(14,Math.max(9,Math.min(Math.floor(cw/7),Math.floor(ch/2.8))));
      ctx.fillStyle='rgba(255,255,255,0.96)';
      ctx.font=`700 ${fs}px -apple-system,system-ui,sans-serif`;
      ctx.textBaseline='top';ctx.textAlign='left';
      const maxChars=Math.max(3,Math.floor((cw-12)/(fs*0.58)));
      const label=d.name.length>maxChars?d.name.slice(0,maxChars-1)+'…':d.name;
      ctx.fillText(label,cx+6,cy+5);
      if(ch>fs+20){
        ctx.fillStyle='rgba(255,255,255,0.6)';
        ctx.font=`${Math.max(8,fs-2)}px -apple-system,system-ui,sans-serif`;
        ctx.fillText(fmtAxisVal(d.value),cx+6,cy+6+fs);
        if(ch>fs*2+22){
          ctx.fillText(pct,cx+6,cy+6+fs*2+2);
        }
      }
    } else if(cw>28&&ch>18){
      const fs=Math.max(8,Math.min(10,Math.floor(ch/2)));
      ctx.fillStyle='rgba(255,255,255,0.85)';
      ctx.font=`700 ${fs}px -apple-system,system-ui,sans-serif`;
      ctx.textBaseline='middle';ctx.textAlign='center';
      ctx.fillText(pct,cx+cw/2,cy+ch/2);
    }
    ctx.restore();
  });

  /* Hover */
  const tmMeta=rects.map(({d,x,y,w,h})=>({
    x,y,w,h,
    html:`<div class="tt-label">${esc(d.name)}</div>${ttRow(d.color,'',fmt(d.value),((d.value/total)*100).toFixed(1)+'%')}`
  }));
  attachChartHover(canvas,()=>tmMeta);
}

/* ── drawRadar ── */
export function drawRadar(canvas,catData){
  if(!canvas)return;
  const dpr=window.devicePixelRatio||1;
  const W=canvas.offsetWidth||400,H=canvas.offsetHeight||300;
  canvas.width=W*dpr;canvas.height=H*dpr;
  const ctx=canvas.getContext('2d');ctx.scale(dpr,dpr);
  ctx.clearRect(0,0,W,H);
  let data=[...catData.slice(0,8)];
  if(data.length===0){
    ctx.fillStyle=chartText();ctx.font='13px -apple-system,system-ui,sans-serif';
    ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('No spending data yet',W/2,H/2);return;
  }
  while(data.length<3)data.push({name:'',value:0,color:'rgba(122,144,184,0.2)'});
  const n=data.length,cx=W/2,cy=H/2,r=Math.min(cx,cy)-55;
  const maxV=Math.max(...data.map(d=>d.value),1);
  const angleStep=(Math.PI*2)/n;
  const pt=(i,scale)=>({x:cx+Math.sin(i*angleStep)*r*scale,y:cy-Math.cos(i*angleStep)*r*scale});
  for(let ring=1;ring<=5;ring++){
    ctx.beginPath();
    for(let i=0;i<n;i++){const p=pt(i,ring/5);i===0?ctx.moveTo(p.x,p.y):ctx.lineTo(p.x,p.y);}
    ctx.closePath();ctx.strokeStyle=ring===5?'rgba(122,144,184,0.18)':'rgba(122,144,184,0.08)';ctx.lineWidth=1;ctx.stroke();
    const lp=pt(0,ring/5);
    ctx.fillStyle='rgba(122,144,184,0.45)';ctx.font='9px -apple-system,system-ui,sans-serif';ctx.textAlign='center';
    ctx.fillText(fmtAxisVal(maxV*ring/5),lp.x,lp.y-4);
  }
  for(let i=0;i<n;i++){
    const p=pt(i,1);ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(p.x,p.y);
    ctx.strokeStyle='rgba(122,144,184,0.12)';ctx.lineWidth=1;ctx.stroke();
    if(data[i].name){
      const lp=pt(i,1.18);ctx.fillStyle='rgba(238,242,255,0.85)';
      ctx.font='bold 11px -apple-system,system-ui,sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
      ctx.fillText(data[i].name.slice(0,14),lp.x,lp.y);
    }
  }
  /* Glow polygon */
  ctx.beginPath();
  data.forEach((d,i)=>{const scale=d.value/maxV;const p=pt(i,scale);i===0?ctx.moveTo(p.x,p.y):ctx.lineTo(p.x,p.y);});
  ctx.closePath();ctx.strokeStyle=hexToRgba('#3b82f6',0.25);ctx.lineWidth=8;ctx.lineJoin='round';ctx.stroke();
  /* Fill */
  ctx.beginPath();
  data.forEach((d,i)=>{const scale=d.value/maxV;const p=pt(i,scale);i===0?ctx.moveTo(p.x,p.y):ctx.lineTo(p.x,p.y);});
  ctx.closePath();
  const grd=ctx.createRadialGradient(cx,cy,0,cx,cy,r);
  grd.addColorStop(0,hexToRgba('#3b82f6',0.35));grd.addColorStop(1,hexToRgba('#3b82f6',0.08));
  ctx.fillStyle=grd;ctx.fill();
  /* Solid outline */
  ctx.beginPath();
  data.forEach((d,i)=>{const scale=d.value/maxV;const p=pt(i,scale);i===0?ctx.moveTo(p.x,p.y):ctx.lineTo(p.x,p.y);});
  ctx.closePath();ctx.strokeStyle='#3b82f6';ctx.lineWidth=2;ctx.stroke();
  /* Dots with glow */
  data.forEach((d,i)=>{
    if(!d.name&&d.value===0)return;
    const scale=d.value/maxV;const p=pt(i,scale);
    ctx.beginPath();ctx.arc(p.x,p.y,6,0,Math.PI*2);ctx.fillStyle=hexToRgba('#3b82f6',0.22);ctx.fill();
    ctx.beginPath();ctx.arc(p.x,p.y,3.5,0,Math.PI*2);ctx.fillStyle='#3b82f6';ctx.fill();
    ctx.strokeStyle=chartBg();ctx.lineWidth=1.5;ctx.stroke();
  });
  if(catData.length<3){
    ctx.fillStyle='rgba(122,144,184,0.5)';ctx.font='11px -apple-system,system-ui,sans-serif';
    ctx.textAlign='center';ctx.textBaseline='bottom';
    ctx.fillText(`${catData.length} of 3+ categories for full radar`,W/2,H-6);
  }
}

/* ── drawSankey ── */
export function drawSankey(canvas,totalIncome,catData,savings){
  if(!canvas)return;
  const W=canvas.offsetWidth||600,H=canvas.offsetHeight||360;
  const ctx=setupCanvas(canvas,W,H);
  const txt=chartText();

  if(!totalIncome&&!catData.length){
    ctx.fillStyle=txt;ctx.font='13px -apple-system,system-ui,sans-serif';
    ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillText('No income or spending data yet',W/2,H/2);
    return;
  }

  /* ── Layout constants ── */
  const nodeW=10;          // thin sharp rectangles
  const padTop=20;
  const padBot=20;
  const labelPad=8;
  const srcX=80;           // left node x position (space for "Income" label)
  const dstX=W-nodeW-120;  // right nodes x position (space for labels)
  const totalH=H-padTop-padBot;

  /* ── Data prep ── */
  const totalSpent=catData.reduce((s,d)=>s+d.value,0);
  const effectiveIncome=Math.max(totalIncome,totalSpent,1);
  const savingsAmt=Math.max(0,savings);

  // Right-side nodes
  const rightNodes=[...catData.map(d=>({...d}))];
  if(savingsAmt>0) rightNodes.push({
    id:'savings',name:'Savings',shortName:'Savings',
    value:savingsAmt,color:'#4ec9ff'
  });

  // Assign heights proportionally — with small gaps between nodes
  const nodeGap=6;
  const usableH=totalH-(rightNodes.length-1)*nodeGap;
  const rightTotal=rightNodes.reduce((s,n)=>s+n.value,0)||1;
  let curY=padTop;
  rightNodes.forEach(n=>{
    n.h=Math.max(4,Math.round((n.value/rightTotal)*usableH));
    n.y=curY;
    curY+=n.h+nodeGap;
  });

  /* ── Draw flows FIRST (behind nodes) ── */
  let srcY=padTop;
  rightNodes.forEach(n=>{
    const flowH=Math.max(2,Math.round((n.value/effectiveIncome)*totalH));
    const x0=srcX+nodeW, y0top=srcY, y0bot=srcY+flowH;
    const x1=dstX,       y1top=n.y, y1bot=n.y+n.h;
    const cpX=(x0+x1)/2;

    // Gradient flow — source color → destination color
    const grd=ctx.createLinearGradient(x0,0,x1,0);
    grd.addColorStop(0,'rgba(14,201,154,0.15)');
    grd.addColorStop(1,hexToRgba(n.color,0.28));

    ctx.beginPath();
    ctx.moveTo(x0,y0top);
    ctx.bezierCurveTo(cpX,y0top, cpX,y1top, x1,y1top);
    ctx.lineTo(x1,y1bot);
    ctx.bezierCurveTo(cpX,y1bot, cpX,y0bot, x0,y0bot);
    ctx.closePath();
    ctx.fillStyle=grd;
    ctx.fill();

    srcY+=flowH;
  });

  /* ── Draw source node (Income) — height = actual total flow used ── */
  const srcUsedH=Math.min(totalH, rightNodes.reduce((s,n)=>s+Math.max(2,Math.round((n.value/effectiveIncome)*totalH)),0));
  ctx.fillStyle='#3b82f6';
  ctx.fillRect(srcX, padTop, nodeW, srcUsedH);
  // Subtle glow on source node
  const srcGlow=ctx.createLinearGradient(srcX-8,0,srcX+nodeW+8,0);
  srcGlow.addColorStop(0,'rgba(59,130,246,0)');
  srcGlow.addColorStop(0.4,'rgba(59,130,246,0.18)');
  srcGlow.addColorStop(0.6,'rgba(59,130,246,0.18)');
  srcGlow.addColorStop(1,'rgba(59,130,246,0)');
  ctx.fillStyle=srcGlow;
  ctx.fillRect(srcX-8,padTop,nodeW+16,srcUsedH);
  // Redraw solid on top
  ctx.fillStyle='#3b82f6';
  ctx.fillRect(srcX,padTop,nodeW,srcUsedH);

  // "Income" label to the left of source node
  ctx.fillStyle='rgba(238,242,255,0.85)';
  ctx.font='bold 12px -apple-system,system-ui,sans-serif';
  ctx.textAlign='right';
  ctx.textBaseline='middle';
  ctx.fillText('Income',srcX-labelPad,H/2);
  ctx.fillStyle=txt;
  ctx.font='11px -apple-system,system-ui,sans-serif';
  ctx.fillText(fmtAxisVal(effectiveIncome),srcX-labelPad,H/2+16);

  /* ── Draw destination nodes + labels ── */
  rightNodes.forEach(n=>{
    // Glow
    const ng=ctx.createLinearGradient(dstX-6,0,dstX+nodeW+6,0);
    ng.addColorStop(0,hexToRgba(n.color,0));
    ng.addColorStop(0.4,hexToRgba(n.color,0.2));
    ng.addColorStop(0.6,hexToRgba(n.color,0.2));
    ng.addColorStop(1,hexToRgba(n.color,0));
    ctx.fillStyle=ng;
    ctx.fillRect(dstX-6,n.y,nodeW+12,n.h);

    // Sharp node rectangle
    ctx.fillStyle=n.color;
    ctx.fillRect(dstX,n.y,nodeW,n.h);

    // Label to the right
    const labelX=dstX+nodeW+labelPad;
    const midY=n.y+n.h/2;
    const pct=((n.value/effectiveIncome)*100).toFixed(0)+'%';
    const displayName=(n.shortName||n.name||'').replace(/^[^\w]*\s*/,''); // strip emoji prefix

    ctx.textAlign='left';
    ctx.textBaseline='middle';
    // Name + pct on same line if node is tall enough, else just name
    if(n.h>=22){
      ctx.fillStyle='rgba(238,242,255,0.9)';
      ctx.font='bold 12px -apple-system,system-ui,sans-serif';
      ctx.fillText(displayName,labelX,n.h>36?midY-8:midY);
      if(n.h>28){
        ctx.fillStyle=txt;
        ctx.font='11px -apple-system,system-ui,sans-serif';
        ctx.fillText(fmtAxisVal(n.value)+' · '+pct,labelX,midY+8);
      }
    } else {
      ctx.fillStyle='rgba(238,242,255,0.8)';
      ctx.font='10px -apple-system,system-ui,sans-serif';
      ctx.fillText(displayName.slice(0,10)+' '+pct,labelX,midY);
    }
  });
}

