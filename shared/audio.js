/*
 * Tiny procedural sound kit (WebAudio, no asset files).
 *
 *   Sfx.play('pop')                  named preset
 *   Sfx.play('pop', { pitch: 1.5 })  preset with pitch multiplier
 *   Sfx.tone({ freq: 440, ... })     raw tone
 *   Sfx.buzz(20)                     short haptic on mobile
 *   Sfx.toggleMute()                 persisted through Platform.storage
 *
 * The AudioContext is created on the first user gesture (browser autoplay
 * rules) and silenced while ads play or the tab is hidden.
 */
(function () {
  'use strict';

  let ctx = null;
  let master = null;
  let muted = false;
  let adMuted = false;
  let noiseBuffer = null;

  function ensureCtx() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
    applyGain();
    return ctx;
  }

  function applyGain() {
    if (!master) return;
    master.gain.value = muted || adMuted ? 0 : 0.5;
  }

  function getNoise() {
    if (noiseBuffer) return noiseBuffer;
    const len = ctx.sampleRate * 0.5;
    noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return noiseBuffer;
  }

  /**
   * opts: freq, type ('sine'|'square'|'triangle'|'sawtooth'|'noise'),
   *       dur (s), vol (0..1), slide (end freq multiplier), attack (s),
   *       delay (s), filter (lowpass Hz)
   */
  function tone(opts) {
    if (muted || adMuted || !ensureCtx() || ctx.state !== 'running') return;
    const o = Object.assign(
      { freq: 440, type: 'sine', dur: 0.12, vol: 0.3, slide: 1, attack: 0.005, delay: 0 },
      opts
    );
    const t0 = ctx.currentTime + o.delay;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(o.vol, t0 + o.attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);

    let src;
    if (o.type === 'noise') {
      src = ctx.createBufferSource();
      src.buffer = getNoise();
    } else {
      src = ctx.createOscillator();
      src.type = o.type;
      src.frequency.setValueAtTime(o.freq, t0);
      if (o.slide !== 1) {
        src.frequency.exponentialRampToValueAtTime(Math.max(20, o.freq * o.slide), t0 + o.dur);
      }
    }

    let node = src;
    if (o.filter) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = o.filter;
      node.connect(f);
      node = f;
    }
    node.connect(gain);
    gain.connect(master);
    src.start(t0);
    src.stop(t0 + o.dur + 0.05);
  }

  // Each preset receives a pitch multiplier `p`.
  const presets = {
    click: function (p) { tone({ freq: 660 * p, type: 'triangle', dur: 0.06, vol: 0.2 }); },
    pop: function (p) { tone({ freq: 520 * p, type: 'sine', dur: 0.1, vol: 0.35, slide: 1.8 }); },
    place: function (p) {
      tone({ freq: 220 * p, type: 'triangle', dur: 0.09, vol: 0.35, slide: 0.7 });
      tone({ type: 'noise', dur: 0.05, vol: 0.08, filter: 1800 });
    },
    drop: function (p) { tone({ freq: 300 * p, type: 'sine', dur: 0.15, vol: 0.3, slide: 0.5 }); },
    clear: function (p) {
      [0, 4, 7, 12].forEach(function (s, i) {
        tone({ freq: 440 * p * Math.pow(2, s / 12), type: 'triangle', dur: 0.18, vol: 0.22, delay: i * 0.05 });
      });
    },
    combo: function (p) {
      [0, 7, 12, 16, 19].forEach(function (s, i) {
        tone({ freq: 523 * p * Math.pow(2, s / 12), type: 'square', dur: 0.14, vol: 0.12, delay: i * 0.045, filter: 3000 });
      });
    },
    merge: function (p) {
      tone({ freq: 330 * p, type: 'sine', dur: 0.18, vol: 0.35, slide: 2 });
      tone({ freq: 660 * p, type: 'triangle', dur: 0.12, vol: 0.15, delay: 0.04 });
    },
    coin: function (p) {
      tone({ freq: 988 * p, type: 'square', dur: 0.06, vol: 0.12, filter: 4000 });
      tone({ freq: 1319 * p, type: 'square', dur: 0.12, vol: 0.12, delay: 0.06, filter: 4000 });
    },
    buy: function (p) {
      tone({ freq: 523 * p, type: 'triangle', dur: 0.08, vol: 0.25 });
      tone({ freq: 784 * p, type: 'triangle', dur: 0.14, vol: 0.25, delay: 0.07 });
    },
    perfect: function (p) {
      tone({ freq: 880 * p, type: 'sine', dur: 0.25, vol: 0.3 });
      tone({ freq: 1760 * p, type: 'sine', dur: 0.2, vol: 0.1, delay: 0.02 });
    },
    whoosh: function () { tone({ type: 'noise', dur: 0.25, vol: 0.15, filter: 900 }); },
    error: function (p) { tone({ freq: 160 * p, type: 'square', dur: 0.15, vol: 0.12, filter: 900 }); },
    gameover: function (p) {
      [0, -3, -7, -12].forEach(function (s, i) {
        tone({ freq: 392 * p * Math.pow(2, s / 12), type: 'triangle', dur: 0.3, vol: 0.25, delay: i * 0.14 });
      });
    },
    win: function (p) {
      [0, 4, 7, 12, 16, 19, 24].forEach(function (s, i) {
        tone({ freq: 523 * p * Math.pow(2, s / 12), type: 'triangle', dur: 0.2, vol: 0.2, delay: i * 0.06 });
      });
    }
  };

  function unlock() {
    if (!ensureCtx()) return;
    if (ctx.state === 'suspended' && !document.hidden) ctx.resume();
  }

  ['pointerdown', 'touchstart', 'keydown', 'mousedown'].forEach(function (ev) {
    window.addEventListener(ev, unlock, { passive: true, capture: true });
  });

  document.addEventListener('visibilitychange', function () {
    if (!ctx) return;
    if (document.hidden) ctx.suspend();
    else ctx.resume();
  });

  const Sfx = {
    tone: tone,
    play: function (name, opts) {
      const fn = presets[name];
      if (fn) fn((opts && opts.pitch) || 1);
    },
    buzz: function (ms) {
      if (muted || !navigator.vibrate) return;
      try { navigator.vibrate(ms || 15); } catch (e) { /* noop */ }
    },
    isMuted: function () { return muted; },
    setMuted: function (m) {
      muted = !!m;
      applyGain();
      if (window.Platform) window.Platform.storage.set('muted', muted);
    },
    toggleMute: function () {
      Sfx.setMuted(!muted);
      return muted;
    },
    /** Read the saved mute preference (call after Platform.init). */
    loadPrefs: function () {
      if (window.Platform) muted = !!window.Platform.storage.get('muted', false);
      applyGain();
    }
  };

  if (window.Platform) {
    window.Platform.onAd(
      function () { adMuted = true; applyGain(); },
      function () { adMuted = false; applyGain(); }
    );
  }

  window.Sfx = Sfx;
})();
