// Общие блоки страниц «Проектирование» и «Отделка» (по макету «Проектирование домов»):
// состав работ с переключением фото и форма заявки. Меню, расчёт, окна, cookie и Метрику подключает main.js.
// Настройки формы берутся из её атрибутов: data-form, data-service, data-message, data-done.
import './main.js';
import {postLead, warmUpProtection} from './site/forms.js';
import {goal} from './site/analytics.js';

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const pad = number => String(number).padStart(2, '0');

/* Состав: один раздел раскрыт, фото слева меняется под него */
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
  if (caption) caption.textContent = `${pad(index)} / ${pad(items.length)} · ${title}`;
  if (!photo) return;
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
const form = document.querySelector('.pj-form');
if (form) {
  const formName = form.dataset.form || 'request';
  const service = form.dataset.service || 'other';
  const doneText = form.dataset.done || 'Заявка принята. Мы свяжемся с вами в ближайшее рабочее время.';
  const field = name => form.elements.namedItem(name);
  const nameInput = field('name');
  const contactInput = field('contact');
  const consentInput = field('consent');
  const error = form.querySelector('.pj-form-error');
  const submitButton = form.querySelector('[type="submit"]');
  const fail = (input, message) => { input.setAttribute('aria-invalid', 'true'); error.textContent = message; input.focus(); };
  [nameInput, contactInput, consentInput].forEach(input => input.addEventListener('input', () => { input.removeAttribute('aria-invalid'); error.textContent = ''; }));
  form.addEventListener('focusin', () => { warmUpProtection(); goal('form_start', {form: formName}); }, {once: true});
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
      await postLead({
        form: formName, page: location.pathname, service, name,
        phone: isEmail ? '' : contact, email: isEmail ? contact : '', consent: true,
        website: field('website')?.value || '', message: form.dataset.message || ''
      });
      goal('lead_sent', {form: formName, service});
      const done = document.createElement('p');
      done.className = 'pj-done';
      done.setAttribute('role', 'status');
      done.tabIndex = -1;
      done.textContent = doneText;
      form.querySelector('.pj-fields').replaceChildren(done);
      done.focus();
    } catch (err) {
      goal('form_error', {form: formName});
      error.textContent = `${err.status && err.message ? err.message : 'Не получилось отправить.'} Напишите нам на info@gkvesmir.ru.`;
    } finally {
      submitButton.disabled = false;
    }
  });
}
