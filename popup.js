/* BreakFree popup. Builds every control from BF_FEATURES. */

/* Outside the extension (opening popup.html directly) fall back to localStorage so the UI can be previewed. */
if (!(window.chrome && chrome.storage && chrome.storage.sync)) {
  const KEY = 'bf-preview-store';
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
  const write = o => { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch {} };
  window.chrome = Object.assign(window.chrome || {}, {
    storage: { sync: {
      get: async () => read(),
      set: async items => write({ ...read(), ...items }),
      remove: async keys => { const o = read(); [].concat(keys).forEach(k => delete o[k]); write(o); },
      clear: async () => write({})
    } }
  });
}

(async () => {
  const { SECTIONS, ALL, BY_KEY, PARENT } = BF_FEATURES;
  const $ = sel => document.querySelector(sel);
  const el = (tag, props = {}, ...children) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else if (v === true) n.setAttribute(k, '');
      else if (v !== false && v != null) n.setAttribute(k, v);
    }
    children.flat().forEach(c => c != null && n.append(c));
    return n;
  };

  const TOOLS = [
    { id: 'active', title: 'Active Settings' },
    { id: 'filters', title: 'Filters' },
    { id: 'schedule', title: 'Schedule' },
    { id: 'presets', title: 'Presets' },
    { id: 'backup', title: 'Import & Export' }
  ];
  const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
  const DAY_LABEL = { 0: 'Su', 1: 'Mo', 2: 'Tu', 3: 'We', 4: 'Th', 5: 'Fr', 6: 'Sa' };
  const DAY_NAME = { 0: 'Sunday', 1: 'Monday', 2: 'Tuesday', 3: 'Wednesday', 4: 'Thursday', 5: 'Friday', 6: 'Saturday' };

  // Full-page layout when opened in a tab (options page or "Open in a full tab").
  let inTab = new URLSearchParams(location.search).has('full');
  try { if (!inTab && chrome.tabs && chrome.tabs.getCurrent) inTab = !!(await chrome.tabs.getCurrent()); } catch (e) { /* popup */ }
  if (inTab) document.body.classList.add('full');

  // Side panel: neither the toolbar popup nor a tab.
  let isPopup = false;
  try { isPopup = chrome.extension.getViews({ type: 'popup' }).includes(window); } catch (e) { /* preview */ }
  const inPanel = new URLSearchParams(location.search).has('panel') || (!inTab && !isPopup && !!chrome.sidePanel);
  if (inPanel) document.body.classList.add('panel');

  // chrome.sidePanel.open must run straight from the click, so look up the window id now.
  let windowId = null;
  const canPanel = !inPanel && !!(chrome.sidePanel && chrome.sidePanel.open && chrome.windows);
  if (canPanel) chrome.windows.getCurrent().then(w => { windowId = w.id; }).catch(() => {});

  let state = await BF.load();
  let view = localStorageGet('bf-view') || 'overview';
  if (!SECTIONS.some(s => s.id === view) && !TOOLS.some(t => t.id === view)) view = 'overview';
  let query = '';
  let saveTimer = null;

  function localStorageGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
  function localStorageSet(k, v) { try { localStorage.setItem(k, v); } catch {} }

  const vals = () => BF.values(state);

  /* Saves run one after another so a quick series of clicks lands in order.
     Typing waits a moment; everything else saves at once so closing the popup never loses a change. */
  let saveChain = Promise.resolve();
  function saveNow() {
    clearTimeout(saveTimer);
    saveChain = saveChain.then(() => BF.save(state)).catch(err => showStatus('Could not save: ' + err.message, true));
  }

  function persist({ rerender = false, typing = false } = {}) {
    clearTimeout(saveTimer);
    if (typing) saveTimer = setTimeout(saveNow, 300);
    else saveNow();
    renderStatus();
    renderPickers();
    renderDrawer();
    if (rerender) render();
  }

  /* ---------- status ---------- */

  let flash = null;
  function showStatus(text, warn) {
    flash = { text, warn };
    renderStatus();
    setTimeout(() => { flash = null; renderStatus(); }, 3500);
  }

  function renderStatus() {
    const s = $('#status');
    let text = '';
    let warn = false;
    if (flash) ({ text, warn } = flash);
    else if (!state.enabled) { text = 'BreakFree is paused. YouTube looks normal.'; warn = true; }
    else if (state.schedule.enabled && !BF.inSchedule(state.schedule)) {
      text = `Waiting for focus hours (${state.schedule.start} to ${state.schedule.end}).`;
      warn = true;
    }
    s.hidden = !text;
    s.textContent = text;
    s.classList.toggle('warn', warn);
    $('#enabled').checked = state.enabled;
    $('#powerText').textContent = state.enabled ? 'On' : 'Off';
  }


  /* ---------- themed dropdowns ----------
     Native <select> menus are drawn by the OS, so they ignore BreakFree's colors.
     Each select stays in the page (hidden) as the source of truth; a button shows its
     value and opens a themed list. Picking an item sets the select and fires "change". */
  let openMenu = null;

  function closeMenu(focusButton) {
    if (!openMenu) return;
    const { menu, btn } = openMenu;
    menu.remove();
    btn.setAttribute('aria-expanded', 'false');
    openMenu = null;
    if (focusButton) btn.focus();
  }

  function themeSelect(sel, { moveId = false, anchor = null } = {}) {
    if (sel._dd) return sel._dd;
    const btn = el('button', { type: 'button', class: 'dd-btn', 'aria-haspopup': 'listbox', 'aria-expanded': 'false' });
    if (moveId && sel.id) { btn.id = sel.id; sel.removeAttribute('id'); }
    if (sel.classList.contains('mini')) btn.classList.add('dd-mini');
    const text = el('span', { class: 'dd-text' });
    btn.append(text);
    if (btn.classList.contains('dd-mini')) btn.append(chevronDown());
    sel.hidden = true;
    sel.after(btn);

    const sync = () => {
      const opt = sel.options[sel.selectedIndex];
      text.textContent = opt ? opt.textContent : '';
      btn.classList.toggle('set', sel.classList.contains('set'));
    };

    function open() {
      if (openMenu && openMenu.btn === btn) return closeMenu();
      closeMenu();
      const menu = el('div', { class: 'dd-menu', role: 'listbox', tabindex: '-1' });
      let current = null;
      [...sel.children].forEach(node => {
        const add = opt => {
          const item = el('button', { type: 'button', class: 'dd-item', role: 'option', 'aria-selected': String(opt.selected), 'data-value': opt.value },
            el('span', { text: opt.textContent }));
          if (opt.selected) { item.append(checkMark()); current = item; }
          item.addEventListener('click', () => {
            sel.value = opt.value;
            closeMenu(true);
            sync();
            sel.dispatchEvent(new Event('change', { bubbles: true }));
          });
          menu.append(item);
        };
        if (node.tagName === 'OPTGROUP') {
          menu.append(el('div', { class: 'dd-group', text: node.label }));
          [...node.children].forEach(add);
        } else add(node);
      });
      document.body.append(menu);

      // Place under the anchor (or above it when there is no room), at least as wide.
      const r = (anchor || btn).getBoundingClientRect();
      const width = Math.max(r.width, 180);
      const left = Math.min(Math.max(8, r.right - width), window.innerWidth - width - 8);
      menu.style.minWidth = width + 'px';
      menu.style.left = (btn.classList.contains('dd-mini') ? left : Math.max(8, Math.min(r.left, window.innerWidth - width - 8))) + 'px';
      const below = window.innerHeight - r.bottom - 12;
      const above = r.top - 12;
      if (below >= Math.min(menu.scrollHeight, 220) || below >= above) {
        menu.style.top = (r.bottom + 6) + 'px';
        menu.style.maxHeight = Math.max(120, below) + 'px';
      } else {
        menu.style.maxHeight = Math.max(120, above) + 'px';
        menu.style.top = Math.max(8, r.top - 6 - Math.min(menu.scrollHeight, above)) + 'px';
      }
      btn.setAttribute('aria-expanded', 'true');
      openMenu = { menu, btn };
      (current || menu.querySelector('.dd-item')).focus();
      if (current) current.scrollIntoView({ block: 'nearest' });

      menu.addEventListener('keydown', e => {
        const items = [...menu.querySelectorAll('.dd-item')];
        const i = items.indexOf(document.activeElement);
        if (e.key === 'ArrowDown') { e.preventDefault(); items[Math.min(items.length - 1, i + 1)].focus(); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); items[Math.max(0, i - 1)].focus(); }
        else if (e.key === 'Home') { e.preventDefault(); items[0].focus(); }
        else if (e.key === 'End') { e.preventDefault(); items[items.length - 1].focus(); }
        else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeMenu(true); }
        else if (e.key === 'Tab') closeMenu();
        else if (e.key.length === 1) {
          const k = e.key.toLowerCase();
          const next = items.slice(i + 1).concat(items.slice(0, i + 1)).find(it => it.textContent.trim().toLowerCase().startsWith(k));
          if (next) next.focus();
        }
      });
    }

    btn.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); open(); });
    btn.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); open(); }
    });
    if (anchor) anchor.addEventListener('click', e => { if (!btn.contains(e.target)) { e.preventDefault(); open(); } });

    sync();
    sel._dd = { sync, open, btn };
    return sel._dd;
  }

  document.addEventListener('pointerdown', e => {
    if (openMenu && !openMenu.menu.contains(e.target) && !openMenu.btn.contains(e.target)) closeMenu();
  }, true);
  window.addEventListener('blur', () => closeMenu());
  window.addEventListener('resize', () => closeMenu());
  document.addEventListener('scroll', e => { if (openMenu && !openMenu.menu.contains(e.target)) closeMenu(); }, true);

  function svgIcon(d, cls) {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('aria-hidden', 'true');
    s.setAttribute('class', cls);
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', d);
    s.append(p);
    return s;
  }
  const chevronDown = () => svgIcon('m6 9 6 6 6-6', 'dd-chev');
  const checkMark = () => svgIcon('m5 12.5 4.5 4.5L19 7.5', 'dd-check');

  /* ---------- pickers ---------- */

  function renderPickers() {
    const p = $('#preset');
    p.textContent = '';
    state.order.forEach(id => p.append(el('option', { value: id, text: state.profiles[id].name })));
    p.append(el('option', { value: '__manage', text: 'Manage presets…' }));
    p.value = state.active;
    const pd = themeSelect(p, { anchor: p.closest('.picker') });
    pd.btn.setAttribute('aria-labelledby', 'presetLabel');
    pd.sync();

    const s = $('#section');
    s.textContent = '';
    const pages = el('optgroup', { label: 'Pages' });
    SECTIONS.forEach(sec => pages.append(el('option', { value: sec.id, text: sec.title })));
    const tools = el('optgroup', { label: 'Tools' });
    TOOLS.forEach(t => tools.append(el('option', { value: t.id, text: t.title })));
    s.append(el('option', { value: 'overview', text: 'Overview' }), pages, tools);
    s.value = view;
    const sd = themeSelect(s, { anchor: s.closest('.picker') });
    sd.btn.setAttribute('aria-labelledby', 'sectionLabel');
    sd.sync();
  }

  $('#preset').addEventListener('change', e => {
    if (e.target.value === '__manage') { go('presets'); e.target.value = state.active; return; }
    state.active = e.target.value;
    persist({ rerender: true });
  });

  $('#section').addEventListener('change', e => go(e.target.value));

  function go(id) {
    view = id;
    query = '';
    $('#search').value = '';
    localStorageSet('bf-view', id);
    closeDrawer();
    renderPickers();
    renderDrawer();
    render();
    $('#view').scrollTop = 0;
  }

  /* ---------- controls ---------- */

  const sectionCount = sec => {
    const v = vals();
    let n = 0;
    sec.groups.forEach(g => g.items.forEach(i => { if (v[i.k]) n++; (i.kids || []).forEach(k => { if (v[k.k]) n++; }); }));
    return n;
  };

  function setValue(k, value) {
    const v = vals();
    if (value === '' || value === false || value == null) delete v[k];
    else v[k] = value;
  }

  function control(item) {
    const v = vals()[item.k];
    const type = item.type || 'toggle';
    const id = 'c-' + item.k.replace(/\W/g, '-');

    if (type === 'toggle') {
      const input = el('input', { type: 'checkbox', id, checked: !!v });
      input.addEventListener('change', () => {
        setValue(item.k, input.checked);
        persist();
        if (item.kids) syncKids(item);
      });
      return { node: el('span', { class: 'sw' }, input, el('span')), id };
    }

    if (type === 'select') {
      const sel = el('select', { class: 'mini' + (v ? ' set' : ''), id });
      item.options.forEach(([value, label]) => sel.append(el('option', { value, text: label })));
      sel.value = v || '';
      sel.addEventListener('change', () => {
        setValue(item.k, sel.value);
        sel.classList.toggle('set', !!sel.value);
        sel._dd && sel._dd.sync();
        persist();
      });
      const wrap = el('span', { class: 'dd-wrap' }, sel);
      themeSelect(sel, { moveId: true });
      return { node: wrap, id };
    }

    if (type === 'color') {
      const input = el('input', { type: 'color', id, value: v || '#000000' });
      const reset = el('button', { type: 'button', class: 'btn small', text: 'Default', hidden: !v });
      input.addEventListener('input', () => { setValue(item.k, input.value); reset.hidden = false; persist({ typing: true }); });
      reset.addEventListener('click', e => { e.preventDefault(); setValue(item.k, ''); reset.hidden = true; input.value = '#000000'; persist(); });
      return { node: el('span', { class: 'colorbox' }, reset, input), id };
    }
  }

  function row(item, { parent = false, where = '', compact = false } = {}) {
    const c = control(item);
    const text = el('span', { class: 'text' },
      el('span', { class: 'name', text: item.label }),
      item.hint && !compact ? el('span', { class: 'hint', text: item.hint }) : null,
      where ? el('span', { class: 'where', text: where }) : null
    );
    // Toggles: the whole row is the label. Selects and colors: label points at the control.
    return el('label', { class: 'row' + (parent ? ' parent' : ''), for: c.id }, text, c.node);
  }

  const kidBoxes = new Map();

  function kidsState(item) {
    const parentOn = !!vals()[item.k];
    if (item.kidsNeedParent) return { dim: !parentOn, note: parentOn ? '' : 'Turn the option above on to use these.' };
    return { dim: parentOn, note: parentOn ? 'Everything here is already hidden by the option above.' : '' };
  }

  function syncKids(item) {
    const box = kidBoxes.get(item.k);
    if (!box) return;
    const { dim, note } = kidsState(item);
    box.wrap.classList.toggle('dim', dim);
    box.note.textContent = note;
    box.note.hidden = !note;
  }

  function itemBlock(item) {
    const card = el('div', { class: 'card' });
    card.append(row(item, { parent: !!item.kids }));
    if (item.kids) {
      const note = el('p', { class: 'kids-note' });
      const wrap = el('div', { class: 'kids' }, item.kids.map(k => row(k)));
      kidBoxes.set(item.k, { wrap, note });
      card.append(note, wrap);
      syncKids(item);
    }
    return card;
  }

  /* A group: plain items share one card, items with kids get their own card. */
  function groupBlock(group, sectionCountLabel) {
    const frag = document.createDocumentFragment();
    if (group.title) frag.append(el('h2', {}, group.title, sectionCountLabel || ''));
    if (group.hint) frag.append(el('p', { class: 'sec-hint', text: group.hint }));
    let plain = null;
    group.items.forEach(item => {
      if (item.kids) { plain = null; frag.append(itemBlock(item)); return; }
      if (!plain) { plain = el('div', { class: 'card' }); frag.append(plain); }
      plain.append(row(item));
    });
    return frag;
  }

  /* ---------- views ---------- */

  function render() {
    const host = $('#view');
    host.textContent = '';
    kidBoxes.clear();

    if (query) return renderSearch(host);
    if (view === 'overview') return renderOverview(host);
    const sec = SECTIONS.find(s => s.id === view);
    if (sec) {
      if (sec.hint) host.append(el('p', { class: 'sec-hint', text: sec.hint }));
      sec.groups.forEach(g => host.append(groupBlock(g)));
      return;
    }
    ({ active: renderActive, filters: renderFilters, schedule: renderSchedule, presets: renderPresets, backup: renderBackup })[view](host);
  }

  function renderOverview(host) {
    const total = ALL.length;
    const on = BF.countOn(vals());
    host.append(
      el('h2', {}, 'Your setup'),
      el('div', { class: 'card' },
        el('div', { class: 'pad' },
          el('div', { class: 'name', text: `${on} of ${total} settings on in "${state.profiles[state.active].name}"` }),
          el('p', { class: 'note', text: 'Pick a page to fine-tune, or search for any setting above.' })
        )
      ),
      el('h2', {}, 'Pages')
    );
    const card = el('div', { class: 'card' });
    SECTIONS.forEach(sec => {
      const n = sectionCount(sec);
      card.append(el('button', { type: 'button', class: 'row', style: 'width:100%;border-left:0;border-right:0;border-bottom:0;background:none;text-align:left', onclick: () => go(sec.id) },
        el('span', { class: 'text' }, el('span', { class: 'name', text: sec.title }), sec.hint ? el('span', { class: 'hint', text: sec.hint }) : null),
        el('span', { class: 'hint', text: n ? `${n} on` : '' }),
        chevron()
      ));
    });
    host.append(card, el('h2', {}, 'Tools'));
    const tools = el('div', { class: 'card' });
    TOOLS.forEach(t => tools.append(el('button', { type: 'button', class: 'row', style: 'width:100%;border-left:0;border-right:0;border-bottom:0;background:none;text-align:left', onclick: () => go(t.id) },
      el('span', { class: 'text' }, el('span', { class: 'name', text: t.title })),
      t.id === 'active' && on ? el('span', { class: 'hint', text: `${on} on` }) : null,
      chevron())));
    host.append(tools);
  }

  function chevron() {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('width', '16');
    s.setAttribute('height', '16');
    s.setAttribute('aria-hidden', 'true');
    s.style.cssText = 'fill:none;stroke:var(--faint);stroke-width:2;stroke-linecap:round;stroke-linejoin:round';
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', 'm9 6 6 6-6 6');
    s.append(p);
    return s;
  }

  /* Active Settings: every setting that is on in the current preset, one flat list per page.
     Rows keep their controls, so a setting can be turned off right here. Turned-off rows stay
     (dimmed) until you leave the view, so a mis-click is easy to undo. */
  function renderActive(host) {
    const v = vals();
    let total = 0;
    SECTIONS.forEach(sec => {
      const hits = [];
      sec.groups.forEach(g => g.items.forEach(item => {
        [item, ...(item.kids || [])].forEach(i => { if (v[i.k] !== undefined) hits.push({ i, g }); });
      }));
      if (!hits.length) return;
      total += hits.length;
      host.append(el('h2', {}, sec.title, el('span', { class: 'count', text: String(hits.length) })));
      const card = el('div', { class: 'card' });
      hits.forEach(({ i, g }) => {
        const parent = PARENT[i.k];
        const where = [g.title, parent ? parent.label : ''].filter(Boolean).join(' › ');
        const r = row(i, { where, compact: true });
        // Kids that need their parent on do nothing while it is off; say so.
        if (!BF.applies(v, i.k)) r.classList.add('inert');
        r.addEventListener('change', () => r.classList.toggle('off-now', vals()[i.k] === undefined));
        card.append(r);
      });
      host.append(card);
    });
    if (!total) {
      host.append(el('p', { class: 'empty', text: `Nothing is on in "${state.profiles[state.active].name}". Pick a page or a template under Presets to get started.` }));
      return;
    }
    host.prepend(el('p', { class: 'sec-hint', text: `${total} setting${total === 1 ? '' : 's'} on in "${state.profiles[state.active].name}".` }));
  }

  function renderSearch(host) {
    const q = query.toLowerCase();
    let found = 0;
    SECTIONS.forEach(sec => {
      const hits = [];
      sec.groups.forEach(g => g.items.forEach(item => {
        [item, ...(item.kids || [])].forEach(i => {
          const hay = (i.label + ' ' + (i.hint || '') + ' ' + g.title + ' ' + sec.title).toLowerCase();
          if (q.split(/\s+/).every(w => hay.includes(w))) hits.push({ i, g });
        });
      }));
      if (!hits.length) return;
      found += hits.length;
      host.append(el('h2', {}, sec.title));
      const card = el('div', { class: 'card' });
      hits.forEach(({ i, g }) => {
        const parent = PARENT[i.k];
        const where = [g.title, parent ? parent.label : ''].filter(Boolean).join(' › ');
        card.append(row(i, { where }));
      });
      host.append(card);
    });
    if (!found) host.append(el('p', { class: 'empty', text: `No settings match "${query}".` }));
  }

  /* filters */

  function renderFilters(host) {
    const list = (field, label, placeholder) => {
      const area = el('textarea', { rows: '5', placeholder, id: 'f-' + field });
      area.value = state[field].join('\n');
      area.addEventListener('input', () => { state[field] = BF.cleanList(area.value.split('\n')); persist({ typing: true }); });
      return el('div', { class: 'pad' }, el('label', { class: 'field', for: 'f-' + field, text: label }), area);
    };
    const thr = el('select', { class: 'mini', id: 'f-threshold' });
    BF.THRESHOLDS.forEach(n => thr.append(el('option', { value: String(n), text: n + '% watched' })));
    thr.value = String(state.watchedThreshold);
    thr.addEventListener('change', () => { state.watchedThreshold = Number(thr.value); persist(); });
    const thrWrap = el('span', { class: 'dd-wrap' }, thr);
    themeSelect(thr, { moveId: true });

    host.append(
      el('h2', {}, 'Hide videos everywhere'),
      el('div', { class: 'card' },
        list('keywords', 'Words in the title', 'One per line, for example\nreaction\nprank'),
        list('channels', 'Channels', 'One per line. Channel name or @handle.')
      ),
      el('p', { class: 'note', style: 'margin:8px 4px 0', text: `Applies to Home, Search, Subscriptions and related videos. Up to ${BF.LIMITS.entries} lines each.` }),
      el('h2', {}, 'Watched videos'),
      el('div', { class: 'card' },
        el('label', { class: 'row', for: 'f-threshold' },
          el('span', { class: 'text' }, el('span', { class: 'name', text: 'Count a video as watched at' }),
            el('span', { class: 'hint', text: 'Used by every "Hide Watched Videos" option' })),
          thrWrap)
      )
    );
  }

  /* schedule */

  function renderSchedule(host) {
    const sw = el('input', { type: 'checkbox', id: 's-on', checked: state.schedule.enabled });
    const body = el('div', { class: 'pad' + (state.schedule.enabled ? '' : ' off') });
    sw.addEventListener('change', () => {
      state.schedule.enabled = sw.checked;
      body.classList.toggle('off', !sw.checked);
      persist();
    });

    const days = el('div', { class: 'days' });
    DAY_ORDER.forEach(d => {
      const b = el('button', { type: 'button', text: DAY_LABEL[d], 'aria-label': DAY_NAME[d], 'aria-pressed': String(state.schedule.days.includes(d)) });
      b.addEventListener('click', () => {
        const set = new Set(state.schedule.days);
        set.has(d) ? set.delete(d) : set.add(d);
        state.schedule.days = [...set];
        b.setAttribute('aria-pressed', String(set.has(d)));
        persist();
      });
      days.append(b);
    });
    const time = (key, label) => {
      const input = el('input', { type: 'time', id: 's-' + key, value: state.schedule[key] });
      input.addEventListener('change', () => { if (input.value) { state.schedule[key] = input.value; persist(); } });
      return [el('label', { for: 's-' + key, text: label }), input];
    };
    body.append(
      el('p', { class: 'field', text: 'Days' }), days,
      el('div', { class: 'times' }, time('start', 'From'), time('end', 'To')),
      el('p', { class: 'note', text: 'If the end is earlier than the start, the window runs past midnight.' })
    );

    host.append(
      el('h2', {}, 'Focus hours'),
      el('div', { class: 'card' },
        el('label', { class: 'row', for: 's-on' },
          el('span', { class: 'text' },
            el('span', { class: 'name', text: 'Only run during set hours' }),
            el('span', { class: 'hint', text: 'Outside these hours YouTube looks normal' })),
          el('span', { class: 'sw' }, sw, el('span'))),
        body)
    );
  }

  /* presets */

  function renderPresets(host) {
    const list = el('div', { class: 'card' });
    state.order.forEach(id => {
      const p = state.profiles[id];
      const name = el('input', { class: 'input', value: p.name, maxlength: String(BF.LIMITS.profileName), 'aria-label': 'Preset name' });
      name.addEventListener('input', () => { p.name = name.value.trim().slice(0, BF.LIMITS.profileName) || 'Preset'; persist({ typing: true }); });
      const use = el('button', { type: 'button', class: 'btn small' + (id === state.active ? ' primary' : ''), text: id === state.active ? 'In use' : 'Use', disabled: id === state.active });
      use.addEventListener('click', () => { state.active = id; persist({ rerender: true }); });
      const dup = el('button', { type: 'button', class: 'btn small', text: 'Copy', disabled: state.order.length >= BF.LIMITS.profiles });
      dup.addEventListener('click', () => addProfile(p.name + ' copy', { ...p.values }));
      const del = el('button', { type: 'button', class: 'btn small danger', text: 'Delete', disabled: state.order.length === 1 });
      del.addEventListener('click', () => {
        if (del.dataset.armed !== '1') { del.dataset.armed = '1'; del.textContent = 'Sure?'; return; }
        delete state.profiles[id];
        state.order = state.order.filter(x => x !== id);
        if (state.active === id) state.active = state.order[0];
        persist({ rerender: true });
      });
      list.append(el('div', { class: 'preset-row' + (id === state.active ? ' active' : '') }, name, use, dup, del));
    });

    const add = el('button', { type: 'button', class: 'btn primary', text: 'New preset', disabled: state.order.length >= BF.LIMITS.profiles });
    add.addEventListener('click', () => addProfile('New preset', {}));

    const templates = el('div', { class: 'card' });
    Object.entries(BF.TEMPLATES).forEach(([id, t]) => {
      const b = el('button', { type: 'button', class: 'btn small', text: 'Apply' });
      b.addEventListener('click', () => {
        if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = 'Replace?'; return; }
        state.profiles[state.active].values = { ...t.values };
        showStatus(`Applied ${t.label} to "${state.profiles[state.active].name}".`);
        persist({ rerender: true });
      });
      templates.append(el('div', { class: 'template' },
        el('span', { class: 'text' }, el('span', { class: 'name', text: t.label }), el('span', { class: 'hint', text: t.blurb })), b));
    });

    host.append(
      el('h2', {}, 'Your presets'), list,
      el('div', { class: 'actions', style: 'margin-top:10px' }, add),
      el('p', { class: 'note', style: 'margin:8px 4px 0', text: `Up to ${BF.LIMITS.profiles} presets. They sync with your Chrome profile.` }),
      el('h2', {}, `Starter templates for "${state.profiles[state.active].name}"`), templates
    );
  }

  function addProfile(name, values) {
    if (state.order.length >= BF.LIMITS.profiles) return;
    const id = BF.newId();
    state.profiles[id] = { name: name.slice(0, BF.LIMITS.profileName), values };
    state.order.push(id);
    state.active = id;
    persist({ rerender: true });
  }

  /* backup */

  /* Settings code: the exported JSON, Base64-encoded (UTF-8 safe). */
  function toCode() {
    const json = JSON.stringify({ app: 'breakfree', version: 1, data: BF.serialize(state) });
    const bytes = new TextEncoder().encode(json);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }

  function fromCode(code) {
    const clean = code.replace(/\s+/g, '');
    if (!clean) throw new Error('paste a settings code first');
    let json;
    try {
      const bin = atob(clean);
      const bytes = Uint8Array.from(bin, ch => ch.charCodeAt(0));
      json = new TextDecoder().decode(bytes);
    } catch (e) { throw new Error('that is not a valid Base64 code'); }
    let parsed;
    try { parsed = JSON.parse(json); } catch (e) { throw new Error('the code does not contain settings'); }
    const data = parsed && parsed.data;
    if (!parsed || parsed.app !== 'breakfree' || !data || !data['bf.meta']) throw new Error('not a BreakFree settings code');
    const pv = {};
    Object.entries(data).forEach(([k, v]) => { if (k.startsWith('bf.p.')) pv[k.slice(5)] = v; });
    return BF.normalize(data['bf.meta'], pv);
  }

  function renderBackup(host) {
    const copy = el('button', { type: 'button', class: 'btn primary', text: 'Copy settings code' });
    copy.addEventListener('click', async () => {
      const code = toCode();
      try {
        await navigator.clipboard.writeText(code);
        copy.textContent = 'Copied';
        showStatus(`Settings code copied (${code.length.toLocaleString()} characters).`);
      } catch (e) {
        // Clipboard blocked: show the code so it can be copied by hand.
        out.hidden = false;
        out.value = code;
        out.select();
        showStatus('Could not reach the clipboard. The code is selected below; press Cmd/Ctrl+C.', true);
      }
      setTimeout(() => { copy.textContent = 'Copy settings code'; }, 2000);
    });
    const out = el('textarea', { class: 'code', readonly: true, hidden: true, 'aria-label': 'Settings code' });

    const input = el('textarea', { class: 'code', id: 'b-import', placeholder: 'Paste a settings code here', spellcheck: 'false' });
    const imp = el('button', { type: 'button', class: 'btn', text: 'Import' });
    imp.addEventListener('click', () => {
      try {
        const next = fromCode(input.value);
        if (imp.dataset.armed !== '1') {
          imp.dataset.armed = '1';
          imp.textContent = `Replace current settings (${next.order.length} preset${next.order.length === 1 ? '' : 's'})?`;
          return;
        }
        state = next;
        persist({ rerender: true });
        showStatus('Settings imported.');
      } catch (e) {
        imp.dataset.armed = '';
        imp.textContent = 'Import';
        showStatus('Import failed: ' + e.message, true);
      }
    });
    input.addEventListener('input', () => { imp.dataset.armed = ''; imp.textContent = 'Import'; });

    const reset = el('button', { type: 'button', class: 'btn danger', text: 'Reset everything' });
    reset.addEventListener('click', () => {
      if (reset.dataset.armed !== '1') { reset.dataset.armed = '1'; reset.textContent = 'Click again to reset'; return; }
      state = BF.defaults();
      persist({ rerender: true });
      showStatus('Back to defaults.');
    });

    host.append(
      el('h2', {}, 'Export'),
      el('div', { class: 'card' }, el('div', { class: 'pad' },
        copy,
        el('p', { class: 'note', text: 'Copies every preset, filter and the schedule as one Base64 code. Paste it anywhere to keep it.' }),
        out)),
      el('h2', {}, 'Import'),
      el('div', { class: 'card' }, el('div', { class: 'pad' },
        input,
        el('div', { class: 'actions', style: 'margin-top:8px' }, imp),
        el('p', { class: 'note', text: 'Replaces all your current settings with the ones in the code.' }))),
      el('h2', {}, 'Reset'),
      el('div', { class: 'card' }, el('div', { class: 'pad' },
        reset,
        el('p', { class: 'note', text: 'Deletes all presets and filters and starts over with the Calm template.' })))
    );
  }

  /* ---------- drawer ---------- */

  function renderDrawer() {
    const host = $('#drawerList');
    host.textContent = '';
    const item = (id, title, n) => el('button', { type: 'button', class: 'drawer-item', 'aria-current': String(view === id), onclick: () => go(id) },
      el('span', { text: title }), n ? el('span', { class: 'n', text: String(n) }) : null);
    host.append(item('overview', 'Overview'));
    host.append(el('div', { class: 'drawer-group', text: 'Pages' }));
    SECTIONS.forEach(sec => host.append(item(sec.id, sec.title, sectionCount(sec))));
    host.append(el('div', { class: 'drawer-group', text: 'Tools' }));
    TOOLS.forEach(t => host.append(item(t.id, t.title, t.id === 'active' ? BF.countOn(vals()) : 0)));
  }

  function openDrawer() {
    $('#drawer').hidden = false;
    $('#scrim').hidden = false;
    $('#menuBtn').setAttribute('aria-expanded', 'true');
    const cur = $('#drawer [aria-current="true"]');
    (cur || $('#drawerClose')).focus();
  }
  function closeDrawer() {
    if ($('#drawer').hidden) return;
    $('#drawer').hidden = true;
    $('#scrim').hidden = true;
    $('#menuBtn').setAttribute('aria-expanded', 'false');
    $('#menuBtn').focus();
  }
  $('#menuBtn').addEventListener('click', openDrawer);
  $('#drawerClose').addEventListener('click', closeDrawer);
  $('#scrim').addEventListener('click', closeDrawer);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeDrawer(); });

  // The background worker watches this value and points the toolbar icon at the popup or the side panel.
  const rememberPanel = on => chrome.storage.local && chrome.storage.local.set({ 'bf.ui': { panel: on } });

  function openSidePanel(e) {
    e.preventDefault();
    if (windowId == null) return;
    // open() must be the first call after the click, before anything awaits.
    chrome.sidePanel.open({ windowId })
      .then(() => rememberPanel(true))
      .then(() => { if (isPopup) window.close(); })
      .catch(err => showStatus('Could not open the side panel: ' + err.message, true));
  }

  async function usePopup(e) {
    e.preventDefault();
    await rememberPanel(false);
    showStatus('The toolbar icon will open the popup from now on.');
    setTimeout(() => window.close(), 1200);
  }

  $('#panelBtn').hidden = !canPanel && !inPanel;
  $('#openPanel').hidden = !canPanel;
  $('#usePopup').hidden = !inPanel;
  if (inPanel) {
    // In the panel, the same header button switches back to the popup.
    $('#panelBtn').setAttribute('aria-label', 'Use the popup instead');
    $('#panelBtn').title = 'Use the popup instead';
    $('#panelBtn').classList.add('active');
    $('#panelBtn').addEventListener('click', usePopup);
  } else {
    $('#panelBtn').addEventListener('click', openSidePanel);
  }
  $('#openPanel').addEventListener('click', openSidePanel);
  $('#usePopup').addEventListener('click', usePopup);

  /* Keep in step with changes made elsewhere (the popup and side panel can both be open). */
  chrome.storage.onChanged && chrome.storage.onChanged.addListener && chrome.storage.onChanged.addListener(async (changes, area) => {
    if (area !== 'sync' || !Object.keys(changes).some(k => k.startsWith('bf.'))) return;
    const fresh = await BF.load();
    if (JSON.stringify(BF.serialize(fresh)) === JSON.stringify(BF.serialize(state))) return; // our own save
    const typing = document.activeElement && document.activeElement.matches('textarea, input[type="text"], input:not([type]), .input');
    if (typing) return;
    state = fresh;
    renderStatus(); renderPickers(); renderDrawer(); render();
  });

  $('#openTab').addEventListener('click', e => {
    e.preventDefault();
    const url = (chrome.runtime && chrome.runtime.getURL) ? chrome.runtime.getURL('popup.html?full=1') : 'popup.html?full=1';
    if (chrome.tabs && chrome.tabs.create) chrome.tabs.create({ url });
    else window.open(url);
  });

  /* ---------- search + power ---------- */

  $('#search').placeholder = `Search ${ALL.length} settings`;
  $('#search').addEventListener('input', e => { query = e.target.value.trim(); render(); });

  $('#enabled').addEventListener('change', e => { state.enabled = e.target.checked; persist(); });

  window.addEventListener('pagehide', () => { if (saveTimer) saveNow(); });

  // Shadow under the header once the content scrolls beneath it.
  const markScrolled = () => {
    const y = document.body.classList.contains('full') ? window.scrollY : $('#view').scrollTop;
    $('#top').classList.toggle('scrolled', y > 2);
  };
  $('#view').addEventListener('scroll', markScrolled, { passive: true });
  window.addEventListener('scroll', markScrolled, { passive: true });

  /* ---------- first render ---------- */

  renderStatus();
  renderPickers();
  renderDrawer();
  render();
})();
