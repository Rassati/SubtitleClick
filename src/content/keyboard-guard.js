(() => {
  'use strict';
  const ns = globalThis.SubtitleClick ??= {};
  if (ns.KeyboardGuard) return;
  const hosts = new Map();
  const consumed = new Set();
  function guard(event) {
    const host = event.composedPath().find(node => hosts.has(node));
    const key = event.code || event.key;
    if (!host && !consumed.has(key)) return;
    if (event.type === 'keydown') consumed.add(key);
    if (event.type === 'keyup') consumed.delete(key);
    // Run at document_start, before YouTube's capture listeners. Do not prevent
    // default: text entry, spaces, selection, IME and button activation must work.
    event.stopImmediatePropagation();
    if (host && event.type === 'keydown' && event.key === 'Escape' && !event.isComposing) {
      event.preventDefault();
      if (!event.repeat) hosts.get(host)();
    }
  }
  for (const type of ['keydown', 'keypress', 'keyup']) window.addEventListener(type, guard, true);
  window.addEventListener('blur', () => consumed.clear());
  ns.KeyboardGuard = {
    register(host, close) { hosts.set(host, close); return () => hosts.delete(host); }
  };
})();
