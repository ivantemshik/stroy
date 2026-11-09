// Страница «Проектирование»: состав проекта. Один раздел раскрыт, большое фото меняется под него.
// Без скриптов все разделы видны целиком.
export function initDesignSections() {
  const items = [...document.querySelectorAll('.pj-item')];
  if (!items.length) return;
  const photo = document.getElementById('section-photo');
  const caption = document.getElementById('section-caption');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const head = item => item.querySelector('.pj-item-head');
  const body = item => item.querySelector('.pj-item-body');
  items.forEach(item => { body(item).hidden = !item.classList.contains('is-open'); });

  function open(item) {
    if (item.classList.contains('is-open')) return;
    items.forEach(other => {
      const isOpen = other === item;
      other.classList.toggle('is-open', isOpen);
      head(other).setAttribute('aria-expanded', String(isOpen));
      body(other).hidden = !isOpen;
    });
    const index = items.indexOf(item) + 1;
    const title = item.querySelector('.pj-item-title').lastChild.textContent.trim();
    if (caption) caption.textContent = `0${index} / 0${items.length}, ${title.toLowerCase()}`;
    if (!photo) return;
    const swap = () => { photo.src = item.dataset.photo; photo.alt = item.dataset.alt; };
    if (reducedMotion.matches) { swap(); return; }
    photo.classList.add('is-fading');
    setTimeout(() => {
      swap();
      const show = () => photo.classList.remove('is-fading');
      if (photo.complete) show(); else photo.addEventListener('load', show, {once: true});
    }, 200);
  }

  items.forEach(item => head(item).addEventListener('click', () => open(item)));
}
