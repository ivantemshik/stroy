// Светлая и тёмная тема всего сайта. Тему ставит маленький скрипт в <head> до отрисовки: выбор посетителя
// из браузера, иначе настройка системы. Переключатель в шапке запоминает выбор. При смене темы цвета
// перетекают, на главной дневное фото плавно сменяется ночным, загораются звёзды и пролетает падающая звезда.
const root = document.documentElement;
const media = window.matchMedia('(prefers-color-scheme: dark)');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
let animTimer;

const effective = () => root.dataset.theme || (media.matches ? 'dark' : 'light');
const system = () => (media.matches ? 'dark' : 'light');
const forget = () => { try { localStorage.removeItem('dm_theme'); localStorage.removeItem('dm_theme_sys'); } catch { /* хранилище недоступно */ } };

// Главная тема у сайта та, что стоит в системе посетителя. Выбор переключателем действует,
// только пока система не поменяется: при смене системной темы сайт сразу идёт за ней
// и забывает ручной выбор. Скрипт в <head> делает то же при следующем заходе.
function followSystem() {
  forget();
  applyTheme(system());
}

function sync() {
  const dark = effective() === 'dark';
  document.querySelectorAll('[data-theme-toggle]').forEach(button => {
    button.setAttribute('aria-pressed', String(dark));
    button.setAttribute('aria-label', dark ? 'Включить светлую тему' : 'Включить тёмную тему');
    button.title = dark ? 'Светлая тема' : 'Тёмная тема';
  });
}

// Звёзды только в небе. Где небо, видно по дневному фото: там оно светло-голубое и чётко отделяется
// от крыши, стен и дерева. Фото на разных экранах обрезается по-разному, поэтому звёзды
// раскладываются заново при смене ширины первого экрана. Раскладка детерминирована и не прыгает.
const MASK_WIDTH = 160;
let mask = null;
let skyAt = null;
let placedFor = '';
let placeTimer;

function readMask(img) {
  if (mask?.src === img.currentSrc) return mask;
  const w = MASK_WIDTH;
  const h = Math.round(w * img.naturalHeight / img.naturalWidth);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const context = canvas.getContext('2d', {willReadFrequently: true});
  context.drawImage(img, 0, 0, w, h);
  const px = context.getImageData(0, 0, w, h).data;
  const blue = new Uint8Array(w * h);
  for (let p = 0; p < w * h; p += 1) {
    const r = px[p * 4], g = px[p * 4 + 1], b = px[p * 4 + 2];
    blue[p] = 0.2126 * r + 0.7152 * g + 0.0722 * b > 125 && b - r > 28 && b >= g ? 1 : 0;
  }
  // Небо сужается на клетку со всех сторон, чтобы звёзды не садились на край крыши.
  const data = new Uint8Array(w * h);
  for (let y = 1; y < h - 1; y += 1) {
    for (let x = 1; x < w - 1; x += 1) {
      const p = y * w + x;
      data[p] = blue[p] & blue[p - 1] & blue[p + 1] & blue[p - w] & blue[p + w];
    }
  }
  mask = {src: img.currentSrc, w, h, data};
  return mask;
}

function placeStars() {
  const hero = document.querySelector('.hero');
  const box = hero?.querySelector('.hero-stars');
  const img = hero?.querySelector('.hero-photo:not(.hero-photo--night) img');
  if (!box || !img?.complete || !img.naturalWidth) return;
  const heroRect = hero.getBoundingClientRect();
  const photoRect = img.getBoundingClientRect();
  const {width, height} = heroRect;
  const key = `${Math.round(width)}x${Math.round(height)} ${img.currentSrc}`;
  if (!width || !photoRect.height || key === placedFor) return;
  let sky;
  try { sky = readMask(img); } catch { return; }
  placedFor = key;

  // Где фото лежит внутри первого экрана: как object-fit: cover с его object-position.
  const [posX, posY] = getComputedStyle(img).objectPosition.split(' ').map(value => parseFloat(value) / 100);
  const scale = Math.max(photoRect.width / img.naturalWidth, photoRect.height / img.naturalHeight);
  const shownW = img.naturalWidth * scale;
  const shownH = img.naturalHeight * scale;
  const left = photoRect.left - heroRect.left + (photoRect.width - shownW) * (posX || 0);
  const top = photoRect.top - heroRect.top + (photoRect.height - shownH) * (posY || 0);
  const photoTop = photoRect.top - heroRect.top;
  // Над фото (полоса под текстом на телефоне) ночью тоже небо.
  skyAt = (x, y) => {
    if (y < photoTop) return true;
    const mx = Math.floor((x - left) / shownW * sky.w);
    const my = Math.floor((y - top) / shownH * sky.h);
    return mx >= 0 && my >= 0 && mx < sky.w && my < sky.h && sky.data[my * sky.w + mx] === 1;
  };

  let seed = 7;
  const random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const fragment = document.createDocumentFragment();
  // Плотность одна на весь экран: где неба больше, там и звёзд больше.
  const tries = Math.round(width * height / 1200);
  for (let n = 0; n < tries; n += 1) {
    const x = random() * width;
    const y = random() * height;
    const kind = random(), twinkle = random(), keep = random(), speed = random(), phase = random();
    // Ближе к земле звёзд меньше, как в настоящем небе.
    const depth = y < photoTop ? 0 : (y - top) / shownH;
    if (keep > Math.min(1, Math.max(0, (0.85 - depth) / 0.5)) || !skyAt(x, y)) continue;
    const star = document.createElement('i');
    const size = kind > 0.94 ? 'big' : kind > 0.7 ? 'mid' : '';
    star.className = `${size}${twinkle < 0.4 ? ' tw' : ''}`.trim();
    star.style.left = `${x.toFixed(1)}px`;
    star.style.top = `${y.toFixed(1)}px`;
    star.style.setProperty('--o', (size === 'big' ? 0.95 : size === 'mid' ? 0.85 : 0.45 + kind * 0.45).toFixed(2));
    star.style.setProperty('--d', `${(2.4 + speed * 3.6).toFixed(2)}s`);
    star.style.setProperty('--delay', `${(-phase * 6).toFixed(2)}s`);
    fragment.append(star);
  }
  box.querySelectorAll('i:not(.shooting)').forEach(star => star.remove());
  box.append(fragment);
}

function watchStars() {
  const hero = document.querySelector('.hero');
  const img = hero?.querySelector('.hero-photo:not(.hero-photo--night) img');
  if (!hero?.querySelector('.hero-stars') || !img) return;
  // Картинка сменится сама, когда экран перейдёт через 600px: тогда маска считается заново.
  img.addEventListener('load', placeStars);
  placeStars();
  if (!('ResizeObserver' in window)) return;
  new ResizeObserver(() => {
    clearTimeout(placeTimer);
    placeTimer = setTimeout(placeStars, 150);
  }).observe(hero);
}

function shootingStar() {
  const box = document.querySelector('.hero-stars');
  if (!box || reducedMotion.matches) return;
  box.querySelector('.shooting')?.remove();
  const star = document.createElement('i');
  star.className = 'shooting';
  // Старт как можно правее, но так, чтобы весь путь шёл по небу, а не по крыше.
  const {width, height} = box.getBoundingClientRect();
  const y = height * 0.07;
  for (let x = width * 0.92; skyAt && x > width * 0.2; x -= width * 0.02) {
    if ([0, 0.25, 0.5, 0.75, 1].every(k => x - 384 * k < 0 || skyAt(x - 384 * k, y + 171 * k))) {
      star.style.left = `${Math.round(x)}px`;
      star.style.top = `${Math.round(y)}px`;
      break;
    }
  }
  star.addEventListener('animationend', () => star.remove(), {once: true});
  box.append(star);
}

function applyTheme(next) {
  if (root.dataset.theme === next) return;
  if (!reducedMotion.matches) {
    root.classList.add('theme-anim');
    clearTimeout(animTimer);
    animTimer = setTimeout(() => root.classList.remove('theme-anim'), 900);
  }
  root.dataset.theme = next;
  sync();
  if (next === 'dark') shootingStar();
}

// Ручной выбор запоминается вместе с системной темой, при которой его сделали.
// Если посетитель вернул ту же тему, что в системе, хранить нечего: сайт снова просто идёт за системой.
function setTheme(next) {
  try {
    if (next === system()) forget();
    else { localStorage.setItem('dm_theme', next); localStorage.setItem('dm_theme_sys', system()); }
  } catch { /* приватный режим: выбор живёт до закрытия страницы */ }
  applyTheme(next);
}

export function initTheme() {
  watchStars();
  sync();
  media.addEventListener?.('change', followSystem);
  document.querySelectorAll('[data-theme-toggle]').forEach(button =>
    button.addEventListener('click', () => setTheme(effective() === 'dark' ? 'light' : 'dark')));
}
