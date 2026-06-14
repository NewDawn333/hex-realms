'use strict';

// Copy web assets into www/ for Capacitor (fully offline in the APK).
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const WWW = path.join(ROOT, 'www');

const COPY = [
  'index.html',
  'manifest.json',
  'icon.svg',
  'sw.js',
  'css',
  'js/constants.js',
  'js/hex.js',
  'js/sprites.js',
  'js/audio.js',
  'js/mapgen.js',
  'js/realmaps.js',
  'js/game.js',
  'js/renderer.js',
  'js/ai.js',
  'js/main.js',
  'js/haptics.js',
  'js/save.js',
];

function rm(dir) {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

function cp(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const name of fs.readdirSync(src)) {
      cp(path.join(src, name), path.join(dest, name));
    }
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

rm(WWW);
fs.mkdirSync(WWW, { recursive: true });

for (const item of COPY) {
  const src = path.join(ROOT, item);
  if (!fs.existsSync(src)) {
    console.warn('skip missing:', item);
    continue;
  }
  cp(src, path.join(WWW, item));
}

// Bundle Capacitor haptics bridge for the native Android shell.
execSync(
  'npx esbuild js/native-bridge.js --bundle --format=iife --global-name=HexNative --outfile=www/js/native.js --minify',
  { cwd: ROOT, stdio: 'inherit' },
);

// Patch index.html in www: load native bridge + skip SW inside Capacitor.
let html = fs.readFileSync(path.join(WWW, 'index.html'), 'utf8');
if (!html.includes('js/native.js')) {
  html = html.replace(
    '<script src="js/main.js"></script>',
    '<script src="js/native.js"></script>\n  <script src="js/main.js"></script>',
  );
}
html = html.replace(
  "navigator.serviceWorker.register('sw.js')",
  "if (!window.Capacitor?.isNativePlatform?.()) navigator.serviceWorker.register('sw.js')",
);
fs.writeFileSync(path.join(WWW, 'index.html'), html);

console.log('Built www/ for Capacitor');
