// Сгенерированные кадры для страницы «Отделка» (по желанию, вместо части реальных фото).
// Исходники: design/sources/otdelka/<имя>.png. Результат: public/images/otdelka/*.webp.
// Каких исходников нет, те пропускаются. Промпты и порядок замены: design/otdelka-photo-prompts.md
import sharp from 'sharp';
import {existsSync} from 'node:fs';
import {mkdir} from 'node:fs/promises';

const source = 'design/sources/otdelka';
const out = 'public/images/otdelka';
await mkdir(out, {recursive: true});

const sizes = {
  gostinaya: [[1600, 1200], [800, 1000, 'mobile']],
  materialy: [[1000, 780]],
  chernovaya: [[1400, 1040], [112, 112, 'thumb']],
  inzheneriya: [[1400, 1040], [112, 112, 'thumb']],
  chistovaya: [[1400, 1040], [112, 112, 'thumb']],
  mebel: [[1400, 1040], [112, 112, 'thumb']],
  nadzor: [[1400, 1040], [112, 112, 'thumb']],
  korobka: [[1200, 1600]]
};

let done = 0;
for (const [name, list] of Object.entries(sizes)) {
  const file = `${source}/${name}.png`;
  if (!existsSync(file)) continue;
  for (const [width, height, suffix] of list) {
    const target = `${out}/${name}-${suffix || width}.webp`;
    await sharp(file).resize(width, height, {fit: 'cover', position: 'attention'}).webp({quality: 84}).toFile(target);
    console.log(target);
    done += 1;
  }
}
console.log(done ? `Готово: ${done} файлов` : `В ${source} нет исходников, сайт использует реальные фото объектов.`);
