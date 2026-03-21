import { $$ } from './utils.js';
import { State } from './state.js';

function applyTheme(mode){
  document.documentElement.setAttribute('data-theme', mode||'dark');
  localStorage.setItem('bedrock_theme', mode||'dark');
}

function getTheme(){ return localStorage.getItem('bedrock_theme')||'dark'; }

function toggleTheme(){
  const next=getTheme()==='dark'?'light':'dark';
  applyTheme(next);
  if(State.settings)State.settings.theme=next;
  $$('.theme-label').forEach(el=>el.textContent=next==='dark'?'Dark Mode':'Light Mode');
}


export { applyTheme, getTheme, toggleTheme };
