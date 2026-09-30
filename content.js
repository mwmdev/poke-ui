(() => {
  if (window.__pokeui) return;
  window.__pokeui = true;

  const SNIPPET_MAX = 400;
  const STYLE_PROPS = [
    'color', 'background-color', 'font-family', 'font-size', 'font-weight', 'line-height',
    'margin', 'padding', 'border', 'border-radius', 'display', 'position', 'width', 'height',
  ];

  // Each color needs toolbar icons: add it to icons/build.sh too.
  const COLORS = [['Rust', '#b4432a'], ['Ochre', '#8c6310'], ['Moss', '#4d6b2c'], ['Teal', '#22696f'], ['Plum', '#7a4577']];
  // Unknown stored values (legacy hexes before background.js migrates them) fall back to the default.
  const knownColor = (v) => (COLORS.some(([, c]) => c === v) ? v : COLORS[0][1]);
  const COLOR_KEY = 'markerColor'; // global: applies to the markers on every page
  const THEMES = ['auto', 'light', 'dark']; // the theme button cycles in this order
  const THEME_LABELS = { auto: 'Theme: Auto', light: 'Theme: Light', dark: 'Theme: Dark' };
  const THEME_KEY = 'theme'; // global, like the marker color

  let notes = [];
  let active = false;
  let color = COLORS[0][1];
  let theme = THEMES[0];
  let pickerOpen = false;

  const pageKey = () => 'notes:' + location.href.split('#')[0];
  let noteKey = pageKey(); // the storage key the in-memory notes belong to

  // ---------- storage ----------
  async function load() {
    const key = pageKey();
    noteKey = key;
    const stored = await chrome.storage.local.get([key, COLOR_KEY, THEME_KEY]);
    if (key !== noteKey) return; // navigated again while loading
    notes = stored[key] || [];
    color = knownColor(stored[COLOR_KEY]);
    theme = stored[THEME_KEY] || THEMES[0];
    applyColor();
    applyTheme();
  }
  const save = () => chrome.storage.local.set({ [noteKey]: notes });

  // ---------- element context ----------
  const resolve = (selector) => {
    try { return document.querySelector(selector); } catch { return null; }
  };
  const isOnly = (selector, el) => {
    try {
      const all = document.querySelectorAll(selector);
      return all.length === 1 && all[0] === el;
    } catch { return false; }
  };

  function segment(el) {
    let s = el.localName;
    for (const c of [...el.classList].slice(0, 3)) s += '.' + CSS.escape(c);
    const parent = el.parentElement;
    if (parent && parent.querySelectorAll(':scope > ' + s).length > 1) {
      const sameTag = [...parent.children].filter((c) => c.localName === el.localName);
      s += `:nth-of-type(${sameTag.indexOf(el) + 1})`;
    }
    return s;
  }

  function uniqueSelector(el) {
    if (el === document.documentElement) return 'html';
    const parts = [];
    for (let cur = el; cur && cur !== document.documentElement; cur = cur.parentElement) {
      if (cur.id && isOnly('#' + CSS.escape(cur.id), cur)) {
        parts.unshift('#' + CSS.escape(cur.id));
        break;
      }
      parts.unshift(segment(cur));
      const sel = parts.join(' > ');
      if (isOnly(sel, el)) return sel;
    }
    return parts.join(' > ');
  }

  function makeNote(el, text) {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const html = el.outerHTML;
    return {
      id: crypto.randomUUID(),
      text,
      url: location.href,
      selector: uniqueSelector(el),
      html: html.length > SNIPPET_MAX ? html.slice(0, SNIPPET_MAX) + '…' : html,
      styles: Object.fromEntries(STYLE_PROPS.map((p) => [p, cs.getPropertyValue(p)])),
      rect: {
        x: Math.round(r.left + scrollX),
        y: Math.round(r.top + scrollY),
        width: Math.round(r.width),
        height: Math.round(r.height),
      },
    };
  }

  // ---------- markdown ----------
  function fence(code) {
    const longest = Math.max(0, ...(code.match(/`+/g) || []).map((s) => s.length));
    return '`'.repeat(Math.max(3, longest + 1));
  }

  function formatNote(n, i) {
    const styles = Object.entries(n.styles).map(([k, v]) => `${k}: ${v}`).join('; ');
    const f = fence(n.html);
    return [
      `### Annotation ${i + 1}`,
      '',
      n.text,
      '',
      `- URL: ${n.url}`,
      `- Selector: \`${n.selector}\``,
      `- Box (document px): x=${n.rect.x} y=${n.rect.y} width=${n.rect.width} height=${n.rect.height}`,
      `- Styles: \`${styles}\``,
      '',
      f + 'html',
      n.html,
      f,
      '',
    ].join('\n');
  }

  const formatAll = () => '# Annotations\n\n' + notes.map(formatNote).join('\n');

  // Footer buttons (withText) show their label as visible text too.
  async function copy(text, btn, withText = false) {
    const label = btn.title;
    const say = (t) => (withText ? t : undefined);
    try {
      await navigator.clipboard.writeText(text);
      setIcon(btn, 'save', 'Copied', say('Copied'));
    } catch {
      btn.classList.add('failed');
      setIcon(btn, 'close', 'Failed', say('Failed'));
    }
    setTimeout(() => {
      btn.classList.remove('failed');
      setIcon(btn, 'copy', label, say(label));
    }, 1200);
  }

  // ---------- UI ----------
  const h = (tag, attrs = {}, ...kids) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v === false || v == null) continue;
      if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? '' : v);
    }
    e.append(...kids.filter((k) => k != null && k !== false));
    return e;
  };

  const ICONS = {
    save: 'M5 12l5 5L20 7',
    close: 'M6 6l12 12M18 6L6 18',
    copy: 'M9 9h11v11H9zM5 15V4h11',
    delete: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
    auto: 'M3 12a9 9 0 1 0 18 0a9 9 0 1 0-18 0M12 17a5 5 0 0 0 0-10v10z',
    light: 'M8 12a4 4 0 1 0 8 0a4 4 0 1 0-8 0M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41'
      + 'M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41',
    dark: 'M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z',
    enter: 'M9 10l-5 5 5 5M20 4v7a4 4 0 0 1-4 4H4',
  };
  const svg = (icon) => `<svg viewBox="0 0 24 24"><path d="${ICONS[icon]}"/></svg>`;
  // With `text`, the button shows the label visibly next to the icon (footer buttons).
  function setIcon(btn, icon, label, text) {
    btn.innerHTML = svg(icon);
    if (text != null) btn.append(h('span', {}, text));
    btn.setAttribute('aria-label', label);
    btn.title = label;
  }
  const grip = () => {
    const g = h('span', { class: 'grip', 'aria-label': 'Move', title: 'Move' });
    g.innerHTML = '<svg viewBox="0 0 12 16">'
      + [3, 8, 13].map((y) => `<circle cx="3" cy="${y}" r="1.5"/><circle cx="9" cy="${y}" r="1.5"/>`).join('')
      + '</svg>';
    g.append(h('span', { class: 'label' },
      h('span', { class: 'title' }, 'Notes'), h('span', { class: 'count' }, String(notes.length))));
    return g;
  };
  function iconBtn(label, icon, attrs = {}, text) {
    const b = h('button', attrs);
    setIcon(b, icon, label, text);
    return b;
  }
  // First click arms the button (red, confirmLabel); a second click within 3 s runs the action.
  // `text` is the visible label for footer buttons; armed, they read "Confirm".
  function confirmBtn(label, confirmLabel, icon, action, attrs = {}, text) {
    const b = iconBtn(label, icon, attrs, text);
    let timer;
    b.addEventListener('click', () => {
      if (!b.classList.contains('armed')) {
        b.classList.add('armed');
        setIcon(b, icon, confirmLabel, text != null ? 'Confirm' : undefined);
        timer = setTimeout(() => {
          b.classList.remove('armed');
          setIcon(b, icon, label, text);
        }, 3000);
        return;
      }
      clearTimeout(timer);
      action();
    });
    return b;
  }

  const CSS_TEXT = `
:host {
  --sans: -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Helvetica, Arial, system-ui, sans-serif;
  --mono: ui-monospace, "SF Mono", "Cascadia Mono", "Segoe UI Mono", Menlo, Consolas, "DejaVu Sans Mono", "Liberation Mono", monospace;
  --ease: cubic-bezier(.2, 0, 0, 1); --t-fast: 90ms; --t-show: 140ms;
}
[hidden] { display: none !important; }
* { box-sizing: border-box; font: 400 13px/1.4 var(--sans); letter-spacing: 0; }
@keyframes pokeui-fade { from { opacity: 0; } }

.marker { position: fixed; min-width: 22px; height: 22px; padding: 0 5px; border: 2px solid #fff;
  border-radius: 11px 11px 3px 11px; background: var(--pokeui-color); color: #fff; cursor: pointer; pointer-events: auto;
  font: 700 11px/18px var(--sans); font-variant-numeric: tabular-nums; text-align: center;
  box-shadow: 0 0 0 1px rgba(26,20,14,.32), 0 2px 6px rgba(26,20,14,.30); transition: box-shadow var(--t-fast) var(--ease); }
.marker:hover { box-shadow: 0 0 0 1px rgba(26,20,14,.42), 0 4px 10px rgba(26,20,14,.34); }
.marker[aria-expanded="true"] { outline: 2px solid var(--pokeui-color); outline-offset: 2px; }
.marker:focus-visible { outline: 2px solid #fff; outline-offset: 1px; box-shadow: 0 0 0 1px rgba(26,20,14,.32), 0 0 0 5px #2a241e; }

.highlight { position: fixed; border: 2px solid var(--pokeui-color); border-radius: 2px; pointer-events: none;
  background: color-mix(in srgb, var(--pokeui-color) 8%, transparent); box-shadow: 0 0 0 1px rgba(255,255,255,.85); }
.highlight.selected { background: color-mix(in srgb, var(--pokeui-color) 14%, transparent); }

.panel, .editor { position: fixed; pointer-events: auto; color-scheme: var(--pokeui-scheme, light dark);
  --paper: light-dark(#f7f2e8, #1f1b17); --sunken: light-dark(#efe8da, #17140f);
  --hover: light-dark(#ece4d4, #2a251f); --press: light-dark(#e3d9c6, #342e26);
  --ink: light-dark(#2a241e, #efe6d6); --ink-2: light-dark(#40372e, #ffffff);
  --muted: light-dark(#6b6156, #b0a493); --faint: light-dark(#9a8f80, #7d7264);
  --line: light-dark(#ddd3c2, #3a332b); --edge: light-dark(#2a241e, #5c5247);
  --focus: light-dark(#2a241e, #efe6d6); --focus-soft: light-dark(rgba(42,36,30,.12), rgba(239,230,214,.16));
  --danger: light-dark(#a3321f, #e0795f); --on-danger: light-dark(#ffffff, #1f1b17);
  background: var(--paper); color: var(--ink); border: 1px solid var(--edge); border-radius: 4px;
  box-shadow: 0 1px 2px rgba(26,20,14,.16), 0 12px 32px -10px rgba(26,20,14,.38); }

button { display: inline-flex; align-items: center; justify-content: center; gap: 6px; margin: 0; padding: 0;
  color: inherit; background: transparent; border: 0; border-radius: 2px; cursor: pointer;
  transition: background-color var(--t-fast) var(--ease), color var(--t-fast) var(--ease), opacity var(--t-fast) var(--ease); }
button:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
button:disabled { opacity: .38; cursor: default; }
button svg { width: 16px; height: 16px; flex: none; fill: none; stroke: currentColor; stroke-width: 1.75;
  stroke-linecap: round; stroke-linejoin: round; pointer-events: none; }
.icon { width: 28px; height: 28px; color: var(--muted); }
.icon:hover, .icon[aria-expanded="true"] { background: var(--hover); color: var(--ink); }

.panel { right: 16px; top: 16px; width: 288px; max-height: 50vh; display: flex; flex-direction: column; overflow: hidden;
  animation: pokeui-fade var(--t-show) var(--ease); }
.head { display: flex; align-items: center; gap: 2px; height: 40px; padding-right: 6px; border-bottom: 1px solid var(--line); flex: none; }
.grip { flex: 1; align-self: stretch; display: flex; align-items: center; gap: 8px; padding-left: 8px;
  cursor: grab; user-select: none; touch-action: none; }
.grip > * { pointer-events: none; }
.grip svg { width: 12px; height: 16px; fill: var(--faint); }
.label { display: flex; align-items: baseline; gap: 7px; }
.title { font: 650 13px/1 var(--sans); letter-spacing: -.005em; }
.count { font: 500 11px/1 var(--mono); color: var(--muted); font-variant-numeric: tabular-nums; }
.dot { display: block; width: 16px; height: 16px; border: 2px solid #fff; border-radius: 8px 8px 2px 8px;
  background: var(--pokeui-color); box-shadow: 0 0 0 1px rgba(26,20,14,.32); }

.swatches { display: flex; align-items: center; gap: 10px; padding: 8px 4px 8px 12px; border-bottom: 1px solid var(--line); flex: none; }
.swatch { width: 20px; height: 20px; border-radius: 10px 10px 3px 10px; box-shadow: inset 0 0 0 1px rgba(0,0,0,.12); }
.swatch[aria-pressed="true"] { outline: 2px solid var(--ink); outline-offset: 2px; }
.theme { margin-left: auto; }

.list { flex: 1 1 auto; min-height: 0; overflow: auto; }
.row { display: flex; align-items: center; padding-right: 4px; transition: background-color var(--t-fast) var(--ease); }
.row + .row { border-top: 1px solid var(--line); }
.row:hover, .row:focus-within { background: var(--hover); }
.row .open { flex: 1; min-width: 0; justify-content: flex-start; gap: 10px; padding: 8px 6px 8px 12px; text-align: left; }
.row .open:focus-visible { outline-offset: -2px; }
.num { flex: none; min-width: 18px; height: 18px; padding: 0 4px; border-radius: 9px 9px 2px 9px;
  background: var(--pokeui-color); color: #fff; font: 700 10.5px/18px var(--sans); font-variant-numeric: tabular-nums; text-align: center; }
.text { min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.row.missing .num { background: transparent; color: var(--muted); box-shadow: inset 0 0 0 1.5px var(--faint); }
.row.missing .text { color: var(--muted); text-decoration: line-through; text-decoration-color: var(--faint); }
.mini { width: 26px; height: 26px; color: var(--muted); opacity: 0; }
.mini svg { width: 15px; height: 15px; }
.row:hover .mini, .row:focus-within .mini { opacity: 1; }
.mini:hover, .mini:focus-visible { background: var(--press); color: var(--ink); }
.empty { margin: 0; padding: 14px 12px; color: var(--muted); }

.foot { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 8px;
  border-top: 1px solid var(--line); flex: none; }
.foot button { height: 30px; padding: 0 10px; font: 600 12px/1 var(--sans); letter-spacing: .01em; }
.foot button svg { width: 15px; height: 15px; }
.foot button span { font: inherit; }
.clear { color: var(--muted); }
.clear:hover { background: var(--hover); color: var(--ink); }
.copy-all { padding: 0 12px; background: var(--ink); color: var(--paper); }
.copy-all:hover { background: var(--ink-2); }
.copy-all:disabled { opacity: .3; }
.armed, .mini.armed, .clear.armed, .copy-all.failed { background: var(--danger); color: var(--on-danger); opacity: 1; }

.editor { width: 320px; padding: 10px; animation: pokeui-fade 120ms var(--ease); }
.meta { display: flex; align-items: center; gap: 8px; min-width: 0; margin-bottom: 8px; }
.sel { min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font: 400 11px/1.2 var(--mono); color: var(--muted); }
.field { position: relative; }
textarea { display: block; width: 100%; min-height: 36px; max-height: 200px; padding: 8px 32px 8px 10px; resize: none;
  field-sizing: content; overflow-y: auto; color: var(--ink); background: var(--sunken); border: 1px solid var(--line);
  border-radius: 2px; font: 400 13px/1.45 var(--sans);
  transition: border-color var(--t-fast) var(--ease), box-shadow var(--t-fast) var(--ease); }
textarea::placeholder { color: var(--faint); }
textarea:focus { outline: none; border-color: var(--edge); box-shadow: 0 0 0 3px var(--focus-soft); }
.enter-hint { position: absolute; right: 9px; bottom: 9px; display: flex; color: var(--faint); pointer-events: none; }
.enter-hint svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 1.75; stroke-linecap: round; stroke-linejoin: round; }

@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; transition: none !important; } }
`;

  const host = document.createElement('poke-ui-root');
  host.style.cssText = 'all: initial; position: fixed; inset: 0; pointer-events: none; z-index: 2147483647;';
  const shadow = host.attachShadow({ mode: 'open' });
  const markersEl = h('div');
  const highlightEl = h('div', { class: 'highlight', hidden: true });
  const panelEl = h('div', { class: 'panel', hidden: true });
  const editorEl = h('div', { class: 'editor', hidden: true });
  shadow.append(h('style', {}, CSS_TEXT), markersEl, highlightEl, panelEl, editorEl);
  document.documentElement.append(host);
  const applyColor = () => host.style.setProperty('--pokeui-color', color);
  // 'auto' lets light-dark() follow the browser's prefers-color-scheme.
  const applyTheme = () => host.style.setProperty('--pokeui-scheme', theme === 'auto' ? 'light dark' : theme);
  applyColor();
  applyTheme();

  const firstLine = (t) => t.split('\n')[0];
  const indexOf = (id) => notes.findIndex((n) => n.id === id);

  function render() {
    markersEl.replaceChildren(...notes.map((n, i) => h('button', {
      class: 'marker', 'data-id': n.id, 'aria-label': `Note ${i + 1}`,
      // A pin toggles its note; opening it also brings up the panel (annotation mode).
      onclick: () => {
        if (!editorEl.hidden && editorEl.dataset.id === n.id) return closeEditor();
        if (!active) setActive(true);
        openEditor({ id: n.id });
      },
    }, String(i + 1))));
    syncExpanded();
    position();

    panelEl.hidden = !active;
    if (!active) return;
    const copyAllBtn = iconBtn('Copy all', 'copy', { class: 'copy-all', disabled: notes.length === 0 }, 'Copy all');
    copyAllBtn.addEventListener('click', () => copy(formatAll(), copyAllBtn, true));
    const clearAllBtn = confirmBtn('Clear all', 'Confirm clear all', 'delete', async () => {
      notes = [];
      await save();
      closeEditor();
      render();
    }, { class: 'clear', disabled: notes.length === 0 }, 'Clear all');
    const colorBtn = h('button', {
      class: 'icon color', 'aria-label': 'Marker color', title: 'Marker color', 'aria-expanded': String(pickerOpen),
      onclick: () => { pickerOpen = !pickerOpen; render(); },
    }, h('span', { class: 'dot' }));
    const themeBtn = iconBtn(THEME_LABELS[theme], theme, {
      class: 'icon theme',
      onclick: async () => {
        theme = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length];
        applyTheme();
        render();
        await chrome.storage.local.set({ [THEME_KEY]: theme });
      },
    });
    const swatches = h('div', { class: 'swatches' }, ...COLORS.map(([name, value]) => h('button', {
      class: 'swatch', style: `background: ${value}`, 'aria-label': name, title: name,
      'aria-pressed': String(value === color),
      onclick: async () => {
        color = value;
        pickerOpen = false;
        applyColor();
        render();
        await chrome.storage.local.set({ [COLOR_KEY]: value });
      },
    })), themeBtn);
    const rows = notes.map((n, i) => {
      const copyBtn = iconBtn(`Copy note ${i + 1}`, 'copy', { class: 'mini' });
      copyBtn.addEventListener('click', () => copy(formatNote(n, i), copyBtn));
      return h('div', { class: 'row' + (resolve(n.selector) ? '' : ' missing') },
        h('button', { class: 'open', onclick: () => openEditor({ id: n.id }) },
          h('span', { class: 'num' }, String(i + 1)), '  ', h('span', { class: 'text' }, firstLine(n.text))),
        copyBtn,
        confirmBtn(`Delete note ${i + 1}`, `Confirm delete note ${i + 1}`, 'delete', async () => {
          notes = notes.filter((x) => x.id !== n.id);
          await save();
          if (editorEl.dataset.id === n.id) closeEditor();
          render();
        }, { class: 'mini' }));
    });
    panelEl.replaceChildren(
      h('div', { class: 'head' }, grip(),
        colorBtn, iconBtn('Done', 'close', { class: 'icon done', onclick: () => setActive(false) })),
      ...(pickerOpen ? [swatches] : []),
      h('div', { class: 'list' }, ...(rows.length ? rows : [h('p', { class: 'empty' }, 'Click any element')])),
      h('div', { class: 'foot' }, clearAllBtn, copyAllBtn),
    );
  }

  // Drag the panel by its grip. Listen on window so the page-event blocker below can't eat the release.
  let dragging = false;
  panelEl.addEventListener('pointerdown', (e) => {
    if (!e.target.classList.contains('grip')) return;
    e.preventDefault();
    const r = panelEl.getBoundingClientRect();
    const dx = e.clientX - r.left;
    const dy = e.clientY - r.top;
    Object.assign(panelEl.style, { left: r.left + 'px', top: r.top + 'px', right: 'auto', bottom: 'auto' });
    dragging = true;
    const move = (ev) => {
      if (!ev.buttons) return end();
      const p = panelEl.getBoundingClientRect();
      panelEl.style.left = Math.max(0, Math.min(ev.clientX - dx, innerWidth - p.width)) + 'px';
      panelEl.style.top = Math.max(0, Math.min(ev.clientY - dy, innerHeight - p.height)) + 'px';
    };
    const end = () => {
      dragging = false;
      removeEventListener('pointermove', move, true);
      removeEventListener('pointerup', end, true);
      removeEventListener('pointercancel', end, true);
    };
    addEventListener('pointermove', move, true);
    addEventListener('pointerup', end, true);
    addEventListener('pointercancel', end, true);
  });

  function position() {
    for (const m of markersEl.children) {
      const n = notes[indexOf(m.dataset.id)];
      const el = n && resolve(n.selector);
      m.hidden = !el;
      if (!el) continue;
      const r = el.getBoundingClientRect();
      // The tag's sharp bottom-right corner points 3px inside the element's top-left corner.
      m.style.left = Math.max(2, r.left - m.offsetWidth + 3) + 'px';
      m.style.top = Math.max(2, r.top - 19) + 'px';
    }
    if (selected) highlight(selected);
  }

  // The pin whose note is open in the editor is expanded.
  const syncExpanded = () => {
    const open = editorEl.hidden ? '' : editorEl.dataset.id;
    for (const m of markersEl.children) m.setAttribute('aria-expanded', String(!!open && m.dataset.id === open));
  };

  // Box around an element: follows the hover in annotation mode, stays on the element whose note is open.
  let selected = null;
  function highlight(el) {
    highlightEl.hidden = !el || !el.isConnected;
    if (highlightEl.hidden) return;
    highlightEl.classList.toggle('selected', el === selected);
    const r = el.getBoundingClientRect();
    Object.assign(highlightEl.style, {
      left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px',
    });
  }

  function openEditor({ id = null, target = null }) {
    const existing = id && notes[indexOf(id)];
    const anchor = target || (existing && resolve(existing.selector));

    // One line that grows as the text wraps. Enter saves (Shift+Enter adds a line break); Esc cancels via the
    // window-level keydown handler. Copy and delete live on the panel rows.
    const input = h('textarea', { rows: 1, 'aria-label': 'Note', placeholder: 'Note', autocomplete: 'off' });
    input.value = existing ? existing.text : '';
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); onSave(); }
    });

    async function onSave() {
      const text = input.value.trim();
      if (!text) return;
      const i = indexOf(id);
      if (i >= 0) notes[i] = { ...notes[i], text };
      else notes.push(makeNote(target, text));
      await save();
      closeEditor();
      render();
    }

    editorEl.dataset.id = id || '';
    const enterHint = h('span', { class: 'enter-hint', 'aria-hidden': 'true', title: 'Enter to save' });
    enterHint.innerHTML = svg('enter');
    const selector = existing ? existing.selector : target ? uniqueSelector(target) : '';
    const num = existing ? indexOf(id) + 1 : notes.length + 1;
    editorEl.replaceChildren(
      h('div', { class: 'meta' },
        h('span', { class: 'num' }, String(num)),
        h('span', { class: 'sel', title: selector }, selector.split(' > ').pop())),
      h('div', { class: 'field' }, input, enterHint));

    selected = anchor;
    highlight(selected);
    editorEl.hidden = false;
    syncExpanded();
    const r = anchor ? anchor.getBoundingClientRect() : { left: 16, top: 16, bottom: 16 };
    const { offsetWidth: w, offsetHeight: eh } = editorEl;
    editorEl.style.left = Math.max(8, Math.min(r.left, innerWidth - w - 8)) + 'px';
    editorEl.style.top = (r.bottom + 8 + eh > innerHeight ? Math.max(8, r.top - eh - 8) : r.bottom + 8) + 'px';
    input.focus();
  }

  function closeEditor() {
    editorEl.hidden = true;
    editorEl.replaceChildren();
    // Removing the focused field leaves a caret in our UI (it lands in the panel's note list); drop it.
    shadow.getSelection().removeAllRanges();
    selected = null;
    highlight(null);
    syncExpanded();
  }

  function setActive(v) {
    active = v;
    highlight(selected);
    if (!v) closeEditor();
    render();
  }

  // ---------- page interaction (annotation mode) ----------
  const isOwn = (e) => e.composedPath().includes(host);
  const swallow = (e) => {
    if (!active || dragging || isOwn(e)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
  };
  for (const type of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'dblclick']) {
    addEventListener(type, swallow, true);
  }
  addEventListener('click', (e) => {
    if (!active || isOwn(e)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    openEditor({ target: e.target });
  }, true);
  addEventListener('mousemove', (e) => {
    if (!active || selected || isOwn(e)) return;
    highlight(e.target);
  }, true);
  addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!editorEl.hidden) closeEditor();
    else if (active) setActive(false);
    else return;
    e.preventDefault();
    e.stopImmediatePropagation();
  }, true);

  let queued = false;
  const schedule = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; position(); });
  };
  addEventListener('scroll', schedule, true);
  addEventListener('resize', schedule);

  // In-page navigation (pushState/back/forward) keeps this script alive: switch to the new page's notes.
  // Page pushState calls can't be observed from this isolated world, so poll.
  setInterval(async () => {
    if (pageKey() === noteKey) return;
    closeEditor();
    notes = [];
    render();
    await load();
    render();
  }, 300);

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes[COLOR_KEY]) {
      color = knownColor(changes[COLOR_KEY].newValue);
      applyColor();
    }
    if (changes[THEME_KEY]) {
      theme = changes[THEME_KEY].newValue || THEMES[0];
      applyTheme();
    }
    const change = changes[noteKey];
    if (change) notes = change.newValue || [];
    if (change || changes[COLOR_KEY] || changes[THEME_KEY]) render();
  });

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg && msg.type === 'pokeui:toggle') {
      setActive(!active);
      sendResponse({ active });
    }
  });

  load().then(render);
})();
