import { $, $$ } from './utils.js';
import { State } from './state.js';

function render(html, afterRender) {
  const main = $('#main-content'); if (!main) return;
  main.innerHTML = html; main.classList.remove('page'); void main.offsetWidth; main.classList.add('page');
  if (afterRender) requestAnimationFrame(afterRender);
}

function showToast(msg, color = 'var(--green)') {
  $$('.toast').forEach(t => t.remove());
  const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; t.style.background = color;
  if (color !== 'var(--green)') t.style.color = 'white';
  document.body.appendChild(t); clearTimeout(State.toastT); State.toastT = setTimeout(() => t.remove(), 2600);
}

function showGlobalLoading(msg = 'Loading...') {
  $('#app').innerHTML = `<div style="position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;background:var(--bg);gap:16px;z-index:9999">
    <div style="animation:pulse 1.5s ease infinite">${bedrockLogo(52)}</div>
    <div style="font-size:14px;color:var(--text2);font-weight:600">${msg}</div>
  </div>`;
}

function setSyncIndicator(on) {
  const ind = $('#sync-ind'); if (!ind) return;
  ind.style.opacity = on ? '1' : '0';
}

function logoSVG(size = 20) {
  const s = size / 20;
  return `<svg width="${size}" height="${size}" viewBox="0 0 20 20" fill="none"><rect x="${5.5*s}" y="${4*s}" width="${9*s}" height="${2.5*s}" rx="${1*s}" fill="white" opacity="0.55"/><rect x="${4.5*s}" y="${7.5*s}" width="${11*s}" height="${2.5*s}" rx="${1*s}" fill="white" opacity="0.72"/><rect x="${3.5*s}" y="${11*s}" width="${13*s}" height="${2.5*s}" rx="${1*s}" fill="white" opacity="0.88"/><rect x="${2.5*s}" y="${14.5*s}" width="${15*s}" height="${2.5*s}" rx="${1*s}" fill="white"/></svg>`;
}

function bedrockIcon(size = 40) {
  const w = size, h = size, r = Math.round(size * 0.22);
  const cx = w / 2;
  const barH = Math.round(size * 0.13), gap = Math.round(size * 0.09), rx = Math.round(size * 0.06);
  const widths = [size * 0.38, size * 0.50, size * 0.62, size * 0.74];
  const totalH = barH * 4 + gap * 3;
  const topY = Math.round((h - totalH) / 2);
  const bars = widths.map((bw, i) => {
    const colors = ['#60a5fa', '#3b82f6', '#1d4ed8', '#1e3a8a'];
    return `<rect x="${Math.round(cx-bw/2)}" y="${topY+i*(barH+gap)}" width="${Math.round(bw)}" height="${barH}" rx="${rx}" fill="${colors[i]}"/>`;
  }).join('');
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${w}" height="${h}" rx="${r}" fill="#090e1a"/>
    ${bars}
  </svg>`;
}

function bedrockLogo(iconSize = 36) {
  const fs = Math.round(iconSize * 0.5);
  const gap = Math.round(iconSize * 0.3);
  return `<div style="display:flex;align-items:center;gap:${gap}px">${bedrockIcon(iconSize)}<span style="font-size:${fs}px;font-weight:600;letter-spacing:0.12em;color:var(--text);font-family:'Outfit',-apple-system,sans-serif">BEDROCK</span></div>`;
}

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

function trapFocus(modal) {
  const focusable = () => [...modal.querySelectorAll(FOCUSABLE)].filter(el => el.offsetParent !== null);
  const handler = e => {
    if (e.key !== 'Tab') return;
    const els = focusable();
    if (!els.length) { e.preventDefault(); return; }
    if (e.shiftKey) {
      if (document.activeElement === els[0]) { e.preventDefault(); els[els.length - 1].focus(); }
    } else {
      if (document.activeElement === els[els.length - 1]) { e.preventDefault(); els[0].focus(); }
    }
  };
  modal.addEventListener('keydown', handler);
  requestAnimationFrame(() => (focusable()[0] || modal).focus());
  return handler;
}

function openModal(modal, triggerEl) {
  modal._trapHandler = trapFocus(modal);
  modal._triggerEl   = triggerEl || document.activeElement;
  document.body.appendChild(modal);
}

function closeModal(modal) {
  if (!modal) return;
  if (modal._trapHandler) modal.removeEventListener('keydown', modal._trapHandler);
  modal._triggerEl?.focus();
  modal.remove();
}

export { render, showToast, showGlobalLoading, setSyncIndicator,
         logoSVG, bedrockIcon, bedrockLogo, trapFocus, openModal, closeModal };
