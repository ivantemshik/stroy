// Страница «Проектирование домов». Меню, расчёт, окна, cookie и Метрика подключает main.js.
import './main.js';
import {postLead, warmUpProtection} from './site/forms.js';
import {goal} from './site/analytics.js';

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

/* Заявка: проверка полей и отправка в систему заявок (база, Telegram, админка) */
const form = document.querySelector('#design-form');
const nameInput = document.querySelector('#design-name');
const contactInput = document.querySelector('#design-contact');
const consentInput = document.querySelector('#design-consent');
const error = document.querySelector('#design-error');
const submitButton = form.querySelector('[type="submit"]');
const fail = (input, message) => { input.setAttribute('aria-invalid', 'true'); error.textContent = message; input.focus(); };
[nameInput, contactInput, consentInput].forEach(input => input.addEventListener('input', () => { input.removeAttribute('aria-invalid'); error.textContent = ''; }));
form.addEventListener('focusin', () => { warmUpProtection(); goal('form_start', {form: 'request-design'}); }, {once: true});
form.addEventListener('submit', async event => {
  event.preventDefault();
  const name = nameInput.value.trim();
  const contact = contactInput.value.trim();
  if (!name) return fail(nameInput, 'Укажите, как к вам обращаться.');
  const isEmail = contact.includes('@');
  const valid = isEmail ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact) : contact.replace(/\D/g, '').length >= 10;
  if (!valid) return fail(contactInput, 'Укажите e-mail или телефон с кодом города.');
  if (!consentInput.checked) return fail(consentInput, 'Отметьте согласие на обработку данных, без него мы не можем принять заявку.');
  submitButton.disabled = true;
  error.textContent = 'Отправляем заявку...';
  try {
    const data = await postLead({
      form: 'request-design', page: location.pathname, service: 'design', name,
      phone: isEmail ? '' : contact, email: isEmail ? contact : '', consent: true,
      website: form.elements.website?.value || '', message: 'Заявка со страницы «Проектирование домов»'
    });
    goal('lead_sent', {form: 'request-design', service: 'design'});
    form.querySelector('.pj-fields').innerHTML = `<p class="pj-done" role="status" tabindex="-1">Заявка${data.id ? ` №${data.id}` : ''} принята. Архитектор свяжется с вами в ближайшее рабочее время.</p>`;
    form.querySelector('.pj-done').focus();
  } catch (err) {
    goal('form_error', {form: 'request-design'});
    error.textContent = `${err.status && err.message ? err.message : 'Не получилось отправить.'} Напишите нам на info@gkvesmir.ru.`;
  } finally {
    submitButton.disabled = false;
  }
});
