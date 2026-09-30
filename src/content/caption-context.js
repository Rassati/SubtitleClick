(() => {
  'use strict';
  const ns = globalThis.SubtitleClick ??= {};
  const normalize = text => text.replace(/\s+/gu, ' ').trim();
  const cjk = character => /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(character);
  function mergeCaptions(previous, current) {
    const left = normalize(previous), right = normalize(current);
    if (left === right || right.startsWith(left)) return right;
    // Rolling captions repeat words across successive windows. Match whole words,
    // or characters for Japanese/Chinese where spaces are not word boundaries.
    const a = Array.from(left), b = Array.from(right);
    for (let size = Math.min(a.length, b.length); size >= 2; size--) {
      if (a.slice(-size).join('') !== b.slice(0, size).join('')) continue;
      const start = a.length - size;
      const startsAtBoundary = start === 0 || /\s/u.test(a[start - 1]) || cjk(a[start]);
      const endsAtBoundary = size === b.length || /[\s\p{P}]/u.test(b[size]) || cjk(b[size - 1]);
      if (startsAtBoundary && endsAtBoundary) return a.concat(b.slice(size)).join('');
    }
    const separator = cjk(a.at(-1) ?? '') && cjk(b[0] ?? '') ? '' : ' ';
    return left + separator + right;
  }
  class CaptionContext {
    constructor() { this.clear(); }
    clear() { this.entries = []; this.lastTime = null; }
    observe(text, time) {
      if (!Number.isFinite(time)) return;
      if (this.lastTime !== null && (time < this.lastTime - .25 || time - this.lastTime > 4)) this.clear();
      this.lastTime = time;
      this.entries = this.entries.filter(entry => time - entry.seen <= 12);
      if (!text?.trim() || text.length > 1500) return;
      const last = this.entries.at(-1);
      if (last && time - last.seen <= 3 && (text === last.text || normalize(text).startsWith(normalize(last.text)))) {
        last.text = text;
        last.seen = time;
      } else this.entries.push({ text, start: time, seen: time });
      this.entries = this.entries.slice(-30);
    }
    get(text, time) { return this.snapshot(text, time).text; }
    snapshot(text, time) {
      this.observe(text, time);
      let result = text;
      let next = this.entries.at(-1);
      let count = 0;
      for (let index = this.entries.length - 2; index >= 0 && count < 2; index--, count++) {
        const previous = this.entries[index];
        if (next.start - previous.seen > 3 || time - previous.seen > 12 ||
            /[.!?。！？]["'”’」』)\]]*$/u.test(previous.text.trim())) break;
        const combined = mergeCaptions(previous.text, result);
        if (combined.length > 700) break;
        result = combined;
        next = previous;
      }
      return { text: normalize(result) === normalize(text) ? text : result, start: next?.start ?? time };
    }
  }
  Object.assign(ns, { CaptionContext, mergeCaptions });
})();
