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

function renderCategories(){
  const custom=CATS.filter(c=>c.custom);
  const builtin=CATS.filter(c=>!c.custom&&c.id!=='income'&&c.id!=='other');

  render(`
  <div class="ph">
    <div><div class="pt">Categories</div><div class="ps">Customize how you track your spending</div></div>
    <button class="btn btn-primary" id="btn-new-cat">${IC.plus} New Category</button>
  </div>
  <div class="card mb16">
    <div class="card-title">Your Custom Categories</div>
    ${custom.length?`<div class="cat-grid">${custom.map((c,i)=>`
      <div class="cat-chip-edit" style="border-color:${c.color}33">
        <div style="width:32px;height:32px;border-radius:8px;background:${c.color}22;display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0">${c.emoji}</div>
        <div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(c.name)}</div><div style="font-size:11px;color:var(--text2);margin-top:1px">Custom</div></div>
        <button class="del-btn" data-del-cat="${c.id}" style="opacity:1">${IC.trash}</button>
      </div>`).join('')}</div>`:
    `<div class="empty" style="padding:24px 0"><div class="empty-icon">🏷️</div><div class="empty-title">No custom categories yet</div><div class="empty-sub">Create one to track spending your way</div></div>`}
  </div>
  <div class="card mb16">
    <div class="card-title">Built-in Categories</div>
    <div class="cat-grid">
      ${builtin.map(c=>`<div style="display:flex;align-items:center;gap:8px;padding:10px 12px;border-radius:var(--rsm);border:1px solid var(--border);background:var(--card2)">
        <div style="width:30px;height:30px;border-radius:8px;background:${c.color}22;display:flex;align-items:center;justify-content:center;font-size:15px;flex-shrink:0">${c.emoji}</div>
        <span style="font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(c.name)}</span>
      </div>`).join('')}
    </div>
  </div>`,
  ()=>{
    $('#btn-new-cat')?.addEventListener('click',()=>showNewCatModal());
    $$('[data-del-cat]').forEach(b=>b.addEventListener('click',()=>{
      const id=b.dataset.delCat;
      CATS=CATS.filter(c=>c.id!==id);
      renderCategories();
      showToast('Category removed');
      queueSync('custom_cats',()=>saveCustomCats(),300);
    }));
  });
}

function showNewCatModal(){
  let selEmoji=CAT_EMOJIS[0],selColor=CAT_COLORS[0];
  const modal=document.createElement('div');modal.className='overlay';
  modal.innerHTML=`<div class="modal" role="dialog" aria-modal="true">
    <div class="mh"><div class="mt-modal">New Category</div><button class="xbtn" aria-label="Close" id="xm">✕</button></div>
    <div class="ig"><label class="il">Category Name</label><input class="input" id="cat-name" type="text" placeholder="e.g. Pet Care, Coffee, Gym"></div>
    <div class="ig"><label class="il">Emoji</label>
      <div class="cat-emoji-pick">${CAT_EMOJIS.map(e=>`<button class="cat-emoji-btn ${e===selEmoji?'sel':''}" data-e="${e}">${e}</button>`).join('')}</div>
    </div>
    <div class="ig"><label class="il">Color</label>
      <div class="color-row">${CAT_COLORS.map(c=>`<div class="color-dot ${c===selColor?'sel':''}" data-c="${c}" style="background:${c}"></div>`).join('')}</div>
    </div>
    <div style="background:var(--card2);border-radius:var(--rsm);padding:12px;margin-bottom:14px;display:flex;align-items:center;gap:10px">
      <div id="cat-preview" style="width:36px;height:36px;border-radius:10px;background:${selColor}22;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0">${selEmoji}</div>
      <div><div id="cat-preview-name" style="font-size:14px;font-weight:700">My Category</div><div style="font-size:12px;color:var(--text2)">Preview</div></div>
    </div>
    <div class="fac gap10"><button class="btn btn-ghost w100" id="cancel-cat" style="justify-content:center">Cancel</button><button class="btn btn-primary w100" id="save-cat" style="justify-content:center">Create Category</button></div>
  </div>`;
  openModal(modal);

  const updatePreview=()=>{
    const p=$('#cat-preview',modal);const pn=$('#cat-preview-name',modal);
    if(p){p.textContent=selEmoji;p.style.background=selColor+'22';}
    if(pn){const n=$('#cat-name',modal)?.value.trim();pn.textContent=esc(n)||'My Category';}
  };
  modal.addEventListener('click',e=>{if(e.target===modal)closeModal(modal)});
  $('#xm',modal).addEventListener('click',()=>closeModal(modal));
  $('#cancel-cat',modal).addEventListener('click',()=>closeModal(modal));
  $('#cat-name',modal).addEventListener('input',updatePreview);
  $$('.cat-emoji-btn',modal).forEach(b=>b.addEventListener('click',()=>{
    selEmoji=b.dataset.e;$$('.cat-emoji-btn',modal).forEach(x=>x.classList.remove('sel'));b.classList.add('sel');updatePreview();
  }));
  $$('.color-dot',modal).forEach(d=>d.addEventListener('click',()=>{
    selColor=d.dataset.c;$$('.color-dot',modal).forEach(x=>x.classList.remove('sel'));d.classList.add('sel');updatePreview();
  }));
  $('#save-cat',modal).addEventListener('click',()=>{
    const name=$('#cat-name',modal).value.trim();
    if(!name)return showToast('Please enter a name','var(--red)');
    const id='cat_'+genId();
    CATS.push({id,name,emoji:selEmoji,color:selColor,custom:true});
    closeModal(modal);
    renderCategories();
    showToast('Category created ✓');
    queueSync('custom_cats',()=>saveCustomCats(),300);
  });
  $('#cat-name',modal).focus();
}


export { renderCategories };
