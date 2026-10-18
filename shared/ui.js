/*
 * Small DOM/canvas helpers shared by the games.
 */
(function () {
  'use strict';

  let toastTimer = null;

  const UI = {
    $: function (sel, root) { return (root || document).querySelector(sel); },

    show: function (el) {
      el = typeof el === 'string' ? UI.$(el) : el;
      el.classList.remove('hidden');
    },
    hide: function (el) {
      el = typeof el === 'string' ? UI.$(el) : el;
      el.classList.add('hidden');
    },

    /** Short message at the top of the screen. */
    toast: function (msg, ms) {
      let el = UI.$('.toast');
      if (!el) {
        el = document.createElement('div');
        el.className = 'toast';
        document.body.appendChild(el);
      }
      el.textContent = msg;
      el.classList.add('visible');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(function () { el.classList.remove('visible'); }, ms || 1800);
    },

    /** Wire a button to Sfx mute state; its text toggles between 🔊 / 🔇. */
    bindMuteButton: function (btn) {
      btn = typeof btn === 'string' ? UI.$(btn) : btn;
      const render = function () {
        btn.textContent = window.Sfx.isMuted() ? '🔇' : '🔊';
        btn.setAttribute('aria-pressed', window.Sfx.isMuted() ? 'true' : 'false');
      };
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        window.Sfx.toggleMute();
        render();
        window.Sfx.play('click');
      });
      render();
    },

    /**
     * Keep a canvas the size of its CSS box at device pixel ratio.
     * onResize(widthCss, heightCss, dpr) is called initially and on every resize;
     * the 2D context is pre-scaled so you can draw in CSS pixels.
     */
    fitCanvas: function (canvas, onResize) {
      const ctx = canvas.getContext('2d');
      const resize = function () {
        const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
        const w = canvas.clientWidth;
        const h = canvas.clientHeight;
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        if (onResize) onResize(w, h, dpr);
      };
      window.addEventListener('resize', resize);
      if (window.ResizeObserver) new ResizeObserver(resize).observe(canvas);
      resize();
      return ctx;
    },

    /** 1234 -> "1,234"; 1.2e9 -> "1.20B" (handy for scores and idle games). */
    formatNumber: function (n) {
      if (!isFinite(n)) return '∞';
      const abs = Math.abs(n);
      if (abs < 1e4) return Math.floor(n).toLocaleString('en-US');
      const units = ['K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];
      let i = -1;
      let v = abs;
      while (v >= 1000 && i < units.length - 1) {
        v /= 1000;
        i++;
      }
      if (v >= 1000) return (n < 0 ? '-' : '') + abs.toExponential(2).replace('+', '');
      const digits = v < 10 ? 2 : v < 100 ? 1 : 0;
      return (n < 0 ? '-' : '') + v.toFixed(digits) + units[i];
    }
  };

  // Block page scroll / pinch zoom / long-press menus inside game iframes.
  document.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  document.addEventListener('gesturestart', function (e) { e.preventDefault(); });
  window.addEventListener('keydown', function (e) {
    if ([' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].indexOf(e.key) >= 0 &&
        e.target === document.body) {
      e.preventDefault();
    }
  });

  window.UI = UI;
})();
