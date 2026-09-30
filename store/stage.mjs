// Shared setup for store/shoot.mjs and store/record.mjs: serves the store scenes and launches headless Chromium with the
// real extension loaded. The scenes are served as http://glasshouse.example (mapped to a local server), so the copied
// markdown shows the demo shop's URL instead of 127.0.0.1 and a random port.
import { chromium } from '@playwright/test';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { prepareExtension } = createRequire(import.meta.url)('../tests/extension-dir.js');

export const root = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
export const HOST = 'http://glasshouse.example';

const routes = {
  '/subscriptions': ['store/demo.html', 'text/html'],
  '/paste': ['store/paste.html', 'text/html'],
  '/promo': ['store/promo.html', 'text/html'],
  '/card': ['store/card.html', 'text/html'],
  '/icons/logo.svg': ['icons/logo.svg', 'image/svg+xml'],
  '/icons/toolbar/b4432a-32.png': ['icons/toolbar/b4432a-32.png', 'image/png'],
};

// Returns the persistent context, `toggle()` (the toolbar icon's code path) and `close()`.
export async function openStage(contextOptions = {}) {
  const server = http.createServer((req, res) => {
    const route = routes[new URL(req.url, 'http://x').pathname];
    if (!route) {
      res.statusCode = 404;
      res.end();
      return;
    }
    res.setHeader('content-type', route[1]);
    res.end(fs.readFileSync(path.join(root, route[0])));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  const extension = prepareExtension();
  // prepareExtension grants the extension 127.0.0.1 (the tests' server); the scenes live on HOST.
  const manifestPath = path.join(extension, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifest.host_permissions = [`${HOST}/*`];
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'poke-ui-stage-'));
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
    args: [
      `--disable-extensions-except=${extension}`,
      `--load-extension=${extension}`,
      `--host-resolver-rules=MAP ${new URL(HOST).hostname} 127.0.0.1:${server.address().port}`,
      // The clipboard API needs a secure context, which 127.0.0.1 is and a plain-http hostname is not.
      `--unsafely-treat-insecure-origin-as-secure=${HOST}`,
    ],
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    ...contextOptions,
  });
  const close = async () => {
    await context.close();
    server.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
    fs.rmSync(extension, { recursive: true, force: true });
  };

  try {
    let [worker] = context.serviceWorkers();
    worker ||= await context.waitForEvent('serviceworker');
    // Playwright switches off every permission that isn't listed; Chromium itself allows the copy by default.
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: HOST });
    const toggle = () => worker.evaluate(async () => {
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      await toggleTab(tab);
    });
    return { context, worker, toggle, close };
  } catch (error) {
    await close();
    throw error;
  }
}
