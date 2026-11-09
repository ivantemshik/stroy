// Изображения страницы «Проектирование домов» (/proektirovanie/).
// Источники — photos/ и design/planning.svg. Результат — public/images/proektirovanie/*.webp
import sharp from 'sharp';
import {mkdir, readFile} from 'node:fs/promises';

const out = 'public/images/proektirovanie';
await mkdir(out, {recursive: true});

const photo = (source, name, width, height, position = 'centre') =>
  sharp(`photos/${source}`).resize(width, height, {fit: 'cover', position}).webp({quality: 84}).toFile(`${out}/${name}.webp`);

// Лист с планом: тот же чертеж, что на главной, но без фона — он лежит на «небе» первого экрана.
const planSvg = (await readFile('design/planning.svg', 'utf8')).replace('<rect width="700" height="850" fill="#e9ebe3"/>', '');
await sharp(Buffer.from(planSvg), {density: 230}).resize(1120).webp({quality: 88, alphaQuality: 90}).toFile(`${out}/plan-sheet.webp`);

await Promise.all([
  photo('08-proektirovanie/02-maket-doma.png', 'maket', 1000, 780),
  photo('08-proektirovanie/01-arhitekturnyy-proekt.png', 'arhitektor', 1400, 1040),
  photo('08-proektirovanie/03-obsledovanie-uchastka.png', 'uchastok', 1800, 680, 'centre'),
  photo('08-proektirovanie/03-obsledovanie-uchastka.png', 'uchastok-mobile', 800, 900, 'east'),
  // Крупные фото разделов: меняются в галерее «Состав проекта»
  photo('01-stroitelstvo-domov/02-odnoetaznaya-villa.png', 'razdel-ar', 1400, 1040),
  photo('02-stroitelnye-raboty/01-fundament.png', 'razdel-kr', 1400, 1040),
  photo('04-inzhenernye-sistemy/01-kotelnaya.png', 'razdel-ios', 1400, 1040),
  photo('08-proektirovanie/04-landshaftnyy-proekt.png', 'razdel-gp', 1400, 1040),
  photo('01-stroitelstvo-domov/02-odnoetaznaya-villa.png', 'thumb-ar', 160, 160),
  photo('02-stroitelnye-raboty/01-fundament.png', 'thumb-kr', 160, 160),
  photo('04-inzhenernye-sistemy/01-kotelnaya.png', 'thumb-ios', 160, 160),
  photo('08-proektirovanie/04-landshaftnyy-proekt.png', 'thumb-gp', 160, 160)
]);
console.log('Prepared design page images.');
