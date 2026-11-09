// Уведомление о cookie с выбором: принять, только необходимые, настроить.
// Без согласия аналитика не загружается. Выбор хранится 12 месяцев.

const KEY = 'dm_consent';
const VERSION = 1;
const YEAR = 365 * 86400 * 1000;

function read() {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!value || value.v !== VERSION || Date.now() - value.ts > YEAR) return null;
    return value;
  } catch {
    return null;
  }
}

function write(analytics) {
  const value = {v: VERSION, ts: Date.now(), analytics: Boolean(analytics)};
  try { localStorage.setItem(KEY, JSON.stringify(value)); } catch { /* хранилище недоступно */ }
  return value;
}

function clearMetrikaCookies() {
  for (const part of document.cookie.split(';')) {
    const name = part.split('=')[0].trim();
    if (/^_ym/.test(name)) {
      for (const domain of ['', location.hostname, `.${location.hostname}`]) {
        document.cookie = `${name}=; Max-Age=0; path=/${domain ? `; domain=${domain}` : ''}`;
      }
    }
  }
}

export function initConsent({onAnalytics}) {
  let banner = null;
  const current = read();
  if (current?.analytics) onAnalytics();

  const apply = analytics => {
    const before = read();
    write(analytics);
    banner?.remove();
    banner = null;
    if (analytics) onAnalytics();
    else if (before?.analytics) { clearMetrikaCookies(); location.reload(); }
  };

  const settings = () => {
    let dialog = document.getElementById('cookie-dialog');
    if (!dialog) {
      dialog = document.createElement('dialog');
      dialog.className = 'dialog';
      dialog.id = 'cookie-dialog';
      dialog.setAttribute('aria-labelledby', 'cookie-title');
      dialog.innerHTML = `<form class="dialog-inner" method="dialog">
        <div class="dialog-head"><h2 id="cookie-title">Настройки cookie</h2>
          <button class="icon-btn" value="cancel" aria-label="Закрыть"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button></div>
        <label class="cookie-option"><input type="checkbox" checked disabled /><span><b>Необходимые</b><span>Работа сайта, форм и защиты от спама. Без них сайт не работает.</span></span></label>
        <label class="cookie-option"><input type="checkbox" name="analytics" /><span><b>Аналитика</b><span>Яндекс Метрика: статистика посещений и вебвизор. Помогает делать сайт удобнее.</span></span></label>
        <p class="note">Подробнее в <a class="link" href="/cookies/">политике cookie</a>.</p>
        <div class="dialog-actions"><button class="btn btn--quiet" value="cancel">Отмена</button><button class="btn" value="save">Сохранить выбор</button></div>
      </form>`;
      document.body.append(dialog);
      dialog.addEventListener('close', () => {
        if (dialog.returnValue === 'save') apply(dialog.querySelector('[name="analytics"]').checked);
      });
    }
    dialog.querySelector('[name="analytics"]').checked = Boolean(read()?.analytics);
    dialog.showModal();
  };

  document.querySelectorAll('[data-cookie-settings]').forEach(button => button.addEventListener('click', settings));

  if (!current) {
    banner = document.createElement('div');
    banner.setAttribute('role', 'region');
    banner.className = 'cookie';
    banner.setAttribute('aria-label', 'Уведомление о cookie');
    banner.innerHTML = `<p>Мы используем необходимые cookie для работы сайта, а с вашего согласия Яндекс Метрику для статистики. Подробнее в <a class="link" href="/cookies/">политике cookie</a>.</p>
      <div class="cookie-actions"><button class="btn" type="button" data-accept>Принять</button><button class="btn btn--quiet" type="button" data-reject>Только необходимые</button><button class="btn btn--quiet" type="button" data-settings>Настроить</button></div>`;
    document.body.append(banner);
    banner.querySelector('[data-accept]').addEventListener('click', () => apply(true));
    banner.querySelector('[data-reject]').addEventListener('click', () => apply(false));
    banner.querySelector('[data-settings]').addEventListener('click', settings);
  }
}
