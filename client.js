/**
 * Client half of the NetEase Cloud Music bundle.
 *
 * Three surfaces share one module-level player (a single <audio> element plus a tiny store), so the
 * full page and the docked bar never fight over playback:
 *   - sidebar.panellist       → the ♪ icon,
 *   - main                    → the NetEase-style library page,
 *   - conversation.input.dock → a compact player above the composer, in normal flow.
 *
 * All traffic goes to the same-origin `/netease-music/*` route owned by the Host half.
 */
window.__ModuleLoader__.load({
  id: 'dsh-netease-music',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useState, useEffect, useMemo, useCallback, useRef } = React;

    const PANEL_ID = 'netease-music';
    const BASE = '/netease-music';
    const API = BASE + '/api';
    const LS_COOKIE = 'dsh.netease.cookie';
    const LS_VOLUME = 'dsh.netease.volume';
    const LS_MODE = 'dsh.netease.mode';
    const LS_QUALITY = 'dsh.netease.quality';
    const ACCENT = '#ec4141';

    const MODES = ['list', 'single', 'shuffle'];
    const MODE_LABEL = { list: '列表循环', single: '单曲循环', shuffle: '随机播放' };
    const MODE_GLYPH = { list: 'repeat', single: 'repeatOne', shuffle: 'shuffle' };
    const QUALITIES = [
      { id: 'standard', label: '标准 128k' },
      { id: 'higher', label: '较高 192k' },
      { id: 'exhigh', label: '极高 320k' },
      { id: 'lossless', label: '无损 FLAC' },
      { id: 'hires', label: 'Hi-Res FLAC' },
    ];

    const css = `
.nm-page { position: relative; display: flex; flex-direction: column; height: 100%; min-height: 0;
  background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary);
  font-size: 13px; line-height: 1.45; }
.nm-frame { display: flex; flex: 1 1 auto; min-height: 0; }
.nm-rail { width: 208px; flex: 0 0 auto; display: flex; flex-direction: column; gap: 2px;
  padding: 14px 10px 18px; overflow-y: auto;
  border-right: 1px solid var(--dsw-alias-border-l1); }
.nm-brand { display: flex; align-items: center; gap: 8px; padding: 4px 10px 14px;
  font-size: 15px; font-weight: 600; }
.nm-nav { display: flex; align-items: center; gap: 9px; padding: 8px 10px; border-radius: 8px;
  cursor: pointer; color: var(--dsw-alias-label-secondary); border: 0; background: none;
  font: inherit; text-align: left; width: 100%; }
.nm-nav:hover { background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); }
.nm-nav.is-active { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }
.nm-rail-title { margin: 16px 10px 6px; font-size: 11px; letter-spacing: .4px;
  color: var(--dsw-alias-label-secondary); }
.nm-rail-item { display: block; width: 100%; text-align: left; border: 0; background: none;
  font: inherit; font-size: 12.5px; padding: 7px 10px; border-radius: 8px; cursor: pointer;
  color: var(--dsw-alias-label-secondary); overflow: hidden; text-overflow: ellipsis;
  white-space: nowrap; }
.nm-rail-item:hover { background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); }
.nm-rail-item.is-active { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }
.nm-main { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; }
.nm-top { display: flex; align-items: center; gap: 12px; padding: 14px 20px 8px; flex: 0 0 auto; }
.nm-search { display: flex; align-items: center; gap: 8px; flex: 1 1 auto; max-width: 520px; }
.nm-input { flex: 1 1 auto; min-width: 0; height: 32px; padding: 0 12px; border-radius: 16px;
  font: inherit; border: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); outline: none; }
.nm-input:focus { border-color: ${ACCENT}; }
.nm-btn { height: 32px; padding: 0 14px; border-radius: 16px; font: inherit; cursor: pointer;
  border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary); white-space: nowrap; }
.nm-btn:hover:not(:disabled) { background: var(--dsw-alias-bg-layer-2); }
.nm-btn:disabled { opacity: .5; cursor: default; }
.nm-btn-accent { border-color: ${ACCENT}; background: ${ACCENT}; color: #fff; }
.nm-btn-accent:hover:not(:disabled) { background: #d63a3a; border-color: #d63a3a; }
.nm-account { margin-left: auto; display: flex; align-items: center; gap: 8px; }
.nm-avatar { width: 26px; height: 26px; border-radius: 50%; object-fit: cover; }
.nm-uname { max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  color: var(--dsw-alias-label-secondary); font-size: 12.5px; }
.nm-link { border: 0; background: none; font: inherit; cursor: pointer; padding: 0 2px;
  color: var(--dsw-alias-label-secondary); }
.nm-link:hover { color: ${ACCENT}; }
.nm-scroll { flex: 1 1 auto; min-height: 0; overflow-y: auto; padding: 4px 20px 20px; }
.nm-cta { display: flex; align-items: center; gap: 12px; padding: 10px 14px; margin: 6px 0 2px;
  border-radius: 10px; font-size: 12.5px; color: var(--dsw-alias-label-secondary);
  border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1); }
.nm-grow { flex: 1 1 auto; min-width: 0; }
.nm-h { display: flex; align-items: baseline; gap: 10px; margin: 20px 0 12px; }
.nm-h b { font-size: 16px; font-weight: 600; }
.nm-h span { font-size: 12px; color: var(--dsw-alias-label-secondary); }
.nm-h-action { margin-left: auto; font-size: 12px; }
.nm-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(132px, 1fr)); gap: 18px 14px; }
.nm-card { min-width: 0; cursor: pointer; }
.nm-card-cover { position: relative; width: 100%; aspect-ratio: 1 / 1; border-radius: 10px;
  overflow: hidden; background: var(--dsw-alias-bg-layer-2); }
.nm-card-cover img { width: 100%; height: 100%; object-fit: cover; display: block; }
.nm-card-count { position: absolute; top: 6px; right: 8px; font-size: 11px; color: #fff;
  display: flex; align-items: center; gap: 3px; text-shadow: 0 1px 3px rgba(0,0,0,.65); }
.nm-card-play { position: absolute; right: 8px; bottom: 8px; width: 30px; height: 30px;
  border-radius: 50%; background: rgba(255,255,255,.94); color: #1a1a1a; display: flex;
  align-items: center; justify-content: center; opacity: 0; transform: translateY(4px);
  transition: opacity .16s ease, transform .16s ease; }
.nm-card:hover .nm-card-play { opacity: 1; transform: none; }
.nm-card-title { margin-top: 7px; font-size: 12.5px; line-height: 1.35; overflow: hidden;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.nm-songs { display: flex; flex-direction: column; }
.nm-song { display: flex; align-items: center; gap: 12px; padding: 7px 10px; border-radius: 8px;
  cursor: pointer; }
.nm-song:hover { background: var(--dsw-alias-bg-layer-1); }
.nm-song.is-active { background: var(--dsw-alias-bg-layer-2); }
.nm-song.is-active .nm-song-name { color: ${ACCENT}; }
.nm-song-no { width: 24px; flex: 0 0 auto; text-align: center; font-size: 12px;
  color: var(--dsw-alias-label-secondary); font-variant-numeric: tabular-nums; }
.nm-song-main { flex: 1 1 auto; min-width: 0; }
.nm-song-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nm-song-sub { font-size: 12px; color: var(--dsw-alias-label-secondary); overflow: hidden;
  text-overflow: ellipsis; white-space: nowrap; }
.nm-song-album { flex: 0 1 220px; min-width: 0; overflow: hidden; text-overflow: ellipsis;
  white-space: nowrap; font-size: 12px; color: var(--dsw-alias-label-secondary); }
.nm-song-dur { flex: 0 0 auto; width: 46px; text-align: right; font-size: 12px;
  color: var(--dsw-alias-label-secondary); font-variant-numeric: tabular-nums; }
.nm-vip { margin-left: 6px; font-style: normal; font-size: 10px; padding: 1px 4px;
  border-radius: 3px; color: ${ACCENT}; border: 1px solid ${ACCENT}; }
.nm-pl-head { display: flex; gap: 18px; padding: 10px 0 18px; align-items: flex-end; }
.nm-pl-cover { width: 132px; height: 132px; border-radius: 12px; object-fit: cover;
  background: var(--dsw-alias-bg-layer-2); flex: 0 0 auto; }
.nm-pl-kicker { font-size: 11px; letter-spacing: .5px; color: var(--dsw-alias-label-secondary); }
.nm-pl-name { font-size: 20px; font-weight: 600; margin: 4px 0 6px; }
.nm-pl-meta { font-size: 12px; color: var(--dsw-alias-label-secondary); margin-bottom: 12px; }
.nm-player { flex: 0 0 auto; display: flex; align-items: center; gap: 16px; padding: 10px 20px;
  border-top: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1); }
.nm-now { display: flex; align-items: center; gap: 10px; width: 230px; flex: 0 0 auto; min-width: 0; }
.nm-cover { width: 46px; height: 46px; border-radius: 6px; object-fit: cover;
  background: var(--dsw-alias-bg-layer-2); flex: 0 0 auto; }
.nm-now-meta { min-width: 0; }
.nm-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nm-sub { font-size: 12px; color: var(--dsw-alias-label-secondary); overflow: hidden;
  text-overflow: ellipsis; white-space: nowrap; }
.nm-controls { display: flex; align-items: center; gap: 8px; flex: 0 0 auto; }
.nm-play { width: 36px; height: 36px; border-radius: 50%; border: 0; cursor: pointer;
  background: ${ACCENT}; color: #fff; display: flex; align-items: center; justify-content: center; }
.nm-play:disabled { opacity: .5; cursor: default; }
.nm-icon-btn { width: 28px; height: 28px; border-radius: 50%; border: 0; background: none;
  color: var(--dsw-alias-label-secondary); cursor: pointer; display: inline-flex;
  align-items: center; justify-content: center; }
.nm-icon-btn:hover:not(:disabled) { background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-primary); }
.nm-icon-btn:disabled { opacity: .35; cursor: default; }
.nm-progress { display: flex; align-items: center; gap: 8px; flex: 1 1 auto; min-width: 60px; }
.nm-time { width: 40px; flex: 0 0 auto; text-align: center; font-size: 11px;
  color: var(--dsw-alias-label-secondary); font-variant-numeric: tabular-nums; }
.nm-range { flex: 1 1 auto; min-width: 40px; height: 4px; cursor: pointer; accent-color: ${ACCENT}; }
.nm-volume { max-width: 84px; }
.nm-tools { display: flex; align-items: center; gap: 8px; flex: 0 0 auto; }
.nm-select { height: 26px; padding: 0 6px; border-radius: 6px; font: inherit; font-size: 11.5px;
  cursor: pointer; color: var(--dsw-alias-label-secondary);
  background: var(--dsw-alias-bg-layer-2); border: 1px solid var(--dsw-alias-border-l1); outline: none; }
.nm-select:hover { color: var(--dsw-alias-label-primary); }
.nm-badge { font-size: 10px; padding: 1px 5px; border-radius: 4px; white-space: nowrap;
  color: var(--dsw-alias-label-secondary); border: 1px solid var(--dsw-alias-border-l1); }
.nm-unavailable { display: flex; align-items: center; gap: 10px; padding: 6px 20px;
  font-size: 12px; color: var(--dsw-alias-label-secondary);
  border-top: 1px solid var(--dsw-alias-border-l1); background: rgba(236,65,65,.06); }
.nm-lyrics-panel { flex: 0 0 auto; height: 190px; overflow-y: auto; padding: 14px 20px 18px;
  text-align: center; border-top: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-layer-1); }
.nm-lyric { padding: 5px 0; color: var(--dsw-alias-label-secondary); font-size: 13px;
  transition: color .18s ease; }
.nm-lyric.is-active { color: ${ACCENT}; font-weight: 600; }
.nm-empty { padding: 56px 16px; text-align: center; color: var(--dsw-alias-label-secondary); }
.nm-empty b { display: block; margin-bottom: 6px; color: var(--dsw-alias-label-primary); }
.nm-dock { display: flex; align-items: center; gap: 10px; padding: 7px 10px; border-radius: 10px;
  cursor: pointer; margin-bottom: 6px; border: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-layer-1); }
.nm-dock-cover { width: 34px; height: 34px; border-radius: 6px; object-fit: cover;
  background: var(--dsw-alias-bg-layer-2); flex: 0 0 auto; }
.nm-dock-meta { flex: 1 1 auto; min-width: 0; }
.nm-dock-name { font-size: 12.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nm-dock-sub { font-size: 11.5px; color: var(--dsw-alias-label-secondary); overflow: hidden;
  text-overflow: ellipsis; white-space: nowrap; }
.nm-dock-track { width: 120px; height: 3px; border-radius: 2px; flex: 0 0 auto; overflow: hidden;
  background: rgba(127,127,127,.22); }
.nm-dock-track > i { display: block; height: 100%; background: ${ACCENT}; transition: width .25s linear; }
.nm-modal { position: absolute; inset: 0; z-index: 40; display: flex; align-items: center;
  justify-content: center; background: rgba(0,0,0,.46); }
.nm-modal-card { width: 316px; padding: 22px 22px 18px; border-radius: 14px; text-align: center;
  background: var(--dsw-alias-bg-overlay); border: 1px solid var(--dsw-alias-border-l1);
  box-shadow: 0 18px 48px rgba(0,0,0,.32); }
.nm-modal-head { display: flex; align-items: center; justify-content: center; gap: 7px;
  font-size: 14px; font-weight: 600; color: ${ACCENT}; }
.nm-modal-text { min-height: 32px; font-size: 12px; color: var(--dsw-alias-label-secondary); }
.nm-modal-actions { display: flex; gap: 8px; justify-content: center; margin-top: 8px; }
.nm-tabs { display: flex; gap: 4px; justify-content: center; margin: 12px 0 2px; }
.nm-tab { border: 0; background: none; font: inherit; font-size: 12px; padding: 5px 10px;
  border-radius: 12px; cursor: pointer; color: var(--dsw-alias-label-secondary); }
.nm-tab:hover { color: var(--dsw-alias-label-primary); }
.nm-tab.is-active { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }
.nm-field { display: flex; gap: 8px; margin: 10px 0 0; }
.nm-field input { flex: 1 1 auto; min-width: 0; height: 34px; padding: 0 10px; border-radius: 8px;
  font: inherit; outline: none; color: inherit; background: var(--dsw-alias-bg-layer-1);
  border: 1px solid var(--dsw-alias-border-l1); }
.nm-field input:focus { border-color: ${ACCENT}; }
.nm-area { width: 100%; height: 86px; margin: 10px 0 0; resize: none; padding: 8px 10px;
  border-radius: 8px; font: inherit; font-size: 12px; outline: none; color: inherit;
  background: var(--dsw-alias-bg-layer-1); border: 1px solid var(--dsw-alias-border-l1); }
.nm-note { min-height: 18px; margin: 6px 0; font-size: 11.5px;
  color: var(--dsw-alias-label-secondary); }
.nm-hintline { margin-top: 8px; font-size: 11px; color: var(--dsw-alias-label-secondary); }
.nm-toast { position: absolute; left: 50%; bottom: 88px; transform: translateX(-50%); z-index: 30;
  max-width: 420px; padding: 8px 14px; border-radius: 8px; font-size: 12.5px;
  background: var(--dsw-alias-bg-overlay); border: 1px solid var(--dsw-alias-border-l1);
  box-shadow: 0 10px 28px rgba(0,0,0,.26); }
.nm-crash { padding: 28px; color: var(--dsw-alias-state-error-primary); font-size: 12.5px; }
`;

    /* ---------------------------------------------------------------- utils */

    function fmtTime(value) {
      if (!Number.isFinite(value) || value < 0) return '0:00';
      const total = Math.floor(value);
      return Math.floor(total / 60) + ':' + String(total % 60).padStart(2, '0');
    }

    function fmtCount(value) {
      const n = Number(value) || 0;
      if (n >= 100000000) return (n / 100000000).toFixed(1) + '亿';
      if (n >= 10000) return Math.floor(n / 10000) + '万';
      return String(n);
    }

    function msg(error) {
      return error && error.message ? error.message : String(error);
    }

    function parseLrc(text) {
      if (!text) return [];
      const out = [];
      const stamp = /\[(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
      for (const raw of String(text).split('\n')) {
        const times = [];
        let last = 0;
        let match;
        stamp.lastIndex = 0;
        while ((match = stamp.exec(raw)) !== null) {
          const frac = match[3] ? Number('0.' + match[3]) : 0;
          times.push(Number(match[1]) * 60 + Number(match[2]) + frac);
          last = stamp.lastIndex;
        }
        if (!times.length) continue;
        const line = raw.slice(last).trim();
        if (!line) continue;
        for (const at of times) out.push({ at, text: line });
      }
      return out.sort((a, b) => a.at - b.at);
    }

    function artistsOf(song) {
      if (!song) return '';
      const list = Array.isArray(song.artists) ? song.artists : Array.isArray(song.ar) ? song.ar : [];
      return list.map((a) => a && a.name).filter(Boolean).join(' / ');
    }

    function normalize(song) {
      if (!song) return null;
      const album = (song.album && song.album.name) || (song.al && song.al.name) || '';
      return {
        id: song.id,
        name: song.name || '',
        artists: artistsOf(song),
        album,
        duration: song.duration || song.dt || 0,
        fee: Number(song.fee) || 0,
      };
    }

    function reportClient(text) {
      try {
        fetch(BASE + '/log', {
          method: 'POST',
          headers: { 'content-type': 'text/plain' },
          body: String(text).slice(0, 500),
        });
      } catch {
        /* diagnostics are best effort */
      }
    }

    async function api(path, params) {
      const search = new URLSearchParams();
      for (const [key, value] of Object.entries(params || {})) {
        if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
      }
      const url = API + path + (search.toString() ? '?' + search.toString() : '');
      try {
        const response = await fetch(url, { headers: { accept: 'application/json' } });
        const text = await response.text();
        let json;
        try {
          json = JSON.parse(text);
        } catch {
          throw new Error('接口返回异常（HTTP ' + response.status + '）');
        }
        if (!response.ok) throw new Error(json && json.error ? json.error : 'HTTP ' + response.status);
        return json;
      } catch (error) {
        reportClient('api ' + path + ' failed: ' + msg(error));
        throw error;
      }
    }

    function coverUrl(value) {
      if (!value) return '';
      let url = String(value);
      if (url.startsWith('//')) url = 'https:' + url;
      if (!/^https?:/i.test(url)) return '';
      return BASE + '/image?url=' + encodeURIComponent(url);
    }

    function readStored(key, fallback) {
      try {
        const value = window.localStorage.getItem(key);
        return value === null ? fallback : value;
      } catch {
        return fallback;
      }
    }

    function writeStored(key, value) {
      try {
        if (value === null) window.localStorage.removeItem(key);
        else window.localStorage.setItem(key, value);
      } catch {
        /* storage may be unavailable; the session still works */
      }
    }

    function createStore(initial) {
      let state = initial;
      const listeners = new Set();
      return {
        get() {
          return state;
        },
        set(patch) {
          const next = typeof patch === 'function' ? patch(state) : { ...state, ...patch };
          if (!next || next === state) return;
          state = next;
          listeners.forEach((fn) => fn());
        },
        subscribe(fn) {
          listeners.add(fn);
          return () => listeners.delete(fn);
        },
      };
    }

    function useStore(store) {
      return React.useSyncExternalStore(store.subscribe, store.get, store.get);
    }

    /* ---------------------------------------------------------------- state */

    const UI = (() => {
      const store = createStore({ loginOpen: false, toast: '', miniHidden: false, lyricsOpen: false });
      let toastTimer = null;
      function toast(message) {
        store.set({ toast: message || '' });
        if (toastTimer) clearTimeout(toastTimer);
        if (message) toastTimer = setTimeout(() => store.set({ toast: '' }), 4200);
      }
      return { store, toast };
    })();

    const Auth = (() => {
      const store = createStore({ cookie: readStored(LS_COOKIE, '') || '', profile: null });
      async function refresh() {
        const cookie = store.get().cookie;
        if (!cookie) {
          store.set({ profile: null });
          return;
        }
        try {
          const json = await api('/login/status', { cookie });
          const profile = json && json.data && json.data.profile;
          store.set({
            profile: profile
              ? { nickname: profile.nickname, avatar: profile.avatarUrl, userId: profile.userId }
              : null,
          });
        } catch {
          store.set({ profile: null });
        }
      }
      function setCookie(cookie) {
        writeStored(LS_COOKIE, cookie || null);
        store.set({ cookie: cookie || '' });
        refresh();
      }
      function logout() {
        writeStored(LS_COOKIE, null);
        store.set({ cookie: '', profile: null });
        UI.toast('已退出登录');
      }
      return { store, refresh, setCookie, logout };
    })();

    const Player = (() => {
      const audio = new Audio();
      audio.preload = 'none';
      const initialVolume = Math.min(1, Math.max(0, Number(readStored(LS_VOLUME, '0.8')) || 0.8));
      const initialMode = MODES.includes(readStored(LS_MODE, 'list')) ? readStored(LS_MODE, 'list') : 'list';
      const storedQuality = readStored(LS_QUALITY, 'exhigh');
      const initialQuality = QUALITIES.some((item) => item.id === storedQuality) ? storedQuality : 'exhigh';
      const store = createStore({
        current: null,
        cover: '',
        playing: false,
        time: 0,
        duration: 0,
        queue: [],
        index: -1,
        lyrics: [],
        volume: initialVolume,
        unavailable: null,
        mode: initialMode,
        quality: initialQuality,
        bitrate: 0,
        format: '',
      });
      audio.volume = initialVolume;
      // A detached media element can report an empty `seekable` range in Chromium, so keep it in the
      // document (invisible) instead of floating in module scope.
      try {
        audio.style.display = 'none';
        if (document.body) document.body.appendChild(audio);
      } catch {
        /* not fatal: playback still works without seeking */
      }

      function describeSeekable() {
        try {
          const parts = [];
          for (let i = 0; i < audio.seekable.length; i += 1) {
            parts.push(Math.round(audio.seekable.start(i)) + '-' + Math.round(audio.seekable.end(i)));
          }
          return parts.join(',') || 'none';
        } catch {
          return 'error';
        }
      }

      audio.addEventListener('timeupdate', () => {
        const patch = { time: audio.currentTime || 0 };
        // Streamed media sometimes reports its duration late; keep the slider usable meanwhile.
        if (!store.get().duration && Number.isFinite(audio.duration) && audio.duration > 0) {
          patch.duration = audio.duration;
        }
        store.set(patch);
      });
      audio.addEventListener('loadedmetadata', () =>
        store.set({ duration: Number.isFinite(audio.duration) ? audio.duration : 0 }),
      );
      audio.addEventListener('durationchange', () =>
        store.set({ duration: Number.isFinite(audio.duration) ? audio.duration : 0 }),
      );
      audio.addEventListener('play', () => store.set({ playing: true }));
      audio.addEventListener('pause', () => store.set({ playing: false }));
      audio.addEventListener('ended', () => advanceAuto());
      audio.addEventListener('error', () => {
        if (audio.src) UI.toast('音频加载失败，可以试试「用客户端播放」');
      });

      async function play(song) {
        if (!song || !song.id) return;
        UI.store.set({ miniHidden: false });
        store.set({ current: song, cover: '', unavailable: null, time: 0, duration: 0, lyrics: [] });
        try {
          const detail = await api('/song/detail', { ids: String(song.id) });
          const first = detail && detail.songs && detail.songs[0];
          if (first) {
            const album = first.al || {};
            store.set({
              cover: album.picUrl || '',
              current: {
                ...song,
                name: first.name || song.name,
                artists: artistsOf(first) || song.artists,
                album: album.name || song.album,
                duration: first.dt || song.duration,
              },
            });
          }
        } catch {
          /* cover and album are optional */
        }

        let item = null;
        try {
          const json = await api('/song/url/v1', {
            id: String(song.id),
            level: store.get().quality,
            cookie: Auth.store.get().cookie,
          });
          item = json && json.data && json.data[0];
        } catch (error) {
          UI.toast('取播放地址失败：' + msg(error));
        }
        if (!item || !item.url) {
          store.set({ unavailable: store.get().current, playing: false });
          return;
        }
        store.set({ bitrate: Number(item.br) || 0, format: item.type || '' });
        releaseObjectUrl();
        currentSourceUrl = item.url;
        audio.src = BASE + '/audio?url=' + encodeURIComponent(item.url);
        audio.volume = store.get().volume;
        try {
          await audio.play();
        } catch {
          UI.toast('点一下播放键开始播放');
        }
        api('/lyric', { id: String(song.id) })
          .then((json) => store.set({ lyrics: parseLrc(json && json.lrc && json.lrc.lyric) }))
          .catch(() => {});
      }

      function playList(list, index) {
        if (!list || !list.length) return;
        const at = Math.max(0, Math.min(index, list.length - 1));
        store.set({ queue: list, index: at });
        play(list[at]);
      }

      function next() {
        const state = store.get();
        if (!state.queue.length) return;
        const at = (state.index + 1) % state.queue.length;
        store.set({ index: at });
        play(state.queue[at]);
      }

      function prev() {
        const state = store.get();
        if (!state.queue.length) return;
        const at = (state.index - 1 + state.queue.length) % state.queue.length;
        store.set({ index: at });
        play(state.queue[at]);
      }

      function toggle() {
        if (!audio.src) {
          const state = store.get();
          if (state.current) play(state.current);
          return;
        }
        if (audio.paused) audio.play().catch(() => UI.toast('这个地址播不了，试试用客户端播放'));
        else audio.pause();
      }

      let lastSeek = { target: -1, at: 0 };
      let currentSourceUrl = '';
      let objectUrl = '';
      let blobMode = false;

      function releaseObjectUrl() {
        if (objectUrl) {
          try {
            URL.revokeObjectURL(objectUrl);
          } catch {
            /* ignore */
          }
          objectUrl = '';
        }
        blobMode = false;
      }

      function seek(value) {
        if (!audio.src) return;
        let target = Number(value);
        if (!Number.isFinite(target)) return;
        const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
        // Seeking to the very end would fire `ended` and look like "restart from zero".
        if (duration > 0) target = Math.min(target, Math.max(0, duration - 0.6));
        if (target < 0) target = 0;
        // `pointerup` and `mouseup` both fire for one gesture; two writes while the element is
        // already seeking make Chromium abort and restart the load.
        const now = Date.now();
        if (Math.abs(target - lastSeek.target) < 1 && now - lastSeek.at < 600) return;
        lastSeek = { target, at: now };

        const apply = () => {
          try {
            audio.currentTime = target;
          } catch {
            /* the element may not be seekable yet */
          }
        };
        const seekable = describeSeekable();
        if (audio.readyState >= 1) apply();
        else audio.addEventListener('loadedmetadata', apply, { once: true });
        store.set({ time: target });
        reportClient(
          'seek target=' + Math.round(target) +
            ' duration=' + Math.round(duration) +
            ' ready=' + audio.readyState +
            ' seekable=' + seekable,
        );
        // Report where the element actually landed: the slider is only honest if this moves.
        setTimeout(() => {
          const landed = Math.abs(audio.currentTime - target) <= 2;
          reportClient(
            'seek-after target=' + Math.round(target) +
              ' currentTime=' + Math.round(audio.currentTime * 10) / 10 +
              ' seekable=' + describeSeekable() +
              ' paused=' + audio.paused +
              ' error=' + (audio.error ? audio.error.code : 'none'),
          );
          // If the stream refused the seek, buffering the whole track locally always works.
          if (!landed && !blobMode) switchToBlob(target);
        }, 700);
      }

      /** Last-resort seek: fetch the whole track once into a Blob URL, which seeks instantly. */
      async function switchToBlob(target) {
        if (!currentSourceUrl) return;
        try {
          UI.toast('正在缓冲整首以便跳转…');
          const response = await fetch(BASE + '/audio?url=' + encodeURIComponent(currentSourceUrl));
          const blob = await response.blob();
          releaseObjectUrl();
          objectUrl = URL.createObjectURL(blob);
          blobMode = true;
          audio.addEventListener(
            'loadedmetadata',
            () => {
              try {
                audio.currentTime = target;
              } catch {
                /* ignore */
              }
              audio.play().catch(() => {});
            },
            { once: true },
          );
          audio.src = objectUrl;
          reportClient('blob fallback: ' + Math.round(blob.size / 1024) + 'KB at ' + Math.round(target));
        } catch (error) {
          reportClient('blob fallback failed: ' + msg(error));
          UI.toast('缓冲失败，请重试');
        }
      }

      function setVolume(value) {
        const volume = Math.min(1, Math.max(0, value));
        audio.volume = volume;
        writeStored(LS_VOLUME, String(volume));
        store.set({ volume });
      }

      /** Auto-advance when a track ends: honours the loop mode; manual next/prev always step. */
      function advanceAuto() {
        const state = store.get();
        if (!state.queue.length) return;
        if (state.mode === 'single') {
          try {
            audio.currentTime = 0;
            audio.play();
          } catch {
            /* the element may be gone */
          }
          return;
        }
        if (state.mode === 'shuffle' && state.queue.length > 1) {
          let at = state.index;
          while (at === state.index) at = Math.floor(Math.random() * state.queue.length);
          store.set({ index: at });
          play(state.queue[at]);
          return;
        }
        next();
      }

      function cycleMode() {
        const current = store.get().mode;
        const nextMode = MODES[(MODES.indexOf(current) + 1) % MODES.length];
        writeStored(LS_MODE, nextMode);
        store.set({ mode: nextMode });
        UI.toast('播放模式：' + MODE_LABEL[nextMode]);
      }

      function setQuality(quality) {
        if (!QUALITIES.some((item) => item.id === quality)) return;
        writeStored(LS_QUALITY, quality);
        store.set({ quality });
        const label = (QUALITIES.find((item) => item.id === quality) || {}).label || quality;
        UI.toast('音质：' + label);
        const state = store.get();
        if (!state.current) return;
        const at = state.time;
        const resume = () => {
          try {
            audio.currentTime = at;
          } catch {
            /* the new stream may not be seekable yet */
          }
        };
        audio.addEventListener('loadedmetadata', resume, { once: true });
        play(state.current);
      }

      async function playInClient(song) {
        const target = song || store.get().current;
        if (!target) return;
        try {
          const response = await fetch(BASE + '/client-play?id=' + encodeURIComponent(String(target.id)), {
            method: 'POST',
          });
          if (!response.ok) {
            const json = await response.json().catch(() => ({}));
            throw new Error(json.error || 'HTTP ' + response.status);
          }
          UI.toast('已交给网易云客户端播放：' + target.name);
        } catch (error) {
          UI.toast('调用客户端失败：' + msg(error));
        }
      }

      return { store, play, playList, next, prev, toggle, seek, setVolume, cycleMode, setQuality, playInClient, audio };
    })();

    /* ---------------------------------------------------------------- login */

    function closeLogin() {
      UI.store.set({ loginOpen: false });
    }

    function openLogin() {
      UI.store.set({ loginOpen: true });
    }

    /* ---------------------------------------------------------------- icons */

    function Glyph(props) {
      const size = (props && props.size) || 18;
      const name = (props && props.name) || 'note';
      const paths = {
        note: [
          h('path', { key: 'a', d: 'M9 18V5.5L20 3v12.5' }),
          h('circle', { key: 'b', cx: 6.5, cy: 18, r: 2.5 }),
          h('circle', { key: 'c', cx: 17.5, cy: 15.5, r: 2.5 }),
        ],
        play: [h('path', { key: 'a', d: 'M8 5.5v13l11-6.5z', fill: 'currentColor', stroke: 'none' })],
        pause: [h('path', { key: 'a', d: 'M8 5h3v14H8zM13 5h3v14h-3z', fill: 'currentColor', stroke: 'none' })],
        next: [
          h('path', { key: 'a', d: 'M6 5.5v13l9-6.5z', fill: 'currentColor', stroke: 'none' }),
          h('path', { key: 'b', d: 'M17 5v14' }),
        ],
        prev: [
          h('path', { key: 'a', d: 'M18 5.5v13l-9-6.5z', fill: 'currentColor', stroke: 'none' }),
          h('path', { key: 'b', d: 'M7 5v14' }),
        ],
        close: [h('path', { key: 'a', d: 'M6 6l12 12M18 6L6 18' })],
        heart: [h('path', { key: 'a', d: 'M12 20s-7-4.6-7-9.4A4 4 0 0 1 12 8a4 4 0 0 1 7 2.6C19 15.4 12 20 12 20z' })],
        fire: [h('path', { key: 'a', d: 'M12 3s4 4.2 4 8a4 4 0 0 1-8 0c0-1.7.8-3.2 1.6-4.2C9 8 8 9.6 8 11.6 8 16 12 21 12 21s8-4.4 8-10c0-4-3-6.4-3-6.4' })],
        clock: [
          h('circle', { key: 'a', cx: 12, cy: 12, r: 8 }),
          h('path', { key: 'b', d: 'M12 8v4.5l3 1.8' }),
        ],
        external: [
          h('path', { key: 'a', d: 'M14 5h5v5M19 5l-8 8' }),
          h('path', { key: 'b', d: 'M18 14v4a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h4' }),
        ],
        repeat: [
          h('path', { key: 'a', d: 'M17 3l3.5 3.5L17 10' }),
          h('path', { key: 'b', d: 'M3.5 12V9.5A3 3 0 0 1 6.5 6.5H20' }),
          h('path', { key: 'c', d: 'M7 21l-3.5-3.5L7 14' }),
          h('path', { key: 'd', d: 'M20.5 12v2.5a3 3 0 0 1-3 3H4' }),
        ],
        repeatOne: [
          h('path', { key: 'a', d: 'M17 3l3.5 3.5L17 10' }),
          h('path', { key: 'b', d: 'M3.5 12V9.5A3 3 0 0 1 6.5 6.5H20' }),
          h('path', { key: 'c', d: 'M7 21l-3.5-3.5L7 14' }),
          h('path', { key: 'd', d: 'M20.5 12v2.5a3 3 0 0 1-3 3H4' }),
          h('path', { key: 'e', d: 'M12 10.4l1.6-1v5.2' }),
        ],
        shuffle: [
          h('path', { key: 'a', d: 'M16 4h5v5' }),
          h('path', { key: 'b', d: 'M4 20L21 3' }),
          h('path', { key: 'c', d: 'M21 16v5h-5' }),
          h('path', { key: 'd', d: 'M15 15l6 6' }),
          h('path', { key: 'e', d: 'M4 4l5.5 5.5' }),
        ],
      };
      return h(
        'svg',
        {
          width: size,
          height: size,
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.7,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': true,
          style: { display: 'block', flex: '0 0 auto' },
        },
        paths[name] || paths.note,
      );
    }

    function MusicIcon(props) {
      const options = props || {};
      return h(
        'span',
        {
          style: {
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: options.active ? 1 : 0.72,
          },
        },
        h(Glyph, { name: 'note', size: options.size || 20 }),
      );
    }

    /* ---------------------------------------------------------------- pieces */

    function PlaylistCard(props) {
      const item = props.item || {};
      return h(
        'div',
        { className: 'nm-card', onClick: props.onOpen, title: item.name },
        h(
          'div',
          { className: 'nm-card-cover' },
          item.picUrl ? h('img', { src: coverUrl(item.picUrl), alt: '', loading: 'lazy' }) : null,
          item.playCount
            ? h('span', { className: 'nm-card-count' }, h(Glyph, { name: 'play', size: 11 }), fmtCount(item.playCount))
            : null,
          h('span', { className: 'nm-card-play' }, h(Glyph, { name: 'play', size: 14 })),
        ),
        h('div', { className: 'nm-card-title' }, item.name || '未命名歌单'),
      );
    }

    function SongRow(props) {
      const song = props.song;
      const active = props.active;
      return h(
        'div',
        {
          className: 'nm-song' + (active ? ' is-active' : ''),
          onClick: props.onPlay,
          title: song.name + ' - ' + song.artists,
        },
        h(
          'span',
          { className: 'nm-song-no' },
          active && props.playing ? h(Glyph, { name: 'note', size: 13 }) : props.index + 1,
        ),
        h(
          'div',
          { className: 'nm-song-main' },
          h('div', { className: 'nm-song-name' }, song.name, song.fee ? h('i', { className: 'nm-vip' }, 'VIP') : null),
          h('div', { className: 'nm-song-sub' }, song.artists),
        ),
        h('span', { className: 'nm-song-album' }, song.album || ''),
        h('span', { className: 'nm-song-dur' }, fmtTime((song.duration || 0) / 1000)),
        h(
          'button',
          {
            className: 'nm-icon-btn',
            title: '用网易云客户端播放',
            onClick: (event) => {
              event.stopPropagation();
              Player.playInClient(song);
            },
          },
          h(Glyph, { name: 'external', size: 14 }),
        ),
      );
    }

    function Progress(props) {
      const [drag, setDrag] = useState(null);
      const max = props.max || 0;
      const value = drag !== null ? drag : props.value || 0;
      const commit = (raw) => {
        const next = Number(raw);
        setDrag(null);
        if (Number.isFinite(next)) props.onSeek(next);
      };
      return h(
        'div',
        { className: 'nm-progress' },
        h('span', { className: 'nm-time' }, fmtTime(value)),
        h('input', {
          className: 'nm-range',
          type: 'range',
          min: 0,
          max: max || 0,
          step: 1,
          value: Math.min(value, max || 0),
          disabled: max <= 0,
          onChange: (event) => setDrag(Number(event.target.value)),
          onPointerUp: (event) => commit(event.currentTarget.value),
          onMouseUp: (event) => commit(event.currentTarget.value),
          onTouchEnd: (event) => commit(event.currentTarget.value),
          onKeyUp: (event) => commit(event.currentTarget.value),
          onBlur: (event) => commit(event.currentTarget.value),
        }),
        h('span', { className: 'nm-time' }, fmtTime(max)),
      );
    }

    function PlayerBar() {
      const state = useStore(Player.store);
      const current = state.current;
      const lyricsOpen = useStore(UI.store).lyricsOpen;
      return h(
        React.Fragment,
        null,
        h(
          'div',
          { className: 'nm-player' },
          h(
            'div',
            { className: 'nm-now' },
            state.cover ? h('img', { className: 'nm-cover', src: coverUrl(state.cover), alt: '' }) : h('div', { className: 'nm-cover' }),
            h(
              'div',
              { className: 'nm-now-meta' },
              h('div', { className: 'nm-name' }, current ? current.name : '未在播放'),
              h('div', { className: 'nm-sub' }, current ? current.artists : '从歌单里点一首开始'),
            ),
          ),
          h(
            'div',
            { className: 'nm-controls' },
            h(
              'button',
              {
                className: 'nm-icon-btn',
                title: '播放模式：' + MODE_LABEL[state.mode],
                onClick: Player.cycleMode,
              },
              h(Glyph, { name: MODE_GLYPH[state.mode], size: 16 }),
            ),
            h(
              'button',
              { className: 'nm-icon-btn', title: '上一首', onClick: Player.prev, disabled: !state.queue.length },
              h(Glyph, { name: 'prev' }),
            ),
            h(
              'button',
              { className: 'nm-play', title: state.playing ? '暂停' : '播放', onClick: Player.toggle, disabled: !current },
              h(Glyph, { name: state.playing ? 'pause' : 'play', size: 16 }),
            ),
            h(
              'button',
              { className: 'nm-icon-btn', title: '下一首', onClick: Player.next, disabled: !state.queue.length },
              h(Glyph, { name: 'next' }),
            ),
          ),
          h(Progress, { value: state.time, max: state.duration, onSeek: Player.seek }),
          h(
            'div',
            { className: 'nm-tools' },
            state.bitrate
              ? h(
                  'span',
                  { className: 'nm-badge', title: '当前音频码率（直接来自网易云，未转码）' },
                  (state.format || '').toUpperCase() + ' ' + Math.round(state.bitrate / 1000) + 'k',
                )
              : null,
            h(
              'select',
              {
                className: 'nm-select',
                title: '音质',
                value: state.quality,
                onChange: (event) => Player.setQuality(event.target.value),
              },
              QUALITIES.map((item) => h('option', { key: item.id, value: item.id }, item.label)),
            ),
            h(
              'button',
              {
                className: 'nm-link',
                disabled: !current,
                onClick: () => UI.store.set({ lyricsOpen: !UI.store.get().lyricsOpen }),
              },
              lyricsOpen ? '收起歌词' : '歌词',
            ),
            h('input', {
              className: 'nm-range nm-volume',
              type: 'range',
              min: 0,
              max: 1,
              step: 0.01,
              value: state.volume,
              title: '音量',
              onChange: (event) => Player.setVolume(Number(event.target.value)),
            }),
          ),
        ),
        state.unavailable
          ? h(
              'div',
              { className: 'nm-unavailable' },
              h(
                'span',
                { className: 'nm-grow' },
                '《' + (state.unavailable.name || '') + '》没有可用的播放地址（会员或版权限制）。',
              ),
              Auth.store.get().cookie
                ? null
                : h('button', { className: 'nm-btn', onClick: openLogin }, '登录'),
              h('button', { className: 'nm-btn', onClick: () => Player.playInClient(state.unavailable) }, '用客户端播放'),
            )
          : null,
      );
    }

    function LyricsPanel() {
      const state = useStore(Player.store);
      const ui = useStore(UI.store);
      const boxRef = useRef(null);
      const active = useMemo(() => {
        let found = -1;
        for (let i = 0; i < state.lyrics.length; i += 1) {
          if (state.lyrics[i].at <= state.time + 0.15) found = i;
          else break;
        }
        return found;
      }, [state.lyrics, state.time]);

      useEffect(() => {
        const box = boxRef.current;
        if (!box || active < 0) return;
        const line = box.querySelector('[data-active="true"]');
        if (line && typeof line.scrollIntoView === 'function') {
          line.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
      }, [active]);

      if (!ui.lyricsOpen || !state.current) return null;
      return h(
        'div',
        { className: 'nm-lyrics-panel', ref: boxRef },
        state.lyrics.length
          ? state.lyrics.map((line, i) =>
              h(
                'div',
                {
                  key: String(i) + '-' + line.at,
                  'data-active': i === active ? 'true' : 'false',
                  className: 'nm-lyric' + (i === active ? ' is-active' : ''),
                },
                line.text,
              ),
            )
          : h('div', { className: 'nm-empty' }, '这首歌没有歌词'),
      );
    }

    /* ---------------------------------------------------------------- pages */

    const cache = new Map();
    let autoImportTried = false;

    async function cached(key, loader, ttlMs) {
      const hit = cache.get(key);
      const now = Date.now();
      if (hit && now - hit.at < (ttlMs || 5 * 60 * 1000)) return hit.value;
      const value = await loader();
      cache.set(key, { at: now, value });
      return value;
    }

    function MusicPage() {
      const auth = useStore(Auth.store);
      const player = useStore(Player.store);
      const ui = useStore(UI.store);

      const [route, setRoute] = useState({ name: 'discover' });
      const [query, setQuery] = useState('');
      const [discover, setDiscover] = useState(null);
      const [discoverPage, setDiscoverPage] = useState(0);
      const [refreshing, setRefreshing] = useState(false);
      const [playlists, setPlaylists] = useState([]);
      const [tracks, setTracks] = useState([]);
      const [loading, setLoading] = useState(false);
      const [error, setError] = useState('');

      // First visit without a stored session: reuse the desktop client's own login, so the panel is
      // usable without scanning anything. Failure is silent — the login button stays available.
      useEffect(() => {
        if (autoImportTried || Auth.store.get().cookie) return;
        autoImportTried = true;
        (async () => {
          try {
            const response = await fetch(BASE + '/client-session');
            const json = await response.json();
            if (!json || !json.ok) return;
            const status = await api('/login/status', { cookie: json.cookie });
            const profile = status && status.data && status.data.profile;
            if (!profile) return;
            Auth.setCookie(json.cookie);
            UI.toast('已沿用客户端账号：' + (profile.nickname || ''));
          } catch {
            /* keep quiet; the explicit login dialog still works */
          }
        })();
      }, []);

      const loadDiscover = useCallback(async (force) => {
        if (force) {
          cache.delete('personalized');
          cache.delete('newsong');
        }
        setRefreshing(true);
        try {
          const [rec, news] = await Promise.all([
            cached('personalized', () => api('/personalized', { limit: 30 })),
            cached('newsong', () => api('/personalized/newsong', { limit: 12 })),
          ]);
          setDiscover({
            playlists: (rec && rec.result) || [],
            songs: ((news && news.result) || []).map((item) => normalize(item.song || item)).filter(Boolean),
          });
        } catch (err) {
          setError('推荐加载失败：' + msg(err));
        } finally {
          setRefreshing(false);
        }
      }, []);

      const refreshDiscover = useCallback(async () => {
        setDiscoverPage((page) => page + 1);
        await loadDiscover(true);
        UI.toast('推荐已更新');
      }, [loadDiscover]);

      useEffect(() => {
        loadDiscover(false);
      }, [loadDiscover]);

      useEffect(() => {
        let alive = true;
        async function load() {
          if (!auth.cookie) {
            setPlaylists([]);
            return;
          }
          try {
            const list = await cached(
              'mine:' + (auth.profile && auth.profile.userId ? auth.profile.userId : 'anon'),
              async () => {
                const account = await api('/user/account', { cookie: auth.cookie });
                const uid = account && account.profile && account.profile.userId;
                if (!uid) return [];
                const mine = await api('/user/playlist', { uid, limit: 100, cookie: auth.cookie });
                return ((mine && mine.playlist) || []).map((item) => ({
                  id: item.id,
                  name: item.name,
                  picUrl: item.coverImgUrl,
                  playCount: item.playCount,
                  trackCount: item.trackCount,
                }));
              },
              60 * 1000,
            );
            if (alive) setPlaylists(list);
          } catch {
            if (alive) setPlaylists([]);
          }
        }
        load();
        return () => {
          alive = false;
        };
      }, [auth.cookie, auth.profile && auth.profile.userId]);

      const openPlaylist = useCallback(async (item) => {
        setRoute({ name: 'playlist', item });
        setLoading(true);
        setError('');
        setTracks([]);
        try {
          const list = await cached('pl:' + item.id, async () => {
            try {
              const json = await api('/playlist/track/all', {
                id: item.id,
                limit: 1000,
                cookie: Auth.store.get().cookie,
              });
              return ((json && json.songs) || []).map(normalize).filter(Boolean);
            } catch {
              const detail = await api('/playlist/detail', { id: item.id });
              const fallback = (detail && detail.playlist && detail.playlist.tracks) || [];
              return fallback.map(normalize).filter(Boolean);
            }
          });
          setTracks(list);
        } catch (err) {
          setError('歌单加载失败：' + msg(err));
        } finally {
          setLoading(false);
        }
      }, []);

      const openDaily = useCallback(async () => {
        setRoute({ name: 'daily' });
        setLoading(true);
        setError('');
        setTracks([]);
        try {
          const json = await api('/recommend/songs', { cookie: Auth.store.get().cookie });
          setTracks(((json && json.data && json.data.dailySongs) || []).map(normalize).filter(Boolean));
        } catch (err) {
          setError('每日推荐加载失败：' + msg(err));
        } finally {
          setLoading(false);
        }
      }, []);

      const doSearch = useCallback(async () => {
        const keyword = query.trim();
        if (!keyword) return;
        setRoute({ name: 'search', keyword });
        setLoading(true);
        setError('');
        setTracks([]);
        try {
          const json = await api('/search', {
            keywords: keyword,
            type: 1,
            limit: 50,
            cookie: Auth.store.get().cookie,
          });
          setTracks(((json && json.result && json.result.songs) || []).map(normalize).filter(Boolean));
        } catch (err) {
          setError('搜索失败：' + msg(err));
        } finally {
          setLoading(false);
        }
      }, [query]);

      const renderSongs = (list) =>
        h(
          'div',
          { className: 'nm-songs' },
          list.map((song, i) =>
            h(SongRow, {
              key: String(song.id) + '-' + i,
              song,
              index: i,
              active: Boolean(player.current && player.current.id === song.id),
              playing: player.playing,
              onPlay: () => Player.playList(list, i),
            }),
          ),
        );

      // The feed comes back longer than one screen, so "换一批" can rotate through real entries
      // instead of pretending the recommendation changed.
      const allPlaylists = (discover && discover.playlists) || [];
      const start = allPlaylists.length ? (discoverPage * 12) % allPlaylists.length : 0;
      const visiblePlaylists = allPlaylists.length
        ? allPlaylists.slice(start).concat(allPlaylists.slice(0, start)).slice(0, 12)
        : [];

      const loginCta = !auth.cookie
        ? h(
            'div',
            { className: 'nm-cta' },
            h(Glyph, { name: 'note', size: 16 }),
            h('span', { className: 'nm-grow' }, '登录后可听会员曲库、同步「我的歌单」和每日推荐。'),
            h('button', { className: 'nm-btn nm-btn-accent', onClick: openLogin }, '登录'),
          )
        : null;

      const content = (() => {
        if (loading) return h('div', { className: 'nm-empty' }, '加载中…');
        if (error) return h('div', { className: 'nm-empty' }, h('b', null, '出错了'), error);

        if (route.name === 'playlist') {
          const item = route.item || {};
          return h(
            React.Fragment,
            null,
            h(
              'div',
              { className: 'nm-pl-head' },
              item.picUrl
                ? h('img', { className: 'nm-pl-cover', src: coverUrl(item.picUrl), alt: '' })
                : h('div', { className: 'nm-pl-cover' }),
              h(
                'div',
                null,
                h('div', { className: 'nm-pl-kicker' }, '歌单'),
                h('div', { className: 'nm-pl-name' }, item.name || '未命名歌单'),
                h('div', { className: 'nm-pl-meta' }, (tracks.length || item.trackCount || 0) + ' 首'),
                h(
                  'button',
                  {
                    className: 'nm-btn nm-btn-accent',
                    disabled: !tracks.length,
                    onClick: () => tracks.length && Player.playList(tracks, 0),
                  },
                  '播放全部',
                ),
              ),
            ),
            tracks.length ? renderSongs(tracks) : h('div', { className: 'nm-empty' }, '这个歌单暂时取不到歌曲'),
          );
        }

        if (route.name === 'daily') {
          return h(
            React.Fragment,
            null,
            h('div', { className: 'nm-h' }, h('b', null, '每日推荐'), h('span', null, '每天 6:00 更新')),
            tracks.length ? renderSongs(tracks) : h('div', { className: 'nm-empty' }, '登录后才能看每日推荐'),
          );
        }

        if (route.name === 'search') {
          return h(
            React.Fragment,
            null,
            h('div', { className: 'nm-h' }, h('b', null, '搜索「' + route.keyword + '」'), h('span', null, tracks.length + ' 首')),
            tracks.length ? renderSongs(tracks) : h('div', { className: 'nm-empty' }, '没有搜到结果'),
          );
        }

        if (route.name === 'mine') {
          if (!auth.cookie) {
            return h(
              'div',
              { className: 'nm-empty' },
              h('b', null, '登录后同步你的歌单'),
              h('button', { className: 'nm-btn nm-btn-accent', style: { marginTop: 12 }, onClick: openLogin }, '登录'),
            );
          }
          return h(
            React.Fragment,
            null,
            h('div', { className: 'nm-h' }, h('b', null, '我的歌单'), h('span', null, playlists.length + ' 个')),
            playlists.length
              ? h(
                  'div',
                  { className: 'nm-grid' },
                  playlists.map((item) =>
                    h(PlaylistCard, { key: String(item.id), item, onOpen: () => openPlaylist(item) }),
                  ),
                )
              : h('div', { className: 'nm-empty' }, '还没有读到歌单'),
          );
        }

        return h(
          React.Fragment,
          null,
          loginCta,
          h(
            'div',
            { className: 'nm-h' },
            h('b', null, '推荐歌单'),
            h('span', null, '按你的口味挑的'),
            h(
              'button',
              {
                className: 'nm-link nm-h-action',
                disabled: refreshing,
                title: '刷新推荐',
                onClick: refreshDiscover,
              },
              refreshing ? '更新中…' : '换一批',
            ),
          ),
          discover && discover.playlists.length
            ? h(
                'div',
                { className: 'nm-grid' },
                visiblePlaylists.map((item) => {
                  const normalized = { ...item, picUrl: item.picUrl || item.coverImgUrl };
                  return h(PlaylistCard, {
                    key: String(item.id),
                    item: normalized,
                    onOpen: () => openPlaylist(normalized),
                  });
                }),
              )
            : h('div', { className: 'nm-empty' }, '推荐加载中…'),
          h('div', { className: 'nm-h' }, h('b', null, '新歌速递')),
          discover && discover.songs.length
            ? renderSongs(discover.songs)
            : h('div', { className: 'nm-empty' }, '新歌加载中…'),
        );
      })();

      return h(
        'div',
        { className: 'nm-page' },
        h('style', null, css),
        h(
          'div',
          { className: 'nm-frame' },
          h(
            'aside',
            { className: 'nm-rail' },
            h('div', { className: 'nm-brand' }, h(Glyph, { name: 'note', size: 18 }), '音乐'),
            h(
              'button',
              {
                className: 'nm-nav' + (route.name !== 'mine' && route.name !== 'daily' ? ' is-active' : ''),
                onClick: () => setRoute({ name: 'discover' }),
              },
              h(Glyph, { name: 'fire', size: 16 }),
              '发现音乐',
            ),
            auth.cookie
              ? h(
                  'button',
                  { className: 'nm-nav' + (route.name === 'daily' ? ' is-active' : ''), onClick: openDaily },
                  h(Glyph, { name: 'clock', size: 16 }),
                  '每日推荐',
                )
              : null,
            h(
              'button',
              { className: 'nm-nav' + (route.name === 'mine' ? ' is-active' : ''), onClick: () => setRoute({ name: 'mine' }) },
              h(Glyph, { name: 'heart', size: 16 }),
              '我的歌单',
            ),
            h('div', { className: 'nm-rail-title' }, '我的歌单'),
            playlists.length
              ? playlists.map((item) =>
                  h(
                    'button',
                    {
                      key: String(item.id),
                      className:
                        'nm-rail-item' +
                        (route.name === 'playlist' && route.item && route.item.id === item.id ? ' is-active' : ''),
                      onClick: () => openPlaylist(item),
                      title: item.name,
                    },
                    item.name,
                  ),
                )
              : h('div', { className: 'nm-rail-item' }, auth.cookie ? '还没有歌单' : '登录后显示'),
          ),
          h(
            'div',
            { className: 'nm-main' },
            h(
              'div',
              { className: 'nm-top' },
              h(
                'div',
                { className: 'nm-search' },
                h('input', {
                  className: 'nm-input',
                  value: query,
                  placeholder: '搜索歌曲 / 歌手 / 专辑',
                  onChange: (event) => setQuery(event.target.value),
                  onKeyDown: (event) => {
                    if (event.key === 'Enter') doSearch();
                  },
                }),
                h('button', { className: 'nm-btn', onClick: doSearch }, '搜索'),
              ),
              h(
                'div',
                { className: 'nm-account' },
                auth.cookie
                  ? h(
                      React.Fragment,
                      null,
                      auth.profile && auth.profile.avatar
                        ? h('img', { className: 'nm-avatar', src: coverUrl(auth.profile.avatar), alt: '' })
                        : null,
                      h('span', { className: 'nm-uname' }, (auth.profile && auth.profile.nickname) || '已登录'),
                      h('button', { className: 'nm-link', onClick: Auth.logout }, '退出'),
                    )
                  : h('button', { className: 'nm-btn nm-btn-accent', onClick: openLogin }, '登录'),
              ),
            ),
            h('div', { className: 'nm-scroll' }, content),
          ),
        ),
        ui.lyricsOpen && player.current ? h(LyricsPanel, null) : null,
        h(PlayerBar, null),
        h(LoginModal, null),
        ui.toast ? h('div', { className: 'nm-toast' }, ui.toast) : null,
      );
    }

    /* ------------------------------------------------------------- docked bar */

    /**
     * Docked above the composer through `conversation.input.dock`: a normal flow element, not a
     * fixed overlay, so it can never cover or reflow the rest of the app.
     */
    function DockBar(props) {
      const state = useStore(Player.store);
      const ui = useStore(UI.store);
      if (!state.current || ui.miniHidden) return null;
      const pct = state.duration > 0 ? Math.min(100, (state.time / state.duration) * 100) : 0;
      return h(
        React.Fragment,
        null,
        // The page owns its own <style>, and it is unmounted while the conversation is shown, so the
        // dock must carry the sheet itself — otherwise it renders as unstyled DOM inside the composer.
        h('style', null, css),
        h(
          'div',
          { className: 'nm-dock', onClick: props.onOpen, title: '打开音乐面板' },
          state.cover
            ? h('img', { className: 'nm-dock-cover', src: coverUrl(state.cover), alt: '' })
            : h('div', { className: 'nm-dock-cover' }),
          h(
            'div',
            { className: 'nm-dock-meta' },
            h('div', { className: 'nm-dock-name' }, state.current.name),
            h(
              'div',
              { className: 'nm-dock-sub' },
              (state.current.artists || '') + (state.unavailable ? ' · 需登录' : ''),
            ),
          ),
          h('div', { className: 'nm-dock-track' }, h('i', { style: { width: pct + '%' } })),
          h(
            'button',
            {
              className: 'nm-icon-btn',
              title: '播放模式：' + MODE_LABEL[state.mode],
              onClick: (event) => {
                event.stopPropagation();
                Player.cycleMode();
              },
            },
            h(Glyph, { name: MODE_GLYPH[state.mode], size: 15 }),
          ),
          h(
            'button',
            {
              className: 'nm-icon-btn',
              title: state.playing ? '暂停' : '播放',
              onClick: (event) => {
                event.stopPropagation();
                Player.toggle();
              },
            },
            h(Glyph, { name: state.playing ? 'pause' : 'play', size: 15 }),
          ),
          h(
            'button',
            {
              className: 'nm-icon-btn',
              title: '下一首',
              onClick: (event) => {
                event.stopPropagation();
                Player.next();
              },
            },
            h(Glyph, { name: 'next', size: 15 }),
          ),
          h(
            'button',
            {
              className: 'nm-icon-btn',
              title: '收起',
              onClick: (event) => {
                event.stopPropagation();
                UI.store.set({ miniHidden: true });
              },
            },
            h(Glyph, { name: 'close', size: 13 }),
          ),
        ),
      );
    }

    function LoginModal() {
      const ui = useStore(UI.store);
      const [tab, setTab] = useState('client');
      const [phone, setPhone] = useState('');
      const [captcha, setCaptcha] = useState('');
      const [cookieText, setCookieText] = useState('');
      const [busy, setBusy] = useState(false);
      const [note, setNote] = useState('');
      const [sent, setSent] = useState(false);

      useEffect(() => {
        function onKey(event) {
          if (event.key === 'Escape') closeLogin();
        }
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
      }, []);

      if (!ui.loginOpen) return null;

      async function sendCode() {
        if (!/^\d{11}$/.test(phone.trim())) {
          setNote('请输入 11 位手机号');
          return;
        }
        setBusy(true);
        setNote('');
        try {
          await api('/captcha/sent', { phone: phone.trim() });
          setSent(true);
          setNote('验证码已发送，请查收短信');
        } catch (error) {
          setNote('发送失败：' + msg(error));
        } finally {
          setBusy(false);
        }
      }

      async function submitPhone() {
        setBusy(true);
        setNote('');
        try {
          const json = await api('/login/cellphone', { phone: phone.trim(), captcha: captcha.trim() });
          if (!json || !json.cookie) throw new Error((json && json.message) || '登录失败');
          Auth.setCookie(json.cookie);
          UI.toast('登录成功');
          closeLogin();
        } catch (error) {
          setNote('登录失败：' + msg(error));
        } finally {
          setBusy(false);
        }
      }

      async function submitCookie() {
        const text = cookieText.trim();
        if (!text) {
          setNote('请粘贴 cookie');
          return;
        }
        setBusy(true);
        setNote('');
        try {
          const json = await api('/login/status', { cookie: text });
          const profile = json && json.data && json.data.profile;
          if (!profile) throw new Error('cookie 无效或已过期');
          Auth.setCookie(text);
          UI.toast('登录成功：' + (profile.nickname || ''));
          closeLogin();
        } catch (error) {
          setNote('登录失败：' + msg(error));
        } finally {
          setBusy(false);
        }
      }

      async function importClient() {
        setBusy(true);
        setNote('');
        try {
          const response = await fetch(BASE + '/client-session');
          const json = await response.json();
          if (!json || !json.ok) throw new Error((json && json.error) || '读取失败');
          const status = await api('/login/status', { cookie: json.cookie });
          const profile = status && status.data && status.data.profile;
          if (!profile) throw new Error('客户端登录态已失效，请在客户端里重新登录');
          Auth.setCookie(json.cookie);
          UI.toast('已使用客户端账号登录：' + (profile.nickname || ''));
          closeLogin();
        } catch (error) {
          setNote('失败：' + msg(error));
        } finally {
          setBusy(false);
        }
      }

      const tabButton = (id, label) =>
        h(
          'button',
          { className: 'nm-tab' + (tab === id ? ' is-active' : ''), onClick: () => setTab(id) },
          label,
        );

      const clientBody = h(
        React.Fragment,
        null,
        h('div', { className: 'nm-hintline' }, '直接读取这台电脑上网易云客户端已登录的账号，不需要扫码。'),
        h('div', { className: 'nm-note' }, note),
        h(
          'button',
          { className: 'nm-btn nm-btn-accent', disabled: busy, onClick: importClient },
          busy ? '读取中…' : '使用客户端账号登录',
        ),
        h('div', { className: 'nm-hintline' }, '登录态只保存在本机浏览器存储里，和网易云自己的登录等价。'),
      );

      const phoneBody = h(
        React.Fragment,
        null,
        h('div', { className: 'nm-field' }, h('input', {
          placeholder: '手机号（11 位）',
          value: phone,
          inputMode: 'numeric',
          onChange: (event) => setPhone(event.target.value),
        })),
        h(
          'div',
          { className: 'nm-field' },
          h('input', {
            placeholder: '短信验证码',
            value: captcha,
            inputMode: 'numeric',
            onChange: (event) => setCaptcha(event.target.value),
          }),
          h('button', { className: 'nm-btn', disabled: busy, onClick: sendCode }, sent ? '重新发送' : '发送验证码'),
        ),
        h('div', { className: 'nm-note' }, note),
        h('button', { className: 'nm-btn nm-btn-accent', disabled: busy, onClick: submitPhone }, busy ? '登录中…' : '登录'),
      );

      const cookieBody = h(
        React.Fragment,
        null,
        h('textarea', {
          className: 'nm-area',
          placeholder: '粘贴完整 Cookie（含 MUSIC_U=...）',
          value: cookieText,
          onChange: (event) => setCookieText(event.target.value),
        }),
        h('div', { className: 'nm-hintline' }, '从浏览器登录 music.163.com 后，DevTools → Network → 复制请求头里的 Cookie 整串。'),
        h('div', { className: 'nm-note' }, note),
        h('button', { className: 'nm-btn nm-btn-accent', disabled: busy, onClick: submitCookie }, busy ? '校验中…' : '用 Cookie 登录'),
      );

      return h(
        'div',
        {
          className: 'nm-modal',
          onClick: (event) => {
            if (event.target === event.currentTarget) closeLogin();
          },
        },
        h(
          'div',
          { className: 'nm-modal-card' },
          h('div', { className: 'nm-modal-head' }, h(Glyph, { name: 'note', size: 16 }), '登录网易云音乐'),
          h('div', { className: 'nm-tabs' }, tabButton('client', '客户端'), tabButton('phone', '手机号'), tabButton('cookie', 'Cookie')),
          tab === 'client' ? clientBody : tab === 'phone' ? phoneBody : cookieBody,
          h(
            'div',
            { className: 'nm-modal-actions' },
            h('button', { className: 'nm-btn', onClick: closeLogin }, '关闭'),
          ),
        ),
      );
    }

    class Boundary extends React.Component {
      constructor(props) {
        super(props);
        this.state = { error: null };
      }
      static getDerivedStateFromError(error) {
        return { error };
      }
      render() {
        if (this.state.error) {
          return h('div', { className: 'nm-crash' }, '音乐面板出错了：' + msg(this.state.error));
        }
        return this.props.children;
      }
    }

    /* ---------------------------------------------------------------- plugin */

    return {
      inject: ['slots'],
      apply(ctx) {
        const failures = [];
        const openPanel = () => {
          try {
            ctx.layout.selectPanel(PANEL_ID);
          } catch {
            /* the layout service may be unavailable in some compositions */
          }
        };

        function step(label, register) {
          try {
            return register();
          } catch (error) {
            failures.push(label + ': ' + msg(error));
            return undefined;
          }
        }

        function registerWhenDeclared(slot, options, component, label) {
          return step(label, () =>
            ctx.effect(
              () => ctx.slots.inject(slot, () => ctx.slots.register(options, component)),
              'netease-music: ' + label,
            ),
          );
        }

        const PageBoundary = (props) => h(Boundary, null, h(MusicPage, props));
        const DockBoundary = () => h(Boundary, null, h(DockBar, { onOpen: openPanel }));

        registerWhenDeclared(
          'sidebar.panellist',
          { name: 'sidebar.panellist', id: PANEL_ID, order: 40, label: '音乐' },
          MusicIcon,
          'sidebar icon',
        );
        registerWhenDeclared('main', { name: 'main', key: PANEL_ID }, PageBoundary, 'main panel');
        registerWhenDeclared(
          'conversation.input.dock',
          { name: 'conversation.input.dock', id: 'netease-dock', order: 40, label: '正在播放' },
          DockBoundary,
          'player dock',
        );

        if (typeof window !== 'undefined' && window.addEventListener) {
          window.addEventListener('error', (event) => {
            reportClient('window error: ' + (event && event.message ? event.message : 'unknown'));
          });
          window.addEventListener('unhandledrejection', (event) => {
            const reason = event && event.reason;
            reportClient('unhandled rejection: ' + (reason && reason.message ? reason.message : String(reason)));
          });
        }

        Auth.refresh();

        if (failures.length) {
          // eslint-disable-next-line no-console
          console.warn('[netease-music] surfaces that failed to register:', failures.join('; '));
        }
      },
    };
  },
});
