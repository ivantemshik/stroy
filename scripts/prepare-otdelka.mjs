// Сгенерированные в Codex кадры: блоки и первый экран «Отделки», фото окон услуг, заглушка фото команды для «О компании».
// Исходники: design/sources/otdelka/<имя>.webp (или .png). Результат: public/images/otdelka/*.webp.
// Каких исходников нет, те пропускаются. Промпты: design/otdelka-photo-prompts.md, design/about-team-prompt.md
import sharp from 'sharp';
import {existsSync} from 'node:fs';
import {mkdir} from 'node:fs/promises';

const source = 'design/sources/otdelka';
const out = 'public/images/otdelka';
await mkdir(out, {recursive: true});

// [ширина, высота, суффикс]: по умолчанию суффикс это ширина, «thumb» это миниатюра 112×112 для списка разделов
const sizes = {
  gostinaya: [[1536, 1024], [1100, 733], [800, 533]],
  materialy: [[1200, 800], [800, 533]],
  chernovaya: [[1200, 800], [112, 112, 'thumb']],
  inzheneriya: [[1200, 800], [112, 112, 'thumb']],
  chistovaya: [[1200, 800], [112, 112, 'thumb']],
  mebel: [[1200, 800], [112, 112, 'thumb']],
  nadzor: [[1200, 800], [112, 112, 'thumb']],
  korobka: [[1024, 1536], [640, 960]]
};
// Заглушка фото команды для «О компании» на главной: свой исходник и своя папка, подпись на сайте «Иллюстрация»
const jobs = [
  ...Object.entries(sizes).map(([name, list]) => ({name, list, from: `${source}/${name}`, to: `${out}/${name}`})),
  {name: 'about-team-placeholder', list: [[1400, 933], [800, 533]], from: 'design/sources/about/about-team-placeholder', to: 'public/images/about/about-team-placeholder'},
  // Вертикальный кадр первого экрана «Отделки» для телефона
  {name: 'hero-mobile', list: [[800, 1200], [560, 840]], from: `${source}/hero-mobile`, to: `${out}/hero-mobile`},
  // Квадратные фото окон услуг (src/site/services.js)
  ...['build', 'works', 'finishing', 'engineering', 'landscape', 'lighting', 'furniture', 'design'].map(key => ({
    name: `service-${key}`, list: [[800, 800], [480, 480]], from: `design/sources/services/service-${key}`, to: `public/images/services/service-${key}`
  }))
];
await mkdir('public/images/about', {recursive: true});
await mkdir('public/images/services', {recursive: true});

let done = 0;
for (const {list, from, to} of jobs) {
  const file = ['webp', 'png'].map(ext => `${from}.${ext}`).find(existsSync);
  if (!file) continue;
  for (const [width, height, suffix] of list) {
    const target = `${to}-${suffix || width}.webp`;
    await sharp(file).resize(width, height, {fit: 'cover', position: suffix === 'thumb' ? 'attention' : 'centre'}).webp({quality: suffix === 'thumb' ? 80 : 82}).toFile(target);
    console.log(target);
    done += 1;
  }
}
console.log(done ? `Готово: ${done} файлов` : 'Исходников нет.');
