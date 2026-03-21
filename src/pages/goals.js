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
import { drawRing } from '../charts.js';

function renderGoals(){
  const goals=State.goals,totalTarget=goals.reduce((s,g)=>s+g.target,0),totalSaved=goals.reduce((s,g)=>s+g.saved,0);
  render(`
  <div class="ph"><div><div class="pt">Goals</div><div class="ps">Track what you're saving toward</div></div><button class="btn btn-primary" id="btn-new-goal">${IC.plus} New Goal</button></div>
  ${goals.length?`<div class="g3 mb16"><div class="rstat"><div class="rstat-lbl">Total Target</div><div class="rstat-val">${fmtK(totalTarget)}</div></div><div class="rstat"><div class="rstat-lbl">Total Saved</div><div class="rstat-val" style="color:var(--green)">${fmtK(totalSaved)}</div></div><div class="rstat"><div class="rstat-lbl">Still Needed</div><div class="rstat-val" style="color:var(--orange)">${fmtK(Math.max(0,totalTarget-totalSaved))}</div></div></div>`:''}
  ${goals.length?`<div class="g2 mb16">${goals.map((g,i)=>{const pct=g.target>0?Math.min((g.saved/g.target)*100,100):0;const left=Math.max(0,g.target-g.saved);const color=g.color||'#3b82f6';return`<div class="goal-card"><div class="goal-ring-wrap"><canvas class="ring" data-idx="${i}" style="width:70px;height:70px"></canvas><div class="goal-info"><div class="goal-name">${esc(g.emoji)} ${esc(g.name)}</div><div class="goal-sub">${g.deadline?'Target: '+new Date(g.deadline+'T12:00:00').toLocaleDateString('en-US',{month:'short',year:'numeric'}):'No deadline'}</div></div></div><div class="pbar" style="height:6px"><div class="pfill" style="width:${pct}%;background:${color}"></div></div><div class="goal-amounts"><span style="color:${color};font-weight:800">${fmtK(g.saved)} saved</span><span style="color:var(--text3)">${fmtK(left)} to go</span></div><div class="fac gap8" style="flex-wrap:wrap"><button class="btn btn-primary btn-sm" style="flex:1;justify-content:center" data-contrib="${i}">${IC.plus} Add Money</button><button class="btn btn-ghost btn-sm" data-edit-goal="${i}">${IC.bulb} Edit</button><button class="btn btn-danger btn-xs" data-del-goal="${i}" aria-label="Delete goal: ${esc(g.name)}">${IC.trash}</button></div></div>`}).join('')}</div>`
  :`<div class="card mb16"><div class="empty"><div class="empty-icon">🎯</div><div class="empty-title">No goals yet</div><div class="empty-sub">Set a savings goal and track your progress</div></div></div>`}
  <button class="goal-add-btn" id="btn-new-goal2">${IC.plus} Add a New Goal</button>`,
  ()=>{
    $('#btn-new-goal')?.addEventListener('click',()=>showGoalModal());
    $('#btn-new-goal2')?.addEventListener('click',()=>showGoalModal());
    $$('[data-contrib]').forEach(b=>b.addEventListener('click',()=>showContributeModal(parseInt(b.dataset.contrib))));
    $$('[data-edit-goal]').forEach(b=>b.addEventListener('click',()=>showGoalModal(parseInt(b.dataset.editGoal))));
    $$('[data-del-goal]').forEach(b=>b.addEventListener('click',()=>{if(!confirm('Delete this goal?'))return;State.goals.splice(parseInt(b.dataset.delGoal),1);saveAndSync('goals',State.goals,()=>SB.saveGoals(State.user.id,State.goals));renderGoals();showToast('Goal deleted')}));
    setTimeout(()=>$$('canvas.ring').forEach(c=>{const g=State.goals[parseInt(c.dataset.idx)];if(g){const pct=g.target>0?Math.min((g.saved/g.target)*100,100):0;drawRing(c,pct,g.color||'#3b82f6');}}),50);
  });
}

function showGoalModal(editIdx=null){
  const g=editIdx!==null?State.goals[editIdx]:null;
  const modal=document.createElement('div');modal.className='overlay';modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.setAttribute('aria-label',g?'Edit Goal':'New Goal');
  modal.innerHTML=`<div class="modal" role="dialog" aria-modal="true"><div class="mh"><div class="mt-modal">${g?'Edit Goal':'New Goal'}</div><button class="xbtn" id="xm" aria-label="Close">✕</button></div>
    <div class="ig"><label class="il" for="g-name">Goal Name</label><input class="input" id="g-name" type="text" placeholder="e.g. Emergency Fund" value="${esc(g?g.name:'')}"></div>
    <div class="g2"><div class="ig"><label class="il" for="g-target">Target Amount</label><div class="amt-wrap"><span class="amt-prefix">$</span><input class="input" id="g-target" type="number" min="1" placeholder="0" value="${g?g.target:''}"></div></div><div class="ig"><label class="il" for="g-saved">Already Saved</label><div class="amt-wrap"><span class="amt-prefix">$</span><input class="input" id="g-saved" type="number" min="0" placeholder="0" value="${g?g.saved:'0'}"></div></div></div>
    <div class="ig"><label class="il" for="g-deadline">Target Date (optional)</label><input class="input" id="g-deadline" type="month" value="${g&&g.deadline?g.deadline.slice(0,7):''}"></div>
    <div class="ig"><label class="il">Emoji</label><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:4px">${GOAL_EMOJIS.map(e=>`<button class="emoji-opt" data-e="${e}" aria-label="Emoji ${e}" style="width:36px;height:36px;border-radius:8px;border:2px solid ${g&&g.emoji===e?'var(--accent)':'var(--border2)'};background:${g&&g.emoji===e?'var(--accent-dim)':'var(--card2)'};cursor:pointer;font-size:18px;transition:all .15s">${e}</button>`).join('')}</div></div>
    <div class="ig"><label class="il">Color</label><div style="display:flex;gap:8px;margin-top:4px">${GOAL_COLORS.map(c=>`<div class="color-swatch" data-c="${c}" role="radio" tabindex="0" aria-label="Color ${c}" aria-checked="${g&&g.color===c}" style="width:28px;height:28px;border-radius:50%;background:${c};cursor:pointer;border:2px solid ${g&&g.color===c?'white':'transparent'};transition:transform .15s"></div>`).join('')}</div></div>
    <div class="fac gap10 mt16"><button class="btn btn-ghost w100" id="cancel-g" style="justify-content:center">Cancel</button><button class="btn btn-primary w100" id="save-g" style="justify-content:center">${g?'Save Changes':'Create Goal'}</button></div>
  </div>`;
  openModal(modal);
  let selEmoji=g?g.emoji:GOAL_EMOJIS[0],selColor=g?g.color:GOAL_COLORS[0];
  const refEmoji=()=>$$('.emoji-opt',modal).forEach(b=>{b.style.borderColor=b.dataset.e===selEmoji?'var(--green)':'var(--border2)';b.style.background=b.dataset.e===selEmoji?'var(--green-dim)':'var(--card2)'});
  const refColor=()=>$$('.color-swatch',modal).forEach(s=>{s.style.border=`2px solid ${s.dataset.c===selColor?'white':'transparent'}`;s.style.transform=s.dataset.c===selColor?'scale(1.2)':'scale(1)'});
  refEmoji();refColor();
  $$('.emoji-opt',modal).forEach(b=>b.addEventListener('click',()=>{selEmoji=b.dataset.e;refEmoji()}));
  $$('.color-swatch',modal).forEach(s=>s.addEventListener('click',()=>{selColor=s.dataset.c;refColor()}));
  modal.addEventListener('click',e=>{if(e.target===modal)closeModal(modal)});
  $('#xm',modal).addEventListener('click',()=>closeModal(modal));
  $('#cancel-g',modal).addEventListener('click',()=>closeModal(modal));
  $('#save-g',modal).addEventListener('click',()=>{
    const name=$('#g-name',modal).value.trim(),target=parseFloat($('#g-target',modal).value),saved=parseFloat($('#g-saved',modal).value)||0;
    if(!name||isNaN(target)||target<=0)return showToast('Fill in name and target','var(--red)');
    const dl=$('#g-deadline',modal).value;
    const goal={id:g?g.id:genId(),name,target,saved,emoji:selEmoji,color:selColor,deadline:dl?dl+'-01':null};
    if(editIdx!==null)State.goals[editIdx]=goal;else State.goals.push(goal);
    saveAndSync('goals',State.goals,()=>SB.saveGoals(State.user.id,State.goals));
    closeModal(modal);showToast(editIdx!==null?'Goal updated ✓':'Goal created! 🎯');renderGoals();
  });
  $('#g-name',modal).focus();
}

function showContributeModal(idx){
  const g=State.goals[idx];if(!g)return;
  const pct=g.target>0?Math.min((g.saved/g.target)*100,100):0;
  const modal=document.createElement('div');modal.className='overlay';
  modal.innerHTML=`<div class="modal" role="dialog" aria-modal="true"><div class="mh"><div class="mt-modal">Add Money · ${esc(g.emoji)} ${esc(g.name)}</div><button class="xbtn" aria-label="Close" id="xm">✕</button></div>
    <div style="background:var(--card2);border-radius:var(--rsm);padding:14px;margin-bottom:16px;text-align:center"><div style="font-size:12px;color:var(--text2);margin-bottom:4px">Current Progress</div><div style="font-size:22px;font-weight:900;color:${g.color||'var(--green)'}">${fmtK(g.saved)} <span style="font-size:14px;color:var(--text2)">/ ${fmtK(g.target)}</span></div><div class="pbar" style="margin-top:10px;height:6px"><div class="pfill" style="width:${pct}%;background:${g.color||'var(--green)'}"></div></div></div>
    <div class="ig"><label class="il">Amount to Add</label><div class="amt-wrap"><span class="amt-prefix">$</span><input class="input" id="contrib-amt" type="number" min="1" placeholder="0" inputmode="decimal"></div></div>
    <div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap">${[50,100,250,500].map(v=>`<button class="btn btn-ghost btn-sm quick-amt" data-v="${v}">+$${v}</button>`).join('')}</div>
    <div class="fac gap10"><button class="btn btn-ghost w100" id="cancel-c" style="justify-content:center">Cancel</button><button class="btn btn-primary w100" id="save-c" style="justify-content:center">Add to Goal</button></div>
  </div>`;
  openModal(modal);
  modal.addEventListener('click',e=>{if(e.target===modal)closeModal(modal)});
  $('#xm',modal).addEventListener('click',()=>closeModal(modal));
  $('#cancel-c',modal).addEventListener('click',()=>closeModal(modal));
  $$('.quick-amt',modal).forEach(b=>b.addEventListener('click',()=>{$('#contrib-amt',modal).value=b.dataset.v}));
  $('#save-c',modal).addEventListener('click',()=>{
    const amt=parseFloat($('#contrib-amt',modal).value);if(isNaN(amt)||amt<=0)return;
    State.goals[idx].saved=Math.min(State.goals[idx].saved+amt,State.goals[idx].target);
    saveAndSync('goals',State.goals,()=>SB.saveGoals(State.user.id,State.goals));
    closeModal(modal);const done=State.goals[idx].saved>=State.goals[idx].target;
    showToast(done?'🎉 Goal reached!':'Added '+fmtK(amt)+' to goal!');renderGoals();
  });
  $('#contrib-amt',modal).focus();
}

export { renderGoals };
