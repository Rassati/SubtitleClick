(() => {
  'use strict';
  const ns = globalThis.SubtitleClick ??= {};
  const normalize = text => String(text ?? '').replace(/\s+/gu, ' ').trim();
  class CaptionTiming {
    constructor() { this.clear(); }
    clear() { this.current = null; this.lastTime = null; this.pending = []; }
    observe(text, time) {
      if (!Number.isFinite(time)) return;
      if (this.lastTime !== null && (time < this.lastTime - .25 || time - this.lastTime > 4)) this.clear();
      this.lastTime = time;
      const caption = normalize(text);
      const previous = this.current;
      if (!previous || !caption.startsWith(previous.text) || !previous.text) {
        this.current = { text: caption, start: time, knownStart: Boolean(previous) };
      } else this.current.text = caption;
      const remaining = [];
      for (const pending of this.pending) {
        if (time - pending.time > 120) continue;
        if (time > pending.time + .1 && !caption.startsWith(pending.caption)) {
          const end = Math.round(time * 100) / 100;
          if (end > pending.clip.start && end - pending.clip.start <= 120) {
            pending.finish({ ...pending.clip, end, source: pending.knownStart ? 'observed' : 'estimated' });
          }
        } else remaining.push(pending);
      }
      this.pending = remaining;
    }
    capture(caption, text, time, contextStart, video) {
      if (!Number.isFinite(time)) return null;
      const current = this.current;
      const knownStart = current?.knownStart && current.text === normalize(caption);
      let start = knownStart ? current.start : Math.max(0, time - 2);
      if (text !== caption && Number.isFinite(contextStart)) start = Math.min(start, contextStart);
      const duration = Number.isFinite(video?.duration) ? video.duration : 86400;
      let end = Math.min(duration, Math.max(time + 1, start + Math.max(2, Math.min(25, text.length / 13 + .5))));
      let source = 'estimated';
      // Native cues, when exposed, provide actual boundaries. YouTube often
      // renders only DOM captions; never assume that a TextTrack exists.
      for (const track of Array.from(video?.textTracks ?? [])) {
        if (track.mode !== 'showing') continue;
        for (const cue of Array.from(track.activeCues ?? [])) {
          if (normalize(cue.text?.replace(/<[^>]*>/g, '')) !== normalize(caption)) continue;
          start = text === caption ? cue.startTime : Math.min(start, cue.startTime);
          end = cue.endTime; source = text === caption ? 'cue' : 'estimated';
        }
      }
      start = Math.max(0, Math.round(start * 100) / 100);
      end = Math.round(end * 100) / 100;
      if (!(end > start && end - start <= 120 && end <= 86400)) return null;
      return { clip: { start, end, source }, caption: normalize(caption), time, knownStart };
    }
    track(capture, finish) {
      if (!capture || capture.clip.source === 'cue') return;
      this.pending.push({ ...capture, finish });
      this.pending = this.pending.slice(-20);
    }
  }
  ns.CaptionTiming = CaptionTiming;
})();
