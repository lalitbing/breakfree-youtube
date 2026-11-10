/* BreakFree core: settings model, storage, presets, schedule and the CSS builder.
   Shared by the popup and the content script. Needs features.js loaded first. */
var BF = (() => {
  const { ALL, BY_KEY, PARENT } = BF_FEATURES;

  const LIMITS = { entries: 50, entryLength: 50, profiles: 10, profileName: 24 };
  const THRESHOLDS = [10, 25, 50, 75, 90];
  const COLOR = /^#[0-9a-f]{6}$/i;
  const TIME = /^\d\d:\d\d$/;

  /* ---------- starter templates ---------- */

  const calm = [
    'gen.shorts', 'home.shorts', 'vp.endSuggest', 'vp.endCards', 'vp.autoplayOff',
    'vp.comments', 'hd.notifCount', 'vi.noHover', 'sb.shorts', 'sr.shorts', 'vp.merch'
  ];
  const focus = [
    ...calm, 'home.feed', 'home.chips', 'home.shelves', 'vp.related', 'vp.center', 'vp.liveChat',
    'hd.notifications', 'nav.explore', 'nav.more', 'sr.shelves', 'sr.peopleAlso', 'sr.mixes',
    'vp.heatmap', 'gen.mixes', 'gen.playables', 'sb.watched', 'sr.watched'
  ];
  const monk = [...focus, 'nav.all', 'gen.grayscale', 'sr.sidebar', 'sr.noInfinite', 'home.noInfinite', 'vi.badgeLive'];

  const TEMPLATES = {
    calm: { label: 'Calm', blurb: 'No Shorts, autoplay or comments', values: { ...toValues(calm) } },
    focus: { label: 'Focus', blurb: 'No feed or recommendations. Search only', values: { ...toValues(focus) } },
    monk: { label: 'Monk Mode', blurb: 'Focus plus grayscale and no sidebar', values: { ...toValues(monk), 'vi.blur': '8px' } },
    clear: { label: 'Everything Visible', blurb: 'YouTube as it is', values: {} }
  };

  function toValues(keys) {
    const v = {};
    keys.forEach(k => { if (BY_KEY[k]) v[k] = true; });
    return v;
  }

  /* ---------- values ---------- */

  function cleanValue(item, raw) {
    const type = item.type || 'toggle';
    if (type === 'toggle') return raw === true ? true : undefined;
    if (type === 'select') return item.options.some(([v]) => v && v === raw) ? raw : undefined;
    if (type === 'color') return typeof raw === 'string' && COLOR.test(raw) ? raw.toLowerCase() : undefined;
    return undefined;
  }

  function cleanValues(raw) {
    const out = {};
    if (!raw || typeof raw !== 'object') return out;
    for (const [k, v] of Object.entries(raw)) {
      const item = BY_KEY[k];
      if (!item) continue;
      const c = cleanValue(item, v);
      if (c !== undefined) out[k] = c;
    }
    return out;
  }

  function cleanList(a) {
    if (!Array.isArray(a)) return [];
    const seen = new Set();
    const out = [];
    for (const x of a) {
      if (typeof x !== 'string') continue;
      const v = x.trim().slice(0, LIMITS.entryLength);
      const id = v.toLowerCase();
      if (!v || seen.has(id)) continue;
      seen.add(id);
      out.push(v);
      if (out.length >= LIMITS.entries) break;
    }
    return out;
  }

  /* ---------- whole state ---------- */

  function newId() {
    return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function defaults() {
    return {
      enabled: true,
      active: 'main',
      order: ['main'],
      profiles: { main: { name: 'My Setup', values: { ...TEMPLATES.calm.values } } },
      keywords: [],
      channels: [],
      watchedThreshold: 75,
      schedule: { enabled: false, days: [1, 2, 3, 4, 5], start: '09:00', end: '17:00' }
    };
  }

  function normalize(meta, profileValues) {
    const d = defaults();
    if (!meta || typeof meta !== 'object') return d;
    const s = meta.schedule || {};
    const names = meta.names && typeof meta.names === 'object' ? meta.names : {};
    const order = (Array.isArray(meta.order) ? meta.order : [])
      .filter(id => typeof id === 'string' && /^[\w-]{1,40}$/.test(id))
      .slice(0, LIMITS.profiles);
    const profiles = {};
    order.forEach(id => {
      profiles[id] = {
        name: String(names[id] || 'Preset').slice(0, LIMITS.profileName),
        values: cleanValues(profileValues[id])
      };
    });
    if (!order.length) return d;
    return {
      enabled: meta.enabled !== false,
      active: order.includes(meta.active) ? meta.active : order[0],
      order,
      profiles,
      keywords: cleanList(meta.keywords),
      channels: cleanList(meta.channels),
      watchedThreshold: THRESHOLDS.includes(meta.watchedThreshold) ? meta.watchedThreshold : d.watchedThreshold,
      schedule: {
        enabled: !!s.enabled,
        days: Array.isArray(s.days) ? s.days.filter(n => Number.isInteger(n) && n >= 0 && n <= 6) : d.schedule.days,
        start: TIME.test(s.start) ? s.start : d.schedule.start,
        end: TIME.test(s.end) ? s.end : d.schedule.end
      }
    };
  }

  const values = state => (state.profiles[state.active] || { values: {} }).values;

  /* ---------- storage ----------
     sync storage caps each item at 8 KB, so each preset is its own item. */

  const META_KEY = 'bf.meta';
  const PROFILE_KEY = id => 'bf.p.' + id;

  async function load() {
    const all = await chrome.storage.sync.get(null);
    const meta = all[META_KEY];
    const pv = {};
    for (const [key, val] of Object.entries(all)) {
      if (key.startsWith('bf.p.')) pv[key.slice(5)] = val;
    }
    return normalize(meta, pv);
  }

  function serialize(state) {
    const meta = {
      enabled: state.enabled,
      active: state.active,
      order: state.order,
      names: Object.fromEntries(state.order.map(id => [id, state.profiles[id].name])),
      keywords: state.keywords,
      channels: state.channels,
      watchedThreshold: state.watchedThreshold,
      schedule: state.schedule
    };
    const items = { [META_KEY]: meta };
    state.order.forEach(id => { items[PROFILE_KEY(id)] = state.profiles[id].values; });
    return items;
  }

  async function save(state) {
    const items = serialize(state);
    const existing = await chrome.storage.sync.get(null);
    const stale = Object.keys(existing).filter(k => k.startsWith('bf.p.') && !(k in items));
    if (stale.length) await chrome.storage.sync.remove(stale);
    await chrome.storage.sync.set(items);
  }

  /* ---------- schedule ---------- */

  const toMinutes = hhmm => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };

  /* True when the schedule covers this moment. Windows may cross midnight. */
  function inSchedule(schedule, now = new Date()) {
    if (!schedule.enabled) return true;
    const mins = now.getHours() * 60 + now.getMinutes();
    const day = now.getDay();
    const a = toMinutes(schedule.start);
    const b = toMinutes(schedule.end);
    const has = d => schedule.days.includes(d);
    if (a === b) return has(day);
    if (a < b) return has(day) && mins >= a && mins < b;
    if (mins >= a) return has(day);
    if (mins < b) return has((day + 6) % 7);
    return false;
  }

  const isActive = (state, now = new Date()) => state.enabled && inSchedule(state.schedule, now);

  /* ---------- CSS ---------- */

  /* Split a selector list on top-level commas so one unsupported selector
     cannot disable the rest of its rule. */
  function splitSelectors(list) {
    const out = [];
    let depth = 0, quote = '', cur = '';
    for (const ch of list) {
      if (quote) { if (ch === quote) quote = ''; cur += ch; continue; }
      if (ch === '"' || ch === "'") { quote = ch; cur += ch; continue; }
      if (ch === '(' || ch === '[') depth++;
      if (ch === ')' || ch === ']') depth--;
      if (ch === ',' && depth === 0) { if (cur.trim()) out.push(cur.trim()); cur = ''; continue; }
      cur += ch;
    }
    if (cur.trim()) out.push(cur.trim());
    return out;
  }

  /* Is this setting in effect, given its parent? */
  function applies(vals, k) {
    if (!vals[k]) return false;
    const parent = PARENT[k];
    if (parent && parent.kidsNeedParent && !vals[parent.k]) return false;
    return true;
  }

  function buildCss(vals) {
    const out = [];
    for (const item of ALL) {
      if (!applies(vals, item.k)) continue;
      if (item.hide) splitSelectors(item.hide).forEach(sel => out.push(`${sel} { display: none !important; }`));
      if (item.css) out.push(typeof item.css === 'function' ? item.css(vals[item.k]) : item.css);
    }
    return out.join('\n');
  }

  const countOn = vals => Object.keys(vals).length;

  return {
    LIMITS, THRESHOLDS, TEMPLATES,
    defaults, normalize, cleanValues, cleanList, values, newId,
    load, save, serialize, inSchedule, isActive, applies, buildCss, splitSelectors, countOn
  };
})();
