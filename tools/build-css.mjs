// Concatenates the stylesheets linked from index.html into one file, in the exact order the page lists them.
//
// Eighteen render-blocking <link> tags cost ~4.4s of cumulative delay on Slow 4G, so the page ships a single
// `app.css`. The sources stay split by area (post.css, forum.css, ...) because that is what people edit; run this
// after any change:  node tools/build-css.mjs
//
// `fonts.css` is not included: theme.js appends it only when the reader picks a downloadable family. Settings and
// sticker styles are also left out — index.html defers them because only /cai-dat-tuivoz needs them.

import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CSS_DIR = join(ROOT, 'public', 'assets', 'css');
const OUT = join(CSS_DIR, 'app.css');

// The concatenation must follow the page's own order, otherwise cascade order changes.
const ORDER = [
  'base.css',
  'font-default.css',
  'theme.css',
  'layout.css',
  'forum.css',
  'avatar.css',
  'post.css',
  'media.css',
  'reaction.css',
  'forms.css',
  'editor.css',
  'account.css',
  'misc.css',
  'responsive.css',
  'headerMenus.css',
  'home.css',
];

// Files that must never end up in the bundle.
const EXCLUDED = new Set(['fonts.css', 'settings.css', 'stickers.css']);

async function checkOrder() {
  const html = await readFile(join(ROOT, 'public', 'index.html'), 'utf8');
  // Only the plain `rel="stylesheet"` links count: the deferred pair carries media="print" and is skipped here.
  const linked = [...html.matchAll(/<link rel="stylesheet" href="\/assets\/css\/([^"]+)">/g)].map((m) => m[1]);
  const bundled = linked.filter((name) => !EXCLUDED.has(name));
  if (bundled.includes('app.css')) {
    // The page has already switched to the bundle; nothing left to verify against.
    if (bundled.length === 1) return;
    throw new Error(`index.html links app.css alongside ${bundled.filter((n) => n !== 'app.css').join(', ')}`);
  }
  const unexpected = bundled.filter((name) => !ORDER.includes(name));
  if (unexpected.length) throw new Error(`index.html links stylesheets missing from ORDER: ${unexpected.join(', ')}`);
  for (const name of ORDER) {
    if (!bundled.includes(name)) throw new Error(`index.html no longer links ${name}; update ORDER or the page`);
  }
}

async function build() {
  await checkOrder();
  const parts = ['/* Built by tools/build-css.mjs — edit the sources in this folder, then run the script. */'];
  for (const name of ORDER) {
    const css = await readFile(join(CSS_DIR, name), 'utf8');
    // The banner keeps a rule traceable to its source file without a sourcemap.
    parts.push(`\n/* ==== ${name} ==== */\n${css.trim()}\n`);
  }
  const out = parts.join('');
  await writeFile(OUT, out, 'utf8');
  const kb = (Buffer.byteLength(out) / 1024).toFixed(1);
  console.log(`app.css ← ${ORDER.length} files, ${kb} KiB`);
}

await build();
