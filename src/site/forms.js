// Формы заявок: проверка полей, защита от спама, отправка в /api/leads, цели Метрики.
import {attribution, goal} from './analytics.js';
import {escapeHtml} from './content-render.js';

let powPromise = null;

async function solveInPage({challenge, salt, maxnumber}) {
  const encoder = new TextEncoder();
  for (let n = 0; n <= maxnumber; n += 1) {
    const buffer = await crypto.subtle.digest('SHA-256', encoder.encode(`${salt}${n}`));
    const hex = Array.from(new Uint8Array(buffer), b => b.toString(16).padStart(2, '0')).join('');
    if (hex === challenge) return n;
  }
  return null;
}

async function solveChallenge() {
  const response = await fetch('/api/challenge', {cache: 'no-store'});
  if (!response.ok) throw new Error('challenge');
  const task = await response.json();
  let number = null;
  if (typeof Worker === 'function') {
    number = await new Promise(resolve => {
      try {
        const worker = new Worker(new URL('./pow-worker.js', import.meta.url), {type: 'module'});
        worker.onmessage = event => { resolve(event.data.number); worker.terminate(); };
        worker.onerror = () => { worker.terminate(); resolve(solveInPage(task)); };
        worker.postMessage(task);
      } catch {
        resolve(solveInPage(task));
      }
    });
  } else {
    number = await solveInPage(task);
  }
  return {challenge: task.challenge, salt: task.salt, signature: task.signature, number};
}

function ensurePow() {
  if (!powPromise) powPromise = solveChallenge().catch(error => { powPromise = null; throw error; });
  return powPromise;
}

// Отправка заявки с решением защитной задачи. При устаревшей задаче повторяет попытку один раз.
export async function postLead(payload) {
  const body = {...payload, attribution: payload.attribution || attribution(), started_at: payload.started_at || Date.now() - 5000};
  const send = async () => {
    body.pow = await ensurePow();
    return fetch('/api/leads', {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify(body)});
  };
  let response = await send();
  let data = await response.json().catch(() => ({}));
  if (response.status === 400 && data.code === 'challenge') {
    powPromise = null;
    response = await send();
    data = await response.json().catch(() => ({}));
  }
  powPromise = null;
  if (!response.ok) throw Object.assign(new Error(data.error || 'Ошибка отправки'), {status: response.status, data});
  return data;
}

export function warmUpProtection() {
  ensurePow().catch(() => {});
}

const phoneDigits = value => String(value || '').replace(/\D/g, '');

function setError(form, name, message) {
  const field = form.elements[name];
  const box = form.querySelector(`[data-error-for="${name}"]`) || (field?.id ? form.querySelector(`#${field.id}-error`) : null);
  if (field && field.setAttribute) {
    if (message) {
      field.setAttribute('aria-invalid', 'true');
      if (box?.id) field.setAttribute('aria-describedby', box.id);
    } else {
      field.removeAttribute('aria-invalid');
    }
  }
  if (box) box.textContent = message || '';
}

function validate(form) {
  const errors = {};
  const phone = form.elements.phone;
  if (phone) {
    const digits = phoneDigits(phone.value);
    if (!digits) errors.phone = 'Оставьте телефон, чтобы мы могли связаться';
    else if (digits.length < 10 || digits.length > 15) errors.phone = 'Проверьте номер: нужно 10 или 11 цифр';
  }
  const consent = form.elements.consent;
  if (consent && !consent.checked) errors.consent = 'Отметьте согласие на обработку данных, без него мы не можем принять заявку';
  for (const name of ['phone', 'consent']) setError(form, name, errors[name]);
  return errors;
}

function radioValue(form, name) {
  const field = form.elements[name];
  if (!field) return '';
  if (field instanceof RadioNodeList) return field.value || '';
  return field.value || '';
}

function fallbackLinks(form, payload) {
  const body = [`Заявка с сайта (${location.pathname})`, payload.name && `Имя: ${payload.name}`, payload.phone && `Телефон: ${payload.phone}`, payload.message].filter(Boolean).join('\n');
  const mail = `mailto:info@gkvesmir.ru?subject=${encodeURIComponent('Заявка с сайта Дом Мира')}&body=${encodeURIComponent(body)}`;
  const tg = document.querySelector('[data-tg]')?.href || 'https://t.me/dommira_consult_bot';
  return `Напишите нам на <a class="link" href="${mail}">почту</a> или <a class="link" href="${escapeHtml(tg)}" target="_blank" rel="noopener">в Telegram</a>.`;
}

export function attachForm(form, {details, onSuccess} = {}) {
  if (form.dataset.bound) return;
  form.dataset.bound = '1';
  const formName = form.dataset.leadForm || 'form';
  const status = form.querySelector('.form-status');
  const submit = form.querySelector('[type="submit"]');
  const startedAt = Date.now();
  let started = false;

  form.addEventListener('focusin', () => {
    if (started) return;
    started = true;
    goal('form_start', {form: formName});
    ensurePow().catch(() => {});
  });
  form.addEventListener('input', event => {
    if (event.target.getAttribute('aria-invalid') === 'true') setError(form, event.target.name, '');
  });

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const errors = validate(form);
    if (Object.keys(errors).length) {
      form.elements[Object.keys(errors)[0]]?.focus?.();
      if (status) { status.dataset.state = 'error'; status.textContent = 'Проверьте отмеченные поля.'; }
      return;
    }
    const extra = typeof details === 'function' ? details() : {};
    const payload = {
      form: formName,
      page: location.pathname,
      service: form.elements.service?.value || extra.service || form.elements.object?.selectedOptions?.[0]?.dataset.service || form.dataset.serviceDefault || document.body.dataset.service || 'other',
      name: form.elements.name?.value?.trim() || '',
      phone: form.elements.phone?.value?.trim() || '',
      email: form.elements.email?.value?.trim() || '',
      contact_pref: radioValue(form, 'contact_pref') || null,
      message: form.elements.message?.value?.trim() || '',
      details: {
        object: form.elements.object?.value || undefined,
        area: form.elements.area?.value?.trim() || undefined,
        has_plot: radioValue(form, 'has_plot') || undefined,
        has_project: radioValue(form, 'has_project') || undefined,
        design_project: radioValue(form, 'design_project') || undefined,
        scope: radioValue(form, 'scope') || undefined,
        ...(extra.details || {})
      },
      consent: Boolean(form.elements.consent?.checked),
      website: form.elements.website?.value || '',
      started_at: startedAt,
      attribution: attribution()
    };
    submit?.setAttribute('aria-busy', 'true');
    if (submit) submit.disabled = true;
    if (status) { status.dataset.state = ''; status.textContent = 'Отправляем заявку...'; }

    try {
      const data = await postLead(payload).catch(error => {
        if (error.data?.errors) for (const [name, message] of Object.entries(error.data.errors)) setError(form, name, message);
        throw error;
      });
      goal('lead_sent', {form: formName, service: payload.service});
      const done = document.createElement('div');
      done.className = 'form-done';
      done.tabIndex = -1;
      done.setAttribute('role', 'status');
      const tg = document.querySelector('[data-tg]')?.href || 'https://t.me/dommira_consult_bot';
      done.innerHTML = `<h3>${data.id ? `Заявка №${data.id} принята` : 'Заявка принята'}</h3>
        <p>Инженер свяжется с вами в ближайшее рабочее время. Если хотите, пока задайте вопросы консультанту в Telegram.</p>
        <div><a class="btn btn--quiet" href="${escapeHtml(tg)}" target="_blank" rel="noopener" data-tg-done>Открыть Telegram</a></div>`;
      form.replaceWith(done);
      done.focus();
      onSuccess?.(data);
    } catch (error) {
      goal('form_error', {form: formName, status: error.status || 0});
      if (status) {
        status.dataset.state = 'error';
        status.innerHTML = `${escapeHtml(error.status === 422 ? 'Проверьте отмеченные поля.' : (error.message && error.status ? error.message : 'Не получилось отправить: нет связи с сервером.'))} ${error.status === 422 ? '' : fallbackLinks(form, payload)}`;
      }
    } finally {
      submit?.removeAttribute('aria-busy');
      if (submit) submit.disabled = false;
    }
  });
}

export function initForms() {
  document.querySelectorAll('form[data-lead-form]').forEach(form => attachForm(form));
  const observer = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        goal('form_open', {form: entry.target.dataset.leadForm});
        observer.unobserve(entry.target);
      }
    }
  }, {threshold: 0.4}) : null;
  document.querySelectorAll('form[data-lead-form]').forEach(form => observer?.observe(form));
}
