(() => {
  'use strict';
  // This literal identifies the code actually running, not a manifest read from disk.
  const ns = globalThis.SubtitleClick ??= {};
  ns.Build = Object.freeze({ version: '0.5.0', protocol: 1 });
})();
