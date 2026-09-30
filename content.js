(() => {
  if (window.__anot) return;
  window.__anot = true;

  const SNIPPET_MAX = 400;
  const STYLE_PROPS = [
    'color', 'background-color', 'font-family', 'font-size', 'font-weight', 'line-height',
    'margin', 'padding', 'border', 'border-radius', 'display', 'position', 'width', 'height',
  ];

  let notes = [];
  let active = false;

  const pageKey = () => 'notes:' + location.href.split('#')[0];

  // ---------- storage ----------
  async function load() {
    const key = pageKey();
    notes = (await chrome.storage.local.get(key))[key] || [];
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
  function iconBtn(label, icon, attrs = {}) {
    const b = h('button', attrs);
    setIcon(b, icon, label);
    return b;
  }

  const CSS_TEXT = `
    [hidden] { display: none !important; }
    * { box-sizing: border-box; font: 13px/1.4 system-ui, sans-serif; }
    .marker { position: fixed; width: 20px; height: 20px; padding: 0; border: 2px solid #fff; border-radius: 50%;
      background: #e5484d; color: #fff; font-weight: 700; font-size: 11px; cursor: pointer; pointer-events: auto; }
    .highlight { position: fixed; border: 2px solid #3b82f6; background: rgba(59,130,246,.15); pointer-events: none; }
    .panel, .editor { position: fixed; background: #1c1c1f; color: #f4f4f5; border-radius: 8px; pointer-events: auto;
      box-shadow: 0 8px 24px rgba(0,0,0,.35); }
    .panel { right: 16px; bottom: 16px; width: 260px; max-height: 50vh; overflow: auto; padding: 8px; }
    .bar, .actions { display: flex; gap: 6px; }
    .panel .bar { margin-bottom: 6px; align-items: center; }
    .grip { cursor: grab; padding: 0 4px; user-select: none; touch-action: none; }
    button { display: inline-flex; align-items: center; justify-content: center; color: inherit; background: #3f3f46;
      border: 0; border-radius: 6px; padding: 4px 8px; cursor: pointer; }
    button svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 2;
      stroke-linecap: round; stroke-linejoin: round; pointer-events: none; }
    button:disabled { opacity: .4; cursor: default; }
    .row { display: block; width: 100%; margin-top: 4px; text-align: left; background: #27272a;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .row.missing { opacity: .5; text-decoration: line-through; }
    .editor { width: 280px; padding: 8px; }
    .editor textarea { display: block; width: 100%; height: 72px; margin-bottom: 6px; resize: vertical; padding: 6px;
      color: inherit; background: #27272a; border: 1px solid #52525b; border-radius: 6px; }
    .editor .save { background: #3b82f6; }
    .editor .delete { margin-left: auto; background: #b42318; }
  `;

  const host = document.createElement('anot-root');
  host.style.cssText = 'all: initial; position: fixed; inset: 0; pointer-events: none; z-index: 2147483647;';
  const shadow = host.attachShadow({ mode: 'open' });
  const markersEl = h('div');
  const highlightEl = h('div', { class: 'highlight', hidden: true });
  const panelEl = h('div', { class: 'panel', hidden: true });
  const editorEl = h('div', { class: 'editor', hidden: true });
  shadow.append(h('style', {}, CSS_TEXT), markersEl, highlightEl, panelEl, editorEl);
  document.documentElement.append(host);

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
    panelEl.replaceChildren(
      h('div', { class: 'bar' }, h('span', { class: 'grip', 'aria-label': 'Move', title: 'Move' }, '⠿'),
        copyAllBtn, iconBtn('Done', 'close', { onclick: () => setActive(false) })),
      ...notes.map((n, i) => h('button', {
        class: 'row' + (resolve(n.selector) ? '' : ' missing'), onclick: () => openEditor({ id: n.id }),
      }, `${i + 1}  ${firstLine(n.text)}`)),
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
  }

  function openEditor({ id = null, target = null }) {
    const existing = id && notes[indexOf(id)];
    const anchor = target || (existing && resolve(existing.selector));

    const ta = h('textarea', { 'aria-label': 'Note', placeholder: 'Note' });
    ta.value = existing ? existing.text : '';
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); onSave(); }
    });

    async function onSave() {
      const text = ta.value.trim();
      if (!text) return;
      const i = indexOf(id);
      if (i >= 0) notes[i] = { ...notes[i], text };
      else notes.push(makeNote(target, text));
      await save();
      closeEditor();
      render();
    }

    const copyBtn = iconBtn('Copy', 'copy');
    copyBtn.addEventListener('click', () => copy(formatNote(notes[indexOf(id)], indexOf(id)), copyBtn));

    editorEl.replaceChildren(ta, h('div', { class: 'actions' },
      iconBtn('Save', 'save', { class: 'save', onclick: onSave }),
      existing && copyBtn,
      iconBtn('Cancel', 'close', { onclick: closeEditor }),
      existing && iconBtn('Delete', 'delete', {
        class: 'delete',
        onclick: async () => {
          notes = notes.filter((n) => n.id !== id);
          await save();
          closeEditor();
          render();
        },
      }),
    ));

    const r = anchor ? anchor.getBoundingClientRect() : { left: 16, top: 16, bottom: 16 };
    const w = 280;
    editorEl.style.left = Math.max(8, Math.min(r.left, innerWidth - w - 8)) + 'px';
    editorEl.style.top = (r.bottom + 8 + 150 > innerHeight ? Math.max(8, r.top - 158) : r.bottom + 8) + 'px';
    editorEl.hidden = false;
    ta.focus();
  }

  function closeEditor() {
    editorEl.hidden = true;
    editorEl.replaceChildren();
  }

  function setActive(v) {
    active = v;
    highlightEl.hidden = true;
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
    if (!active || isOwn(e)) return;
    const r = e.target.getBoundingClientRect();
    Object.assign(highlightEl.style, {
      left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px',
    });
    highlightEl.hidden = false;
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
    const change = area === 'local' && changes[pageKey()];
    if (!change) return;
    notes = change.newValue || [];
    render();
  });

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg && msg.type === 'anot:toggle') {
      setActive(!active);
      sendResponse({ active });
    }
  });

  load().then(render);
})();
