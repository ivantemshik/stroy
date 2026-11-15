// Миниатюры для ленты в окне просмотра фото объекта: <id>-thumb.webp, 320 px по ширине.
// Берём самый крупный вариант каждого фото из manifest.json. Уже готовые миниатюры не трогаем.
// Запуск: node scripts/prepare-thumbs.mjs
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const dir = path.resolve('public/images/objects');
const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
let made = 0;
for (const [id, info] of Object.entries(manifest)) {
  const out = path.join(dir, `${id}-thumb.webp`);
  if (fs.existsSync(out)) continue;
  const source = path.join(dir, `${id}-${Math.max(...info.widths)}.webp`);
  if (!fs.existsSync(source)) { console.warn(`нет исходника: ${source}`); continue; }
  await sharp(source).resize({width: 320, withoutEnlargement: true}).webp({quality: 72}).toFile(out);
  made++;
}
console.log(`миниатюр создано: ${made}`);
