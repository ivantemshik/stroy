// Отрисовка редактируемого контента. Используется и при сборке (vite.config.js), и в браузере (content.js).

export const escapeHtml = value => String(value ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export function formatPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  const m = /^7(\d{3})(\d{3})(\d{2})(\d{2})$/.exec(digits);
  return m ? `+7 (${m[1]}) ${m[2]}-${m[3]}-${m[4]}` : String(phone || '');
}

export function telHref(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  return digits ? `tel:+${digits}` : '';
}

const LISTS = {
  prices: rows => rows.map(row => `<tr><th scope="row">${escapeHtml(row.name)}</th><td>${escapeHtml(row.price)}</td></tr>`).join(''),
  promo: items => items.map(item => `<li><b>${escapeHtml(item.title)}</b><span>${escapeHtml(item.text)}</span></li>`).join(''),
  faq: items => items.map(item => `<details data-faq><summary>${escapeHtml(item.q)}<span aria-hidden="true">+</span></summary><p>${escapeHtml(item.a)}</p></details>`).join('')
};

export function listKind(key) {
  if (key.endsWith('.prices')) return 'prices';
  if (key.endsWith('.promo')) return 'promo';
  if (key.endsWith('.faq')) return 'faq';
  return null;
}

export function renderList(key, value) {
  const kind = listKind(key);
  return kind && Array.isArray(value) ? LISTS[kind](value) : '';
}

// Ключи вида "home.prices" хранятся целиком, а "contacts.email" это поле объекта contacts.
export function getPath(content, path) {
  if (path in content) return content[path];
  const [head, ...rest] = path.split('.');
  return rest.reduce((acc, part) => acc?.[part], content[head]);
}

export function faqJsonLd(items) {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: (items || []).map(item => ({'@type': 'Question', name: item.q, acceptedAnswer: {'@type': 'Answer', text: item.a}}))
  });
}

// Подстановка контента в HTML страницы при сборке. Разметка страниц написана так,
// чтобы внутри элементов с data-c-list не было вложенных тегов того же имени.
export function bakeHtml(html, content) {
  let out = html.replace(/<(\w+)([^>]*?)\sdata-c-list="([\w.]+)"([^>]*)>([\s\S]*?)<\/\1>/g, (match, tag, before, key, after) => {
    const value = content[key];
    if (!Array.isArray(value)) return match;
    return `<${tag}${before} data-c-list="${key}"${after}>${renderList(key, value)}</${tag}>`;
  });
  out = out.replace(/<script type="application\/ld\+json" data-c-jsonld="([\w.]+)">[\s\S]*?<\/script>/g, (match, key) =>
    Array.isArray(content[key]) ? `<script type="application/ld+json" data-c-jsonld="${key}">${faqJsonLd(content[key])}</script>` : match);
  out = out.replace(/<(\w+)([^>]*?)\sdata-c="([\w.]+)"([^>]*)>([^<]*)<\/\1>/g, (match, tag, before, path, after) => {
    const value = getPath(content, path);
    return typeof value === 'string' && value ? `<${tag}${before} data-c="${path}"${after}>${escapeHtml(value)}</${tag}>` : match;
  });
  const phone = content.contacts?.phone || '';
  out = out.replace(/<a([^>]*?)\sdata-phone([^>]*?)>([^<]*)<\/a>/g, (match, before, after) => {
    if (!phone) return match;
    const attrs = `${before} data-phone${after}`.replace(/\shref="[^"]*"/, '').replace(/\shidden(="[^"]*")?/, '');
    return `<a${attrs} href="${telHref(phone)}">${escapeHtml(formatPhone(phone))}</a>`;
  });
  const email = content.contacts?.email;
  if (email) out = out.replace(/href="mailto:[^"?]*(\?[^"]*)?"\s+data-c-mail/g, (match, query = '') => `href="mailto:${escapeHtml(email)}${query}" data-c-mail`);
  return out;
}
