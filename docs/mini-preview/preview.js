(() => {
  'use strict';
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const storageKey = 'netmask-mini-design-preview-v1';
  const defaultState = {placement: 2, design: 1, opacity: 96, size: 100, theme: 'light', bannerDismissed: false, metrics: ['download','upload','link','signal','latency']};
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(storageKey) || '{}'); } catch { /* Preview works with storage disabled. */ }
  const state = {...defaultState, ...saved, paused: false};
  if (![1,2,3].includes(state.placement)) state.placement = 2;
  if (![1,2,3,4,5].includes(state.design)) state.design = 1;
  if (!Array.isArray(state.metrics) || !state.metrics.length) state.metrics = [...defaultState.metrics];
  state.metrics = state.metrics.filter(id => defaultState.metrics.includes(id));
  if (!state.metrics.length) state.metrics = [...defaultState.metrics];
  state.opacity = Math.min(100, Math.max(35, Number(state.opacity) || 96));
  state.size = Math.min(140, Math.max(75, Number(state.size) || 100));
  state.theme = state.theme === 'dark' ? 'dark' : 'light';
  let toastTimer;
  const placements = [
    {id:1, name:'Title bar', note:'Always close to the window controls. Available from Overview or Journal.'},
    {id:2, name:'Overview navigation', note:'A dedicated mode switch beside your sections. Easy to find without scrolling.', recommended:true},
    {id:3, name:'Connection tools', note:'Alongside Going live and the connection check. An action with your other tools.'}
  ];
  const designs = [
    {id:1, name:'Fieldnote', note:'Warm paper, a familiar name, and a quiet row of readings.', recommended:true},
    {id:2, name:'Ribbon', note:'A slim line for the top of your screen. The smallest interruption.'},
    {id:3, name:'Soft glass', note:'A frosted green surface that settles into your desktop.'},
    {id:4, name:'Little dial', note:'A compact instrument with one reading in focus.'},
    {id:5, name:'Signal desk', note:'A darker instrument with crisp numbers and a live rhythm.'}
  ];
  const metrics = [
    {id:'download', name:'Live download', value:'24.8 Mbps'},
    {id:'upload', name:'Live upload', value:'3.2 Mbps'},
    {id:'link', name:'Wi-Fi link', value:'866 Mbps'},
    {id:'signal', name:'Signal strength', value:'92%'},
    {id:'latency', name:'Latency', value:'18 ms'}
  ];
  const wifi = '<svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M3 8.5a14 14 0 0 1 18 0M6 12a9.5 9.5 0 0 1 12 0M9 15.5a4.7 4.7 0 0 1 6 0"/><circle cx="12" cy="19" r="1" fill="currentColor" stroke="none"/></svg>';
  const spark = '<svg class="spark" viewBox="0 0 130 40" fill="none" preserveAspectRatio="none" aria-hidden="true"><path d="M0 35H130M0 18H130" stroke="currentColor" stroke-opacity=".12"/><path d="M0 30L7 30L12 24L18 26L24 17L30 20L36 12L42 15L48 8L54 16L61 12L68 22L74 15L80 19L86 10L92 14L98 5L104 11L110 7L116 15L122 11L130 12" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>';
  const newBadge = '<span class="new-badge">NEW</span>';
  const activate = (extra = '') => `<button class="mini-activate ${extra}" data-activate><span class="mini-icon">▣</span> Mini mode ${newBadge}</button>`;
  const persist = () => {
    try { localStorage.setItem(storageKey, JSON.stringify({...state, paused: false})); } catch { /* Storage is optional. */ }
  };
  function appPreview(placement) {
    const banner = state.bannerDismissed ? '' : `<aside class="announcement"><span class="announcement-icon">▣</span><div><h4>Your connection, always in view.</h4><p>Keep a small NetMask window on your desktop while you work.</p><button class="banner-activate" data-activate>Try mini mode ↗</button></div><button class="dismiss-banner" data-dismiss-banner aria-label="Dismiss mini mode announcement forever" title="Dismiss forever">×</button></aside>`;
    return `<div class="app-preview"><div class="app-titlebar"><img src="../../src/renderer/public/branding/mark.svg" alt=""><strong>NetMask</strong><span class="app-version">vNext</span>${placement === 1 ? activate('toolbar-activate') : ''}<div class="window-controls" aria-hidden="true"><span>⚙</span><span>−</span><span>□</span><span>×</span></div></div><div class="app-nav"><span>Overview</span><span>Journal</span>${placement === 2 ? activate() : ''}</div><div class="app-body">${banner}<div class="app-hero-label"><span class="dot"></span> CONNECTED <span style="margin-left:auto;color:var(--muted);letter-spacing:0">LIVE</span></div><div class="app-hero-top"><div><h3 class="app-network-name">Studio</h3><p class="app-hero-sub">Wi-Fi 6 · Private network</p></div><span class="app-wifi-icon">${wifi}</span></div><div class="app-rates"><div class="app-rate"><small>↓ LIVE DOWNLOAD</small><strong>24.8 <span>Mbps</span></strong></div><div class="app-rate"><small>↑ LIVE UPLOAD</small><strong>3.2 <span>Mbps</span></strong></div>${spark}</div><div class="app-hero-foot"><span>Wi-Fi link <b>866 Mbps</b></span><span>Ping <b>18 ms</b> · Signal <b>92%</b></span></div><div class="app-tools"><button data-preview-action="Going live preview">Going live ↗</button><button data-preview-action="Connection check preview">Check connection</button>${placement === 3 ? activate() : ''}</div><div class="app-section-label">Saved networks <span>02</span></div><div class="app-network-row active">${wifi}<div><strong>Studio</strong><small>Wi-Fi · Familiar label</small></div><span>● Connected</span></div><div class="app-network-row">${wifi}<div><strong>Guest room</strong><small>Wi-Fi · Saved network</small></div><span>⋯</span></div><div class="app-editor"><h4>Make it familiar.</h4><p>Your local name, with the original safely kept.</p></div></div></div>`;
  }
  const widgetTop = (interactive, title = 'NETMASK') => `<div class="widget-top"><img src="../../src/renderer/public/branding/mark.svg" alt=""><span>${title}</span><span class="widget-controls"><span title="Always on top">⌖</span>${interactive ? '<button data-widget-menu aria-label="Customize mini window">⋯</button>' : '<span>⋯</span>'}</span></div>`;
  const rate = (id, label, value, arrow) => `<div class="widget-rate" data-metric="${id}"><label><span>${arrow}</span>${label}</label><strong>${value}<small>Mbps</small></strong></div>`;
  const bottom = () => '<div class="widget-bottom"><span data-metric="link">Wi-Fi <b>866</b> Mbps</span><span data-metric="signal">Signal <b>92%</b></span><span data-metric="latency"><b>18</b> ms</span></div>';
  function widgetMarkup(id, interactive = false) {
    if (id === 1) return `<div class="widget widget-fieldnote">${widgetTop(interactive)}<div class="widget-name-line"><span class="widget-name">Studio</span><span class="widget-status"><span class="dot"></span> Wi-Fi 6</span></div><div class="widget-rates">${rate('download','Live download','24.8','↓')}${rate('upload','Live upload','3.2','↑')}</div>${bottom()}</div>`;
    if (id === 2) return `<div class="widget widget-ribbon"><div class="widget-ribbon-brand"><div class="widget-top"><span class="dot"></span> NETMASK</div><span class="widget-name">Studio</span></div><div class="widget-rates">${rate('download','Download','24.8','↓')}${rate('upload','Upload','3.2','↑')}</div><div class="ribbon-signal">${interactive ? '<button data-widget-menu aria-label="Customize mini window" class="icon-button">⋯</button>' : wifi}<span data-metric="link">866 Mbps</span><div style="margin-top:4px"><span data-metric="signal">92%</span><span data-metric="latency"> · 18 ms</span></div></div></div>`;
    if (id === 3) return `<div class="widget widget-glass">${widgetTop(interactive)}<div class="widget-name-line"><span class="widget-name">Studio</span><span class="widget-status"><span class="dot"></span> Connected</span></div><div class="widget-rates">${rate('download','Live download','24.8','↓')}${rate('upload','Live upload','3.2','↑')}</div>${spark}${bottom()}</div>`;
    if (id === 4) {
      const shown = interactive ? metrics.filter(m => state.metrics.includes(m.id)) : metrics;
      const focal = shown[0];
      const values = {download:['24.8','Mbps','↓ Live download'],upload:['3.2','Mbps','↑ Live upload'],link:['866','Mbps','Wi-Fi link'],signal:['92','%','Signal strength'],latency:['18','ms','Latency']};
      const value = values[focal.id];
      const remaining = shown.slice(1).map(m => `<span data-metric="${m.id}"><b>${values[m.id][0]}${m.id === 'signal' ? '%' : ''}</b> ${m.id === 'signal' ? 'signal' : m.id === 'link' ? 'Wi-Fi' : m.id === 'upload' ? '↑ Mbps' : m.id === 'download' ? '↓ Mbps' : 'ms'}</span>`);
      return `<div class="widget widget-dial">${widgetTop(interactive)}<div class="dial-readout" data-metric="${focal.id}"><svg class="dial-ring" viewBox="0 0 130 130" aria-hidden="true"><circle class="track" cx="65" cy="65" r="56"/><circle class="value" cx="65" cy="65" r="56"/></svg><label>${value[2]}</label><strong>${value[0]}</strong><small>${value[1]}</small></div><p class="dial-network">Studio <span class="dot"></span></p>${remaining.length ? `<div class="widget-bottom">${remaining.slice(0,3).join('')}</div>${remaining.length > 3 ? `<div class="widget-linkline" style="text-align:center">${remaining.slice(3).join(' · ')}</div>` : ''}` : ''}</div>`;
    }
    const bars = [12,20,16,30,23,39,29,43,34,48,37,42].map(h => `<i style="--bar:${h}px"></i>`).join('');
    return `<div class="widget widget-instrument">${widgetTop(interactive,'NETMASK / LIVE')}<div class="instrument-main"><div class="widget-rates">${rate('download','Download','24.8','↓')}${rate('upload','Upload','3.2','↑')}</div><div class="instrument-bars" aria-hidden="true">${bars}</div></div><div class="instrument-network"><span><span class="dot"></span> Studio</span><span>WI-FI 6 · CONNECTED</span></div>${bottom()}</div>`;
  }
  function renderPlacements() {
    $('#placement-grid').innerHTML = placements.map(p => `<article class="choice-card placement-card ${state.placement === p.id ? 'selected' : ''}" data-placement="${p.id}">${appPreview(p.id)}<div class="choice-caption"><span class="choice-number">${p.id}</span><div><h3>${p.name}${p.recommended ? '<span class="recommendation">Suggested</span>' : ''}</h3><p>${p.note}</p></div><button class="select-choice" data-select-placement="${p.id}" aria-label="Choose placement ${p.id}: ${p.name}" aria-pressed="${state.placement === p.id}">${state.placement === p.id ? '✓' : ''}</button></div></article>`).join('');
    $('#full-app').innerHTML = appPreview(state.placement);
  }
  function renderDesigns() {
    $('#design-grid').innerHTML = designs.map(d => `<article class="choice-card design-card ${state.design === d.id ? 'selected' : ''}" data-design="${d.id}"><div class="widget-sample">${widgetMarkup(d.id)}</div><div class="choice-caption"><span class="choice-number">${d.id}</span><div><h3>${d.name}${d.recommended ? '<span class="recommendation">Suggested</span>' : ''}</h3><p>${d.note}</p></div><button class="select-choice" data-select-design="${d.id}" aria-label="Choose window ${d.id}: ${d.name}" aria-pressed="${state.design === d.id}">${state.design === d.id ? '✓' : ''}</button></div></article>`).join('');
  }
  function choiceText() { return `NetMask mini mode: placement ${state.placement} (${placements[state.placement-1].name}) + window ${state.design} (${designs[state.design-1].name}).`; }
  function updateSummary() {
    $('#selection-summary').textContent = `Placement ${state.placement} · Window ${state.design}`;
    $('#choice-text').textContent = `Your choice: placement ${state.placement} (${placements[state.placement-1].name}) + window ${state.design} (${designs[state.design-1].name}).`;
  }
  function applyTheme() {
    document.documentElement.dataset.theme = state.theme;
    $('#theme-toggle').setAttribute('aria-label', `Switch to ${state.theme === 'light' ? 'dark' : 'paper'} theme`);
    $('#theme-toggle span').textContent = state.theme === 'light' ? 'Dark' : 'Paper';
    persist();
  }
  function renderWidget(reset = false) {
    $('#floating-widget').innerHTML = widgetMarkup(state.design, true);
    updateAppearance();
    updateMetrics();
    if (reset) resetPosition();
    else clampPosition();
  }
  function updateAppearance() {
    const floating = $('#floating-widget');
    floating.style.opacity = String(state.opacity / 100);
    floating.style.transform = `scale(${widgetScale()})`;
    $('#opacity').value = String(state.opacity);
    $('#size').value = String(state.size);
    $('#opacity-output').textContent = `${state.opacity}%`;
    $('#size-output').textContent = `${state.size}%`;
    for (const input of $$('.slider-row input')) input.style.setProperty('--fill', `${(Number(input.value) - Number(input.min)) / (Number(input.max) - Number(input.min)) * 100}%`);
    $('.widget', floating).classList.toggle('paused', state.paused);
    $('#pause-readings').innerHTML = `<span>${state.paused ? '▷' : 'Ⅱ'}</span> ${state.paused ? 'Resume' : 'Pause'} readings`;
    persist();
  }
  function widgetScale() {
    const floating = $('#floating-widget'), stage = $('#desktop');
    return Math.min(state.size / 100, (stage.clientWidth - 24) / Math.max(1, floating.offsetWidth), (stage.clientHeight - 64) / Math.max(1, floating.offsetHeight));
  }
  function updateMetrics() {
    if (state.design === 4) $('#floating-widget').innerHTML = widgetMarkup(4, true);
    $('.widget', $('#floating-widget')).classList.toggle('paused', state.paused);
    $$('[data-metric]', $('#floating-widget')).forEach(el => el.classList.toggle('metric-hidden', !state.metrics.includes(el.dataset.metric)));
    $('#metric-options').innerHTML = metrics.map(m => `<label class="metric-toggle"><input type="checkbox" data-toggle-metric="${m.id}" ${state.metrics.includes(m.id) ? 'checked' : ''}><span>${m.name}</span><small>${m.value}</small></label>`).join('');
    persist();
  }
  function position(left, top) {
    const stage = $('#desktop');
    const floating = $('#floating-widget');
    const width = floating.offsetWidth * widgetScale();
    const height = floating.offsetHeight * widgetScale();
    floating.style.left = `${Math.max(12, Math.min(left, stage.clientWidth - width - 12))}px`;
    floating.style.top = `${Math.max(12, Math.min(top, stage.clientHeight - height - 52))}px`;
    floating.style.right = 'auto';
  }
  function resetPosition() {
    position($('#desktop').clientWidth - $('#floating-widget').offsetWidth * widgetScale() - 26, 26);
    if (!$('#widget-menu').hidden) placeMenu();
  }
  function clampPosition() {
    const floating = $('#floating-widget');
    floating.style.transform = `scale(${widgetScale()})`;
    if (!floating.style.left) resetPosition();
    else position(parseFloat(floating.style.left), parseFloat(floating.style.top));
    if (!$('#widget-menu').hidden) placeMenu();
  }
  function placeMenu() {
    const stage = $('#desktop'), floating = $('#floating-widget'), menu = $('#widget-menu');
    const stageRect = stage.getBoundingClientRect(), widgetRect = floating.getBoundingClientRect();
    const right = widgetRect.right - stageRect.left;
    const below = widgetRect.bottom - stageRect.top + 10;
    menu.style.left = `${Math.max(12, Math.min(right - menu.offsetWidth, stage.clientWidth - menu.offsetWidth - 12))}px`;
    menu.style.top = `${Math.max(12, Math.min(below, stage.clientHeight - menu.offsetHeight - 52))}px`;
    // If there is space next to the window, keep the window in view while adjusting.
    if (below + menu.offsetHeight > stage.clientHeight - 52 && widgetRect.left - stageRect.left > menu.offsetWidth + 24) {
      menu.style.left = `${Math.max(12, widgetRect.left - stageRect.left - menu.offsetWidth - 12)}px`;
      menu.style.top = `${Math.max(12, Math.min(widgetRect.top - stageRect.top, stage.clientHeight - menu.offsetHeight - 52))}px`;
    }
  }
  function openMenu() { $('#widget-menu').hidden = false; placeMenu(); $('#opacity').focus({preventScroll:true}); }
  function closeMenu(returnFocus = true) { $('#widget-menu').hidden = true; if (returnFocus) $('#floating-widget').focus({preventScroll:true}); }
  function toast(message) {
    clearTimeout(toastTimer);
    $('#stage-toast').hidden = false;
    $('#stage-toast').textContent = message;
    toastTimer = setTimeout(() => { $('#stage-toast').hidden = true; }, 3500);
  }
  function activateMini() {
    $('#floating-widget').hidden = false;
    $('#full-app').hidden = true;
    $('#playground').scrollIntoView({behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block:'start'});
    resetPosition();
    toast('Mini mode is open. Drag it anywhere; right-click to customize.');
  }
  document.addEventListener('click', event => {
    const target = event.target.closest('button');
    if (!target) return;
    if (target.dataset.selectPlacement) {
      state.placement = Number(target.dataset.selectPlacement);
      renderPlacements(); updateSummary(); persist();
    } else if (target.dataset.selectDesign) {
      state.design = Number(target.dataset.selectDesign);
      renderDesigns(); renderWidget(true); updateSummary(); persist();
    } else if (target.hasAttribute('data-activate')) activateMini();
    else if (target.hasAttribute('data-dismiss-banner')) {
      state.bannerDismissed = true; renderPlacements(); persist();
    } else if (target.hasAttribute('data-widget-menu')) openMenu();
    else if (target.dataset.previewAction) toast(`${target.dataset.previewAction} — sample only.`);
  });
  $('#theme-toggle').addEventListener('click', () => { state.theme = state.theme === 'light' ? 'dark' : 'light'; applyTheme(); });
  $('#open-menu').addEventListener('click', () => { $('#floating-widget').hidden = false; openMenu(); });
  $('#close-menu').addEventListener('click', () => closeMenu());
  $('#reset-position').addEventListener('click', resetPosition);
  $('#opacity').addEventListener('input', event => { state.opacity = Number(event.target.value); updateAppearance(); });
  $('#size').addEventListener('input', event => { state.size = Number(event.target.value); updateAppearance(); clampPosition(); });
  $('#metric-options').addEventListener('change', event => {
    const id = event.target.dataset.toggleMetric;
    if (!id) return;
    if (!event.target.checked && state.metrics.length === 1) { event.target.checked = true; toast('Keep at least one reading in your window.'); return; }
    state.metrics = event.target.checked ? [...state.metrics, id] : state.metrics.filter(value => value !== id);
    updateMetrics(); clampPosition();
  });
  $('#restore-full').addEventListener('click', () => { closeMenu(false); $('#full-app').hidden = false; $('#floating-widget').hidden = true; toast('Back in full NetMask. Use Mini mode to return.'); $('[data-activate]', $('#full-app'))?.focus({preventScroll:true}); });
  $('#test-speed').addEventListener('click', () => { closeMenu(); toast('Sample internet check: 148.6 Mbps down · 32.4 Mbps up · 18 ms latency.'); });
  $('#pause-readings').addEventListener('click', () => { state.paused = !state.paused; updateAppearance(); closeMenu(); toast(state.paused ? 'Readings paused. Last sample is still visible.' : 'Readings resumed.'); });
  $('#reset-widget').addEventListener('click', () => { state.opacity = 96; state.size = 100; state.metrics = [...defaultState.metrics]; state.paused = false; updateAppearance(); updateMetrics(); resetPosition(); closeMenu(); toast('Appearance reset.'); });
  $('#floating-widget').addEventListener('contextmenu', event => { event.preventDefault(); openMenu(); });
  $('#floating-widget').addEventListener('keydown', event => {
    if (event.key === 'ContextMenu' || event.key === 'F10' && event.shiftKey) { event.preventDefault(); openMenu(); return; }
    const move = {ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[event.key];
    if (!move || event.target.closest('button')) return;
    event.preventDefault(); const distance = event.shiftKey ? 20 : 5;
    position(parseFloat($('#floating-widget').style.left) + move[0] * distance, parseFloat($('#floating-widget').style.top) + move[1] * distance);
    if (!$('#widget-menu').hidden) placeMenu();
  });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    if (!$('#widget-menu').hidden) closeMenu();
    else if (!$('#floating-widget').hidden && $('#desktop').contains(document.activeElement)) $('#restore-full').click();
  });
  document.addEventListener('pointerdown', event => {
    if (!$('#widget-menu').hidden && !$('#widget-menu').contains(event.target) && !$('#floating-widget').contains(event.target) && !event.target.closest('#open-menu')) closeMenu(false);
  });
  let drag;
  $('#floating-widget').addEventListener('pointerdown', event => {
    if (event.button !== 0 || event.target.closest('button')) return;
    const floating = $('#floating-widget');
    closeMenu(false);
    drag = {pointer:event.pointerId, x:event.clientX, y:event.clientY, left:parseFloat(floating.style.left), top:parseFloat(floating.style.top)};
    floating.setPointerCapture(event.pointerId); floating.classList.add('dragging');
  });
  $('#floating-widget').addEventListener('pointermove', event => { if (drag?.pointer === event.pointerId) position(drag.left + event.clientX - drag.x, drag.top + event.clientY - drag.y); });
  const endDrag = () => { drag = undefined; $('#floating-widget').classList.remove('dragging'); };
  $('#floating-widget').addEventListener('pointerup', endDrag);
  $('#floating-widget').addEventListener('lostpointercapture', endDrag);
  $('#floating-widget').addEventListener('pointercancel', endDrag);
  $('#copy-choice').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(choiceText()); $('#copy-choice').textContent = 'Choice copied ✓'; }
    catch { $('#choice-text').textContent = choiceText(); $('#copy-choice').textContent = 'Select the choice text to copy'; }
  });
  new ResizeObserver(clampPosition).observe($('#desktop'));
  const params = new URLSearchParams(location.search);
  if (params.has('theme')) state.theme = params.get('theme') === 'dark' ? 'dark' : 'light';
  if (params.get('capture')) { document.body.classList.add('capture'); $(`#${params.get('capture')}`)?.classList.add('capture-target'); }
  applyTheme(); renderPlacements(); renderDesigns(); renderWidget(true); updateSummary();
  // Small, explicit automation surface for local screenshots and interaction checks.
  window.miniPreview = {state, resetBanner() {state.bannerDismissed=false;renderPlacements();persist();}, openMenu, resetPosition, choiceText};
})();
