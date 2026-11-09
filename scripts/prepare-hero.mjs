// Готовит главное фото для светлой и тёмной темы: WebP нужных ширин в public/images/hero/.
// Дневное фото: public/images/construction-hero.webp и мобильная версия construction-hero-mobile.webp.
// Ночное фото: лучший вариант из Codex кладётся в design/sources/hero-night/construction-hero-night.webp
// (и construction-hero-night-mobile.png). Пока его нет, скрипт делает временную ночную версию
// из дневного фото: затемняет и холодит кадр и оставляет тёплый свет окон. Звёзды рисует сайт поверх фото.
// Запуск: node scripts/prepare-hero.mjs
import {mkdir, access} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';

const root = fileURLToPath(new URL('..', import.meta.url));
const out = `${root}public/images/hero/`;
const exists = path => access(path).then(() => true, () => false);

const SETS = [
  {day: 'public/images/construction-hero.webp', night: 'design/sources/hero-night/construction-hero-night.webp', name: 'construction-hero', widths: [1792, 1200, 800], skyTop: 0.62},
  {day: 'public/images/construction-hero-mobile.webp', night: 'design/sources/hero-night/construction-hero-night-mobile.webp', name: 'construction-hero-mobile', widths: [800], skyTop: 0.5}
];

async function standInNight(dayPath, skyTop) {
  const {data, info} = await sharp(dayPath).removeAlpha().raw().toBuffer({resolveWithObject: true});
  const {width, height, channels} = info;
  const outBuf = Buffer.alloc(data.length);
  // Маска неба: светлые малонасыщенные пиксели в верхней части кадра, затем размытие, чтобы не было резких краёв у листвы.
  let mask = new Float32Array(width * height);
  for (let p = 0; p < width * height; p += 1) {
    const i = p * channels, r = data[i], g = data[i + 1], b = data[i + 2];
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const y = Math.floor(p / width) / height;
    mask[p] = y < skyTop && lum > 150 && (Math.max(r, g, b) - Math.min(r, g, b)) < 40 ? 1 : 0;
  }
  const blur = (src, radius) => {
    const tmp = new Float32Array(src.length), dst = new Float32Array(src.length), n = radius * 2 + 1;
    for (let y = 0; y < height; y += 1) { let acc = 0; for (let x = -radius; x <= radius; x += 1) acc += src[y * width + Math.min(width - 1, Math.max(0, x))];
      for (let x = 0; x < width; x += 1) { tmp[y * width + x] = acc / n; acc += src[y * width + Math.min(width - 1, x + radius + 1)] - src[y * width + Math.max(0, x - radius)]; } }
    for (let x = 0; x < width; x += 1) { let acc = 0; for (let y = -radius; y <= radius; y += 1) acc += tmp[Math.min(height - 1, Math.max(0, y)) * width + x];
      for (let y = 0; y < height; y += 1) { dst[y * width + x] = acc / n; acc += tmp[Math.min(height - 1, y + radius + 1) * width + x] - tmp[Math.max(0, y - radius) * width + x]; } }
    return dst;
  };
  mask = blur(blur(mask, 6), 6);
  for (let p = 0; p < width * height; p += 1) {
    const i = p * channels, r = data[i], g = data[i + 1], b = data[i + 2];
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const y = Math.floor(p / width) / height;
    const warm = Math.min(1, Math.max(0, (r - b - 28) / 60)) * Math.min(1, Math.max(0, (lum - 105) / 80));
    const m = mask[p] * (1 - warm);
    // Ночь: тёмный индиго, тёплый свет окон и фонарей остаётся.
    const t = Math.min(1, y / skyTop);
    const skyR = 10 + 10 * t, skyG = 16 + 16 * t, skyB = 38 + 26 * t;
    const baseR = r * 0.19 + 4, baseG = g * 0.22 + 6, baseB = b * 0.33 + 18;
    const nr = baseR * (1 - m) + skyR * m, ng = baseG * (1 - m) + skyG * m, nb = baseB * (1 - m) + skyB * m;
    outBuf[i] = Math.round(nr * (1 - warm) + Math.min(255, r * 1.02) * warm);
    outBuf[i + 1] = Math.round(ng * (1 - warm) + g * 0.82 * warm);
    outBuf[i + 2] = Math.round(nb * (1 - warm) + b * 0.55 * warm);
  }
  return sharp(outBuf, {raw: {width, height, channels}});
}

await mkdir(out, {recursive: true});
for (const set of SETS) {
  const day = `${root}${set.day}`;
  const nightSource = `${root}${set.night}`;
  const real = await exists(nightSource);
  const night = real ? sharp(nightSource) : await standInNight(day, set.skyTop);
  const nightBuffer = await night.png().toBuffer();
  const dayMeta = await sharp(day).metadata();
  for (const width of set.widths) {
    const w = Math.min(width, dayMeta.width);
    await sharp(day).resize({width: w}).webp({quality: 76, effort: 5}).toFile(`${out}${set.name}-${w}.webp`);
    // Ночная версия подгоняется под размер дневной, чтобы кадры совпали при плавной смене.
    await sharp(nightBuffer).resize({width: w, height: Math.round(w * dayMeta.height / dayMeta.width), fit: 'cover'}).webp({quality: 76, effort: 5}).toFile(`${out}${set.name}-night-${w}.webp`);
    console.log(set.name, w, real ? 'ночь из Codex' : 'временная ночь');
  }
}
