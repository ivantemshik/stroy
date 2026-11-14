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

// Группы прайса: заголовки для таблиц, разметки для поиска и базы знаний ИИ-консультанта.
export const PRICE_GROUPS = {
  'build.prices': 'Строительство и конструктив',
  'finish.prices': 'Отделочные работы',
  'engineering.prices': 'Инженерные системы',
  'landscape.prices': 'Участок и благоустройство',
  'design.prices': 'Проектирование'
};

// «от 70 000 ₽/м²»: число крупно, рубли и единица мельче, как в таблице цен «Проектирования».
const priceHtml = price => escapeHtml(price).replace(/^(.*\d)\s*(₽.*)$/, '$1 <small>$2</small>');
// В карточке прайса «от» и единица мелко и приглушённо, сумма крупно.
const priceCardHtml = price => escapeHtml(price).replace(/^от\s+/, '<small>от</small> ').replace(/(\d)\s*(₽.*)$/, '$1 <small>$2</small>');
const initial = name => escapeHtml((String(name || '').trim().match(/[\p{L}\d]/u) || ['•'])[0].toUpperCase());

// Цена строкой в число и единицу для разметки Offer: «от 6 500 ₽/м³» → 6500 и «м³».
export function parsePrice(price) {
  const match = /(\d[\d\s]*)\s*₽\s*(?:\/\s*(.+))?$/.exec(String(price || ''));
  return match ? {value: Number(match[1].replace(/\s/g, '')), unit: (match[2] || '').trim()} : null;
}

const LISTS = {
  prices: rows => rows.map(row => row.code
    ? `<tr class="has-code"><th scope="row">${escapeHtml(row.code)}</th><td>${escapeHtml(row.name)}</td><td>${priceHtml(row.price)}</td></tr>`
    : `<tr><th scope="row">${escapeHtml(row.name)}</th><td>${priceHtml(row.price)}</td></tr>`).join(''),
  promo: items => items.map(item => `<li><b>${escapeHtml(item.title)}</b><span>${escapeHtml(item.text)}</span></li>`).join(''),
  paras: items => items.map(item => `<p>${escapeHtml(item.text)}</p>`).join(''),
  facts: items => items.map(item => `<li><strong>${escapeHtml(item.value)}</strong><span>${escapeHtml(item.label)}</span></li>`).join(''),
  faq: items => items.map(item => `<details data-faq><summary>${escapeHtml(item.q)}<span aria-hidden="true">+</span></summary><p>${escapeHtml(item.a)}</p></details>`).join(''),
  // Только настоящие отзывы из админки: имя, где и когда оставлен. Без фото и звёзд, которых у отзыва нет.
  reviews: items => items.map(item => `<article class="review-card"><div class="review-person"><span class="review-initial" aria-hidden="true">${initial(item.name)}</span><div><h3>${escapeHtml(item.name)}</h3>${item.source || item.date ? `<p class="review-source">${escapeHtml([item.source, item.date].filter(Boolean).join(', '))}</p>` : ''}</div></div>${item.subject ? `<p class="review-subject">${escapeHtml(item.subject)}</p>` : ''}<p class="review-copy">${escapeHtml(item.text)}</p></article>`).join('')
};

// Другие виды того же списка: data-c-view="cards" у прайса в окне «Полный прайс».
const VIEWS = {
  cards: rows => rows.map(row => `<li class="price-card"><span class="price-card-name">${row.code ? `<b>${escapeHtml(row.code)}</b>` : ''}${escapeHtml(row.name)}</span><span class="price-card-value">${priceCardHtml(row.price)}</span></li>`).join('')
};

export function listKind(key) {
  if (key.endsWith('.prices')) return 'prices';
  if (key.endsWith('.promo')) return 'promo';
  if (key.endsWith('.faq')) return 'faq';
  if (key.endsWith('.paras')) return 'paras';
  if (key.endsWith('.facts')) return 'facts';
  if (key.endsWith('.reviews')) return 'reviews';
  return null;
}

export function renderList(key, value, view) {
  if (!Array.isArray(value)) return '';
  if (view && VIEWS[view]) return VIEWS[view](value);
  const kind = listKind(key);
  return kind ? LISTS[kind](value) : '';
}

// Сколько строк в списках (через пробел можно несколько): «65 работ» на кнопке прайса.
export function countLists(content, keys) {
  return String(keys).trim().split(/\s+/).reduce((sum, key) => sum + (Array.isArray(content[key]) ? content[key].length : 0), 0);
}

// Пустой список прячет блок или ссылку на него (data-c-hide-empty), например отзывы, пока их нет.
export const isEmptyList = (content, key) => !Array.isArray(content[key]) || content[key].length === 0;

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

// Каталог цен для разметки Service: группы прайса, в каждой работы с ценой «от» и единицей.
export function offerCatalog(content, keys) {
  return {
    '@type': 'OfferCatalog',
    name: 'Цены за работу без материалов',
    itemListElement: keys.filter(key => Array.isArray(content[key])).map(key => ({
      '@type': 'OfferCatalog',
      name: PRICE_GROUPS[key] || key,
      itemListElement: content[key].map(row => ({row, price: parsePrice(row.price)})).filter(({price}) => price).map(({row, price}) => ({
        '@type': 'Offer',
        itemOffered: {'@type': 'Service', name: row.name},
        priceSpecification: {'@type': 'UnitPriceSpecification', minPrice: price.value, priceCurrency: 'RUB', ...(price.unit ? {unitText: price.unit} : {})}
      }))
    }))
  };
}

// Подстановка контента в HTML страницы при сборке. Разметка страниц написана так,
// чтобы внутри элементов с data-c-list не было вложенных тегов того же имени.
export function bakeHtml(html, content) {
  let out = html.replace(/<(\w+)([^>]*?)\sdata-c-list="([\w.]+)"([^>]*)>([\s\S]*?)<\/\1>/g, (match, tag, before, key, after) => {
    const value = content[key];
    if (!Array.isArray(value)) return match;
    const view = /data-c-view="(\w+)"/.exec(before + after)?.[1];
    return `<${tag}${before} data-c-list="${key}"${after}>${renderList(key, value, view)}</${tag}>`;
  });
  out = out.replace(/(<\w+[^>]*?\sdata-c-count="([\w. ]+)"[^>]*>)\d*(<\/\w+>)/g, (match, open, keys, close) => `${open}${countLists(content, keys)}${close}`);
  out = out.replace(/<(\w+)([^>]*?)\sdata-c-hide-empty="([\w.]+)"([^>]*?)(\/?)>/g, (match, tag, before, key, after, slash) => {
    const attrs = `${before} data-c-hide-empty="${key}"${after}`.replace(/\shidden(="[^"]*")?/g, '');
    return `<${tag}${attrs}${isEmptyList(content, key) ? ' hidden' : ''}${slash}>`;
  });
  out = out.replace(/<script type="application\/ld\+json" data-c-jsonld="([\w.]+)">[\s\S]*?<\/script>/g, (match, key) =>
    Array.isArray(content[key]) ? `<script type="application/ld+json" data-c-jsonld="${key}">${faqJsonLd(content[key])}</script>` : match);
  // Разметка услуги с ценами из прайса: data-c-offers перечисляет группы через пробел.
  out = out.replace(/<script type="application\/ld\+json" data-c-offers="([\w. ]+)">([\s\S]*?)<\/script>/g, (match, keys, base) => {
    try {
      const data = {...JSON.parse(base), hasOfferCatalog: offerCatalog(content, keys.trim().split(/\s+/))};
      return `<script type="application/ld+json" data-c-offers="${keys}">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;
    } catch {
      return match;
    }
  });
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
