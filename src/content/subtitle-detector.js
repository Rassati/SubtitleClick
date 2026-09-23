(() => {
  'use strict';
  const ns = globalThis.SubtitleClick ??= {};
  const selector = '.ytp-caption-window-container .caption-window';
  function visible(element) {
    if (!element.isConnected || !element.getClientRects().length) return false;
    for (let current = element; current instanceof Element; current = current.parentElement) {
      const style = getComputedStyle(current);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    }
    return true;
  }
  function readWindow(element) {
    const lines = [...element.querySelectorAll('.caption-visual-line')];
    const readSegments = line => [...line.querySelectorAll('.ytp-caption-segment')]
      .map(segment => segment.textContent).join('');
    // Preserve punctuation, adjacent styled spans and line boundaries.
    return (lines.length ? lines.map(readSegments).join('\n') : readSegments(element)).trim();
  }
  class SubtitleDetector {
    constructor(player, onChange) {
      this.player = player;
      this.onChange = onChange;
      this.current = { text: '', windows: [] };
      this.decorated = new Map();
      this.scheduled = false;
      this.stopped = false;
      this.observer = new MutationObserver(records => {
        // Progress bars and player controls mutate constantly; don't remeasure captions for them.
        const relevant = records.some(record => {
          const target = record.target.nodeType === Node.TEXT_NODE ? record.target.parentElement : record.target;
          if (target.closest?.('[data-subtitleclick-ui]')) return false;
          if (target.closest?.('.ytp-caption-window-container')) return true;
          if (record.type === 'attributes') return target === player || target.matches?.('.ytp-subtitles-button');
          if (record.type === 'childList') {
            return [...record.addedNodes, ...record.removedNodes].some(node => node instanceof Element &&
              (node.matches('.ytp-caption-window-container') || node.querySelector('.ytp-caption-window-container')));
          }
          return false;
        });
        if (!relevant) return;
        if (this.scheduled) return;
        this.scheduled = true;
        queueMicrotask(() => {
          this.scheduled = false;
          if (!this.stopped) this.refresh();
        });
      });
      this.observer.observe(player, { subtree: true, childList: true, characterData: true,
        attributes: true, attributeFilter: ['class', 'style', 'hidden', 'aria-pressed'] });
      this.refresh();
    }
    snapshot() {
      if (this.player.matches('.ad-showing, .ad-interrupting') ||
          this.player.querySelector('.ytp-subtitles-button')?.getAttribute('aria-pressed') === 'false') {
        return { text: '', windows: [] };
      }
      const windows = [...this.player.querySelectorAll(selector)].filter(window => visible(window) && readWindow(window));
      return { text: windows.map(readWindow).join('\n'), windows };
    }
    refresh() {
      const next = this.snapshot();
      for (const [element, attributes] of this.decorated) {
        if (!next.windows.includes(element)) this.restore(element, attributes);
      }
      for (const element of next.windows) {
        if (this.decorated.has(element)) continue;
        const attributes = Object.fromEntries(['role', 'tabindex', 'title', 'aria-label'].map(name => [name, element.getAttribute(name)]));
        this.decorated.set(element, attributes);
        element.setAttribute('data-subtitleclick-caption', '');
        element.setAttribute('role', 'button');
        element.setAttribute('tabindex', '0');
        element.setAttribute('title', 'Traduzir para português · SubtitleClick');
        element.setAttribute('aria-label', 'Traduzir legenda para português');
      }
      const changed = next.text !== this.current.text;
      this.current = next;
      if (changed) this.onChange(next);
      return next;
    }
    target(element) {
      const window = element instanceof Element ? element.closest(selector) : null;
      return window && this.player.contains(window) && visible(window) ? window : null;
    }
    restore(element, attributes) {
      element.removeAttribute('data-subtitleclick-caption');
      for (const [name, value] of Object.entries(attributes)) {
        if (value === null) element.removeAttribute(name);
        else element.setAttribute(name, value);
      }
      this.decorated.delete(element);
    }
    destroy() {
      this.stopped = true;
      this.observer.disconnect();
      for (const [element, attributes] of this.decorated) this.restore(element, attributes);
    }
  }
  Object.assign(ns, { SubtitleDetector, readCaptionWindow: readWindow });
})();
