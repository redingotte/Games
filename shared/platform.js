/*
 * Platform adapter shared by every game.
 *
 * - On CrazyGames (SDK v3 script present in the page) it forwards gameplay
 *   events, ads and save data to the SDK.
 * - Everywhere else (itch.io, own website, local file) every call is a safe
 *   no-op, ads are reported as unavailable and saves go to localStorage.
 *
 * Games only ever talk to `Platform`, never to a vendor SDK directly, so a
 * new portal can be supported by editing this single file.
 */
(function () {
  'use strict';

  const AD_MIN_INTERVAL_MS = 3 * 60 * 1000;
  const memoryStore = {};

  let sdk = null;
  let gameId = 'game';
  let inGameplay = false;
  let lastAdAt = Date.now();
  let adRunning = false;
  const adListeners = [];

  function safeLocalGet(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (e) {
      return Object.prototype.hasOwnProperty.call(memoryStore, key) ? memoryStore[key] : null;
    }
  }

  function safeLocalSet(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch (e) {
      memoryStore[key] = value;
    }
  }

  function rawGet(key) {
    if (sdk && sdk.data) {
      try {
        const v = sdk.data.getItem(key);
        if (v !== null && v !== undefined) return v;
      } catch (e) {
        /* data module disabled: fall back to localStorage */
      }
    }
    return safeLocalGet(key);
  }

  function rawSet(key, value) {
    if (sdk && sdk.data) {
      try {
        sdk.data.setItem(key, value);
      } catch (e) {
        /* ignore, localStorage copy below still persists */
      }
    }
    safeLocalSet(key, value);
  }

  function notifyAd(started) {
    adRunning = started;
    adListeners.forEach(function (l) {
      try {
        (started ? l.start : l.end)();
      } catch (e) {
        console.error(e);
      }
    });
  }

  function withTimeout(promise, ms) {
    return Promise.race([
      promise,
      new Promise(function (_, reject) {
        setTimeout(function () { reject(new Error('timeout')); }, ms);
      })
    ]);
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  function detectLang() {
    const params = new URLSearchParams(location.search);
    const forced = params.get('lang');
    if (forced) return forced.slice(0, 2).toLowerCase();
    const nav = (navigator.languages && navigator.languages[0]) || navigator.language || 'en';
    return nav.slice(0, 2).toLowerCase();
  }

  function requestAd(type) {
    return new Promise(function (resolve) {
      if (!sdk || adRunning) return resolve(false);
      let started = false;
      let settled = false;
      const done = function (ok) {
        if (settled) return;
        settled = true;
        if (started) notifyAd(false);
        lastAdAt = Date.now();
        resolve(ok);
      };
      try {
        sdk.ad.requestAd(type, {
          adStarted: function () {
            started = true;
            notifyAd(true);
          },
          adFinished: function () { done(true); },
          adError: function () { done(false); }
        });
      } catch (e) {
        done(false);
      }
    });
  }

  const Platform = {
    /** 'crazygames' | 'local' (CrazyGames SDK in localhost test mode) | 'web' */
    env: 'web',
    lang: detectLang(),

    /** Call once at startup, before reading saves. Never rejects. */
    init: async function (id) {
      gameId = id || gameId;
      const params = new URLSearchParams(location.search);
      if (!window.CrazyGames && params.get('sdk') === 'crazygames') {
        try {
          await withTimeout(loadScript('https://sdk.crazygames.com/crazygames-sdk-v3.js'), 5000);
        } catch (e) {
          console.warn('CrazyGames SDK could not be loaded', e);
        }
      }
      if (window.CrazyGames && window.CrazyGames.SDK) {
        try {
          await withTimeout(window.CrazyGames.SDK.init(), 5000);
          const env = window.CrazyGames.SDK.environment;
          if (env === 'crazygames' || env === 'local') {
            sdk = window.CrazyGames.SDK;
            Platform.env = env;
          }
        } catch (e) {
          console.warn('CrazyGames SDK init failed, running without it', e);
        }
      }
    },

    loadingStart: function () {
      if (sdk) try { sdk.game.loadingStart(); } catch (e) { /* noop */ }
    },
    loadingStop: function () {
      if (sdk) try { sdk.game.loadingStop(); } catch (e) { /* noop */ }
    },

    /** Call when the player starts or resumes actual play. Idempotent. */
    gameplayStart: function () {
      if (inGameplay) return;
      inGameplay = true;
      if (sdk) try { sdk.game.gameplayStart(); } catch (e) { /* noop */ }
    },
    /** Call on game over, pause, menus. Idempotent. */
    gameplayStop: function () {
      if (!inGameplay) return;
      inGameplay = false;
      if (sdk) try { sdk.game.gameplayStop(); } catch (e) { /* noop */ }
    },
    /** Celebrate a big moment (new best score, boss beaten). Use sparingly. */
    happytime: function () {
      if (sdk) try { sdk.game.happytime(); } catch (e) { /* noop */ }
    },

    /** True when rewarded ads can be offered (hide reward buttons otherwise). */
    hasRewarded: function () {
      return !!sdk;
    },

    /**
     * Interstitial at a natural break (e.g. between game over and restart).
     * Throttled; always resolves, the game simply continues afterwards.
     */
    midgameAd: async function () {
      if (!sdk || Date.now() - lastAdAt < AD_MIN_INTERVAL_MS) return false;
      return requestAd('midgame');
    },

    /** Resolves true only if the player watched the ad and earned the reward. */
    rewardedAd: async function () {
      return requestAd('rewarded');
    },

    /** Register callbacks fired when an ad starts / ends (mute + pause). */
    onAd: function (start, end) {
      adListeners.push({ start: start || function () {}, end: end || function () {} });
    },
    isAdRunning: function () {
      return adRunning;
    },

    storage: {
      get: function (key, fallback) {
        const raw = rawGet(gameId + ':' + key);
        if (raw === null || raw === undefined) return fallback;
        try {
          return JSON.parse(raw);
        } catch (e) {
          return fallback;
        }
      },
      set: function (key, value) {
        rawSet(gameId + ':' + key, JSON.stringify(value));
      }
    },

    /** Pick the dictionary for the current language, falling back to English. */
    strings: function (dict) {
      const base = dict.en || {};
      const local = dict[Platform.lang] || {};
      return Object.assign({}, base, local);
    }
  };

  window.Platform = Platform;
})();
