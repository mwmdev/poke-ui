(() => {
  if (window.__pokeui) return;
  window.__pokeui = true;

  const SNIPPET_MAX = 400;
  const STYLE_PROPS = [
    'color', 'background-color', 'font-family', 'font-size', 'font-weight', 'line-height',
    'margin', 'padding', 'border', 'border-radius', 'display', 'position', 'width', 'height',
  ];

  // Each color needs toolbar icons: add it to icons/build.sh too.
  const COLORS = [
    ['Red', '#e5484d'], ['Orange', '#f76b15'], ['Green', '#30a46c'], ['Blue', '#0090ff'], ['Purple', '#8e4ec6'],
  ];
  const COLOR_KEY = 'markerColor'; // global: applies to the markers on every page

  let notes = [];
  let active = false;
  let color = COLORS[0][1];
  let pickerOpen = false;

  const pageKey = () => 'notes:' + location.href.split('#')[0];

  // ---------- storage ----------
  async function load() {
    const key = pageKey();
    const stored = await chrome.storage.local.get([key, COLOR_KEY]);
    notes = stored[key] || [];
    color = stored[COLOR_KEY] || COLORS[0][1];
    applyColor();
  }
  const save = () => chrome.storage.local.set({ [pageKey()]: notes });

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

  async function copy(text, btn) {
    const label = btn.title;
    try {
      await navigator.clipboard.writeText(text);
      setIcon(btn, 'save', 'Copied');
    } catch {
      setIcon(btn, 'close', 'Failed');
    }
    setTimeout(() => setIcon(btn, 'copy', label), 1200);
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
  };
  function setIcon(btn, icon, label) {
    btn.innerHTML = `<svg viewBox="0 0 24 24"><path d="${ICONS[icon]}"/></svg>`;
    btn.setAttribute('aria-label', label);
    btn.title = label;
  }
  const grip = () => {
    const g = h('span', { class: 'grip', 'aria-label': 'Move', title: 'Move' });
    g.innerHTML = '<svg viewBox="0 0 24 24">'
      + [6, 12, 18].map((y) => `<circle cx="9" cy="${y}" r="1.8"/><circle cx="15" cy="${y}" r="1.8"/>`).join('')
      + '</svg>';
    return g;
  };
  function iconBtn(label, icon, attrs = {}) {
    const b = h('button', attrs);
    setIcon(b, icon, label);
    return b;
  }

  const CSS_TEXT = `
    [hidden] { display: none !important; }
    * { box-sizing: border-box; font: 13px/1.4 system-ui, sans-serif; }
    .marker { position: fixed; width: 20px; height: 20px; padding: 0; border: 2px solid #fff; border-radius: 50%;
      background: var(--pokeui-color); color: #fff; font-weight: 700; font-size: 11px; cursor: pointer; pointer-events: auto; }
    .highlight { position: fixed; border: 2px solid #3b82f6; background: rgba(59,130,246,.15); pointer-events: none; }
    .panel, .editor { position: fixed; background: #1c1c1f; color: #f4f4f5; border-radius: 8px; pointer-events: auto;
      box-shadow: 0 8px 24px rgba(0,0,0,.35); }
    .panel { right: 16px; top: 16px; width: 260px; max-height: 50vh; overflow: auto; padding: 8px; }
    .bar { display: flex; gap: 6px; }
    .panel .bar { align-items: center; }
    .panel > * + * { margin-top: 6px; }
    .done { margin-left: auto; }
    .grip { display: flex; align-items: center; height: 24px; cursor: grab; user-select: none; touch-action: none; }
    .grip svg { width: 16px; height: 16px; fill: currentColor; pointer-events: none; }
    .dot { width: 16px; height: 16px; border-radius: 50%; border: 2px solid #fff; background: var(--pokeui-color); }
    .swatches { display: flex; gap: 8px; padding: 2px 4px; }
    .swatch { width: 24px; height: 24px; padding: 0; border-radius: 50%; border: 2px solid transparent; }
    .swatch[aria-pressed="true"] { border-color: #fff; }
    button { display: inline-flex; align-items: center; justify-content: center; color: inherit; background: #3f3f46;
      border: 0; border-radius: 6px; padding: 4px 8px; cursor: pointer; }
    button svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 2;
      stroke-linecap: round; stroke-linejoin: round; pointer-events: none; }
    button:disabled { opacity: .4; cursor: default; }
    .row { display: flex; align-items: center; gap: 2px; padding-right: 4px; background: #27272a; border-radius: 6px; }
    .row .open { flex: 1; min-width: 0; display: block; text-align: left; background: none;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .row.missing .open { opacity: .5; text-decoration: line-through; }
    .row .mini { padding: 4px; background: none; opacity: 0; }
    .row:hover .mini, .row:focus-within .mini { opacity: 1; }
    .row .mini:hover, .row .mini:focus-visible { background: #3f3f46; }
    .editor { width: 280px; padding: 8px; }
    .editor .field { position: relative; }
    .editor input { display: block; width: 100%; padding: 6px 30px 6px 8px;
      color: inherit; background: #27272a; border: 1px solid #52525b; border-radius: 6px; }
    .enter-hint { position: absolute; right: 8px; top: 50%; transform: translateY(-50%); display: flex;
      color: #71717a; pointer-events: none; }
    .enter-hint svg { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 2;
      stroke-linecap: round; stroke-linejoin: round; }
    .armed { background: #b42318; }
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
  applyColor();

  const firstLine = (t) => t.split('\n')[0];
  const indexOf = (id) => notes.findIndex((n) => n.id === id);

  function render() {
    markersEl.replaceChildren(...notes.map((n, i) => h('button', {
      class: 'marker', 'data-id': n.id, 'aria-label': `Note ${i + 1}`, onclick: () => openEditor({ id: n.id }),
    }, String(i + 1))));
    position();

    panelEl.hidden = !active;
    if (!active) return;
    const copyAllBtn = iconBtn('Copy all', 'copy', { disabled: notes.length === 0 });
    copyAllBtn.addEventListener('click', () => copy(formatAll(), copyAllBtn));
    const clearAllBtn = iconBtn('Clear all', 'delete', { disabled: notes.length === 0 });
    let armTimer;
    clearAllBtn.addEventListener('click', async () => {
      if (!clearAllBtn.classList.contains('armed')) {
        clearAllBtn.classList.add('armed');
        setIcon(clearAllBtn, 'delete', 'Confirm clear all');
        armTimer = setTimeout(() => {
          clearAllBtn.classList.remove('armed');
          setIcon(clearAllBtn, 'delete', 'Clear all');
        }, 3000);
        return;
      }
      clearTimeout(armTimer);
      notes = [];
      await save();
      closeEditor();
      render();
    });
    const colorBtn = h('button', {
      class: 'color', 'aria-label': 'Marker color', title: 'Marker color', 'aria-expanded': String(pickerOpen),
      onclick: () => { pickerOpen = !pickerOpen; render(); },
    }, h('span', { class: 'dot' }));
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
    })));
    panelEl.replaceChildren(
      h('div', { class: 'bar' }, grip(),
        colorBtn, copyAllBtn, clearAllBtn, iconBtn('Done', 'close', { class: 'done', onclick: () => setActive(false) })),
      ...(pickerOpen ? [swatches] : []),
      ...notes.map((n, i) => {
        const copyBtn = iconBtn(`Copy note ${i + 1}`, 'copy', { class: 'mini' });
        copyBtn.addEventListener('click', () => copy(formatNote(n, i), copyBtn));
        return h('div', { class: 'row' + (resolve(n.selector) ? '' : ' missing') },
          h('button', { class: 'open', onclick: () => openEditor({ id: n.id }) }, `${i + 1}  ${firstLine(n.text)}`),
          copyBtn,
          iconBtn(`Delete note ${i + 1}`, 'delete', {
            class: 'mini',
            onclick: async () => {
              notes = notes.filter((x) => x.id !== n.id);
              await save();
              if (editorEl.dataset.id === n.id) closeEditor();
              render();
            },
          }));
      }),
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
      m.style.left = Math.max(0, r.left - 10) + 'px';
      m.style.top = Math.max(0, r.top - 10) + 'px';
    }
    if (selected) highlight(selected);
  }

  // Blue box around an element: follows the hover in annotation mode, stays on the element whose note is open.
  let selected = null;
  function highlight(el) {
    highlightEl.hidden = !el || !el.isConnected;
    if (highlightEl.hidden) return;
    const r = el.getBoundingClientRect();
    Object.assign(highlightEl.style, {
      left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px',
    });
  }

  function openEditor({ id = null, target = null }) {
    const existing = id && notes[indexOf(id)];
    const anchor = target || (existing && resolve(existing.selector));

    // Enter saves; Esc cancels via the window-level keydown handler. Copy and delete live on the panel rows.
    const input = h('input', { type: 'text', 'aria-label': 'Note', placeholder: 'Note', autocomplete: 'off' });
    input.value = existing ? existing.text : '';
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); onSave(); }
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
    enterHint.innerHTML = '<svg viewBox="0 0 24 24"><path d="M9 10l-5 5 5 5M20 4v7a4 4 0 0 1-4 4H4"/></svg>';
    editorEl.replaceChildren(h('div', { class: 'field' }, input, enterHint));

    selected = anchor;
    highlight(selected);
    editorEl.hidden = false;
    const r = anchor ? anchor.getBoundingClientRect() : { left: 16, top: 16, bottom: 16 };
    const { offsetWidth: w, offsetHeight: eh } = editorEl;
    editorEl.style.left = Math.max(8, Math.min(r.left, innerWidth - w - 8)) + 'px';
    editorEl.style.top = (r.bottom + 8 + eh > innerHeight ? Math.max(8, r.top - eh - 8) : r.bottom + 8) + 'px';
    input.focus();
  }

  function closeEditor() {
    editorEl.hidden = true;
    editorEl.replaceChildren();
    selected = null;
    highlight(null);
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

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes[COLOR_KEY]) {
      color = changes[COLOR_KEY].newValue || COLORS[0][1];
      applyColor();
    }
    const change = changes[pageKey()];
    if (change) notes = change.newValue || [];
    if (change || changes[COLOR_KEY]) render();
  });

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg && msg.type === 'pokeui:toggle') {
      setActive(!active);
      sendResponse({ active });
    }
  });

  load().then(render);
})();
