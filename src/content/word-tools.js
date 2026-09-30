(() => {
  'use strict';
  const ns = globalThis.SubtitleClick ??= {};
  function segments(text, language = 'en') {
    try { return [...new Intl.Segmenter(language, { granularity: 'word' }).segment(text)]; }
    catch { return [...text.matchAll(/[\p{L}\p{M}\p{N}]+(?:['’][\p{L}\p{M}]+)*|[^\p{L}\p{M}\p{N}]+/gu)]
      .map(match => ({ segment: match[0], index: match.index, isWordLike: /[\p{L}\p{N}]/u.test(match[0]) })); }
  }
  function atPoint(anchor, x, y, language) {
    const range = document.caretRangeFromPoint?.(x, y);
    if (!range || range.startContainer.nodeType !== Node.TEXT_NODE || !anchor.contains(range.startContainer)) return '';
    const line = range.startContainer.parentElement.closest('.caption-visual-line') ?? anchor;
    const before = document.createRange();
    before.selectNodeContents(line);
    before.setEnd(range.startContainer, range.startOffset);
    const index = before.toString().length;
    return segments(line.textContent, language).find(part => part.isWordLike && index >= part.index && index < part.index + part.segment.length)?.segment ?? '';
  }
  ns.WordTools = { segments, atPoint };
})();
