// Яндекс Метрика загружается только после согласия на аналитические cookie.
// UTM метки и источник первого захода хранятся в sessionStorage и уходят вместе с заявкой.

const meta = document.querySelector('meta[name="ym-counter"]');
const COUNTER = /^\d+$/.test(meta?.content?.trim() || '') ? Number(meta.content.trim()) : null;
const ATTR_KEY = 'dm_attr';
const CID_KEY = 'dm_cid';
let loaded = false;
let clientId = null;

const store = {
  get(key) { try { return sessionStorage.getItem(key); } catch { return null; } },
  set(key, value) { try { sessionStorage.setItem(key, value); } catch { /* приватный режим */ } }
};

export function captureAttribution() {
  if (store.get(ATTR_KEY)) return;
  const params = new URLSearchParams(location.search);
  const data = {};
  for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'yclid', 'gclid']) {
    const value = params.get(key);
    if (value) data[key] = value.slice(0, 150);
  }
  if (document.referrer) {
    try {
      const ref = new URL(document.referrer);
      if (ref.host !== location.host) data.referrer = `${ref.origin}${ref.pathname}`.slice(0, 300);
    } catch { /* пустой реферер */ }
  }
  data.landing_page = location.pathname;
  store.set(ATTR_KEY, JSON.stringify(data));
}

export function attribution() {
  let data = {};
  try { data = JSON.parse(store.get(ATTR_KEY) || '{}'); } catch { data = {}; }
  const cid = clientId || store.get(CID_KEY);
  if (cid) data.ym_client_id = cid;
  return data;
}

export function getClientId() {
  return clientId || store.get(CID_KEY);
}

export function loadMetrika(onReady) {
  if (!COUNTER || loaded) return;
  loaded = true;
  /* eslint-disable */
  (function (m, e, t, r, i, k, a) {
    m[i] = m[i] || function () { (m[i].a = m[i].a || []).push(arguments); };
    m[i].l = 1 * new Date();
    k = e.createElement(t); a = e.getElementsByTagName(t)[0]; k.async = 1; k.src = r; a.parentNode.insertBefore(k, a);
  })(window, document, 'script', 'https://mc.yandex.ru/metrika/tag.js', 'ym');
  /* eslint-enable */
  window.ym(COUNTER, 'init', {clickmap: true, trackLinks: true, accurateTrackBounce: true, webvisor: true, trackHash: false});
  window.ym(COUNTER, 'getClientID', id => {
    clientId = String(id);
    store.set(CID_KEY, clientId);
    onReady?.(clientId);
  });
}

export function goal(name, params = {}) {
  if (!COUNTER || !loaded || typeof window.ym !== 'function') return;
  window.ym(COUNTER, 'reachGoal', name, {page: location.pathname, ...params});
}

export function metrikaEnabled() {
  return Boolean(COUNTER);
}
