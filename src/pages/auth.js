import { $, $$, esc, fmt, fmtK, fmtDate, fmtAxisVal, genId, todayStr,
          initials, avatarColor, hexToRgba } from '../utils.js';
import { IC }                               from '../icons.js';
import { SB }                               from '../db.js';
import { State, Cache, saveAndSync, queueSync,
          DEFAULT_BUDGETS, getDebts, saveDebts,
          getNWHistory, saveNWHistory,
          saveSplits, saveBills }            from '../state.js';
import { getCat, CATS }                     from '../categories.js';
import { render, showToast, showGlobalLoading, openModal, closeModal,
          bedrockLogo, setSyncIndicator }     from '../ui.js';
import { navigate }                          from '../router.js';
import { applyTheme, getTheme } from '../theme.js';
import { loadUserData } from '../state.js';

function renderAuth(mode='login'){
  $('#app').innerHTML=`
  <div class="auth-wrap">
    <div class="auth-glow a"></div><div class="auth-glow b"></div>
    <div class="auth-card">
      <div class="auth-logo">${bedrockLogo(48)}</div>
      <div class="auth-title">${mode==='login'?'Welcome back':'Create your account'}</div>
      <div class="auth-sub">${mode==='login'?'Sign in to continue budgeting.':'Your smarter money journey starts here.'}</div>
      <div id="auth-err" role="alert" aria-live="polite" style="display:none" class="auth-err"></div>
      ${mode==='register'?`<div class="ig"><label class="il" for="inp-name">Full Name</label><input class="input" id="inp-name" type="text" placeholder="Jane Smith" autocomplete="name"></div>`:''}
      <div class="ig"><label class="il" for="inp-email">Email Address</label><input class="input" id="inp-email" type="email" placeholder="you@example.com" autocomplete="email"></div>
      <div class="ig"><label class="il" for="inp-pass">Password</label><input class="input" id="inp-pass" type="password" placeholder="${mode==='register'?'Minimum 8 characters':'••••••••'}" autocomplete="${mode==='register'?'new-password':'current-password'}"></div>
      <button class="btn btn-primary w100" id="auth-submit" style="justify-content:center;padding:13px;margin-top:6px">${mode==='login'?'Sign In →':'Create Account →'}</button>
      ${mode==='login'?`<div style="text-align:center;margin-top:12px"><span class="auth-link" id="forgot-pw" tabindex="0" role="button">Forgot password?</span></div>`:''}
      <div class="auth-switch">${mode==='login'?`No account? <span class="auth-link" id="mode-sw">Sign up free</span>`:`Have an account? <span class="auth-link" id="mode-sw">Sign in</span>`}</div>
    </div>
  </div>`;

  const submit=async()=>{
    const btn=$('#auth-submit');btn.textContent='Loading…';btn.disabled=true;
    const email=$('#inp-email')?.value.trim(),pass=$('#inp-pass')?.value,name=$('#inp-name')?.value.trim();
    const showErr=msg=>{const e=$('#auth-err');if(e){e.textContent=msg;e.style.display='block'}btn.textContent=mode==='login'?'Sign In →':'Create Account →';btn.disabled=false;};
    try{
      if(mode==='login'){
        const user=await SB.signIn(email,pass);
        showGlobalLoading('Loading your data…');
        await loadUserData(user);
        import('../shell.js').then(m => m.initApp());
      } else {
        if(!name)return showErr('Please enter your name');
        if(pass.length<8)return showErr('Password must be at least 8 characters');
        const user=await SB.signUp(email,pass,name);
        showGlobalLoading('Setting up your account…');
        await loadUserData(user);
        renderOnboarding();
      }
    }catch(e){showErr(e.message||'Something went wrong. Please try again.');}
  };

  /* Enter on any field submits */
  ['#inp-name','#inp-email','#inp-pass'].forEach(sel=>{
    $(sel)?.addEventListener('keydown',e=>{if(e.key==='Enter')submit();});
  });

  $('#auth-submit').addEventListener('click',submit);
  $('#mode-sw').addEventListener('click',()=>renderAuth(mode==='login'?'register':'login'));

  /* Forgot password */
  $('#forgot-pw')?.addEventListener('click',async()=>{
    const email=$('#inp-email')?.value.trim();
    if(!email)return showToast('Enter your email first','var(--orange)');
    const btn=$('#auth-submit');btn.disabled=true;
    try{
      await supa.auth.resetPasswordForEmail(email,{redirectTo:location.origin+location.pathname});
      showToast('Password reset email sent — check your inbox ✓');
    }catch(e){showToast('Could not send reset email. Try again.','var(--red)');}
    btn.disabled=false;
  });
  $('#forgot-pw')?.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' ')$('#forgot-pw').click();});
}

function renderOnboarding(){
  const firstName=esc(State.user.name.split(' ')[0]);

  /* ── STEP DEFINITIONS ── */
  const steps=[
    {
      id:'pay_freq',
      q:'How often do you get paid?',
      hint:'This helps Bedrock understand your income cycle. Nothing is recorded until you log a payment yourself.',
      type:'choice',
      choices:['Weekly','Bi-Weekly (every 2 weeks)','Twice a Month (1st & 15th)','Monthly','Irregular / varies'],
    },
    {
      id:'income',
      q:'What is your income per pay period (after tax)?',
      hint:'This is just for planning — Bedrock will NOT record any income until you log it yourself in Transactions.',
      type:'money',
      placeholder:'e.g. 2250',
    },
    {
      id:'account_add',
      q:'Would you like to add a bank account?',
      hint:'Enter the current balance as it appears in your banking app right now. Nothing is assumed or auto-paid.',
      type:'yesno',
    },
    {
      id:'debts',
      q:'Do you have any loans or debts?',
      hint:'Credit cards, student loans, auto loans, mortgage, personal loans — pick all that apply.',
      type:'multi',
      choices:['Credit Card','Student Loan','Auto Loan','Mortgage','Personal Loan','Medical Debt','No debts'],
    },
    {
      id:'subs',
      q:'What subscriptions or regular bills do you pay?',
      hint:"We'll track these in your Bills page. Nothing is paid automatically — you log payments yourself.",
      type:'bill_picker',
    },
    {
      id:'utilities',
      q:'Which utilities do you pay?',
      hint:"We won't ask for amounts since they vary. You can add the amount when you receive a bill and mark it paid when you pay it.",
      type:'multi',
      choices:['Electricity','Gas','Water','Internet','Phone','Trash','Sewer','Other Utility'],
    },
    {
      id:'style',
      q:'How do you like to budget?',
      hint:"Bedrock will pre-fill your budget categories. You can always change this later.",
      type:'choice',
      choices:['No particular style','50/30/20 Rule','Zero-based','Envelope method','Just track spending'],
    },
    {
      id:'goals',
      q:'What are you saving toward?',
      hint:'Pick all that apply. Bedrock will create goal cards for each one.',
      type:'multi',
      choices:['Emergency fund','House / down payment','Car','Vacation','Pay off debt','Retirement','Education','Something else'],
    },
  ];

  let step=0;
  const answers={accounts:[],debtDetails:[]};

  /* Build the dynamic step list based on current answers */
  function getActiveSteps(){
    const base=[...steps];

    /* ── ACCOUNT LOOP ──
       After account_add (yes/no):
         if Yes → insert account_detail_0 + account_more_0 (yes/no)
         if addMore_0 === Yes → insert account_detail_1 + account_more_1
         ... keep going until the latest addMore_N is 'No' or unanswered
    */
    const addIdx=base.findIndex(s=>s.id==='account_add');
    if(answers.account_add==='Yes'){
      const accSteps=[];
      let n=0;
      while(true){
        accSteps.push({
          id:`account_detail_${n}`,
          q:n===0?'Tell us about your account':'Tell us about your next account',
          hint:'Enter the current balance as it appears in your bank app right now.',
          type:'account_detail',
          idx:n,
        });
        // Only insert the "add more" question if we've answered the detail for this slot
        // (always insert it so user can answer it)
        accSteps.push({
          id:`account_more_${n}`,
          q:'Would you like to connect another bank account?',
          hint:answers.accounts[n]
            ? `${answers.accounts[n].name||answers.accounts[n].type||'Account'} added. Add another?`
            : 'Add another account?',
          type:'yesno',
        });
        if(answers[`account_more_${n}`]==='Yes'){
          n++;
        } else {
          break;
        }
      }
      base.splice(addIdx+1,0,...accSteps);
    }

    /* ── DEBT DETAIL LOOP ── */
    const selectedDebts=(answers.debts||[]).filter(d=>d!=='No debts');
    const debtSteps=selectedDebts.map((dtype,i)=>({
      id:`debt_${i}`,
      q:`Tell us about your ${dtype}`,
      hint:"We'll track this in your Debt Tracker. Nothing is paid automatically.",
      type:'debt_detail',
      dtype,
      idx:i,
    }));
    const debtIdx=base.findIndex(s=>s.id==='debts');
    base.splice(debtIdx+1,0,...debtSteps);

    return base;
  }

  const ACCOUNT_TYPES=['Checking Account','Savings Account','Investment Account','Retirement (401k/IRA)','Cash','Other'];
  const GRADIENTS=['linear-gradient(135deg,#7c3aed,#4f46e5)','linear-gradient(135deg,#0ec99a,#0891b2)','linear-gradient(135deg,#ff9f43,#ee5a24)','linear-gradient(135deg,#ff4d6a,#c0392b)','linear-gradient(135deg,#8b78f5,#c56cf0)','linear-gradient(135deg,#4ec9ff,#1e90ff)'];

  function renderStep(){
    const activeSteps=getActiveSteps();
    const s=activeSteps[step];
    if(!s)return;
    const isLast=step===activeSteps.length-1;
    const progress=activeSteps.map((_,i)=>`<div style="height:3px;flex:1;border-radius:3px;background:${i<=step?'var(--green)':'var(--border2)'};transition:background .3s"></div>`).join('');

    let inputHTML='';
    if(s.type==='money'){
      inputHTML=`<div class="amt-wrap mb16"><span class="amt-prefix">$</span><input class="input" id="ob-input" type="number" min="0" placeholder="${s.placeholder||'0'}" inputmode="decimal" value="${answers[s.id]||''}" style="font-size:28px;font-weight:900;padding:14px 14px 14px 32px"></div>`;
    } else if(s.type==='choice'){
      inputHTML=`<div style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px">${s.choices.map(c=>`<button class="ob-choice" data-val="${c}" style="text-align:left;padding:13px 16px;border-radius:var(--rsm);border:2px solid ${answers[s.id]===c?'var(--green)':'var(--border2)'};background:${answers[s.id]===c?'var(--green-dim)':'var(--card2)'};color:${answers[s.id]===c?'var(--green)':'var(--text)'};font-size:14px;font-weight:600;cursor:pointer;font-family:inherit;transition:all .15s">${c}</button>`).join('')}</div>`;
    } else if(s.type==='multi'){
      inputHTML=`<div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px">${s.choices.map(c=>{const sel=(answers[s.id]||[]).includes(c);return`<button class="ob-multi" data-val="${c}" style="padding:9px 14px;border-radius:20px;border:2px solid ${sel?'var(--green)':'var(--border2)'};background:${sel?'var(--green-dim)':'transparent'};color:${sel?'var(--green)':'var(--text2)'};font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;transition:all .15s">${c}</button>`}).join('')}</div>`;
    } else if(s.type==='yesno'){
      const cur=answers[s.id];
      inputHTML=`<div style="display:flex;gap:12px;margin-bottom:16px">
        ${['Yes','No'].map(v=>`<button class="ob-choice" data-val="${v}" style="flex:1;justify-content:center;text-align:center;padding:18px 16px;border-radius:var(--rsm);border:2px solid ${cur===v?'var(--green)':'var(--border2)'};background:${cur===v?'var(--green-dim)':'var(--card2)'};color:${cur===v?'var(--green)':'var(--text)'};font-size:16px;font-weight:700;cursor:pointer;font-family:inherit;transition:all .15s">${v==='Yes'?'✓ Yes':'✕ No'}</button>`).join('')}
      </div>`;
    } else if(s.type==='account_detail'){
      const existing=answers.accounts[s.idx]||{};
      const prevAccounts=answers.accounts.filter(Boolean).slice(0,s.idx);
      const prevHTML=prevAccounts.length?`<div style="margin-bottom:16px;display:flex;flex-wrap:wrap;gap:6px">${prevAccounts.map(a=>`<div style="background:var(--green-dim);border:1px solid rgba(14,201,154,.2);border-radius:20px;padding:4px 12px;font-size:12px;font-weight:700;color:var(--green)">✓ ${a.name||a.type}</div>`).join('')}</div>`:'';
      inputHTML=`
        ${prevHTML}
        <div class="ig"><label class="il">Account Type</label><select class="input" id="ob-acc-type">${ACCOUNT_TYPES.map(t=>`<option ${existing.type===t?'selected':''}>${t}</option>`).join('')}</select></div>
        <div class="ig"><label class="il">Nickname (optional)</label><input class="input" id="ob-acc-name" type="text" placeholder="e.g. Chase Checking" value="${existing.name||''}"></div>
        <div class="ig"><label class="il">Current Balance</label><div class="amt-wrap"><span class="amt-prefix">$</span><input class="input" id="ob-acc-bal" type="number" min="0" placeholder="0.00" inputmode="decimal" value="${existing.balance!=null?existing.balance:''}" style="font-size:24px;font-weight:800;padding:14px 14px 14px 28px"></div></div>`;
    } else if(s.type==='debt_detail'){
      const existing=answers.debtDetails[s.idx]||{};
      inputHTML=`
        <div style="background:var(--card2);border-radius:var(--rsm);padding:12px;margin-bottom:16px;font-size:13px;color:var(--text2)">💡 This just tracks your debt — nothing is paid automatically.</div>
        <div class="ig"><label class="il">Lender / Name</label><input class="input" id="ob-debt-name" type="text" placeholder="e.g. Navient, Chase Visa" value="${existing.name||''}"></div>
        <div class="g2">
          <div class="ig"><label class="il">Current Balance Owed</label><div class="amt-wrap"><span class="amt-prefix">$</span><input class="input" id="ob-debt-bal" type="number" min="0" placeholder="0" inputmode="decimal" value="${existing.balance||''}"></div></div>
          <div class="ig"><label class="il">APR (%)</label><input class="input" id="ob-debt-apr" type="number" min="0" max="100" step="0.01" placeholder="e.g. 19.99" value="${existing.apr||''}"></div>
        </div>
        <div class="g2">
          <div class="ig"><label class="il">Min Monthly Payment</label><div class="amt-wrap"><span class="amt-prefix">$</span><input class="input" id="ob-debt-mp" type="number" min="0" placeholder="0" inputmode="decimal" value="${existing.minPayment||''}"></div></div>
          <div class="ig"><label class="il">Payoff Date (optional)</label><input class="input" id="ob-debt-end" type="month" value="${existing.endDate||''}"></div>
        </div>`;
    } else if(s.type==='bill_picker'){
      const COMMON_SUBS=[
        {name:'Netflix',emoji:'📺',cat:'entertainment',amount:17},
        {name:'Spotify',emoji:'🎵',cat:'entertainment',amount:11},
        {name:'Hulu',emoji:'📺',cat:'entertainment',amount:18},
        {name:'Disney+',emoji:'📺',cat:'entertainment',amount:14},
        {name:'Apple TV+',emoji:'📺',cat:'entertainment',amount:10},
        {name:'HBO Max',emoji:'📺',cat:'entertainment',amount:16},
        {name:'Amazon Prime',emoji:'📦',cat:'shopping',amount:15},
        {name:'YouTube Premium',emoji:'▶️',cat:'entertainment',amount:14},
        {name:'Apple Music',emoji:'🎵',cat:'entertainment',amount:11},
        {name:'Xbox Game Pass',emoji:'🎮',cat:'entertainment',amount:15},
        {name:'PlayStation Plus',emoji:'🎮',cat:'entertainment',amount:18},
        {name:'iCloud+',emoji:'☁️',cat:'utilities',amount:3},
        {name:'Google One',emoji:'☁️',cat:'utilities',amount:3},
        {name:'Gym Membership',emoji:'🏋️',cat:'personal',amount:40},
        {name:'Rent',emoji:'🏠',cat:'housing',amount:null},
        {name:'Mortgage',emoji:'🏠',cat:'housing',amount:null},
        {name:'Car Insurance',emoji:'🚗',cat:'transport',amount:null},
        {name:'Health Insurance',emoji:'🏥',cat:'personal',amount:null},
        {name:'Life Insurance',emoji:'🛡️',cat:'personal',amount:null},
        {name:'Phone Plan',emoji:'📱',cat:'utilities',amount:null},
      ];
      if(!answers.subs)answers.subs=[];
      inputHTML=`
        <div style="background:var(--card2);border-radius:var(--rsm);padding:12px;margin-bottom:16px;font-size:13px;color:var(--text2)">💡 Select what applies — nothing is paid automatically. You'll log payments in Transactions.</div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px" id="ob-sub-chips">
          ${COMMON_SUBS.map(sub=>{
            const sel=answers.subs.some(x=>x.name===sub.name);
            return`<button class="ob-sub-chip ${sel?'sel':''}" data-subname="${esc(sub.name)}" data-subemoji="${sub.emoji}" data-subcat="${sub.cat}" data-subamt="${sub.amount||''}"
              style="display:flex;align-items:center;gap:6px;padding:8px 12px;border-radius:20px;border:2px solid ${sel?'var(--green)':'var(--border2)'};background:${sel?'var(--green-dim)':'var(--card2)'};color:${sel?'var(--green)':'var(--text2)'};font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;transition:all .15s">
              ${esc(sub.emoji)} ${esc(sub.name)}${sub.amount?` <span style="opacity:.7;font-weight:600">~$${sub.amount}</span>`:''}
            </button>`;
          }).join('')}
        </div>
        <div style="font-size:12px;color:var(--text3);margin-bottom:8px">Or add a custom one:</div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <input class="input" id="ob-custom-sub" type="text" placeholder="e.g. Audible, Peloton…" style="flex:1;min-width:140px">
          <button class="btn btn-ghost btn-sm" id="ob-add-custom-sub">+ Add</button>
        </div>`;
    }

    $('#app').innerHTML=`
    <div style="position:fixed;inset:0;display:flex;align-items:flex-start;justify-content:center;background:var(--bg);padding:20px;overflow-y:auto">
      <div style="position:absolute;top:-15%;left:-10%;width:500px;height:500px;border-radius:50%;background:radial-gradient(circle,rgba(139,120,245,.07) 0,transparent 70%);pointer-events:none"></div>
      <div style="position:absolute;bottom:-15%;right:-10%;width:600px;height:600px;border-radius:50%;background:radial-gradient(circle,rgba(14,201,154,.05) 0,transparent 70%);pointer-events:none"></div>
      <div style="width:100%;max-width:480px;position:relative;z-index:1;padding-top:20px">
        <div style="margin-bottom:28px">${bedrockLogo(44)}</div>
        <div style="display:flex;gap:4px;margin-bottom:24px">${progress}</div>
        ${step===0?`<div style="font-size:13px;font-weight:700;color:var(--green);margin-bottom:8px;letter-spacing:.5px">WELCOME, ${firstName.toUpperCase()} 👋</div>`:''}
        <div style="font-size:21px;font-weight:900;letter-spacing:-.5px;margin-bottom:6px;line-height:1.3">${s.q}</div>
        <div style="font-size:13px;color:var(--text2);margin-bottom:20px;line-height:1.5">${s.hint}</div>
        ${inputHTML}
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:8px">
          ${step>0?`<button class="btn btn-ghost" id="ob-back" style="padding:12px 20px;${s.type==='yesno'?'flex:1;justify-content:center;':''}">← Back</button>`:''}
          ${s.type!=='yesno'?`<button class="btn btn-primary" id="ob-next" style="flex:1;justify-content:center;padding:13px;font-size:15px">${isLast?'Get Started 🎯':'Next →'}</button>`:''}
        </div>
        <div style="text-align:center;margin-top:16px"><span class="link" id="ob-skip" style="color:var(--text3);font-size:13px">Skip setup — I'll configure manually</span></div>
      </div>
    </div>`;

    /* Wire choices */
    $$('.ob-choice').forEach(b=>b.addEventListener('click',()=>{
      if(s.type==='account_count') answers.accounts_count=parseInt(b.dataset.val);
      else answers[s.id]=b.dataset.val;
      $$('.ob-choice').forEach(x=>{x.style.borderColor='var(--border2)';x.style.background='var(--card2)';x.style.color='var(--text)';});
      b.style.borderColor='var(--green)';b.style.background='var(--green-dim)';b.style.color='var(--green)';
      /* yesno steps advance directly — no Next button needed */
      if(s.type==='yesno') setTimeout(async()=>{
        if(isLast){await applyOnboardingAnswers(answers);initApp();}
        else{step++;renderStep();}
      },220);
    }));
    $$('.ob-multi').forEach(b=>b.addEventListener('click',()=>{
      if(!answers[s.id])answers[s.id]=[];
      const idx=answers[s.id].indexOf(b.dataset.val);
      if(idx>=0)answers[s.id].splice(idx,1);else answers[s.id].push(b.dataset.val);
      const sel=answers[s.id].includes(b.dataset.val);
      b.style.borderColor=sel?'var(--green)':'var(--border2)';b.style.background=sel?'var(--green-dim)':'transparent';b.style.color=sel?'var(--green)':'var(--text2)';
    }));
    /* Bill picker chip toggle */
    $$('.ob-sub-chip').forEach(b=>b.addEventListener('click',()=>{
      if(!answers.subs)answers.subs=[];
      const name=b.dataset.subname;
      const existing=answers.subs.findIndex(x=>x.name===name);
      if(existing>=0){
        answers.subs.splice(existing,1);
        b.style.borderColor='var(--border2)';b.style.background='var(--card2)';b.style.color='var(--text2)';
      } else {
        answers.subs.push({name,emoji:b.dataset.subemoji,cat:b.dataset.subcat,amount:b.dataset.subamt?parseFloat(b.dataset.subamt):null});
        b.style.borderColor='var(--green)';b.style.background='var(--green-dim)';b.style.color='var(--green)';
      }
    }));
    $('#ob-add-custom-sub')?.addEventListener('click',()=>{
      const inp=$('#ob-custom-sub');
      const name=(inp?.value||'').trim();
      if(!name)return;
      if(!answers.subs)answers.subs=[];
      if(!answers.subs.find(x=>x.name===name)){
        answers.subs.push({name,emoji:'💳',cat:'other',amount:null,custom:true});
        const chip=document.createElement('button');
        chip.className='ob-sub-chip sel';
        chip.dataset.subname=name;
        chip.style.cssText='display:flex;align-items:center;gap:6px;padding:8px 12px;border-radius:20px;border:2px solid var(--green);background:var(--green-dim);color:var(--green);font-size:13px;font-weight:700;cursor:pointer;font-family:inherit';
        chip.textContent='💳 '+name;
        chip.addEventListener('click',()=>{
          answers.subs=answers.subs.filter(x=>x.name!==name);
          chip.remove();
        });
        $('#ob-sub-chips')?.appendChild(chip);
      }
      if(inp)inp.value='';
    });
    $('#ob-custom-sub')?.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();$('#ob-add-custom-sub')?.click();}});
    /* Grad picker only exists in the Add Account modal, not onboarding */

    $('#ob-next')?.addEventListener('click',async()=>{
      /* Collect current step data */
      if(s.type==='money'){const v=parseFloat($('#ob-input')?.value);if(v>0)answers[s.id]=v;}
      if(s.type==='account_detail'){
        const existing=answers.accounts[s.idx]||{};
        answers.accounts[s.idx]={
          type:$('#ob-acc-type')?.value||'Checking Account',
          name:$('#ob-acc-name')?.value.trim()||'',
          balance:parseFloat($('#ob-acc-bal')?.value)||0,
          /* Keep existing gradient if already set, otherwise pick random */
          gradient:existing.gradient||GRADIENTS[Math.floor(Math.random()*GRADIENTS.length)],
        };
      }
      if(s.type==='debt_detail'){
        answers.debtDetails[s.idx]={
          dtype:s.dtype,
          name:$('#ob-debt-name')?.value.trim()||s.dtype,
          balance:parseFloat($('#ob-debt-bal')?.value)||0,
          apr:parseFloat($('#ob-debt-apr')?.value)||0,
          minPayment:parseFloat($('#ob-debt-mp')?.value)||0,
          endDate:$('#ob-debt-end')?.value||null,
        };
      }
      if(isLast){await applyOnboardingAnswers(answers);initApp();}
      else{step++;renderStep();}
    });
    $('#ob-back')?.addEventListener('click',()=>{step--;renderStep()});
    $('#ob-skip')?.addEventListener('click',()=>initApp());
    $('#ob-input')?.addEventListener('keydown',e=>{if(e.key==='Enter')$('#ob-next').click()});
    /* Auto-focus first input */
    setTimeout(()=>($('#ob-input')||$('#ob-acc-bal')||$('#ob-debt-name'))?.focus(),50);
  }
  renderStep();
}

async function applyOnboardingAnswers(answers){
  const uid=State.user.id;
  const saves=[];

  /* ── ACCOUNTS: add each account with its real balance ── */
  for(const acc of (answers.accounts||[])){
    if(!acc||acc.balance==null)continue;
    const newAcc={type:acc.type||'Checking Account',name:acc.name||acc.type,balance:acc.balance,gradient:acc.gradient||'linear-gradient(135deg,#7c3aed,#4f46e5)'};
    const saved=await SB.addAccount(uid,newAcc).catch(()=>null);
    State.accounts.push(saved||{...newAcc,id:genId()});
  }

  /* ── RECURRING: set up income schedule (NO transaction created) ── */
  if(answers.income&&answers.pay_freq&&answers.pay_freq!=='Irregular / varies'){
    const freqMap={'Weekly':7,'Bi-Weekly (every 2 weeks)':14,'Twice a Month (1st & 15th)':null,'Monthly':null};
    /* Just store income info in settings for reference — no recurring tx created */
    State.settings.incomeAmount=answers.income;
    State.settings.payFreq=answers.pay_freq;
    saves.push(SB.saveSettings(uid,State.settings).catch(()=>{}));
  }

  /* ── RENT: add to budgets only — NO transaction, NO recurring ── */
  if(answers.rent){
    const hb=State.budgets.find(b=>b.categoryId==='housing');
    if(hb)hb.amount=answers.rent;
    else State.budgets.push({categoryId:'housing',amount:answers.rent});
  }

  /* ── DEBTS: add to debt tracker ── */
  for(const d of (answers.debtDetails||[])){
    if(!d||!d.balance)continue;
    State.debts.push({
      id:genId(),
      type:d.dtype==='Credit Card'?'credit':d.dtype==='Student Loan'?'student':d.dtype==='Auto Loan'?'auto':d.dtype==='Mortgage'?'mortgage':d.dtype==='Personal Loan'?'personal':d.dtype==='Medical Debt'?'medical':'other',
      name:d.name,balance:d.balance,originalBalance:d.balance,
      apr:d.apr||0,minPayment:d.minPayment||0,
      endDate:d.endDate||null,
    });
  }
  saveDebts(State.debts);

  /* ── BILLS: subscriptions + utilities from onboarding ── */
  const utilEmojis={Electricity:'⚡',Gas:'🔥',Water:'💧',Internet:'📡',Phone:'📱',Trash:'🗑️',Sewer:'🚿','Other Utility':'🏠'};
  const newBills=[
    ...(answers.subs||[]).map(sub=>({id:genId(),name:sub.name,emoji:sub.emoji||'💳',category:sub.cat||'other',amount:sub.amount||null,dueDay:null,type:'subscription',paid:false,paidDate:null})),
    ...(answers.utilities||[]).filter(u=>u!=='No utilities').map(u=>({id:genId(),name:u,emoji:utilEmojis[u]||'🏠',category:'utilities',amount:null,dueDay:null,type:'utility',paid:false,paidDate:null})),
  ];
  State.bills=[...State.bills,...newBills];
  saveBills(State.bills);

  /* ── BUDGET STYLE ── */
  if(answers.style==='50/30/20 Rule'&&answers.income){
    const mo=answers.pay_freq==='Weekly'?answers.income*52/12:answers.pay_freq==='Bi-Weekly (every 2 weeks)'?answers.income*26/12:answers.pay_freq==='Twice a Month (1st & 15th)'?answers.income*2:answers.income;
    const needs=mo*0.50,wants=mo*0.30;
    const map={housing:needs*0.5,food:needs*0.2,utilities:needs*0.1,transport:needs*0.2,entertainment:wants*0.4,shopping:wants*0.35,personal:wants*0.25};
    Object.entries(map).forEach(([cat,amt])=>{const b=State.budgets.find(b=>b.categoryId===cat);if(b)b.amount=Math.round(amt);else State.budgets.push({categoryId:cat,amount:Math.round(amt)});});
  }
  saves.push(SB.saveBudgets(uid,State.budgets).catch(()=>{}));

  /* ── GOALS ── */
  const goalMap={'Emergency fund':{emoji:'🛡️',target:5000},'House / down payment':{emoji:'🏠',target:30000},'Car':{emoji:'🚗',target:10000},'Vacation':{emoji:'✈️',target:3000},'Pay off debt':{emoji:'💳',target:5000},'Retirement':{emoji:'🏦',target:50000},'Education':{emoji:'🎓',target:15000},'Something else':{emoji:'🎯',target:1000}};
  (answers.goals||[]).forEach((g,i)=>{const p=goalMap[g]||{emoji:'🎯',target:1000};State.goals.push({id:genId(),name:g,target:p.target,saved:0,emoji:p.emoji,color:GOAL_COLORS[i%GOAL_COLORS.length],deadline:null});});
  if(State.goals.length)saves.push(SB.saveGoals(uid,State.goals).catch(()=>{}));

  await Promise.all(saves);
}

export { renderAuth, renderOnboarding };
