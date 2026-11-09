// Страница «Проектирование домов». Меню, расчет и окна — из main.js.
import './main.js';

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

/* Состав проекта: один раздел раскрыт, фото слева меняется под него */
const items = [...document.querySelectorAll('.pj-item')];
const photo = document.querySelector('#section-photo');
const caption = document.querySelector('#section-caption');
function openItem(item) {
  if (item.classList.contains('is-open')) return;
  items.forEach(other => {
    const open = other === item;
    other.classList.toggle('is-open', open);
    other.querySelector('.pj-item-head').setAttribute('aria-expanded', String(open));
    other.querySelector('.pj-item-body').hidden = !open;
  });
  const index = items.indexOf(item) + 1;
  const title = item.querySelector('.pj-item-title').lastChild.textContent.trim();
  caption.textContent = `0${index} / 05 · ${title}`;
  const swap = () => { photo.src = item.dataset.photo; photo.alt = item.dataset.alt; };
  if (reducedMotion.matches) { swap(); return; }
  photo.classList.add('is-fading');
  setTimeout(() => {
    swap();
    const show = () => photo.classList.remove('is-fading');
    photo.complete ? show() : photo.addEventListener('load', show, {once: true});
  }, 200);
}
items.forEach(item => item.querySelector('.pj-item-head').addEventListener('click', () => openItem(item)));

/* Заявка: проверка полей и письмо в почтовой программе посетителя */
const form = document.querySelector('#design-form');
const nameInput = document.querySelector('#design-name');
const contactInput = document.querySelector('#design-contact');
const error = document.querySelector('#design-error');
const fail = (input, message) => { input.setAttribute('aria-invalid', 'true'); error.textContent = message; input.focus(); };
[nameInput, contactInput].forEach(input => input.addEventListener('input', () => { input.removeAttribute('aria-invalid'); error.textContent = ''; }));
form.addEventListener('submit', event => {
  event.preventDefault();
  const name = nameInput.value.trim();
  const contact = contactInput.value.trim();
  if (!name) return fail(nameInput, 'Укажите, как к вам обращаться.');
  const valid = contact.includes('@') ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact) : contact.replace(/\D/g, '').length >= 10;
  if (!valid) return fail(contactInput, 'Укажите e-mail или телефон с кодом города.');
  const body = `Здравствуйте! Хочу обсудить проект дома с «Дом Мира».\n\nИмя: ${name}\nКонтакт: ${contact}\n\nПлощадь, участок и пожелания: [расскажите о будущем доме]`;
  window.location.href = `mailto:info@gkvesmir.ru?subject=${encodeURIComponent('Дом Мира — проектирование дома')}&body=${encodeURIComponent(body)}`;
});
