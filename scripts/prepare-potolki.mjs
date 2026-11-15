// Сгенерированные в ChatGPT кадры страницы «Натяжные потолки и стены».
// Исходники: design/sources/potolki/<имя>.webp (или .png). Результат: public/images/potolki/*.webp.
// Промпты: design/potolki-photo-prompts.md. Каких исходников нет, те пропускаются.
import sharp from 'sharp';
import {existsSync} from 'node:fs';
import {mkdir} from 'node:fs/promises';

const source = 'design/sources/potolki';
const out = 'public/images/potolki';
await mkdir(out, {recursive: true});

// [ширина, высота]: файл называется <имя>-<ширина>.webp
const sizes = {
  hero: [[1536, 1024], [1100, 733]],
  'hero-mobile': [[800, 1200], [560, 840]],
  matovyy: [[800, 600], [480, 360]],
  paryashchiy: [[800, 600], [480, 360]],
  linii: [[800, 600], [480, 360]],
  tkanevyy: [[800, 600], [480, 360]],
  stena: [[1100, 733], [800, 533]],
  faq: [[800, 1200], [640, 960]]
};

let done = 0;
for (const [name, list] of Object.entries(sizes)) {
  const file = ['webp', 'png'].map(ext => `${source}/${name}.${ext}`).find(existsSync);
  if (!file) continue;
  for (const [width, height] of list) {
    const target = `${out}/${name}-${width}.webp`;
    await sharp(file).resize(width, height, {fit: 'cover', position: 'centre'}).webp({quality: 82}).toFile(target);
    console.log(target);
    done += 1;
  }
}
console.log(done ? `Готово: ${done} файлов` : 'Исходников нет.');
