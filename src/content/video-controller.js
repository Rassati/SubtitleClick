(() => {
  'use strict';
  const ns = globalThis.SubtitleClick ??= {};
  class VideoController {
    constructor(player) { this.player = player; this.owned = null; }
    get element() { return this.player.querySelector('video.html5-main-video') ?? this.player.querySelector('video'); }
    bookmark() {
      const video = this.element;
      return video ? { video, time: video.currentTime, source: video.currentSrc } : null;
    }
    pause(enabled) {
      this.release(false);
      const video = this.element;
      if (!enabled || !video || video.paused || video.ended) return;
      this.owned = { video, time: video.currentTime, source: video.currentSrc };
      video.pause();
    }
    release(resume, rewindSeconds = 0) {
      const owned = this.owned;
      this.owned = null;
      if (!resume || !owned) return;
      const { video, time, source } = owned;
      if (video.isConnected && video.paused && !video.ended && !video.seeking &&
          video.currentSrc === source && Math.abs(video.currentTime - time) < 0.25) {
        if (rewindSeconds > 0) this.seekBack(owned, rewindSeconds);
        const result = video.play();
        result?.catch(() => {});
      }
    }
    seekBack(bookmark, seconds) {
      const { video, time, source } = bookmark ?? {};
      if (!video || video !== this.element || !video.isConnected || video.currentSrc !== source ||
          !Number.isFinite(time) || !Number.isFinite(seconds) || seconds <= 0) return false;
      let target = Math.max(0, time - Math.min(seconds, 15));
      const ranges = video.seekable;
      if (ranges?.length) {
        let found = false;
        for (let index = 0; index < ranges.length; index++) {
          if (time >= ranges.start(index) && time <= ranges.end(index)) {
            target = Math.max(target, ranges.start(index));
            found = true;
            break;
          }
        }
        if (!found) return false;
      }
      try { video.currentTime = target; return true; } catch { return false; }
    }
    replay(bookmark, seconds = 5) {
      this.release(false);
      if (!this.seekBack(bookmark, seconds)) return false;
      this.element.play()?.catch(() => {});
      return true;
    }
  }
  ns.VideoController = VideoController;
})();
