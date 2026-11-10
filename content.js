/* BreakFree content script. Turns the active preset into CSS and runs the few
   behaviors that need a script (redirects, filters, autoplay and so on). */
(() => {
  const root = document.documentElement;
  const ITEM_SELECTOR = BF_FEATURES.ITEMS;

  let state = BF.defaults();
  let vals = {};
  let live = false;
  let tickTimer = null;

  const on = k => live && BF.applies(vals, k);
  const val = k => (live && BF.applies(vals, k) ? vals[k] : '');

  /* ---------- stylesheet ---------- */

  // A tab can still hold the script from an older install. Remove its stylesheet; the old script stops itself.
  document.querySelectorAll('style#breakfree-css').forEach(n => n.remove());
  const style = document.createElement('style');
  style.id = 'breakfree-css';

  function mountStyle() {
    if (!style.isConnected) (document.head || root).appendChild(style);
  }

  /* The last stylesheet is cached in the page's localStorage so it can be applied
     before storage finishes loading, which stops hidden things from flashing. */
  const CACHE_KEY = 'breakfree-css';

  const REVEAL_CSS = `
    .bf-reveal { display: flex; align-items: center; justify-content: center; gap: 8px; width: 100%; margin: 12px 0 4px;
      padding: 0 16px; height: 40px; border: 0; border-radius: 20px; cursor: pointer;
      background: var(--yt-spec-badge-chip-background, rgba(255,255,255,.1)); color: var(--yt-spec-text-primary, #f1f1f1);
      font: 500 14px/1 Roboto, Arial, sans-serif; }
    .bf-reveal:hover { background: var(--yt-spec-mono-tonal-hover, rgba(255,255,255,.2)); }
    .bf-reveal:focus-visible { outline: 2px solid #5ee8a8; outline-offset: 2px; }
    .bf-reveal svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
    .bf-history { display: inline-flex; align-items: center; justify-content: center; width: 40px; height: 40px; border-radius: 50%;
      color: var(--yt-spec-text-primary, #f1f1f1); text-decoration: none; }
    .bf-history:hover { background: var(--yt-spec-mono-tonal-hover, rgba(255,255,255,.1)); }
    .bf-history svg { width: 24px; height: 24px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
    .bf-reveal small { font-weight: 400; color: var(--yt-spec-text-secondary, #aaa); }
  `;

  function applyCss() {
    mountStyle();
    const css = '[data-bf-hide] { display: none !important; }\n' + REVEAL_CSS + (live ? BF.buildCss(vals) : '');
    style.textContent = css;
    try { localStorage.setItem(CACHE_KEY, css); } catch (e) { /* storage blocked */ }
  }

  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) { style.textContent = cached; mountStyle(); }
  } catch (e) { /* storage blocked */ }

  /* ---------- helpers ---------- */

  const norm = s => (s || '').trim().replace(/^@/, '').toLowerCase();
  const videoId = () => new URLSearchParams(location.search).get('v') || '';

  function titleOf(el) {
    const h3 = el.querySelector('h3[title]');
    if (h3) return h3.getAttribute('title');
    const t = el.querySelector('#video-title, .ytLockupMetadataViewModelTitle, .yt-lockup-metadata-view-model__title, h3');
    return t ? (t.getAttribute('title') || t.textContent || '') : '';
  }

  function channelNameOf(el) {
    const c = el.querySelector('ytd-channel-name #text, ytd-channel-name, .ytContentMetadataViewModelMetadataRow:first-child:not(:last-child), .yt-content-metadata-view-model__metadata-row:first-child:not(:last-child)');
    return c ? c.textContent : '';
  }

  function channelHandleOf(el) {
    const a = el.querySelector('a[href^="/@"]');
    if (!a) return '';
    return decodeURIComponent((a.getAttribute('href') || '').slice(2).split(/[/?#]/)[0]);
  }

  function watchedPercent(el) {
    const bar = el.querySelector(
      'ytd-thumbnail-overlay-resume-playback-renderer #progress, [class*="WatchedProgressBarSegment"], [class*="watched-progress-bar-segment"]'
    );
    if (!bar) return 0;
    const w = parseFloat(bar.style.width);
    return Number.isNaN(w) ? 0 : w;
  }

  function pageOf(el) {
    if (el.closest('ytd-search')) return 'sr';
    if (el.closest('ytd-browse[page-subtype="home"]')) return 'home';
    if (el.closest('ytd-browse[page-subtype="subscriptions"]')) return 'sb';
    if (el.closest('ytd-watch-flexy')) return 'vp';
    return '';
  }

  function liveState(el) {
    const badge = [...el.querySelectorAll('badge-shape, ytd-thumbnail-overlay-time-status-renderer, .badge')]
      .map(b => b.textContent).join(' ');
    const meta = [...el.querySelectorAll('#metadata-line, #metadata, .ytContentMetadataViewModelHost, .yt-content-metadata-view-model, #buttons')]
      .map(m => m.textContent).join(' ');
    const isLive = !!el.querySelector('[overlay-style="LIVE"], .badge-style-type-live-now-alpha, badge-shape[class*="ThumbnailLive"]') ||
      /\b(LIVE|PREMIERE|PREMIERING)\b/.test(badge) || /\b(watching|Premiering now)\b/i.test(meta);
    const isUpcoming = !!el.querySelector('[overlay-style="UPCOMING"]') ||
      /\bUPCOMING\b/.test(badge) || /\b(Scheduled for|Premieres|Notify me|waiting)\b/i.test(meta);
    return { isLive, isUpcoming };
  }

  /* ---------- scan video tiles ---------- */

  function scanItems() {
    const keywords = live ? state.keywords.map(k => k.toLowerCase()) : [];
    const channels = live ? state.channels.map(norm) : [];
    const threshold = state.watchedThreshold;
    const watched = { home: on('home.watched'), sr: on('sr.watched'), sb: on('sb.watched'), vp: on('vp.watched') };
    const subsLive = on('sb.live');
    const subsUpcoming = on('sb.upcoming');

    document.querySelectorAll(ITEM_SELECTOR).forEach(el => {
      // Lockups nested inside another tile are handled by the outer tile.
      if (el.parentElement && el.parentElement.closest(ITEM_SELECTOR)) return;
      let hide = false;

      if (keywords.length) {
        const title = titleOf(el).toLowerCase();
        hide = keywords.some(k => title.includes(k));
      }
      if (!hide && channels.length) {
        const name = norm(channelNameOf(el));
        const handle = norm(channelHandleOf(el));
        hide = channels.some(c => c === name || c === handle);
      }
      const page = pageOf(el);
      if (!hide && watched[page]) hide = watchedPercent(el) >= threshold;
      if (!hide && page === 'sb' && (subsLive || subsUpcoming)) {
        const s = liveState(el);
        hide = (subsLive && s.isLive && !s.isUpcoming) || (subsUpcoming && s.isUpcoming);
      }

      if (hide !== el.hasAttribute('data-bf-hide')) el.toggleAttribute('data-bf-hide', hide);
    });
  }

  /* ---------- thumbnails ---------- */

  const THUMB_RE = /\/(vi|vi_webp)\/([\w-]{11})\/[^/?#]+(\?[^#]*)?$/;

  function replaceThumbnails() {
    const frame = val('vi.replace');
    document.querySelectorAll('img[src*="i.ytimg.com/vi"], img[data-bf-src]').forEach(img => {
      if (!frame) {
        if (img.dataset.bfSrc) { img.src = img.dataset.bfSrc; delete img.dataset.bfSrc; }
        return;
      }
      const src = img.getAttribute('src') || '';
      const want = `/hq${frame}.jpg`;
      if (src.endsWith(want)) return;
      const m = src.match(THUMB_RE);
      if (!m || !img.closest('ytd-thumbnail, yt-thumbnail-view-model, ytd-playlist-thumbnail')) return;
      img.dataset.bfSrc = src;
      img.src = `https://i.ytimg.com/vi/${m[2]}${want}`;
    });
  }

  /* ---------- channel home sections ---------- */

  function tagChannelSections() {
    const page = document.querySelector('ytd-browse[page-subtype="channels"]:not([hidden])');
    if (!page) return;
    page.querySelectorAll('ytd-item-section-renderer').forEach(sec => {
      const link = sec.querySelector('#title-container a[href], #title a[href]');
      const href = link ? link.getAttribute('href') || '' : '';
      const title = (sec.querySelector('#title-container #title, #title') || {}).textContent || '';
      let type = '';
      if (/for you/i.test(title)) type = 'foryou';
      else if (/member/i.test(title) || href.includes('/membership')) type = 'members';
      else if (href.includes('/releases') || /^releases$/i.test(title.trim())) type = 'releases';
      else if (href.includes('/streams') || /^(live|past live streams)/i.test(title.trim())) type = 'live';
      else if (/sort=p\b/.test(href) || /^popular/i.test(title.trim())) type = 'popular';
      else if (href.includes('/videos') || /^videos$/i.test(title.trim())) type = 'videos';
      else if (href.includes('list=') || sec.querySelector('ytd-playlist-renderer, ytd-grid-playlist-renderer')) type = 'playlist';
      if (sec.getAttribute('data-bf-chsec') !== type) {
        if (type) sec.setAttribute('data-bf-chsec', type);
        else sec.removeAttribute('data-bf-chsec');
      }
    });
  }

  /* ---------- redirects ---------- */

  let channelBaseSeen = '';

  function redirects() {
    const path = location.pathname;

    if (on('sh.redirect')) {
      const m = path.match(/^\/shorts\/([\w-]{5,})/);
      if (m) { location.replace('/watch?v=' + m[1]); return true; }
    }

    const home = val('home.redirect');
    if (home && path === '/') { location.replace(home); return true; }

    const tab = val('ch.start');
    const ch = path.match(/^\/(@[^/]+|channel\/[^/]+|c\/[^/]+|user\/[^/]+)(\/.*)?$/);
    if (ch) {
      const base = '/' + ch[1];
      const rest = (ch[2] || '').replace(/\/$/, '');
      // Only redirect when arriving at a channel, so the Home tab still works afterwards.
      if (tab && !rest && channelBaseSeen !== base) {
        channelBaseSeen = base;
        location.replace(`${base}/${tab}`);
        return true;
      }
      channelBaseSeen = base;
    } else {
      channelBaseSeen = '';
    }

    const sort = val('sr.sort');
    if (sort && path === '/results') {
      const q = new URLSearchParams(location.search);
      if (q.get('search_query') && !q.has('sp')) {
        location.replace(`/results?search_query=${encodeURIComponent(q.get('search_query'))}&sp=${sort}`);
        return true;
      }
    }
    return false;
  }

  /* ---------- watch page behaviors ---------- */

  const doneFor = {};
  const onceForVideo = (name, fn) => {
    const id = videoId();
    if (!id || doneFor[name] === id) return;
    if (fn() !== false) doneFor[name] = id;
  };

  /* Automatically show chapters.
     Opens them through YouTube's own control, never by editing the panel directly,
     so YouTube knows the panel is open and clicking chapters later reuses it instead
     of opening a second one. Each video gets a few attempts (a click made while the
     page is still switching videos can be ignored); once the panel is seen open,
     we stop, so closing it sticks until the next video. */
  const CHAPTER_PANEL = 'ytd-engagement-panel-section-list-renderer[visibility="ENGAGEMENT_PANEL_VISIBILITY_EXPANDED"]:is([target-id*="macro-markers"], [target-id*="timeline"])';
  let chap = { id: '', tries: 0, at: 0, done: false };

  function openChapters() {
    const id = videoId();
    if (chap.id !== id) chap = { id, tries: 0, at: 0, done: false };
    if (chap.done) return;
    if (document.querySelector(CHAPTER_PANEL)) { chap.done = true; return; }
    if (chap.tries >= 4) { chap.done = true; return; }
    if (Date.now() - chap.at < 1500) return; // give the last click time to work
    // Wait until the page has switched to this video.
    const flexy = document.querySelector('ytd-watch-flexy');
    if (!flexy || flexy.getAttribute('video-id') !== id) return;

    const container = document.querySelector('ytd-player .ytp-chapter-container');
    const title = container && container.querySelector('.ytp-chapter-title');
    let target = null;
    if (title && container.style.display !== 'none' && title.textContent.trim()) target = title;
    else target = document.querySelector('ytd-watch-metadata ytd-horizontal-card-list-renderer:has(ytd-macro-markers-list-item-renderer) :is(#button-container, ytd-button-renderer) button');
    if (!target) return; // no chapters yet, or this video has none

    target.click();
    chap.tries++;
    chap.at = Date.now();
    setTimeout(scheduleTick, 1600); // check that it opened
  }

  /* "Show recommendations for this video": a one-time pass that lifts "Hide Related Videos"
     for the current video only. Moving to another video hides them again. */
  let relatedShownFor = '';
  let revealBtn = null;

  function makeRevealButton() {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'bf-reveal';
    // Built node by node: YouTube enforces Trusted Types, which blocks innerHTML.
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    const eye = document.createElementNS(NS, 'path');
    eye.setAttribute('d', 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z');
    const pupil = document.createElementNS(NS, 'circle');
    pupil.setAttribute('cx', '12'); pupil.setAttribute('cy', '12'); pupil.setAttribute('r', '3');
    svg.append(eye, pupil);
    const label = document.createElement('span');
    label.textContent = 'Show recommendations for this video';
    const tag = document.createElement('small');
    tag.textContent = '· BreakFree';
    b.append(svg, label, tag);
    b.addEventListener('click', () => {
      relatedShownFor = videoId();
      root.setAttribute('data-bf-show-related', '');
      b.remove();
      setTimeout(() => window.dispatchEvent(new Event('resize')), 50);
    });
    return b;
  }

  function relatedReveal() {
    const id = videoId();
    const wanted = location.pathname === '/watch' && on('vp.related');
    const shown = wanted && relatedShownFor === id;

    if (root.hasAttribute('data-bf-show-related') !== shown) root.toggleAttribute('data-bf-show-related', shown);
    if (!shown && relatedShownFor && relatedShownFor !== id) relatedShownFor = '';

    if (!wanted || shown) { if (revealBtn) revealBtn.remove(); return; }
    // Place it right under the video's title, channel and description.
    const meta = document.querySelector('ytd-watch-flexy[video-id="' + id + '"] #below ytd-watch-metadata');
    if (!meta) return;
    if (!revealBtn) revealBtn = makeRevealButton();
    if (revealBtn.previousElementSibling !== meta) meta.after(revealBtn);
  }

  /* ---------- header history shortcut ---------- */

  let historyBtn = null;

  function makeHistoryButton() {
    const a = document.createElement('a');
    a.className = 'bf-history';
    a.href = '/feed/history';
    a.title = 'History';
    a.setAttribute('aria-label', 'History');
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    const p1 = document.createElementNS(NS, 'path');
    p1.setAttribute('d', 'M3 12a9 9 0 1 0 3-6.7L3 8');
    const p2 = document.createElementNS(NS, 'path');
    p2.setAttribute('d', 'M3 3v5h5');
    const p3 = document.createElementNS(NS, 'path');
    p3.setAttribute('d', 'M12 7v5l3 2');
    svg.append(p1, p2, p3);
    a.append(svg);
    return a;
  }

  function historyShortcut() {
    const buttons = on('hd.history') && document.querySelector('ytd-masthead #end #buttons, ytd-masthead #buttons');
    if (!buttons) { if (historyBtn) historyBtn.remove(); return; }
    if (!historyBtn) historyBtn = makeHistoryButton();
    if (historyBtn.parentElement !== buttons) buttons.prepend(historyBtn);
  }

  function watchPage() {
    if (location.pathname !== '/watch') return;

    // The player only re-measures itself on resize, so nudge it after the sidebar disappears.
    if (on('vp.center')) onceForVideo('center', () => { setTimeout(() => window.dispatchEvent(new Event('resize')), 300); });

    if (on('vp.autoplayOff')) {
      const t = document.querySelector('ytd-player .ytp-autonav-toggle-button[aria-checked="true"]');
      if (t) (t.closest('button') || t).click();
    }

    if (on('vp.theater')) {
      onceForVideo('theater', () => {
        const flexy = document.querySelector('ytd-watch-flexy');
        const btn = document.querySelector('ytd-player .ytp-size-button');
        if (!flexy || !btn) return false;
        if (!flexy.hasAttribute('theater') && !flexy.hasAttribute('fullscreen')) btn.click();
      });
    }

    if (on('vp.chapters')) openChapters();

    if (on('vp.descExpand') && !on('vp.desc')) {
      onceForVideo('desc', () => {
        const more = document.querySelector('ytd-watch-metadata #description-inline-expander #expand');
        if (!more || !more.offsetParent) return false;
        more.click();
      });
    }
  }

  /* ---------- shorts: block scrolling, open as normal videos ---------- */

  const inShorts = () => location.pathname.startsWith('/shorts');

  window.addEventListener('wheel', e => {
    if (on('sh.noScroll') && inShorts() && e.target.closest && e.target.closest('ytd-shorts')) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, { capture: true, passive: false });

  window.addEventListener('keydown', e => {
    if (!on('sh.noScroll') || !inShorts()) return;
    if (e.target.closest && e.target.closest('input, textarea, [contenteditable]')) return;
    if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown'].includes(e.key)) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, true);

  document.addEventListener('click', e => {
    if (!on('sh.redirect') || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
    const a = e.target.closest && e.target.closest('a[href^="/shorts/"]');
    if (!a) return;
    const m = a.getAttribute('href').match(/^\/shorts\/([\w-]{5,})/);
    if (!m) return;
    e.preventDefault();
    e.stopPropagation();
    location.href = '/watch?v=' + m[1];
  }, true);

  /* ---------- main loop ---------- */

  /* After the extension is reloaded or updated, this copy loses its connection
     and must stop so it cannot fight the fresh copy. */
  const alive = () => { try { return !!chrome.runtime.id; } catch (e) { return false; } };

  function teardown() {
    observer.disconnect();
    clearInterval(scheduleTimer);
    style.remove();
    if (revealBtn) revealBtn.remove();
    if (historyBtn) historyBtn.remove();
    root.removeAttribute('data-bf-show-related');
  }

  function tick() {
    tickTimer = null;
    if (!alive()) return teardown();
    if (live && redirects()) return;
    scanItems();
    replaceThumbnails();
    relatedReveal();
    historyShortcut();
    if (live) {
      tagChannelSections();
      watchPage();
    }
  }

  function scheduleTick() {
    if (!tickTimer) tickTimer = setTimeout(tick, 250);
  }

  function refresh() {
    vals = BF.values(state);
    live = BF.isActive(state);
    root.toggleAttribute('data-breakfree', live);
    applyCss();
    tick();
    if (location.pathname === '/watch') setTimeout(() => window.dispatchEvent(new Event('resize')), 300);
  }

  async function reload() {
    try {
      state = await BF.load();
    } catch (e) {
      if (!alive()) teardown();
      return;
    }
    refresh();
  }

  reload();

  let reloadTimer = null;
  const queueReload = () => { clearTimeout(reloadTimer); reloadTimer = setTimeout(reload, 60); };
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && Object.keys(changes).some(k => k.startsWith('bf.'))) queueReload();
  });
  // Safety net: re-read settings whenever the tab regains focus or becomes visible.
  window.addEventListener('focus', queueReload);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) queueReload(); });

  const observer = new MutationObserver(scheduleTick);
  observer.observe(root, { childList: true, subtree: true });
  window.addEventListener('yt-navigate-finish', scheduleTick, true);
  window.addEventListener('popstate', scheduleTick);
  document.addEventListener('DOMContentLoaded', mountStyle);

  // Re-check the schedule so focus hours start and stop on time.
  const scheduleTimer = setInterval(() => {
    if (!alive()) return teardown();
    const now = BF.isActive(state);
    if (now !== live) refresh();
  }, 30000);
})();
