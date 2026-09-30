// Copies the extension to a temp dir and grants it access to the local test server, which the
// published manifest doesn't request (it relies on activeTab from a real toolbar click).
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const SOURCE = process.env.POKEUI_EXTENSION || path.resolve(__dirname, '..');

function prepareExtension() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'poke-ui-ext-'));
  for (const name of ['manifest.json', 'background.js', 'content.js', 'icons']) {
    fs.cpSync(path.join(SOURCE, name), path.join(dir, name), { recursive: true });
  }
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  manifest.host_permissions = ['http://127.0.0.1/*'];
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  return dir;
}

module.exports = { prepareExtension };
