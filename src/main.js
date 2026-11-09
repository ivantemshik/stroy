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
const menuToggle = $('.menu-toggle');
function closeMenu() { menuToggle.setAttribute('aria-expanded', 'false'); menuToggle.setAttribute('aria-label', 'Открыть меню'); $('#mobile-menu').hidden = true; }
menuToggle.addEventListener('click', () => { const open = menuToggle.getAttribute('aria-expanded') !== 'true'; menuToggle.setAttribute('aria-expanded', String(open)); menuToggle.setAttribute('aria-label', open ? 'Закрыть меню' : 'Открыть меню'); $('#mobile-menu').hidden = !open; });
$$('a, button', $('#mobile-menu')).forEach(link => link.addEventListener('click', closeMenu));
document.addEventListener('keydown', event => { if (event.key === 'Escape') closeMenu(); });
const services = {
  design: {title:'Сначала — ваш образ жизни', intro:'Создаем индивидуальный проект с учетом ваших пожеланий и особенностей участка. Продумываем не только фасад, но и то, как дом будет работать каждый день.', scope:['Эскизный проект','Архитектура и конструктив','Инженерные системы','Ландшафтный проект'], rate:'Эскизный проект — от 700 ₽/м².', image:'canva-detail-1.png', select:'Эскизный проект'},
  build: {title:'От участка до дома', intro:'Строим частные дома по индивидуальным проектам. Фундамент, стены и перекрытия, фасад и кровля — в едином процессе с инженерными системами и отделкой.', scope:['Фундаменты','Стены и перекрытия','Кровля и фасады','Индивидуальные проекты'], rate:'Строительство по проекту — от 70 000 ₽/м² за работу, без материалов.', image:'canva-detail-1.png', select:'Строительство по проекту'},
  interior: {title:'Все, что делает дом вашим', intro:'Инженерные системы, отделка по дизайн-проекту, корпусная мебель и благоустройство. Каждая деталь продолжает общую идею дома.', scope:['Отделка и ремонт','Мебель на заказ','Ландшафт','Архитектурное освещение'], rate:'Ремонт по дизайн-проекту — от 60 000 ₽/м² без инженерных систем и материалов.', image:'canva-detail-2.png', select:'Отделка по дизайн-проекту'},
  engineering: {title:'Комфорт начинается с инженерии', intro:'Проектируем и монтируем системы, которые делают повседневную жизнь удобной: от отопления и воды до вентиляции и электроснабжения.', scope:['Водоснабжение и отопление','Вентиляция','Электромонтаж','Канализация'], rate:'Проектирование инженерных систем — от 1 500 ₽/м².', image:'canva-detail-3.png', select:'Проектирование инженерии'},
  landscape: {title:'Дом продолжается в саду', intro:'Продумываем и обустраиваем участок: от планировки территории до посадки растений, дорожек, дренажа и освещения.', scope:['Ландшафтный проект','Газоны и посадки','Дорожки и площадки','Дренаж и автополив'], rate:'Ландшафтный проект, дендроплан, автополив и освещение — от 15 000 ₽/сотка.', image:'project-landscape.webp', emailOnly:true},
  lighting: {title:'Архитектура в новом свете', intro:'Проектируем и монтируем подсветку домов, зданий и ландшафта. Подбираем решения для фасадов, деревьев и пространства участка.', scope:['Подсветка фасадов','Ландшафтное освещение','Декоративный свет','Монтаж'], rate:'Состав работ и стоимость рассчитываются индивидуально.', image:'project-lighting.webp', emailOnly:true},
  furniture: {title:'Мебель под ваше пространство', intro:'Изготавливаем корпусную мебель по индивидуальному проекту: кухни, шкафы, гардеробные, столы и стеллажи.', scope:['Кухни','Шкафы и гардеробные','Столы и стеллажи','Дизайн мебели'], rate:'Стоимость рассчитывается по проекту, размерам и выбранным материалам.', image:'project-furniture.webp', emailOnly:true}
};
$$('[data-service]').forEach(button => button.addEventListener('click', () => {
  const service = services[button.dataset.service];
  $('#service-content').innerHTML = `<img class="service-asset" src="${import.meta.env.BASE_URL}images/${service.image}" width="72" height="72" alt="Архитектурная деталь из материалов проекта" /><p class="eyebrow">ДОМ МИРА / НАШИ НАПРАВЛЕНИЯ</p><h2 id="service-title">${service.title}</h2><p>${service.intro}</p><div class="service-scope">${service.scope.map(text=>`<span>${text}</span>`).join('')}</div><p>${service.rate}</p><p class="small-print">Стоимость ориентировочная. Состав работ и итоговый расчет определяются индивидуально.</p><button class="button plum service-cta">Обсудить задачу <span aria-hidden="true"><svg class="ui-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><path d="M7 17 17 7M7 7h10v10"/></svg></span></button>`;
  const action = $('.service-cta');
  if (service.emailOnly) {
    const link=document.createElement('a');
    link.className=action.className;
    link.innerHTML=action.innerHTML;
    link.href=`mailto:info@gkvesmir.ru?subject=${encodeURIComponent('Дом Мира — '+service.title)}&body=${encodeURIComponent('Здравствуйте! Хочу обсудить проект: '+service.title+'.\n\nМои пожелания: ')}`;
    action.replaceWith(link);
  } else action.addEventListener('click', () => {state.scope = service.select; openQuiz();});
  openModal(serviceDialog);
}));
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
function renderQuiz() {
  const content = $('#quiz-content');
  const titles = ['Начнем с вашей мечты', 'Сколько места для жизни?', 'Что доверите нашей команде?', 'Первый ориентир уже есть'];
  const progress = `<div class="quiz-progress" aria-label="Шаг ${state.step + 1} из 4">${[0,1,2,3].map(i=>`<span class="${i <= state.step ? 'active' : ''}"></span>`).join('')}</div>`;
  let inner = '';
  if (state.step === 0) inner = `<p>Что вы планируете построить?</p><div class="quiz-options">${['Загородный дом','Дом для постоянной жизни','Коммерческий объект'].map(value=>`<button class="quiz-option ${state.type === value ? 'selected' : ''}" data-type="${value}" aria-pressed="${state.type === value}"><span>${value}</span><span aria-hidden="true">${state.type === value ? '<svg class="ui-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><path d="m5 12 4 4L19 6"/></svg>' : '<svg class="ui-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><path d="M7 17 17 7M7 7h10v10"/></svg>'}</span></button>`).join('')}</div>`;
  if (state.step === 1) inner = `<p>Укажите приблизительную площадь. На этом этапе точность до метра не нужна.</p><label class="area-output" for="area"><span id="area-value">${state.area}</span> <small>м²</small></label><input class="area-range" type="range" id="area" min="50" max="600" step="10" value="${state.area}" aria-label="Площадь дома в квадратных метрах" /><div class="range-labels"><span>50 м²</span><span>600 м²</span></div>`;
  if (state.step === 2) inner = `<p>Выберите задачу для предварительного ориентира.</p><div class="quiz-options">${['Строительство по проекту','Эскизный проект','Проектирование инженерии','Отделка по дизайн-проекту'].map(value=>`<button class="quiz-option ${state.scope === value ? 'selected' : ''}" data-scope="${value}" aria-pressed="${state.scope === value}"><span>${value}</span><span aria-hidden="true">${state.scope === value ? '<svg class="ui-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><path d="m5 12 4 4L19 6"/></svg>' : '<svg class="ui-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><path d="M7 17 17 7M7 7h10v10"/></svg>'}</span></button>`).join('')}</div>`;
  if (state.step === 3) {
    const rate = {'Строительство по проекту':70000,'Эскизный проект':700,'Проектирование инженерии':1500,'Отделка по дизайн-проекту':60000}[state.scope];
    inner = `<div class="quiz-summary"><p>Ориентировочная стоимость работ</p><strong class="estimate">от ${rub(state.area * rate)} ₽</strong><p>${rub(state.area)} м² × ${rub(rate)} ₽/м² · без материалов</p></div><dl class="summary-dl"><dt>Ваш объект</dt><dd>${state.type}</dd><dt>Задача</dt><dd>${state.scope}</dd><dt>Площадь</dt><dd>${state.area} м²</dd></dl><p class="small-print">Это предварительный ориентир по опубликованному прайсу, а не смета. Для отделки инженерные системы не включены. Итог зависит от проекта, участка и состава работ.</p><label class="modal-field-label" for="quiz-email">Ваш e-mail (необязательно)</label><input class="modal-input" id="quiz-email" type="email" autocomplete="email" placeholder="name@example.ru" value="${escapeHtml(state.email)}" /><a class="button plum mail-link" id="mail-link" href="${mailto()}">Открыть письмо <span aria-hidden="true"><svg class="ui-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><path d="M7 17 17 7M7 7h10v10"/></svg></span></a><p class="small-print" id="mail-hint">Откроется ваша почтовая программа. Проверьте текст и отправьте письмо самостоятельно.</p>`;
  }
  content.innerHTML = `${progress}<p class="eyebrow">ВАШ БУДУЩИЙ ДОМ / 0${state.step+1}</p><h2 id="quiz-title">${titles[state.step]}</h2>${inner}<div class="quiz-actions">${state.step > 0 ? '<button class="quiz-back"><svg class="ui-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><path d="M19 12H5m6-6-6 6 6 6"/></svg> Назад</button>' : ''}${state.step < 3 ? '<button class="button plum quiz-next">Продолжить <span aria-hidden="true"><svg class="ui-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><path d="M5 12h14m-6-6 6 6-6 6"/></svg></span></button>' : '<button class="quiz-back quiz-reset">Начать заново <svg class="ui-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><path d="M20 7v5h-5M19 12a7 7 0 1 0-2 5M20 7l-3-3"/></svg></button>'}</div>`;
  $$('[data-type]', content).forEach(button=>button.addEventListener('click',()=>{state.type=button.dataset.type;renderQuiz();$('.quiz-option.selected',content)?.focus();}));
  $$('[data-scope]', content).forEach(button=>button.addEventListener('click',()=>{state.scope=button.dataset.scope;renderQuiz();$('.quiz-option.selected',content)?.focus();}));
  $('.quiz-next',content)?.addEventListener('click',()=>{state.step++;renderQuiz();$('#quiz-title').setAttribute('tabindex','-1');$('#quiz-title').focus();});
  $('.quiz-back:not(.quiz-reset)',content)?.addEventListener('click',()=>{state.step=Math.max(0,state.step-1);renderQuiz();});
  $('.quiz-reset',content)?.addEventListener('click',()=>{state.step=0;renderQuiz();});
  $('#area',content)?.addEventListener('input',event=>{state.area=Number(event.target.value);$('#area-value').textContent=state.area;});
  $('#quiz-email',content)?.addEventListener('input',event=>{state.email=event.target.value;$('#mail-link').href=mailto();});
  $('#mail-link',content)?.addEventListener('click',event=>{if(!$('#quiz-email').reportValidity())event.preventDefault();});
}
function mailto() {
  const body = `Здравствуйте! Хочу обсудить проект с «Дом Мира».\n\nОбъект: ${state.type}\nПлощадь: около ${state.area} м²\nЗадача: ${state.scope}\n${state.email ? `Мой e-mail: ${state.email}\n` : ''}\nУчасток и пожелания: [расскажите о вашем проекте]`;
  return `mailto:info@gkvesmir.ru?subject=${encodeURIComponent('Обсудить проект дома — Дом Мира')}&body=${encodeURIComponent(body)}`;
}
$('#contact-form').addEventListener('submit', event => {event.preventDefault();state.email=$('#contact-email').value;openQuiz();});
$('#year').textContent = new Date().getFullYear();
export {openModal,closeModal};
