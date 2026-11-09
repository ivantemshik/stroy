// Список объектов с большим фото и просмотр фотографий объекта в окне.
import {goal} from './analytics.js';
import {escapeHtml} from './content-render.js';

const src = (id, width) => `/images/objects/${id}-${width}.webp`;

export function openGallery(object, startIndex = 0) {
  const dialog = document.getElementById('gallery-dialog');
  if (!dialog || !object) return;
  let index = startIndex;
  const photos = object.photos;
  const render = () => {
    const [id, width, height, alt] = photos[index];
    dialog.innerHTML = `<div class="dialog-inner">
      <div class="dialog-head"><h2 class="visually-hidden">${escapeHtml(object.title)}</h2>
        <div class="lightbox-nav">
          <button class="icon-btn" type="button" data-prev aria-label="Предыдущее фото" ${photos.length < 2 ? 'disabled' : ''}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5 8 12l7 7"/></svg></button>
          <button class="icon-btn" type="button" data-next aria-label="Следующее фото" ${photos.length < 2 ? 'disabled' : ''}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg></button>
        </div>
        <button class="icon-btn" type="button" data-close aria-label="Закрыть"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button></div>
      <figure><img src="${src(id, width)}" width="${width}" height="${height}" alt="${escapeHtml(alt)}" />
        <figcaption><span>${escapeHtml(object.text)}</span><span>Фото ${index + 1} из ${photos.length}</span></figcaption></figure></div>`;
    dialog.querySelector('[data-close]').addEventListener('click', () => dialog.close());
    dialog.querySelector('[data-prev]').addEventListener('click', () => { index = (index - 1 + photos.length) % photos.length; render(); dialog.querySelector('[data-prev]').focus(); });
    dialog.querySelector('[data-next]').addEventListener('click', () => { index = (index + 1) % photos.length; render(); dialog.querySelector('[data-next]').focus(); });
    const next = photos[(index + 1) % photos.length];
    if (next) new Image().src = src(next[0], next[1]);
  };
  const onKey = event => {
    if (event.key === 'ArrowRight') dialog.querySelector('[data-next]')?.click();
    if (event.key === 'ArrowLeft') dialog.querySelector('[data-prev]')?.click();
  };
  let touchX = null;
  const onTouchStart = event => { touchX = event.touches[0].clientX; };
  const onTouchEnd = event => {
    if (touchX === null) return;
    const dx = event.changedTouches[0].clientX - touchX;
    if (Math.abs(dx) > 50) dialog.querySelector(dx < 0 ? '[data-next]' : '[data-prev]')?.click();
    touchX = null;
  };
  dialog.addEventListener('keydown', onKey);
  dialog.addEventListener('touchstart', onTouchStart, {passive: true});
  dialog.addEventListener('touchend', onTouchEnd);
  dialog.addEventListener('close', () => {
    dialog.removeEventListener('keydown', onKey);
    dialog.removeEventListener('touchstart', onTouchStart);
    dialog.removeEventListener('touchend', onTouchEnd);
  }, {once: true});
  render();
  dialog.showModal();
  dialog.querySelector('[data-close]').focus();
  goal('portfolio_open', {object: object.title});
}

export function initObjects() {
  const root = document.querySelector('[data-objects]');
  const dataNode = document.getElementById('objects-data');
  if (!root || !dataNode) return;
  let data;
  try { data = JSON.parse(dataNode.textContent); } catch { return; }
  const viewerButton = root.querySelector('[data-open-gallery]');
  const viewerImg = root.querySelector('[data-viewer-img]');
  const caption = root.querySelector('[data-viewer-caption]');
  const count = root.querySelector('[data-viewer-count]');
  const viewerVisible = () => viewerButton && getComputedStyle(root.querySelector('.objects-viewer')).display !== 'none';
  let active = 'promenad';

  root.querySelectorAll('[data-object]').forEach(row => row.addEventListener('click', () => {
    const key = row.dataset.object;
    const object = data[key];
    if (!object) return;
    if (!viewerVisible()) { openGallery(object); return; }
    if (active === key) { openGallery(object); return; }
    active = key;
    root.querySelectorAll('[data-object]').forEach(other => other.setAttribute('aria-pressed', String(other === row)));
    const [id, width, height, alt] = object.photos[0];
    viewerImg.removeAttribute('srcset');
    viewerImg.src = src(id, width);
    viewerImg.width = width;
    viewerImg.height = height;
    viewerImg.alt = alt;
    caption.textContent = object.text;
    count.textContent = `${object.photos.length} фото`;
    viewerButton.setAttribute('aria-label', `Открыть фото объекта ${object.title}`);
  }));
  viewerButton?.addEventListener('click', () => openGallery(data[active]));
}

// Галерея по data-gallery-ряду фото (страница отделки).
export function initPhotoLinks() {
  const dataNode = document.getElementById('gallery-data');
  if (!dataNode) return;
  let data;
  try { data = JSON.parse(dataNode.textContent); } catch { return; }
  document.querySelectorAll('[data-gallery]').forEach(button => button.addEventListener('click', () => {
    const [key, index] = button.dataset.gallery.split(':');
    openGallery(data[key], Number(index) || 0);
  }));
}
