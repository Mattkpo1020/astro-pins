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
