// Свежий контент из админки: телефон, почта, часы, цены, акции и вопросы.
// Страница уже собрана с контентом на момент сборки, здесь подтягиваются правки, сделанные позже.
import {renderList, getPath, formatPhone, telHref, countLists, isEmptyList} from './content-render.js';

export function applyContent(content) {
  document.querySelectorAll('[data-c]').forEach(node => {
    const value = getPath(content, node.dataset.c);
    if (typeof value !== 'string') return;
    if (node.dataset.c === 'notice') {
      node.textContent = value;
      node.hidden = !value.trim();
      return;
    }
    if (value && node.textContent !== value) node.textContent = value;
  });
  document.querySelectorAll('[data-c-list]').forEach(node => {
    const value = content[node.dataset.cList];
    if (!Array.isArray(value)) return;
    const html = renderList(node.dataset.cList, value, node.dataset.cView);
    if (node.innerHTML !== html) node.innerHTML = html;
  });
  document.querySelectorAll('[data-c-count]').forEach(node => { node.textContent = String(countLists(content, node.dataset.cCount)); });
  document.querySelectorAll('[data-c-hide-empty]').forEach(node => { node.hidden = isEmptyList(content, node.dataset.cHideEmpty); });
  const phone = content.contacts?.phone || '';
  document.querySelectorAll('[data-phone]').forEach(link => {
    if (phone) {
      link.href = telHref(phone);
      link.textContent = formatPhone(phone);
      link.hidden = false;
      link.closest('li')?.removeAttribute('hidden');
    } else {
      link.hidden = true;
    }
  });
  const email = content.contacts?.email;
  if (email) document.querySelectorAll('a[data-c-mail]').forEach(link => { link.href = `mailto:${email}`; });
}

export function initContent() {
  fetch('/api/content', {headers: {accept: 'application/json'}})
    .then(response => (response.ok ? response.json() : null))
    .then(content => { if (content) applyContent(content); })
    .catch(() => {});
}
