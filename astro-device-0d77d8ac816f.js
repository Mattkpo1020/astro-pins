/* Capability checks and a portrait guard. Never touches saves or game rules. */
(() => {
  'use strict';
  const appleTouch = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const handheld = appleTouch || (navigator.maxTouchPoints > 0 && matchMedia('(pointer: coarse)').matches);
  let pending = false;
  let previous = null;
  let attached = false;
  const api = {
    needsPortrait: false,
    hapticsSupported: typeof navigator.vibrate === 'function' && navigator.maxTouchPoints > 0,
    lockState: 'unknown',
    safeArea: {x: 0, y: 0, width: 1, height: 1},
    fitViewport,
    refresh,
    requestPortrait,
    start() {
      if (attached) return;
      attached = true;
      window.addEventListener('orientationchange', refresh);
      window.addEventListener('resize', refresh);
      window.addEventListener('pageshow', refresh);
      document.addEventListener('visibilitychange', () => { refresh(); if (!document.hidden) requestPortrait(); });
      if (screen.orientation && typeof screen.orientation.addEventListener === 'function') screen.orientation.addEventListener('change', refresh);
      const retry = document.getElementById('portrait-retry');
      if (retry) retry.addEventListener('click', requestPortrait);
      refresh();
    }
  };
  let viewportProbe = null;
  let lastSafeArea = '';
  function fitViewport() {
    if (!viewportProbe) {
      viewportProbe = document.createElement('div');
      viewportProbe.id = 'viewport-probe';
      viewportProbe.setAttribute('aria-hidden', 'true');
      viewportProbe.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100vh;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)';
      document.body.appendChild(viewportProbe);
    }
    const installed = navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
    const focused = document.activeElement;
    const keyboard = focused && (focused.tagName === 'INPUT' || focused.tagName === 'TEXTAREA' || focused.isContentEditable);
    const v = window.visualViewport;
    // Installed iOS can report a visualViewport already shortened by safe insets.
    // Measure the full CSS viewport there; use the visible viewport for Safari/keyboard.
    const height = installed && !keyboard ? viewportProbe.getBoundingClientRect().height : (v ? v.height : innerHeight);
    const top = installed && !keyboard ? 0 : (v ? v.offsetTop : 0);
    document.documentElement.style.setProperty('--visible-height', `${height}px`);
    document.documentElement.style.setProperty('--visible-top', `${top}px`);
    const frame = document.getElementById('game-frame');
    if (!frame) return;
    const bounds = frame.getBoundingClientRect(), css = getComputedStyle(viewportProbe);
    const inset = name => Math.max(0, parseFloat(css[name]) || 0);
    // Intersect the screen's safe region with this actual frame, applying it once.
    const screenHeight = viewportProbe.getBoundingClientRect().height;
    const left = Math.max(0, inset('paddingLeft') - bounds.left);
    const right = Math.max(0, bounds.right - (viewportProbe.getBoundingClientRect().width - inset('paddingRight')));
    const safeTop = Math.max(0, inset('paddingTop') - bounds.top);
    // Some installed iOS web apps draw a layout viewport taller than the area
    // actually presented above the system's bottom strip. Keep the background
    // full-size, but place the dock above BOTH that visible edge and its inset.
    let contentBottom = screenHeight - inset('paddingBottom');
    if (installed && !keyboard) {
      const visibleBottom = v ? v.offsetTop + v.height : innerHeight;
      const presentedBottom = Math.min(screenHeight, innerHeight || screenHeight, visibleBottom);
      contentBottom = Math.min(contentBottom, presentedBottom - inset('paddingBottom'));
    }
    const bottom = Math.max(0, bounds.bottom - contentBottom);
    const w = Math.max(1, bounds.width), h = Math.max(1, bounds.height);
    api.safeArea = {x: Math.min(.45, left/w), y: Math.min(.45, safeTop/h), width: Math.max(.1, 1-(left+right)/w), height: Math.max(.1, 1-(safeTop+bottom)/h)};
    const key = JSON.stringify(api.safeArea);
    if (key !== lastSafeArea) {
      lastSafeArea = key;
      window.dispatchEvent(new CustomEvent('astropins:viewportchange'));
    }
  }
  function isLandscape() {
    const type = screen.orientation && screen.orientation.type;
    if (typeof type === 'string' && /^(portrait|landscape)/.test(type)) return type.startsWith('landscape');
    if (typeof window.orientation === 'number') return Math.abs(window.orientation) === 90;
    // Do not mistake a software keyboard shrinking the viewport for rotation.
    const tag = document.activeElement && document.activeElement.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return api.needsPortrait;
    return matchMedia('(orientation: landscape)').matches;
  }
  function refresh() {
    api.needsPortrait = handheld && isLandscape();
    const overlay = document.getElementById('portrait-guard');
    if (overlay) overlay.hidden = !api.needsPortrait;
    const retry = document.getElementById('portrait-retry');
    const cannotLock = !screen.orientation || typeof screen.orientation.lock !== 'function' || (appleTouch && api.lockState === 'denied');
    if (retry) retry.hidden = cannotLock;
    const help = document.getElementById('portrait-help');
    if (help) help.hidden = !(appleTouch && cannotLock);
    const frame = document.getElementById('game-frame');
    if (frame) {
      frame.inert = api.needsPortrait;
      frame.setAttribute('aria-hidden', api.needsPortrait ? 'true' : 'false');
    }
    if (previous !== api.needsPortrait) {
      previous = api.needsPortrait;
      window.dispatchEvent(new CustomEvent('astropins:devicechange'));
    }
  }
  function requestPortrait() {
    if (!handheld || pending || document.hidden) return;
    if (!screen.orientation || typeof screen.orientation.lock !== 'function') {
      api.lockState = 'unsupported'; refresh(); return;
    }
    pending = true;
    try {
      Promise.resolve(screen.orientation.lock('portrait-primary')).then(() => {
        api.lockState = 'locked';
      }, () => { api.lockState = 'denied'; }).finally(() => { pending = false; refresh(); });
    } catch (_) { pending = false; api.lockState = 'denied'; refresh(); }
  }
  window.AstroPinsDevice = api;
})();
