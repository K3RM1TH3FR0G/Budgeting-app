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
import { applyTheme, getTheme, toggleTheme } from '../theme.js';

function renderSettings(){
  const u=State.user,s=State.settings,hh=State.household;
  render(`
  <div class="ph"><div class="pt">Settings</div></div>
  <div class="card mb16 mobile-only">
    <div class="card-title">Quick Links</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      ${[
        {id:'reports',  label:'Reports',  emoji:'📊'},
        {id:'goals',    label:'Goals',    emoji:'🎯'},
        {id:'forecast', label:'Forecast', emoji:'📈'},
        {id:'loans',    label:'Loan Calc',emoji:'🏠'},
        {id:'bills',    label:'Bills',    emoji:'📄'},
        {id:'debts',    label:'Debts',    emoji:'💳'},
        {id:'splits',   label:'Splits',   emoji:'🤝'},
        {id:'accounts', label:'Accounts', emoji:'🏦'},
        {id:'categories',label:'Categories',emoji:'🏷️'},
      ].map(p=>`<button data-page="${p.id}" class="btn btn-ghost" style="justify-content:flex-start;gap:10px;padding:12px 14px">${p.emoji} ${p.label}</button>`).join('')}
    </div>
  </div>
  <div class="card mb16"><div class="card-title">Profile</div>
    <div class="fac gap16 mb16">
      <div class="avatar" style="width:52px;height:52px;font-size:18px;background:${avatarColor(u.name)}">${initials(u.name)}</div>
      <div><div id="pd"><div style="font-size:18px;font-weight:900">${esc(u.name)}</div><div style="font-size:13px;color:var(--text2)">${esc(u.email)}</div><button class="link" id="edit-name-btn" style="font-size:13px;margin-top:4px;display:block">Edit name</button></div>
      <div id="pe" style="display:none"><div class="fac gap8"><input class="input" id="name-inp" value="${esc(u.name)}" style="width:200px"><button class="btn btn-primary btn-sm" id="save-name-btn">Save</button><button class="btn btn-ghost btn-sm" id="cancel-name-btn">Cancel</button></div></div>
      </div>
    </div>
    <div class="setting-row"><div><div class="sr-label">Email</div></div><span class="badge b-green">✓ ${esc(u.email)}</span></div>
    <div class="setting-row"><div><div class="sr-label">Member Since</div></div><span style="font-size:13px;color:var(--text2)">${new Date(u.createdAt).toLocaleDateString('en-US',{month:'long',year:'numeric'})}</span></div>
    <div class="setting-row"><div><div class="sr-label">Sync Status</div><div class="sr-sub">Data synced to Supabase cloud</div></div><span class="badge b-green">☁ Live</span></div>
  </div>
  <div class="card mb16">
    <div class="fbc mb16">
      <div><div class="card-title" style="margin:0">Household Sharing</div><div style="font-size:12px;color:var(--text2);margin-top:2px">${hh.length+1} member${hh.length>0?'s':''} · shared budgets sync in real time</div></div>
      <span class="badge b-purple">${IC.users} ${hh.length+1}</span>
    </div>
    <div class="hm"><div class="avatar" style="background:${avatarColor(esc(u.name))}">${initials(esc(u.name))}</div><div style="flex:1"><div style="font-weight:700;font-size:14px">${u.name} <span class="badge b-purple" style="margin-left:6px">You · Owner</span></div><div style="font-size:12px;color:var(--text2)">${u.email}</div></div></div>
    ${hh.map(m=>`<div class="hm"><div class="avatar" style="background:${avatarColor(m.name)};font-size:11px">${initials(m.name)}</div><div style="flex:1"><div style="font-weight:700;font-size:14px">${esc(m.name)}</div><div style="font-size:12px;color:var(--text2)">${esc(m.email)}</div></div><button class="btn btn-danger btn-xs" data-rm="${esc(m.id)}">Remove</button></div>`).join('')}
    <div class="divider"></div>
    <div style="font-size:13px;font-weight:800;color:var(--text2);margin-bottom:8px">Invite a household member</div>
    <div class="fac gap8"><input class="input" id="invite-email" type="email" placeholder="their@email.com" style="flex:1"><button class="btn btn-primary" id="invite-btn">${IC.plus} Invite</button></div>
    <div style="font-size:12px;color:var(--text3);margin-top:8px;line-height:1.5">Invited members can view and add transactions to your shared household. They log in with their own account and link to yours using your household code.</div>
    ${hh.length>0?`<div class="divider"></div>
    <div style="font-size:13px;font-weight:800;color:var(--text2);margin-bottom:8px">Your Household Code</div>
    <div style="background:var(--card2);border-radius:var(--rsm);padding:12px;font-family:monospace;font-size:16px;font-weight:900;letter-spacing:4px;text-align:center;color:var(--green);user-select:all">${btoa(u.id).slice(0,8).toUpperCase()}</div>
    <div style="font-size:11px;color:var(--text3);margin-top:6px;text-align:center">Share this code with family members to join your household</div>`:''}
    ${hh.length>0?`<div class="divider"></div>
    <div class="fbc">
      <div><div class="sr-label">Shared Budget View</div><div style="font-size:12px;color:var(--text2);margin-top:2px">Show combined spending for all members</div></div>
      <label class="toggle"><input type="checkbox" id="shared-view" ${s.sharedView?'checked':''}><span class="tslider"></span></label>
    </div>`:''}
  </div>
  <div class="card mb16"><div class="card-title">Preferences</div>
    <div class="setting-row"><div><div class="sr-label">Mobile Nav Bar</div><div class="sr-sub">Choose which pages appear in the bottom nav</div></div><button class="btn btn-ghost btn-sm" id="btn-nav-pins">📌 Customize</button></div>
    <div class="setting-row"><div><div class="sr-label">Budget Alerts</div><div class="sr-sub">Warn when nearing budget limits</div></div><label class="toggle"><input type="checkbox" id="tog-notifs" ${s.notifs?'checked':''}><span class="tslider"></span></label></div>
    <div class="setting-row"><div><div class="sr-label">Balance Mode</div><div class="sr-sub" id="bal-mode-sub">${s.autoBalance?'⚡ Auto — balance updates from transactions':'Manual — you control the balance'}</div></div>
      <div style="display:flex;align-items:center;gap:8px">
        <span id="lbl-manual" style="font-size:12px;font-weight:700;color:${!s.autoBalance?'var(--text)':'var(--text3)'}">Manual</span>
        <label class="toggle"><input type="checkbox" id="tog-auto-balance" ${s.autoBalance?'checked':''}><span class="tslider"></span></label>
        <span id="lbl-auto" style="font-size:12px;font-weight:700;color:${s.autoBalance?'var(--green)':'var(--text3)'}">Auto</span>
      </div>
    </div>
    <div class="setting-row"><div><div class="sr-label">Theme</div><div class="sr-sub">Switch between dark and light mode</div></div>
      <div class="theme-toggle" id="settings-theme-btn" style="padding:0">
        <div class="theme-pill"></div>
        <span class="theme-label" style="font-size:13px;font-weight:700;color:var(--text2)">${getTheme()==='light'?'Light Mode':'Dark Mode'}</span>
      </div>
    </div>
    <div class="setting-row"><div><div class="sr-label">Week starts on</div></div><select class="input" id="week-start" style="width:auto"><option value="monday" ${s.weekStart==='monday'?'selected':''}>Monday</option><option value="sunday" ${s.weekStart==='sunday'?'selected':''}>Sunday</option></select></div>
    <div class="setting-row"><div><div class="sr-label">Daily Spending Limit</div><div class="sr-sub">Alert when daily spend exceeds this amount</div></div><div class="amt-wrap" style="width:120px"><span class="amt-prefix" style="font-size:13px">$</span><input class="input" id="daily-limit" type="number" min="0" placeholder="Off" value="${s.dailyLimit||''}" style="padding:7px 7px 7px 22px;font-size:14px;font-weight:700"></div></div>
  </div>
    <div class="setting-row"><div><div class="sr-label">Budget Style Guides</div><div class="sr-sub">Apply 50/30/20, zero-based, or envelope method</div></div><button class="btn btn-ghost btn-sm" id="btn-style-guide">📊 Explore</button></div>
    <div class="setting-row"><div><div class="sr-label">Custom Categories</div><div class="sr-sub">${CATS.filter(c=>c.custom).length} custom · create your own spending categories</div></div><button class="btn btn-ghost btn-sm" id="btn-cats">🏷️ Manage</button></div>
    <div class="setting-row"><div><div class="sr-label">Alert Center</div><div class="sr-sub">View all budget warnings and goal milestones</div></div><button class="btn btn-ghost btn-sm" id="btn-alerts">${IC.bell} View</button></div>
  </div>
  <div class="card mb16"><div class="card-title">Recurring Transactions</div>
    <div class="setting-row"><div><div class="sr-label">Manage Recurring</div><div class="sr-sub">${State.recurring.length} active · bills, subscriptions, income</div></div><button class="btn btn-ghost btn-sm" id="btn-rec">${IC.repeat} Manage</button></div>
  </div>
  <div class="card mb16"><div class="card-title">Data Management</div>
    <div class="setting-row"><div><div class="sr-label">Import CSV</div><div class="sr-sub">Import from your bank's CSV export</div></div><button class="btn btn-ghost btn-sm" id="btn-imp">${IC.upload} Import</button></div>
    <div class="setting-row"><div><div class="sr-label">Export Transactions</div><div class="sr-sub">Download all transactions as CSV</div></div><button class="btn btn-ghost btn-sm" id="btn-exp-csv">${IC.download} CSV</button></div>
  </div>
  <div class="card"><div class="card-title">Session</div>
    <div class="setting-row"><div><div class="sr-label">Sign Out</div><div class="sr-sub">You'll be signed out on this device</div></div><button class="btn btn-danger btn-sm" id="logout-btn2">${IC.out} Sign Out</button></div>
  </div>`,
  ()=>{
    /* Wire quick link buttons inside settings */
    $$('[data-page]',$('#main-content')).forEach(b=>b.addEventListener('click',()=>navigate(b.dataset.page)));
    $('#edit-name-btn')?.addEventListener('click',()=>{$('#pd').style.display='none';$('#pe').style.display='block';$('#name-inp').focus()});
    $('#cancel-name-btn')?.addEventListener('click',()=>{$('#pd').style.display='';$('#pe').style.display='none'});
    $('#save-name-btn')?.addEventListener('click',async()=>{
      const name=$('#name-inp').value.trim();if(!name)return;
      State.user={...State.user,name};
      await SB.updateName(name).catch(()=>{});
      const un=$('.u-name');if(un)un.textContent=name;
      showToast('Name updated!');renderSettings();
    });
    $('#invite-btn')?.addEventListener('click',async()=>{
      const e=$('#invite-email').value.trim();if(!e)return;
      const name=e.split('@')[0];
      const member=await SB.addMember(State.user.id,e,name).catch(()=>null);
      State.household.push(member||{id:genId(),email:e,name});
      showToast('Invite sent!');renderSettings();
    });
    $('#invite-email')?.addEventListener('keydown',e=>{if(e.key==='Enter')$('#invite-btn').click()});
    $$('[data-rm]').forEach(b=>b.addEventListener('click',async()=>{await SB.removeMember(b.dataset.rm).catch(()=>{});State.household=State.household.filter(m=>m.id!==b.dataset.rm);renderSettings()}));
    $('#shared-view')?.addEventListener('change',e=>{State.settings.sharedView=e.target.checked;saveAndSync('settings',State.settings,()=>SB.saveSettings(State.user.id,State.settings));showToast(e.target.checked?'Shared view enabled':'Shared view disabled');});
    $('#tog-notifs')?.addEventListener('change',e=>{State.settings.notifs=e.target.checked;saveAndSync('settings',State.settings,()=>SB.saveSettings(State.user.id,State.settings))});
    $('#tog-auto-balance')?.addEventListener('change',e=>{
      const on=e.target.checked;
      State.settings.autoBalance=on;
      saveAndSync('settings',State.settings,()=>SB.saveSettings(State.user.id,State.settings));
      /* Update labels in-place — no page re-render */
      const lblManual=$('#lbl-manual');const lblAuto=$('#lbl-auto');const sub=$('#bal-mode-sub');
      if(lblManual) lblManual.style.color=on?'var(--text3)':'var(--text)';
      if(lblAuto)   lblAuto.style.color=on?'var(--green)':'var(--text3)';
      if(sub)       sub.textContent=on?'⚡ Auto — balance updates from transactions':'Manual — you control the balance';
      showToast(on?'⚡ Auto-Balance ON':'Manual mode ON');
    });
    $('#week-start')?.addEventListener('change',e=>{State.settings.weekStart=e.target.value;saveAndSync('settings',State.settings,()=>SB.saveSettings(State.user.id,State.settings))});
    $('#daily-limit')?.addEventListener('change',e=>{const v=parseFloat(e.target.value);State.settings.dailyLimit=v>0?v:null;saveAndSync('settings',State.settings,()=>SB.saveSettings(State.user.id,State.settings));showToast(v>0?'Daily limit set to '+fmtK(v):'Daily limit removed');});
    $('#settings-theme-btn')?.addEventListener('click',()=>{toggleTheme();renderSettings()});
    $('#btn-style-guide')?.addEventListener('click',()=>{const ms=monthStats(State.txs,0);showStyleGuideModal(ms.income||0)});
    $('#btn-cats')?.addEventListener('click',()=>navigate('categories'));
    $('#btn-nav-pins')?.addEventListener('click',showNavPinModal);
    $('#btn-alerts')?.addEventListener('click',showAlertCenter);
    $('#btn-rec')?.addEventListener('click',showRecurringModal);
    $('#btn-imp')?.addEventListener('click',showImportModal);
    $('#btn-exp-csv')?.addEventListener('click',exportCSV);
    $('#logout-btn2')?.addEventListener('click',logout);
  });
}


export { renderSettings };
