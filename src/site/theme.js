// Светлая и тёмная тема всего сайта. Тему ставит маленький скрипт в <head> до отрисовки: выбор посетителя
// из браузера, иначе настройка системы. Переключатель в шапке запоминает выбор. При смене темы цвета
// перетекают, на главной дневное фото плавно сменяется ночным, загораются звёзды и пролетает падающая звезда.
const root = document.documentElement;
const media = window.matchMedia('(prefers-color-scheme: dark)');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
let animTimer;

const effective = () => root.dataset.theme || (media.matches ? 'dark' : 'light');
const stored = () => { try { return localStorage.getItem('dm_theme'); } catch { return null; } };

// Если посетитель сам не выбирал тему, сайт идёт за системой и при её смене на лету.
function followSystem() {
  if (stored() === 'dark' || stored() === 'light') return;
  applyTheme(media.matches ? 'dark' : 'light');
}

function sync() {
  const dark = effective() === 'dark';
  document.querySelectorAll('[data-theme-toggle]').forEach(button => {
    button.setAttribute('aria-pressed', String(dark));
    button.setAttribute('aria-label', dark ? 'Включить светлую тему' : 'Включить тёмную тему');
    button.title = dark ? 'Светлая тема' : 'Тёмная тема';
  });
}

// Звёзды над домом: позиции детерминированы, чтобы не прыгали между визитами.
function makeStars() {
  const box = document.querySelector('.hero-stars');
  if (!box || box.childElementCount) return;
  let seed = 7;
  const random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const fragment = document.createDocumentFragment();
  // Звёзды только в небе: слева над заголовком и узкой полосой над крышей, не на доме и деревьях.
  for (let placed = 0, tries = 0; placed < 46 && tries < 400; tries += 1) {
    const x = random() * 100;
    const y = random() * 100;
    if (!(x < 48 || (x < 58 && y < 60) || y < 14)) continue;
    placed += 1;
    const star = document.createElement('i');
    if (random() > 0.85) star.className = 'big';
    star.style.left = `${x.toFixed(2)}%`;
    star.style.top = `${y.toFixed(2)}%`;
    star.style.setProperty('--d', `${(2.4 + random() * 3).toFixed(2)}s`);
    star.style.setProperty('--delay', `${(-random() * 5).toFixed(2)}s`);
    fragment.append(star);
  }
  box.append(fragment);
}

function shootingStar() {
  const box = document.querySelector('.hero-stars');
  if (!box || reducedMotion.matches) return;
  box.querySelector('.shooting')?.remove();
  const star = document.createElement('i');
  star.className = 'shooting';
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

function setTheme(next) {
  try { localStorage.setItem('dm_theme', next); } catch { /* приватный режим: выбор живёт до закрытия страницы */ }
  applyTheme(next);
}

export function initTheme() {
  makeStars();
  sync();
  media.addEventListener?.('change', followSystem);
  document.querySelectorAll('[data-theme-toggle]').forEach(button =>
    button.addEventListener('click', () => setTheme(effective() === 'dark' ? 'light' : 'dark')));
}
