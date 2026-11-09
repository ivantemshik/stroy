// Расчёт стоимости в окне: несколько вопросов, ориентир по прайсу компании и заявка.
import {goal} from './analytics.js';
import {attachForm} from './forms.js';
import {escapeHtml} from './content-render.js';

const rub = value => new Intl.NumberFormat('ru-RU').format(Math.round(value));

const CONFIGS = {
  construction: {
    service: 'construction',
    title: 'Расчёт стоимости строительства',
    steps: [
      {key: 'object', q: 'Что строим?', options: ['Частный дом', 'Одноэтажный дом', 'Коммерческий объект', 'Баня, гараж или гостевой дом']},
      {key: 'area', q: 'Какая площадь?', area: {min: 40, max: 900, step: 10, value: 150}},
      {key: 'material', q: 'Из чего стены?', options: ['Керамический блок', 'Газобетон', 'Монолит', 'Кирпич', 'Пока не знаю']},
      {key: 'has_project', q: 'Проект уже есть?', options: ['Есть готовый проект', 'Нужен проект', 'Пока не знаю']}
    ],
    estimate(state) {
      if (state.object === 'Коммерческий объект') return {value: null, note: 'Коммерческие объекты считаем по проекту: пришлём смету после разговора с инженером.'};
      return {value: state.area * 70000, note: `${rub(state.area)} м² × 70 000 ₽ за работу по прайсу «Строительство дома по проекту». Материалы считаются отдельно, точная сумма в смете.`};
    }
  },
  design: {
    service: 'design',
    title: 'Расчёт стоимости проекта',
    steps: [
      {key: 'scope', q: 'Что нужно спроектировать?', options: ['Эскизный проект', 'Эскиз и архитектурный раздел', 'Эскиз, архитектура и расчёт нагрузки', 'Полный проект с инженерными системами']},
      {key: 'area', q: 'Какая площадь дома?', area: {min: 40, max: 900, step: 10, value: 150}},
      {key: 'has_plot', q: 'Участок уже есть?', options: ['Есть участок', 'Выбираю участок', 'Пока нет']}
    ],
    estimate(state) {
      const parts = {
        'Эскизный проект': [700],
        'Эскиз и архитектурный раздел': [700, 1200],
        'Эскиз, архитектура и расчёт нагрузки': [700, 1200, 1500],
        'Полный проект с инженерными системами': [700, 1200, 1500, 1500]
      }[state.scope] || [700];
      const rate = parts.reduce((sum, value) => sum + value, 0);
      return {value: state.area * rate, note: `${rub(state.area)} м² × ${parts.map(rub).join(' + ')} ₽ за м² по прайсу разделов, без материалов. При договоре на строительство проект входит в стоимость дома.`};
    }
  },
  finishing: {
    service: 'finishing',
    title: 'Расчёт стоимости отделки',
    steps: [
      {key: 'object', q: 'Где отделка?', options: ['Загородный дом', 'Квартира', 'Коммерческое помещение']},
      {key: 'area', q: 'Какая площадь?', area: {min: 30, max: 800, step: 10, value: 150}},
      {key: 'scope', q: 'Какие работы нужны?', options: ['Под ключ по дизайн проекту', 'Черновая отделка', 'Чистовая отделка', 'Капитальный ремонт']},
      {key: 'design_project', q: 'Дизайн проект есть?', options: ['Есть', 'Нужен', 'Не нужен']}
    ],
    estimate(state) {
      if (state.scope === 'Под ключ по дизайн проекту') return {value: state.area * 60000, note: `${rub(state.area)} м² × 60 000 ₽ по прайсу «Ремонт по дизайн проекту», без инженерных систем и материалов. Точная сумма после обмеров.`};
      return {value: null, note: 'Эти работы считаем по смете после обмеров: например, штукатурка стен от 1 600 ₽/м², стяжка пола от 1 600 ₽/м², плитка на стены от 5 500 ₽/м².'};
    }
  }
};

export function initCalc() {
  const dialog = document.getElementById('calc-dialog');
  const openers = document.querySelectorAll('[data-open-calc]');
  if (!dialog || !openers.length) return;
  const config = CONFIGS[document.body.dataset.service] || CONFIGS.construction;
  let state;
  let step;
  let startedGoal = false;

  const close = () => dialog.close();

  function render() {
    const total = config.steps.length;
    if (step < total) {
      const current = config.steps[step];
      let body;
      if (current.area) {
        const value = state.area || current.area.value;
        state.area = value;
        body = `<div class="calc-area"><output id="calc-area-out" for="calc-area">${value} м²</output>
          <label class="visually-hidden" for="calc-area">Площадь в квадратных метрах</label>
          <input id="calc-area" type="range" min="${current.area.min}" max="${current.area.max}" step="${current.area.step}" value="${value}" />
          <div class="field"><label for="calc-area-num">Или введите точно</label><input id="calc-area-num" type="number" inputmode="numeric" min="${current.area.min}" max="2000" value="${value}" /></div></div>`;
      } else {
        body = `<fieldset class="calc-options"><legend class="visually-hidden">${escapeHtml(current.q)}</legend>${current.options.map((option, index) => `
          <input type="radio" name="calc-opt" id="calc-opt-${index}" value="${escapeHtml(option)}" ${state[current.key] === option ? 'checked' : ''} /><label for="calc-opt-${index}">${escapeHtml(option)}</label>`).join('')}</fieldset>`;
      }
      dialog.innerHTML = `<div class="dialog-inner">
        <div class="dialog-head"><div><p class="dialog-progress">Шаг ${step + 1} из ${total}</p><h2 id="calc-title" tabindex="-1">${escapeHtml(current.q)}</h2></div>
          <button class="icon-btn" type="button" data-close aria-label="Закрыть"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button></div>
        ${body}
        <div class="dialog-actions">${step > 0 ? '<button class="btn btn--quiet" type="button" data-back>Назад</button>' : '<span></span>'}
          <button class="btn" type="button" data-next ${current.area || state[current.key] ? '' : 'disabled'}>Дальше</button></div></div>`;
      dialog.querySelector('[data-close]').addEventListener('click', close);
      dialog.querySelector('[data-back]')?.addEventListener('click', () => { step -= 1; render(); });
      const next = dialog.querySelector('[data-next]');
      next.addEventListener('click', () => { step += 1; render(); });
      dialog.querySelectorAll('[name="calc-opt"]').forEach(input => input.addEventListener('change', () => {
        state[current.key] = input.value;
        next.disabled = false;
        if (!startedGoal) { startedGoal = true; goal('calc_start', {service: config.service}); }
      }));
      const range = dialog.querySelector('#calc-area');
      const number = dialog.querySelector('#calc-area-num');
      const out = dialog.querySelector('#calc-area-out');
      const setArea = value => {
        const v = Math.max(10, Math.min(2000, Math.round(Number(value) || 0)));
        state.area = v;
        out.textContent = `${v} м²`;
      };
      range?.addEventListener('input', () => { setArea(range.value); number.value = range.value; });
      number?.addEventListener('input', () => { setArea(number.value); range.value = Math.min(Number(range.max), Number(number.value) || 0); });
    } else {
      const result = config.estimate(state);
      goal('calc_result', {service: config.service});
      const estimateText = result.value ? `от ${rub(result.value)} ₽` : 'по смете';
      dialog.innerHTML = `<div class="dialog-inner">
        <div class="dialog-head"><div><p class="dialog-progress">Готово</p><h2 id="calc-title" tabindex="-1">Ориентир по стоимости работ</h2></div>
          <button class="icon-btn" type="button" data-close aria-label="Закрыть"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button></div>
        <div class="calc-result"><strong>${escapeHtml(estimateText)}</strong><span>${escapeHtml(result.note)}</span></div>
        <form class="lead-form ym-hide-content ym-disable-keys" data-lead-form="calc-${config.service}" novalidate>
          <p>Оставьте телефон: инженер уточнит детали и пришлёт смету бесплатно.</p>
          <div class="field-row">
            <div class="field"><label for="c-name">Имя</label><input id="c-name" name="name" autocomplete="name" maxlength="80" /></div>
            <div class="field"><label for="c-phone">Телефон</label><input id="c-phone" name="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="+7" required class="ym-hide-content" /><span class="field-error" id="c-phone-error"></span></div>
          </div>
          <div class="hp" aria-hidden="true"><label for="c-website">Сайт</label><input id="c-website" name="website" tabindex="-1" autocomplete="off" /></div>
          <label class="check"><input type="checkbox" name="consent" required /><span>Даю <a href="/soglasie/" target="_blank">согласие на обработку персональных данных</a> и принимаю <a href="/privacy/" target="_blank">политику конфиденциальности</a>.</span></label>
          <span class="field-error" data-error-for="consent"></span>
          <div class="form-actions"><button class="btn" type="submit">Получить смету</button><p class="form-status" role="status" aria-live="polite"></p></div>
          <button class="btn btn--quiet" type="button" data-back>Изменить ответы</button>
        </form></div>`;
      dialog.querySelector('[data-close]').addEventListener('click', close);
      dialog.querySelector('[data-back]').addEventListener('click', () => { step = config.steps.length - 1; render(); });
      const form = dialog.querySelector('form');
      attachForm(form, {details: () => ({service: state.object === 'Коммерческий объект' ? 'commercial' : config.service, details: {
        object: state.object, area: String(state.area), material: state.material, has_project: state.has_project,
        scope: state.scope, design_project: state.design_project, has_plot: state.has_plot, estimate: estimateText
      }})});
    }
    dialog.querySelector('#calc-title')?.focus();
  }

  openers.forEach(button => button.addEventListener('click', () => {
    state = {};
    step = 0;
    render();
    dialog.showModal();
    goal('form_open', {form: `calc-${config.service}`});
  }));
}
