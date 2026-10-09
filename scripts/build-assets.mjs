// สร้างไฟล์ static ที่ต้องใช้ก่อน dev/deploy:
//   public/icons.svg      — SVG sprite จาก lucide-static (เฉพาะไอคอนที่ใช้)
//   public/vendor/fonts/  — ฟอนต์ Prompt / IBM Plex Sans Thai / IBM Plex Mono (self-host ไม่พึ่ง Google Fonts)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NM = path.join(ROOT, 'node_modules');
const PUB = path.join(ROOT, 'public');

// ---------- icons ----------
const ICONS = [
  'file-plus', 'file-pen', 'file-x', 'file-text', 'files', 'file-check', 'file-search', 'file-up', 'file-spreadsheet',
  'download', 'upload', 'log-in', 'log-out', 'bell', 'search', 'house', 'layout-dashboard', 'inbox', 'users', 'user',
  'user-plus', 'user-round', 'settings', 'check', 'x', 'circle-check', 'circle-x', 'circle-alert', 'clock', 'send',
  'chevron-right', 'chevron-down', 'chevron-left', 'plus', 'eye', 'eye-off', 'folder-open', 'folder-archive',
  'folder-input', 'hash', 'calendar', 'shield-check', 'key-round', 'triangle-alert', 'info', 'arrow-right',
  'arrow-left', 'menu', 'refresh-cw', 'stamp', 'list-checks', 'history', 'pencil', 'lock', 'archive', 'badge-check',
  'rotate-ccw', 'undo-2', 'external-link', 'mail', 'building-2', 'clipboard-list', 'sparkles', 'check-check', 'filter',
  'circle-user', 'book-open', 'trending-up',
];
const iconDir = path.join(NM, 'lucide-static', 'icons');
const symbols = ICONS.map((name) => {
  const file = path.join(iconDir, `${name}.svg`);
  if (!fs.existsSync(file)) throw new Error(`ไม่พบไอคอน ${name}`);
  const body = fs.readFileSync(file, 'utf8')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/^[\s\S]*?<svg[^>]*>/, '')
    .replace(/<\/svg>\s*$/, '')
    .replace(/\s*\n\s*/g, '');
  return `<symbol id="i-${name}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</symbol>`;
});
fs.writeFileSync(
  path.join(PUB, 'icons.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg"><!-- Lucide icons (ISC) -->${symbols.join('')}</svg>\n`,
);

// ---------- fonts ----------
const FONTS = {
  'ibm-plex-sans-thai': ['400', '500', '600'],
  prompt: ['500', '600'],
  'ibm-plex-mono': ['500', '600'],
};
let copied = 0;
for (const [family, weights] of Object.entries(FONTS)) {
  const src = path.join(NM, '@fontsource', family);
  const dest = path.join(PUB, 'vendor', 'fonts', family);
  fs.mkdirSync(path.join(dest, 'files'), { recursive: true });
  for (const w of weights) {
    const css = fs.readFileSync(path.join(src, `${w}.css`), 'utf8');
    fs.writeFileSync(path.join(dest, `${w}.css`), css);
    for (const [, rel] of css.matchAll(/url\(\.\/(files\/[^)]+)\)/g)) {
      fs.copyFileSync(path.join(src, rel), path.join(dest, rel));
      copied++;
    }
  }
}
console.log(`[build] icons.svg (${ICONS.length} icons) + ${copied} font files → public/`);
