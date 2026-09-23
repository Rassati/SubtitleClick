const { test } = require('node:test');
const assert = require('node:assert/strict');
require('../../src/content/video-controller.js');
const { VideoController } = globalThis.SubtitleClick;
function setup(paused = false) {
  const video = {
    paused, ended: false, seeking: false, isConnected: true, currentTime: 10, currentSrc: 'video-a',
    pause() { this.paused = true; this.pauses = (this.pauses ?? 0) + 1; },
    play() { this.paused = false; this.plays = (this.plays ?? 0) + 1; return Promise.resolve(); }
  };
  return { video, control: new VideoController({ querySelector: () => video }) };
}
test('only resumes a video paused by this extension', () => {
  for (const initiallyPaused of [true, false]) {
    const { video, control } = setup(initiallyPaused);
    control.pause(true);
    control.release(true);
    assert.equal(video.plays ?? 0, initiallyPaused ? 0 : 1);
  }
});
test('disabled pause and navigation never start playback', () => {
  const { video, control } = setup();
  control.pause(false);
  assert.equal(video.pauses, undefined);
  control.pause(true);
  control.release(false);
  control.release(true);
  assert.equal(video.plays, undefined);
});
test('seek, source replacement and removed video cancel resumption', () => {
  for (const patch of [{ currentTime: 25 }, { currentSrc: 'video-b' }, { isConnected: false }, { seeking: true }]) {
    const { video, control } = setup();
    control.pause(true);
    Object.assign(video, patch);
    control.release(true);
    assert.equal(video.plays, undefined);
  }
});
test('explicit replay rewinds from the clicked moment and starts even a manually paused video', () => {
  const { video, control } = setup(true);
  const bookmark = control.bookmark();
  video.currentTime = 12;
  assert.equal(control.replay(bookmark, 5), true);
  assert.equal(video.currentTime, 5);
  assert.equal(video.plays, 1);
});
test('automatic rewind only affects an owned pause and stays within seekable media', () => {
  const { video, control } = setup();
  video.seekable = { length: 1, start: () => 7, end: () => 20 };
  control.pause(true);
  control.release(true, 5);
  assert.equal(video.currentTime, 7);
  const paused = setup(true);
  paused.control.pause(true);
  paused.control.release(true, 5);
  assert.equal(paused.video.currentTime, 10);
  assert.equal(paused.video.plays, undefined);
});
test('replay clamps to zero and rejects replaced videos or sources', () => {
  const { video, control } = setup();
  video.currentTime = 2;
  assert.equal(control.replay(control.bookmark(), 5), true);
  assert.equal(video.currentTime, 0);
  const bookmark = control.bookmark();
  video.currentSrc = 'another video';
  assert.equal(control.replay(bookmark), false);
  assert.equal(video.plays, 1);
});
