import { supa }          from './config.js';
import { State, Cache }  from './state.js';

const DEFAULT_CATS=[
  {id:'housing',name:'Housing',emoji:'🏠',color:'#8b78f5',custom:false},
  {id:'food',name:'Food & Dining',emoji:'🍽️',color:'#3b82f6',custom:false},
  {id:'transport',name:'Transport',emoji:'🚗',color:'#4ec9ff',custom:false},
  {id:'entertainment',name:'Entertainment',emoji:'🎬',color:'#ff9f43',custom:false},
  {id:'shopping',name:'Shopping',emoji:'🛍️',color:'#ff4d6a',custom:false},
  {id:'health',name:'Health',emoji:'💊',color:'#54a0ff',custom:false},
  {id:'utilities',name:'Utilities',emoji:'⚡',color:'#ffd166',custom:false},
  {id:'savings',name:'Savings',emoji:'🏦',color:'#3b82f6',custom:false},
  {id:'personal',name:'Personal Care',emoji:'✨',color:'#c56cf0',custom:false},
  {id:'travel',name:'Travel',emoji:'✈️',color:'#48dbfb',custom:false},
  {id:'income',name:'Income',emoji:'💰',color:'#3b82f6',custom:false},
  {id:'other',name:'Other',emoji:'📦',color:'#8395a7',custom:false},
];

function loadCustomCats(){
  const uid=State.user?.id;if(!uid)return;
  const saved=Cache.get(uid,'custom_cats',null);
  cats.list.length = 0;
  const newList = saved ? [...DEFAULT_CATS,...saved] : [...DEFAULT_CATS];
  newList.forEach(c => cats.list.push(c));
}

function saveCustomCats(){
  const uid=State.user?.id;if(!uid)return;
  const custom=cats.list.filter(c=>c.custom);
  Cache.set(uid,'custom_cats',custom);
  // Fire cloud write in background — never blocks UI
  setTimeout(()=>supa.from('settings').upsert({user_id:uid,custom_cats:JSON.stringify(custom)}).catch(()=>{}),0);
}


// CATS is wrapped in an object so modules can mutate it without reassigning the import
export const cats = { list: [...DEFAULT_CATS] };
export { DEFAULT_CATS };
export const getCat = id => cats.list.find(c=>c.id===id)||cats.list.find(c=>c.id==='other');

// Keep CATS as a convenience alias pointing to the same array
export const CATS = cats.list;

export { loadCustomCats, saveCustomCats };
