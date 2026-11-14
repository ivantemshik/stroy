import {postLead} from './site/forms.js';
import {goal, captureAttribution, loadMetrika, getClientId} from './site/analytics.js';
import {initConsent} from './site/consent.js';
import {initTheme} from './site/theme.js';
import {initPhotoLinks} from './site/objects.js';
import {initContent} from './site/content.js';
import {SERVICES} from './site/services.js';
const page = document.body.dataset.page || 'home';
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const quiz = $('#quiz-dialog');
const serviceDialog = $('#service-dialog');
const state = {step: 0, type: 'Загородный дом', area: 150, scope: 'Строительство по проекту', email: ''};
const rub = value => new Intl.NumberFormat('ru-RU').format(value);
const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const modalFocus = new WeakMap();
function openModal(dialog, returnTarget = document.activeElement) {
  modalFocus.set(dialog, returnTarget);
  if (!dialog.open) dialog.showModal();
  document.body.style.overflow = 'hidden';
}
function closeModal(dialog) {
  dialog.close();
}
$$('dialog').forEach(dialog => {
  $('[data-close]', dialog).addEventListener('click', () => closeModal(dialog));
  dialog.addEventListener('click', event => {
    const bounds = dialog.getBoundingClientRect();
    if (event.target === dialog && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom)) closeModal(dialog);
  });
  dialog.addEventListener('close', () => {
    if (!$$('dialog[open]').length) {
      document.body.style.overflow = '';
      modalFocus.get(dialog)?.focus();
    }
  });
});
function openQuiz(step = 0) {
  goal('form_open', {form: `calc-${page}`});
  const returnTarget = serviceDialog.open ? modalFocus.get(serviceDialog) : document.activeElement;
  if (serviceDialog.open) serviceDialog.close();
  state.step = step;
  renderQuiz();
  openModal(quiz, returnTarget);
}
$$('[data-open="quiz"]').forEach(button => button.addEventListener('click', () => {
  if (button.dataset.quizScope) state.scope = button.dataset.quizScope;
  openQuiz();
}));
$$('[data-open="privacy"]').forEach(button => button.addEventListener('click', () => openModal($('#privacy-dialog'))));
/* Окно «Полный прайс»: вкладки по направлениям, кнопка открывает нужную (data-prices-tab) */
const pricesDialog = $('#prices-dialog');
if (pricesDialog) {
  const tabs = $$('[role="tab"]', pricesDialog);
  const selectTab = (name, focus = false) => {
    tabs.forEach(tab => {
      const active = tab.dataset.tab === name;
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
      $(`#${tab.getAttribute('aria-controls')}`).hidden = !active;
      if (active && focus) tab.focus();
    });
    $('.prices-body', pricesDialog).scrollTop = 0;
  };
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => selectTab(tab.dataset.tab));
    tab.addEventListener('keydown', event => {
      const step = {ArrowRight: 1, ArrowLeft: -1}[event.key];
      if (!step) return;
      event.preventDefault();
      selectTab(tabs[(index + step + tabs.length) % tabs.length].dataset.tab, true);
    });
  });
  $$('[data-open="prices"]').forEach(button => button.addEventListener('click', () => {
    selectTab(button.dataset.pricesTab || 'build');
    goal('prices_view', {place: page, tab: button.dataset.pricesTab || 'build'});
    openModal(pricesDialog);
  }));
  $('[data-prices-calc]', pricesDialog).addEventListener('click', () => {
    const returnTarget = modalFocus.get(pricesDialog);
    pricesDialog.close();
    goal('form_open', {form: `calc-${page}`});
    state.scope = page === 'otdelka' ? 'Отделка по дизайн-проекту' : 'Строительство по проекту';
    state.step = 0;
    renderQuiz();
    openModal(quiz, returnTarget);
  });
}
const menuToggle = $('.menu-toggle');
function closeMenu() { menuToggle.setAttribute('aria-expanded', 'false'); menuToggle.setAttribute('aria-label', 'Открыть меню'); $('#mobile-menu').hidden = true; }
menuToggle.addEventListener('click', () => { const open = menuToggle.getAttribute('aria-expanded') !== 'true'; menuToggle.setAttribute('aria-expanded', String(open)); menuToggle.setAttribute('aria-label', open ? 'Закрыть меню' : 'Открыть меню'); $('#mobile-menu').hidden = !open; });
$$('a, button:not(.mobile-services-toggle)', $('#mobile-menu')).forEach(link => link.addEventListener('click', closeMenu));
document.addEventListener('keydown', event => { if (event.key === 'Escape') closeMenu(); });
// Окно услуги: фото, результат, состав работ, цена «от», форма заявки с выбранной услугой и три способа связи.
// Данные в src/site/services.js, одно окно для меню, карточек главной и блока «Наши услуги».
const SERVICES_VERSION = typeof __SERVICES_V__ === 'string' && __SERVICES_V__ ? `?v=${__SERVICES_V__}` : '';
const serviceForm = $('#service-form');
const serviceFormHtml = serviceForm ? serviceForm.innerHTML : '';
let currentService = null;
function openService(key, returnTarget = document.activeElement) {
  const service = SERVICES[key];
  if (!service) return;
  if (service.href) { location.href = service.href; return; }
  currentService = service;
  const path = size => `${import.meta.env.BASE_URL}images/services/${service.photo}-${size}.webp${SERVICES_VERSION}`;
  const photo = $('#service-photo');
  photo.src = path(800);
  photo.srcset = `${path(480)} 480w, ${path(800)} 800w`;
  photo.sizes = '(max-width: 760px) 100vw, 45vw';
  photo.alt = service.alt;
  $('#service-title').textContent = service.title;
  $('#service-result').textContent = service.result;
  $('#service-works').replaceChildren(...service.works.map(text => Object.assign(document.createElement('li'), {textContent: text})));
  $('#service-price').textContent = service.price;
  serviceForm.innerHTML = serviceFormHtml;
  const mail = $('[data-service-mail]', serviceDialog);
  if (mail) mail.href = `${mail.href.split('?')[0]}?subject=${encodeURIComponent(`Дом Мира: ${service.title}`)}`;
  $$('dialog[open]').forEach(dialog => { if (dialog !== serviceDialog) dialog.close(); });
  goal('form_open', {form: `service-${key}`});
  openModal(serviceDialog, returnTarget);
  serviceDialog.scrollTop = 0;
}
serviceForm?.addEventListener('submit', async event => {
  event.preventDefault();
  if (!currentService) return;
  const field = name => serviceForm.elements.namedItem(name);
  const error = $('.service-error', serviceForm);
  const fail = (input, message) => { error.textContent = message; input.setAttribute('aria-invalid', 'true'); input.focus(); };
  $$('[aria-invalid]', serviceForm).forEach(input => input.removeAttribute('aria-invalid'));
  const phone = field('phone').value.trim();
  if (phone.replace(/\D/g, '').length < 10) return fail(field('phone'), 'Укажите телефон с кодом города.');
  if (!field('consent').checked) return fail(field('consent'), 'Отметьте согласие на обработку данных, без него заявку не принять.');
  const submit = $('.service-submit', serviceForm);
  const comment = field('comment').value.trim();
  const form = `service-${currentService.key}`;
  submit.disabled = true;
  error.textContent = 'Отправляем...';
  try {
    await postLead({form, page: location.pathname, service: currentService.lead, name: field('name').value.trim(), phone, consent: true,
      website: field('website').value, message: `Заявка из окна услуги «${currentService.title}»${comment ? `. ${comment}` : ''}`});
    goal('lead_sent', {form, service: currentService.lead});
    const done = Object.assign(document.createElement('p'), {className: 'service-done', textContent: 'Заявка принята. Менеджер свяжется с вами в ближайшее рабочее время.', tabIndex: -1});
    done.setAttribute('role', 'status');
    serviceForm.replaceChildren(done);
    done.focus();
  } catch (err) {
    goal('form_error', {form});
    error.textContent = `${err.status && err.message ? err.message : 'Не получилось отправить.'} Напишите нам на info@gkvesmir.ru.`;
    submit.disabled = false;
  }
});
$$('[data-service]').forEach(button => button.addEventListener('click', () => openService(button.dataset.service, button)));
// Старый адрес «Проектирования» и ссылки вида /?usluga=design сразу открывают окно услуги.
const linkedService = new URLSearchParams(location.search).get('usluga');
if (linkedService && SERVICES[linkedService] && !SERVICES[linkedService].href) {
  history.replaceState(null, '', location.pathname + location.hash);
  openService(linkedService, document.body);
}

/* Меню «Услуги» в шапке: «Отделка» ведёт на страницу, остальные услуги открывают окно */
const servicesToggle = $('.nav-services-toggle');
const servicesMenu = $('#services-menu');
if (servicesToggle && servicesMenu) {
  const setServicesOpen = open => { servicesToggle.setAttribute('aria-expanded', String(open)); servicesMenu.hidden = !open; };
  servicesToggle.addEventListener('click', () => setServicesOpen(servicesMenu.hidden));
  document.addEventListener('click', event => { if (!servicesMenu.hidden && !event.target.closest('.nav-services')) setServicesOpen(false); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && !servicesMenu.hidden) { setServicesOpen(false); servicesToggle.focus(); } });
  $('.nav-services').addEventListener('focusout', event => { if (!event.currentTarget.contains(event.relatedTarget)) setServicesOpen(false); });
  $$('a, button', servicesMenu).forEach(item => item.addEventListener('click', () => setServicesOpen(false)));
}
const mobileServicesToggle = $('.mobile-services-toggle');
mobileServicesToggle?.addEventListener('click', () => {
  const open = mobileServicesToggle.getAttribute('aria-expanded') !== 'true';
  mobileServicesToggle.setAttribute('aria-expanded', String(open));
  $('#mobile-services').hidden = !open;
});
const projectsTrack = $('#projects-track');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
function moveProjects(direction) {
  const cards=$$('.project-card',projectsTrack);
  if(projectsTrack.scrollWidth<=projectsTrack.clientWidth+2){
    direction>0 ? projectsTrack.append(cards[0]) : projectsTrack.prepend(cards.at(-1));
    if(!reducedMotion.matches)projectsTrack.animate([{opacity:.6},{opacity:1}],{duration:240,easing:'ease-out'});
    return;
  }
  const step=cards[0].getBoundingClientRect().width+parseFloat(getComputedStyle(projectsTrack).columnGap);
  const limit=projectsTrack.scrollWidth-projectsTrack.clientWidth;
  let next=projectsTrack.scrollLeft+direction*step;
  if(direction>0&&projectsTrack.scrollLeft>=limit-2)next=0;
  if(direction<0&&projectsTrack.scrollLeft<=2)next=limit;
  projectsTrack.scrollTo({left:Math.max(0,Math.min(next,limit)),behavior:reducedMotion.matches?'instant':'smooth'});
}
$$('[data-project-direction]').forEach(button=>button.addEventListener('click',()=>moveProjects(Number(button.dataset.projectDirection))));
projectsTrack?.addEventListener('keydown',event=>{
  if(event.key==='ArrowRight'||event.key==='ArrowLeft'){
    event.preventDefault();moveProjects(event.key==='ArrowRight'?1:-1);
  }
});

/* «Наши проекты»: бесконечная автопрокрутка по кругу.
   Слева и справа от карточек стоят их копии, поэтому лента не кончается:
   когда прокрутка уходит на целый набор вперёд или назад, мы незаметно
   возвращаем её на набор обратно. Листать самому можно всегда: на время
   свайпа, колеса, наведения или фокуса автопрокрутка встаёт на паузу. */
if (projectsTrack) {
  const originals = $$('.project-card', projectsTrack);
  const makeClone = card => {
    const clone = card.cloneNode(true);
    clone.setAttribute('aria-hidden', 'true');
    clone.tabIndex = -1;
    clone.dataset.clone = '';
    return clone;
  };
  projectsTrack.prepend(...originals.map(makeClone));
  projectsTrack.append(...originals.map(makeClone));
  projectsTrack.classList.add('is-looping');

  // Ширина одного полного набора карточек вместе с промежутком.
  const setWidth = () => {
    const after = originals.at(-1).nextElementSibling;
    return after ? after.offsetLeft - originals[0].offsetLeft : 0;
  };
  const wrap = () => {
    const w = setWidth();
    if (!w) return;
    if (projectsTrack.scrollLeft < w * 0.5) projectsTrack.scrollLeft += w;
    else if (projectsTrack.scrollLeft > w * 1.5) projectsTrack.scrollLeft -= w;
  };
  const toStart = () => { projectsTrack.scrollLeft = originals[0].offsetLeft - projectsTrack.firstElementChild.offsetLeft; };
  toStart();
  window.addEventListener('load', toStart, {once: true});
  projectsTrack.addEventListener('scroll', wrap, {passive: true});

  const SPEED = 32; // пикселей в секунду
  let hovering = false, touching = false, visible = true, resumeAt = 0;
  const pause = (ms = 2500) => { resumeAt = performance.now() + ms; };
  projectsTrack.addEventListener('mouseenter', () => { hovering = true; });
  projectsTrack.addEventListener('mouseleave', () => { hovering = false; pause(600); });
  projectsTrack.addEventListener('touchstart', () => { touching = true; }, {passive: true});
  projectsTrack.addEventListener('touchend', () => { touching = false; pause(); }, {passive: true});
  projectsTrack.addEventListener('wheel', () => pause(), {passive: true});
  projectsTrack.addEventListener('keydown', () => pause(4000));
  new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; }).observe(projectsTrack);

  let position = projectsTrack.scrollLeft;
  let last = performance.now();
  const tick = now => {
    const dt = Math.min(now - last, 100) / 1000;
    last = now;
    const running = visible && !hovering && !touching && now >= resumeAt && !document.hidden
      && !reducedMotion.matches && !projectsTrack.matches(':focus-within');
    if (running) {
      if (Math.abs(position - projectsTrack.scrollLeft) > 2) position = projectsTrack.scrollLeft;
      position += SPEED * dt;
      projectsTrack.scrollLeft = position;
      wrap();
      if (Math.abs(position - projectsTrack.scrollLeft) > 2) position = projectsTrack.scrollLeft;
    } else {
      position = projectsTrack.scrollLeft;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
function renderQuiz() {
  const content = $('#quiz-content');
  const titles = ['Что будем строить?', 'Какая нужна площадь?', 'Какие работы нужны?', 'Примерная стоимость'];
  const progress = `<div class="quiz-progress" aria-label="Шаг ${state.step + 1} из 4">${[0,1,2,3].map(i=>`<span class="${i <= state.step ? 'active' : ''}"></span>`).join('')}</div>`;
  let inner = '';
  if (state.step === 0) inner = `<p>Выберите тип объекта.</p><div class="quiz-options">${['Загородный дом','Дом для постоянной жизни','Коммерческий объект'].map(value=>`<button class="quiz-option ${state.type === value ? 'selected' : ''}" data-type="${value}" aria-pressed="${state.type === value}"><span>${value}</span><span aria-hidden="true">${state.type === value ? '<svg class="ui-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><path d="m5 12 4 4L19 6"/></svg>' : '<svg class="ui-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><path d="M7 17 17 7M7 7h10v10"/></svg>'}</span></button>`).join('')}</div>`;
  if (state.step === 1) inner = `<p>Хватит примерной цифры, до метра считать не нужно.</p><label class="area-output" for="area"><span id="area-value">${state.area}</span> <small>м²</small></label><input class="area-range" type="range" id="area" min="50" max="600" step="10" value="${state.area}" aria-label="Площадь дома в квадратных метрах" /><div class="range-labels"><span>50 м²</span><span>600 м²</span></div>`;
  if (state.step === 2) inner = `<p>Выберите одну, по ней посчитаем ориентир.</p><div class="quiz-options">${['Строительство по проекту','Эскизный проект','Проектирование инженерии','Отделка по дизайн-проекту'].map(value=>`<button class="quiz-option ${state.scope === value ? 'selected' : ''}" data-scope="${value}" aria-pressed="${state.scope === value}"><span>${value}</span><span aria-hidden="true">${state.scope === value ? '<svg class="ui-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><path d="m5 12 4 4L19 6"/></svg>' : '<svg class="ui-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><path d="M7 17 17 7M7 7h10v10"/></svg>'}</span></button>`).join('')}</div>`;
  if (state.step === 3) {
    const rate = {'Строительство по проекту':70000,'Эскизный проект':700,'Проектирование инженерии':1500,'Отделка по дизайн-проекту':60000}[state.scope];
    inner = `<div class="quiz-summary"><p class="quiz-summary-label">Ориентировочная стоимость работ</p><strong class="estimate">от ${rub(state.area * rate)} ₽</strong><p class="quiz-summary-note">${rub(state.area)} м² × ${rub(rate)} ₽/м², только работа, без материалов. Это ориентир по прайсу, точную сумму покажет смета после осмотра.</p></div><dl class="summary-dl"><dt>Объект</dt><dd>${state.type}</dd><dt>Работы</dt><dd>${state.scope}</dd><dt>Площадь</dt><dd>${state.area} м²</dd></dl><div class="quiz-form"><label class="modal-field-label" for="quiz-name">Имя</label><input class="modal-input" id="quiz-name" autocomplete="name" maxlength="80" /><label class="modal-field-label" for="quiz-phone">Телефон</label><input class="modal-input ym-hide-content" id="quiz-phone" type="tel" autocomplete="tel" placeholder="+7" /><label class="modal-field-label" for="quiz-message">Комментарий, необязательно</label><textarea class="modal-input quiz-message" id="quiz-message" maxlength="1000" rows="2" placeholder="Где участок, когда хотите начать"></textarea><label class="quiz-consent"><input type="checkbox" id="quiz-consent" /> <span>Даю <a href="/soglasie/" target="_blank">согласие на обработку персональных данных</a></span></label><button class="button plum" type="button" id="quiz-send">Получить смету</button><p class="small-print" id="quiz-hint" role="status"></p></div>`;
  }
  content.innerHTML = `${progress}<p class="eyebrow">ШАГ ${state.step+1} ИЗ 4</p><h2 id="quiz-title">${titles[state.step]}</h2>${inner}<div class="quiz-actions">${state.step > 0 ? '<button class="quiz-back"><svg class="ui-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><path d="M19 12H5m6-6-6 6 6 6"/></svg> Назад</button>' : ''}${state.step < 3 ? '<button class="button plum quiz-next">Продолжить <span aria-hidden="true"><svg class="ui-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><path d="M5 12h14m-6-6 6 6-6 6"/></svg></span></button>' : '<button class="quiz-back quiz-reset">Начать заново <svg class="ui-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><path d="M20 7v5h-5M19 12a7 7 0 1 0-2 5M20 7l-3-3"/></svg></button>'}</div>`;
  $$('[data-type]', content).forEach(button=>button.addEventListener('click',()=>{state.type=button.dataset.type;renderQuiz();$('.quiz-option.selected',content)?.focus();}));
  $$('[data-scope]', content).forEach(button=>button.addEventListener('click',()=>{state.scope=button.dataset.scope;renderQuiz();$('.quiz-option.selected',content)?.focus();}));
  $('.quiz-next',content)?.addEventListener('click',()=>{state.step++;renderQuiz();$('#quiz-title').setAttribute('tabindex','-1');$('#quiz-title').focus();});
  $('.quiz-back:not(.quiz-reset)',content)?.addEventListener('click',()=>{state.step=Math.max(0,state.step-1);renderQuiz();});
  $('.quiz-reset',content)?.addEventListener('click',()=>{state.step=0;renderQuiz();});
  $('#area',content)?.addEventListener('input',event=>{state.area=Number(event.target.value);$('#area-value').textContent=state.area;});
  $('#quiz-send',content)?.addEventListener('click',async()=>{
    const hint=$('#quiz-hint'),phone=$('#quiz-phone').value.trim();
    if(phone.replace(/\D/g,'').length<10){hint.textContent='Укажите телефон с кодом города.';$('#quiz-phone').focus();return;}
    if(!$('#quiz-consent').checked){hint.textContent='Отметьте согласие на обработку данных.';return;}
    const button=$('#quiz-send');button.disabled=true;hint.textContent='Отправляем...';
    try{
      const form=`calc-${page}`;
      const data=await postLead({form,page:location.pathname,service:state.type==='Коммерческий объект'?'commercial':state.scope.includes('Отделка')?'finishing':state.scope.includes('Строительство')?'construction':'design',
        name:$('#quiz-name').value.trim(),phone,email:state.email||'',message:$('#quiz-message').value.trim(),consent:true,details:{object:state.type,area:String(state.area),scope:state.scope}});
      goal('lead_sent',{form});
      hint.textContent=`Заявка${data.id?` №${data.id}`:''} принята. Мы свяжемся с вами в ближайшее рабочее время.`;
    }catch(error){hint.textContent=`${error.status&&error.message?error.message:'Не получилось отправить.'} Напишите на info@gkvesmir.ru.`;button.disabled=false;}
  });
}
function mailto() {
  const body = `Здравствуйте! Хочу обсудить проект с «Дом Мира».\n\nОбъект: ${state.type}\nПлощадь: около ${state.area} м²\nЗадача: ${state.scope}\n${state.email ? `Мой e-mail: ${state.email}\n` : ''}\nУчасток и пожелания: [расскажите о вашем проекте]`;
  return `mailto:info@gkvesmir.ru?subject=${encodeURIComponent('Обсудить проект дома — Дом Мира')}&body=${encodeURIComponent(body)}`;
}
/* «Оставить отзыв» под отзывами: отзыв приходит менеджерам как обращение с пометкой «Отзыв для сайта»,
   после проверки его публикуют в админке, раздел «Контент сайта», список «Отзывы клиентов». */
const reviewDialog = $('#review-dialog');
if (reviewDialog) {
  const reviewForm = $('#review-form', reviewDialog);
  const reviewFormHtml = reviewForm.innerHTML;
  $$('[data-open="review"]').forEach(button => button.addEventListener('click', () => {
    if (!$('.review-submit', reviewForm)) reviewForm.innerHTML = reviewFormHtml;
    goal('form_open', {form: 'review'});
    openModal(reviewDialog, button);
  }));
  reviewForm.addEventListener('submit', async event => {
    event.preventDefault();
    const field = name => reviewForm.elements.namedItem(name);
    const error = $('.review-error', reviewForm);
    const fail = (input, message) => { error.textContent = message; input.setAttribute('aria-invalid', 'true'); input.focus(); };
    $$('[aria-invalid]', reviewForm).forEach(input => input.removeAttribute('aria-invalid'));
    const name = field('name').value.trim();
    const contact = field('contact').value.trim();
    const text = field('text').value.trim();
    const isEmail = contact.includes('@');
    if (!name) return fail(field('name'), 'Укажите, как подписать отзыв.');
    if (!(isEmail ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact) : contact.replace(/\D/g, '').length >= 10)) return fail(field('contact'), 'Укажите телефон или e-mail: менеджер уточнит детали перед публикацией.');
    if (text.length < 20) return fail(field('text'), 'Напишите хотя бы пару предложений о работе.');
    if (!field('consent').checked) return fail(field('consent'), 'Отметьте согласие на обработку данных.');
    const subject = field('subject').value;
    const submit = $('.review-submit', reviewForm);
    submit.disabled = true;
    error.textContent = 'Отправляем...';
    try {
      await postLead({form: 'review', page: location.pathname, service: 'other', name, phone: isEmail ? '' : contact, email: isEmail ? contact : '', consent: true,
        website: field('website').value, message: `Отзыв для сайта${subject ? ` (${subject})` : ''}. Публикация с именем: ${field('publish').checked ? 'можно' : 'нельзя, только для компании'}.\n\n${text}`});
      goal('lead_sent', {form: 'review'});
      const done = Object.assign(document.createElement('p'), {className: 'review-done', textContent: 'Спасибо! Отзыв получили. Менеджер свяжется с вами, уточнит детали, и после этого опубликуем отзыв на сайте.', tabIndex: -1});
      done.setAttribute('role', 'status');
      reviewForm.replaceChildren(done);
      done.focus();
    } catch (err) {
      goal('form_error', {form: 'review'});
      error.textContent = `${err.status && err.message ? err.message : 'Не получилось отправить.'} Напишите нам на info@gkvesmir.ru.`;
      submit.disabled = false;
    }
  });
}

/* Форма «Оставить заявку» в подвале: имя, телефон, согласие, отправка прямо отсюда, результат в том же блоке */
const footerForm = $('#footer-form');
footerForm?.addEventListener('submit', async event => {
  event.preventDefault();
  const field = name => footerForm.elements.namedItem(name);
  const status = $('.footer-form-status', footerForm);
  const fail = (input, message) => { status.textContent = message; input.setAttribute('aria-invalid', 'true'); input.focus(); };
  $$('[aria-invalid]', footerForm).forEach(input => input.removeAttribute('aria-invalid'));
  const phone = field('phone').value.trim();
  if (phone.replace(/\D/g, '').length < 10) return fail(field('phone'), 'Укажите телефон с кодом города.');
  if (!field('consent').checked) return fail(field('consent'), 'Отметьте согласие на обработку данных.');
  const submit = $('.footer-submit', footerForm);
  const form = `footer-${page}`;
  submit.disabled = true;
  status.textContent = 'Отправляем...';
  try {
    await postLead({form, page: location.pathname, service: page === 'otdelka' ? 'finishing' : 'other', name: field('name').value.trim(), phone, consent: true,
      website: field('website').value, message: 'Заявка из формы внизу страницы'});
    goal('lead_sent', {form});
    footerForm.classList.add('is-done');
    status.textContent = 'Заявка принята. Менеджер свяжется с вами в ближайшее рабочее время.';
  } catch (err) {
    goal('form_error', {form});
    status.textContent = `${err.status && err.message ? err.message : 'Не получилось отправить.'} Напишите нам на info@gkvesmir.ru.`;
    submit.disabled = false;
  }
});

/* «Появились вопросы?» в правом нижнем углу на главной и «Отделке»: три способа связи.
   Появляется после первого экрана, прячется, пока открыта клавиатура или видна форма в подвале, и после закрытия. */
const ask = $('#ask');
if (ask && ['home', 'otdelka'].includes(page)) {
  let dismissed = false;
  try { dismissed = sessionStorage.getItem('dm_ask_closed') === '1'; } catch { /* приватный режим */ }
  const toggle = $('.ask-toggle', ask);
  const panel = $('#ask-panel');
  const askState = {scrolled: false, footer: false, forms: 0, typing: false, cookie: false};
  const update = () => { ask.hidden = dismissed || !askState.scrolled || askState.footer || askState.forms > 0 || askState.typing || askState.cookie; if (ask.hidden) setPanel(false); };
  const setPanel = open => { toggle.setAttribute('aria-expanded', String(open)); panel.hidden = !open; };
  toggle.addEventListener('click', () => { setPanel(panel.hidden); if (!panel.hidden) goal('form_open', {form: 'ask'}); });
  $('.ask-close', ask).addEventListener('click', () => {
    dismissed = true;
    try { sessionStorage.setItem('dm_ask_closed', '1'); } catch { /* приватный режим */ }
    update();
  });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && !panel.hidden) { setPanel(false); toggle.focus(); } });
  document.addEventListener('click', event => { if (!panel.hidden && !event.target.closest('#ask')) setPanel(false); });
  const onScroll = () => { askState.scrolled = window.scrollY > window.innerHeight * 0.6; update(); };
  window.addEventListener('scroll', onScroll, {passive: true});
  document.addEventListener('focusin', event => { askState.typing = Boolean(event.target.closest?.('input, textarea, select')) && !event.target.closest('#ask'); update(); });
  document.addEventListener('focusout', () => { askState.typing = false; setTimeout(update, 0); });
  const footer = $('.footer');
  if (footer && 'IntersectionObserver' in window) new IntersectionObserver(([entry]) => { askState.footer = entry.isIntersecting; update(); }, {rootMargin: '0px 0px -10% 0px'}).observe(footer);
  // Формы на самой странице (смета на «Отделке»): пока форма на экране, подсказка не закрывает её поля и кнопку
  const pageForms = [...document.querySelectorAll('main form')];
  if (pageForms.length && 'IntersectionObserver' in window) {
    const seen = new Set();
    const formObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => { if (entry.isIntersecting) seen.add(entry.target); else seen.delete(entry.target); });
      askState.forms = seen.size;
      update();
    });
    pageForms.forEach(form => formObserver.observe(form));
  }
  // Баннер cookie создаётся и удаляется скриптом согласия: пока он на экране, подсказку не показываем.
  const syncCookie = () => { askState.cookie = Boolean(document.querySelector('body > .cookie')); update(); };
  new MutationObserver(syncCookie).observe(document.body, {childList: true});
  syncCookie();
  onScroll();
}

$('#year').textContent = new Date().getFullYear();

// Ссылки на ИИ-консультанта несут страницу и ClientID Метрики, чтобы заявка из бота связалась с визитом.
function updateTelegramLinks(clientId = getClientId()) {
  $$('a[data-manager-tg]:not([data-direct])').forEach(link => {
    try {
      const url = new URL(link.href);
      url.searchParams.set('start', `m_${page}${clientId ? `_${clientId}` : ''}`.slice(0, 64));
      link.href = url.toString();
    } catch { /* ссылка без адреса */ }
  });
  $$('a[data-tg]').forEach(link => {
    try {
      const url = new URL(link.href);
      url.searchParams.set('start', `s_${page}${clientId ? `_${clientId}` : ''}`.slice(0, 64));
      link.href = url.toString();
    } catch { /* ссылка без адреса */ }
  });
}
document.addEventListener('click', event => {
  const target = event.target.closest('a, button');
  if (!target) return;
  if (target.matches('a[data-tg]')) goal('tg_click', {place: target.closest('section, header, footer')?.id || 'page'});
  else if (target.matches('a[href^="tel:"]')) goal('phone_click');
  else if (target.matches('a[href^="mailto:"]')) goal('email_click');
});
document.addEventListener('toggle', event => {
  if (event.target.matches?.('details[data-faq]') && event.target.open) goal('faq_open', {question: event.target.querySelector('summary')?.textContent?.slice(0, 80)});
}, true);
captureAttribution();
updateTelegramLinks();
initConsent({onAnalytics: () => loadMetrika(updateTelegramLinks)});
initTheme();
initPhotoLinks();
initContent();

/* Плавное появление блоков главной при прокрутке.
   Наблюдаем за группой целиком (заголовок, сетка карточек), а карточки внутри
   появляются по очереди. Так карточки в горизонтальных лентах тоже не теряются. */
function initReveal() {
  const main = $('#main');
  if (!main || !('IntersectionObserver' in window) || reducedMotion.matches) return;
  const groups = new Map();
  const add = (trigger, items) => { if (trigger && items.length) groups.set(trigger, items); };
  $$('.section-heading, .projects-heading, .intro-copy, .faq > div:first-child, .projects-track', main).forEach(el => add(el, [el]));
  ['.service-list', '.uslugi-grid', '.quality-grid', '.home-grid', '.process-grid', '.price-grid', '.about-facts', '.reviews-grid', '.faq-list'].forEach(selector => {
    $$(selector, main).forEach(parent => add(parent, [...parent.children].filter(child => !child.matches('[data-clone]'))));
  });
  $$('.footer-title, .contact-grid').forEach(el => add(el, [el]));
  groups.forEach(items => items.forEach((item, i) => { item.dataset.reveal = ''; item.style.setProperty('--reveal-i', Math.min(i, 6)); }));
  const lines = $$(':scope > .uslugi, :scope > .quality, :scope > .projects, :scope > .homes, :scope > .prices, :scope > .about', main);
  lines.forEach(section => { section.dataset.revealLine = ''; });
  const observer = new IntersectionObserver(entries => entries.forEach(entry => {
    if (!entry.isIntersecting) return;
    observer.unobserve(entry.target);
    if (entry.target.dataset.revealLine !== undefined) entry.target.classList.add('is-line-in');
    groups.get(entry.target)?.forEach(item => item.classList.add('is-in'));
  }), {rootMargin: '0px 0px -8% 0px', threshold: 0.12});
  groups.forEach((_, trigger) => observer.observe(trigger));
  lines.forEach(section => observer.observe(section));
}
initReveal();
export {openModal,closeModal};
