/* Tourmaker - small UI toolkit: DOM helper, toast, modal, storage, downloads. */
(function () {
  'use strict';
  const UI = window.UI = {};

  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    let value;
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'value') value = v;
      else if (k === 'checked' || k === 'selected' || k === 'disabled' || k === 'readOnly') el[k] = !!v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of kids.flat(Infinity)) {
      if (c === null || c === undefined || c === false) continue;
      el.append(c.nodeType ? c : document.createTextNode(String(c)));
    }
    if (value !== undefined) el.value = value;
    return el;
  }
  UI.h = h;
  UI.$ = (s, r) => (r || document).querySelector(s);
  UI.$$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  UI.clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); return el; };
  UI.debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

  // ---------------------------------------------------------------------------------------------- storage (the browser may refuse it: never throw)
  UI.store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } },
  };

  // ---------------------------------------------------------------------------------------------- toast and modal
  UI.toast = function (msg, kind) {
    const el = h('div', { class: 'toast' + (kind === 'err' ? ' err' : '') }, msg);
    UI.$('#toast-root').appendChild(el);
    setTimeout(() => el.remove(), kind === 'err' ? 7000 : 3200);
  };

  UI.modal = function (o) {
    const root = UI.$('#modal-root');
    const back = h('div', { class: 'modal-back' });
    const close = () => { back.remove(); document.removeEventListener('keydown', onKey, true); if (o.onClose) o.onClose(); };
    const onKey = (e) => {
      if (!back.isConnected) { document.removeEventListener('keydown', onKey, true); return; }
      if (back !== root.lastElementChild) return;                      // only the top-most dialog reacts
      if (e.key === 'Escape') { e.stopPropagation(); close(); }
      else if (e.key === 'Enter' && o.submit && !(e.target && e.target.tagName === 'TEXTAREA') && !(e.target && e.target.tagName === 'BUTTON')) { e.preventDefault(); o.submit(api); }
    };
    const api = { close, el: back };
    const foot = h('footer', {}, (o.buttons || []).map((b) => h('button', { class: 'btn' + (b.primary ? ' primary' : ''), onclick: () => { if (b.onClick) { if (b.onClick(api) === false) return; } if (b.close !== false) close(); } }, b.label)));
    const win = h('div', { class: 'modal', style: { width: o.width || 'min(720px, 100%)' } }, h('header', {}, o.title || ''), h('div', { class: 'body' }, o.body), foot);
    back.appendChild(win);
    root.appendChild(back);
    document.addEventListener('keydown', onKey, true);
    const first = UI.$('input, select, textarea', win);
    if (first && !o.noFocus) first.focus();
    return api;
  };

  UI.confirm = function (text, okLabel, danger) {
    return new Promise((resolve) => {
      let done = false;
      const fin = (v) => { if (!done) { done = true; resolve(v); } };
      UI.modal({ title: danger ? 'Please confirm' : 'Confirm', width: 'min(460px, 100%)', body: h('div', {}, [].concat(text).map((t) => h('p', { style: { margin: '0 0 6px' } }, t))), buttons: [{ label: 'Cancel', onClick: () => fin(false) }, { label: okLabel || 'OK', primary: true, onClick: () => fin(true) }], onClose: () => fin(false), submit: (m) => { fin(true); m.close(); } });
    });
  };

  // ---------------------------------------------------------------------------------------------- files
  UI.download = function (name, text, mime) {
    const blob = new Blob([text], { type: mime || 'text/plain' });
    const a = h('a', { href: URL.createObjectURL(blob), download: name });
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  };
  UI.readFile = (file) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(new Error('The file could not be read.')); r.readAsText(file); });
  UI.slug = (s) => (s || 'tournament').toLowerCase().replace(/[^a-z0-9֐-׿]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'tournament';
  UI.copy = async function (text) {
    try { await navigator.clipboard.writeText(text); return true; } catch (e) {
      const ta = h('textarea', { style: { position: 'fixed', left: '-1000px' } }); ta.value = text; document.body.appendChild(ta); ta.select();
      let ok = false; try { ok = document.execCommand('copy'); } catch (e2) { /* ignore */ } ta.remove(); return ok;
    }
  };
  UI.fmtTime = (d) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  UI.fmtDate = (iso) => { try { return new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }); } catch (e) { return iso || ''; } };
})();
