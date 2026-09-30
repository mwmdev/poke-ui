// The overlay shared by store/shoot.mjs and store/record.mjs: a cursor, a click ring and the caption label.
// Pass it to context.addInitScript(installOverlay): it runs in every page before the page's own scripts, so it must stay
// self-contained (Playwright serializes the function's source).
//
// In the page:
// - window.__caption(html, n): shows the caption label; `n` is the optional mono numeral ("01"). Changing a visible
//   caption fades it out, swaps the text and fades it back in. __caption(null) fades it out.
// - window.__cursorTo(x, y, ms): glides the drawn cursor to (x, y) over `ms`. It survives navigations (sessionStorage).
//   Screenshots never call it, so they show no cursor.
// - Every mousedown draws a click ring at the pointer.
// The cursor glides on its own (CSS transition) while the real mouse jumps once on arrival: gliding the real mouse across
// the page would make the extension's hover highlight cover whatever is under the path.
export function installOverlay() {
  const mono = 'ui-monospace, "SF Mono", "Cascadia Mono", "Segoe UI Mono", Menlo, Consolas, "DejaVu Sans Mono", "Liberation Mono", monospace';
  const serif = '"Iowan Old Style", "Palatino Linotype", Palatino, "TeX Gyre Pagella", "URW Palladio L", "Book Antiqua", Georgia, serif';
  const css = `
    .cursor { position: absolute; left: 0; top: 0; opacity: 0; filter: drop-shadow(0 1px 2px rgba(26,20,14,.35));
      transition: transform var(--ms, 0ms) cubic-bezier(.45, 0, .2, 1); }
    .ring { position: absolute; width: 14px; height: 14px; margin: -7px 0 0 -7px; box-sizing: border-box;
      border: 2px solid #b4432a; border-radius: 50%; animation: ring 480ms cubic-bezier(.2, 0, 0, 1) forwards; }
    @keyframes ring { to { transform: scale(3.2); opacity: 0; } }
    .caption { position: absolute; left: 32px; bottom: 32px; display: flex; align-items: baseline; gap: 14px;
      padding: 13px 20px 15px 18px; background: #f7f2e8; color: #2a241e; border: 1px solid #2a241e; border-radius: 2px;
      box-shadow: 0 1px 2px rgba(26,20,14,.16), 0 14px 34px -12px rgba(26,20,14,.42); white-space: nowrap;
      opacity: 0; transform: translateY(6px); transition: opacity 240ms ease, transform 240ms ease; }
    .caption.on { opacity: 1; transform: none; }
    .caption.out { opacity: 0; transform: none; transition: opacity 160ms ease; }
    .n { font: 500 13px/1 ${mono}; color: #6b6156; letter-spacing: .04em; }
    .n:empty { display: none; }
    .t { font: 700 26px/1.1 ${serif}; letter-spacing: -.01em; }
    .t img { display: inline-block; width: 24px; height: 24px; margin: 0 3px; vertical-align: -3px; }`;
  let shadow;
  const place = (x, y, ms) => {
    const cursor = shadow?.querySelector('.cursor');
    if (!cursor) return;
    cursor.style.setProperty('--ms', ms + 'ms');
    cursor.style.opacity = '1';
    // The arrow's tip sits at (5, 3) of the 24-unit path, drawn at 26 px.
    cursor.style.transform = `translate(${x - 5.4}px, ${y - 3.25}px)`;
  };
  window.__cursorTo = (x, y, ms) => {
    sessionStorage.setItem('demo-cursor', JSON.stringify([x, y]));
    place(x, y, ms);
  };
  addEventListener('mousedown', (e) => {
    const ring = document.createElement('div');
    ring.className = 'ring';
    ring.style.left = e.clientX + 'px';
    ring.style.top = e.clientY + 'px';
    ring.addEventListener('animationend', () => ring.remove());
    shadow?.append(ring);
  }, true);
  document.addEventListener('DOMContentLoaded', () => {
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647';
    shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `<style>${css}</style>
      <div class="caption"><span class="n"></span><span class="t"></span></div>
      <svg class="cursor" width="26" height="26" viewBox="0 0 24 24">
        <path d="M5 3l14 7.5-6 1.8-2.4 6.2z" fill="#2a241e" stroke="#f7f2e8" stroke-width="1.5" stroke-linejoin="round"/>
      </svg>`;
    document.documentElement.append(host);
    const saved = sessionStorage.getItem('demo-cursor');
    if (saved) place(...JSON.parse(saved), 0);
  });
  let swap;
  window.__caption = (html, n = '') => {
    const caption = shadow.querySelector('.caption');
    const set = () => {
      caption.querySelector('.n').textContent = n;
      caption.querySelector('.t').innerHTML = html;
    };
    clearTimeout(swap);
    if (!html) {
      if (caption.classList.contains('on')) caption.classList.replace('on', 'out');
      swap = setTimeout(() => caption.classList.remove('out'), 160);
    } else if (caption.classList.contains('on')) {
      caption.classList.replace('on', 'out');
      swap = setTimeout(() => {
        set();
        caption.classList.replace('out', 'on');
      }, 160);
    } else {
      set();
      caption.classList.remove('out');
      caption.classList.add('on');
    }
  };
}
