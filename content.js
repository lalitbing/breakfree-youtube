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
    /* Own tokens: YouTube's --yt-spec-* variables are not reliably defined where these
       elements live, so the theme follows the html[dark] attribute YouTube sets. */
    .bf-history, .bf-hq { --bf-bg: #fff; --bf-fg: #0f0f0f; --bf-fg2: #606060; --bf-layer: rgba(0,0,0,.05);
      --bf-layer2: rgba(0,0,0,.1); --bf-edge: rgba(0,0,0,.1); --bf-shadow: rgba(0,0,0,.16); }
    html[dark] :is(.bf-history, .bf-hq) { --bf-bg: #282828; --bf-fg: #f1f1f1; --bf-fg2: #aaa; --bf-layer: rgba(255,255,255,.1);
      --bf-layer2: rgba(255,255,255,.2); --bf-edge: rgba(255,255,255,.1); --bf-shadow: rgba(0,0,0,.5); }
    .bf-history { display: inline-flex; align-items: center; justify-content: center; width: 40px; height: 40px; border-radius: 50%;
      color: var(--bf-fg); text-decoration: none; }
    .bf-history:hover, .bf-history[aria-expanded="true"] { background: var(--bf-layer2); }
    .bf-history:focus-visible { outline: 2px solid #5ee8a8; outline-offset: 2px; }
    .bf-history svg { width: 24px; height: 24px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
    .bf-hq { position: fixed; z-index: 2300; width: 380px; max-width: calc(100vw - 16px); box-sizing: border-box; padding: 8px 0;
      border-radius: 12px; background: var(--bf-bg); color: var(--bf-fg);
      box-shadow: 0 4px 32px var(--bf-shadow), 0 0 0 1px var(--bf-edge);
      font: 400 14px/1.4 Roboto, Arial, sans-serif; animation: bf-hq-in .14s ease-out; }
    @keyframes bf-hq-in { from { opacity: 0; transform: translateY(-4px); } }
    .bf-hq-head { display: flex; align-items: baseline; justify-content: space-between; padding: 6px 16px 10px; }
    .bf-hq-head span { font-size: 16px; font-weight: 500; }
    .bf-hq-head small { font-size: 11px; color: var(--bf-fg2); }
    .bf-hq-item { display: flex; gap: 12px; padding: 6px 16px; color: inherit; text-decoration: none; }
    a.bf-hq-item:hover, a.bf-hq-item:focus-visible { background: var(--bf-layer); outline: none; }
    .bf-hq-thumb { position: relative; flex: none; width: 120px; height: 68px; border-radius: 8px; overflow: hidden;
      background: var(--bf-layer2); }
    .bf-hq-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .bf-hq-dur { position: absolute; right: 4px; bottom: 4px; padding: 1px 4px; border-radius: 4px; background: rgba(0,0,0,.8);
      color: #fff; font-size: 11px; font-weight: 500; line-height: 16px; }
    .bf-hq-prog { position: absolute; left: 0; right: 0; bottom: 0; height: 3px; background: rgba(255,255,255,.4); }
    .bf-hq-prog i { display: block; height: 100%; background: #f00; }
    .bf-hq-text { min-width: 0; flex: 1; padding-top: 2px; }
    .bf-hq-title { font-weight: 500; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
    .bf-hq-ch { margin-top: 4px; font-size: 12px; color: var(--bf-fg2);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .bf-hq-skel .bf-hq-text { height: 14px; margin-top: 6px; border-radius: 4px; background: var(--bf-layer2); }
    .bf-hq-skel > * { animation: bf-hq-pulse 1.2s ease-in-out infinite; }
    @keyframes bf-hq-pulse { 50% { opacity: .45; } }
    .bf-hq-empty { padding: 20px 16px; color: var(--bf-fg2); text-align: center; }
    .bf-hq-all { display: flex; align-items: center; justify-content: center; gap: 6px; margin: 8px 16px 4px; height: 36px; border-radius: 18px;
      background: var(--bf-layer); color: inherit; text-decoration: none; font-weight: 500; }
    .bf-hq-all:hover, .bf-hq-all:focus-visible { background: var(--bf-layer2); outline: none; }
    .bf-hq-all svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
    @media (prefers-reduced-motion: reduce) { .bf-hq, .bf-hq-skel > * { animation: none; } }
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

  /* ---------- header history shortcut + quick view ---------- */

  /* The header button opens a small popover with the latest videos from the
     watch history. Ctrl/Cmd/middle click still opens the full history page.
     The list comes from the history page's own initial data (same origin, so
     the user's session cookies apply); nothing leaves youtube.com. */

  const HQ_LIMIT = 5;
  const HQ_FRESH_MS = 30000;
  const SVG_NS = 'http://www.w3.org/2000/svg';

  let historyBtn = null;
  let hqPop = null;
  const hq = { items: null, at: 0, pending: null, error: false };

  // Built node by node: YouTube enforces Trusted Types, which blocks innerHTML.
  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text) n.textContent = text;
    return n;
  }

  function icon(paths, cls) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    if (cls) svg.setAttribute('class', cls);
    paths.forEach(d => {
      const p = document.createElementNS(SVG_NS, 'path');
      p.setAttribute('d', d);
      svg.append(p);
    });
    return svg;
  }

  /* ----- data ----- */

  const ytText = t => !t ? '' : typeof t === 'string' ? t
    : t.simpleText || t.content || (t.runs || []).map(r => r.text).join('');

  // First value stored under `key` anywhere inside `o` (depth first).
  function findKey(o, key, depth = 0) {
    if (!o || typeof o !== 'object' || depth > 12) return undefined;
    if (!Array.isArray(o) && key in o) return o[key];
    for (const k in o) {
      const r = findKey(o[k], key, depth + 1);
      if (r !== undefined) return r;
    }
    return undefined;
  }

  // Pulls the newest videos out of /feed/history's ytInitialData. YouTube serves
  // both the older videoRenderer and the newer lockupViewModel; Shorts are skipped.
  function historyFromData(data, limit) {
    const out = [];
    const seen = new Set();
    const add = v => {
      if (!v.id || seen.has(v.id) || out.length >= limit) return;
      seen.add(v.id);
      out.push(v);
    };
    const walk = o => {
      if (out.length >= limit || !o || typeof o !== 'object') return;
      if (Array.isArray(o)) { o.forEach(walk); return; }
      const vr = o.videoRenderer;
      const lv = o.lockupViewModel;
      if (vr && vr.videoId) {
        add({
          id: vr.videoId,
          title: ytText(vr.title),
          channel: ytText(vr.longBylineText || vr.ownerText || vr.shortBylineText),
          duration: ytText(vr.lengthText),
          progress: Number(findKey(vr.thumbnailOverlays, 'percentDurationWatched')) || 0
        });
      } else if (lv && lv.contentId && lv.contentType === 'LOCKUP_CONTENT_TYPE_VIDEO') {
        const meta = (lv.metadata && lv.metadata.lockupMetadataViewModel) || {};
        const rows = findKey(meta.metadata, 'metadataRows') || [];
        const firstPart = rows[0] && rows[0].metadataParts && rows[0].metadataParts[0];
        const badge = findKey(lv.contentImage, 'thumbnailBadgeViewModel');
        const bar = findKey(lv.contentImage, 'thumbnailOverlayProgressBarViewModel');
        add({
          id: lv.contentId,
          title: ytText(meta.title),
          channel: firstPart ? ytText(firstPart.text) : '',
          duration: badge ? ytText(badge.text) : '',
          progress: bar ? Number(bar.startPercent) || 0 : 0
        });
      } else {
        for (const k in o) walk(o[k]);
      }
    };
    walk(data);
    return out;
  }

  function initialDataFromHtml(html) {
    const m = /(?:var ytInitialData|window\["ytInitialData"\])\s*=\s*/.exec(html);
    if (!m) return null;
    const start = m.index + m[0].length;
    const end = html.indexOf(';</script>', start);
    if (end < 0) return null;
    try { return JSON.parse(html.slice(start, end)); } catch (e) { return null; }
  }

  function loadHistory(force) {
    if (hq.pending) return hq.pending;
    if (!force && hq.items && Date.now() - hq.at < HQ_FRESH_MS) return Promise.resolve(hq.items);
    hq.pending = fetch('/feed/history', { credentials: 'same-origin' })
      .then(r => (r.ok ? r.text() : Promise.reject(new Error('HTTP ' + r.status))))
      .then(html => {
        const data = initialDataFromHtml(html);
        if (!data) throw new Error('no ytInitialData');
        hq.items = historyFromData(data, HQ_LIMIT);
        hq.at = Date.now();
        hq.error = false;
        return hq.items;
      })
      .catch(() => { hq.error = true; return hq.items; })
      .finally(() => { hq.pending = null; });
    return hq.pending;
  }

  /* ----- popover ----- */

  function historyItem(v) {
    const a = el('a', 'bf-hq-item');
    a.href = '/watch?v=' + encodeURIComponent(v.id);
    const thumb = el('div', 'bf-hq-thumb');
    const img = el('img');
    img.alt = '';
    img.loading = 'lazy';
    img.src = `https://i.ytimg.com/vi/${encodeURIComponent(v.id)}/mqdefault.jpg`;
    thumb.append(img);
    if (v.duration) thumb.append(el('span', 'bf-hq-dur', v.duration));
    if (v.progress > 0) {
      const bar = el('div', 'bf-hq-prog');
      const fill = el('i');
      fill.style.width = Math.min(100, v.progress) + '%';
      bar.append(fill);
      thumb.append(bar);
    }
    const text = el('div', 'bf-hq-text');
    text.append(el('div', 'bf-hq-title', v.title || 'Untitled video'));
    if (v.channel) text.append(el('div', 'bf-hq-ch', v.channel));
    a.append(thumb, text);
    a.addEventListener('click', closeHistoryPop);
    return a;
  }

  function renderHistoryList() {
    if (!hqPop) return;
    const list = hqPop.querySelector('.bf-hq-list');
    list.replaceChildren();
    list.removeAttribute('aria-busy');
    if (hq.items && hq.items.length) {
      hq.items.forEach(v => list.append(historyItem(v)));
    } else if (hq.items === null && !hq.error) {
      list.setAttribute('aria-busy', 'true');
      for (let i = 0; i < HQ_LIMIT; i++) {
        const row = el('div', 'bf-hq-item bf-hq-skel');
        row.append(el('div', 'bf-hq-thumb'), el('div', 'bf-hq-text'));
        list.append(row);
      }
    } else {
      list.append(el('div', 'bf-hq-empty', hq.error
        ? "Couldn't load your history. Try again in a moment."
        : 'Nothing here yet. Sign in and make sure watch history is on.'));
    }
  }

  function placeHistoryPop() {
    if (!hqPop || !historyBtn) return;
    const r = historyBtn.getBoundingClientRect();
    const w = hqPop.offsetWidth;
    const left = Math.max(8, Math.min(r.right - w, window.innerWidth - w - 8));
    hqPop.style.top = Math.round(r.bottom + 8) + 'px';
    hqPop.style.left = Math.round(left) + 'px';
  }

  function openHistoryPop(viaKeyboard) {
    if (hqPop) return;
    hqPop = el('div', 'bf-hq');
    hqPop.id = 'bf-hq';
    hqPop.setAttribute('role', 'dialog');
    hqPop.setAttribute('aria-label', 'Recently watched');

    const head = el('div', 'bf-hq-head');
    head.append(el('span', '', 'Recently watched'), el('small', '', 'BreakFree'));

    const all = el('a', 'bf-hq-all');
    all.href = '/feed/history';
    all.append(el('span', '', 'View all history'), icon(['M5 12h14', 'M13 6l6 6-6 6']));
    all.addEventListener('click', closeHistoryPop);

    hqPop.append(head, el('div', 'bf-hq-list'), all);
    document.body.append(hqPop);
    historyBtn.setAttribute('aria-expanded', 'true');
    renderHistoryList();
    placeHistoryPop();

    const focusFirst = () => {
      const first = hqPop && hqPop.querySelector('a');
      if (first) first.focus();
    };
    if (viaKeyboard) focusFirst();

    loadHistory().then(() => {
      if (!hqPop) return;
      const hadFocus = hqPop.contains(document.activeElement);
      renderHistoryList();
      if (hadFocus || viaKeyboard) focusFirst();
    });
  }

  function closeHistoryPop() {
    if (!hqPop) return;
    hqPop.remove();
    hqPop = null;
    if (historyBtn) historyBtn.setAttribute('aria-expanded', 'false');
  }

  document.addEventListener('pointerdown', e => {
    if (hqPop && !hqPop.contains(e.target) && !(historyBtn && historyBtn.contains(e.target))) closeHistoryPop();
  }, true);

  document.addEventListener('keydown', e => {
    if (!hqPop) return;
    if (e.key === 'Escape') {
      e.stopPropagation();
      closeHistoryPop();
      if (historyBtn) historyBtn.focus();
      return;
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const links = [...hqPop.querySelectorAll('a')];
    const i = links.indexOf(document.activeElement);
    if (i < 0) return;
    e.preventDefault();
    e.stopPropagation();
    links[(i + (e.key === 'ArrowDown' ? 1 : links.length - 1)) % links.length].focus();
  }, true);

  window.addEventListener('resize', placeHistoryPop);
  document.addEventListener('yt-navigate-start', () => {
    closeHistoryPop();
    hq.at = 0; // a new video may have joined the history
  });

  function makeHistoryButton() {
    const a = el('a', 'bf-history');
    a.href = '/feed/history';
    a.title = 'Recently watched';
    a.setAttribute('aria-label', 'Recently watched');
    a.setAttribute('aria-haspopup', 'dialog');
    a.setAttribute('aria-controls', 'bf-hq');
    a.setAttribute('aria-expanded', 'false');
    a.append(icon(['M3 12a9 9 0 1 0 3-6.7L3 8', 'M3 3v5h5', 'M12 7v5l3 2']));
    a.addEventListener('click', e => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      e.stopPropagation();
      if (hqPop) closeHistoryPop();
      else openHistoryPop(e.detail === 0);
    });
    // Start fetching as soon as the pointer heads for the button.
    const warm = () => { loadHistory(); };
    a.addEventListener('pointerenter', warm);
    a.addEventListener('focus', warm);
    return a;
  }

  function historyShortcut() {
    const buttons = on('hd.history') && document.querySelector('ytd-masthead #end #buttons, ytd-masthead #buttons');
    if (!buttons) {
      closeHistoryPop();
      if (historyBtn) historyBtn.remove();
      return;
    }
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
    closeHistoryPop();
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
