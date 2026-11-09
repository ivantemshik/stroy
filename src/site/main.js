// Общий скрипт страниц сайта.
import {captureAttribution, loadMetrika, goal, getClientId} from './analytics.js';
import {initConsent} from './consent.js';
import {initForms} from './forms.js';
import {initCalc} from './calc.js';
import {initObjects, initPhotoLinks} from './objects.js';
import {initContent} from './content.js';

const page = document.body.dataset.page || 'home';

// Ссылки на ИИ-консультанта несут страницу и ClientID Метрики, чтобы заявка из бота связалась с визитом.
function updateTelegramLinks(clientId = getClientId()) {
  document.querySelectorAll('a[data-tg], a[data-tg-done]').forEach(link => {
    try {
      const url = new URL(link.href);
      url.searchParams.set('start', `s_${page}${clientId ? `_${clientId}` : ''}`.slice(0, 64));
      link.href = url.toString();
    } catch { /* ссылка без адреса */ }
  });
}

function initMenu() {
  const toggle = document.querySelector('.menu-toggle');
  const menu = document.getElementById('mobile-menu');
  if (!toggle || !menu) return;
  const set = open => {
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Закрыть меню' : 'Открыть меню');
    menu.hidden = !open;
  };
  toggle.addEventListener('click', () => set(menu.hidden));
  menu.querySelectorAll('a').forEach(link => link.addEventListener('click', () => set(false)));
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && !menu.hidden) { set(false); toggle.focus(); } });
}

function initTabs() {
  document.querySelectorAll('[data-switch]').forEach(root => {
    const tabs = [...root.querySelectorAll('[role="tab"]')];
    const select = tab => {
      tabs.forEach(other => {
        const selected = other === tab;
        other.setAttribute('aria-selected', String(selected));
        other.tabIndex = selected ? 0 : -1;
        document.getElementById(other.getAttribute('aria-controls')).hidden = !selected;
      });
    };
    tabs.forEach((tab, index) => {
      tab.addEventListener('click', () => select(tab));
      tab.addEventListener('keydown', event => {
        const delta = {ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1}[event.key];
        if (!delta) return;
        event.preventDefault();
        const next = tabs[(index + delta + tabs.length) % tabs.length];
        select(next);
        next.focus();
      });
    });
  });
}

function initGoals() {
  document.addEventListener('click', event => {
    const target = event.target.closest('a, button');
    if (!target) return;
    if (target.matches('a[data-tg], a[data-tg-done]')) goal('tg_click', {place: target.closest('section, header, footer')?.id || 'page'});
    else if (target.matches('a[href^="tel:"]')) goal('phone_click');
    else if (target.matches('a[href^="mailto:"]')) goal('email_click');
  });
  document.addEventListener('toggle', event => {
    if (event.target.matches?.('details[data-faq]') && event.target.open) goal('faq_open', {question: event.target.querySelector('summary')?.textContent?.slice(0, 80)});
  }, true);
  const viewed = document.querySelectorAll('[data-goal-view]');
  if (!('IntersectionObserver' in window)) return;
  const timers = new Map();
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        timers.set(entry.target, setTimeout(() => { goal(entry.target.dataset.goalView); observer.unobserve(entry.target); }, 2000));
      } else {
        clearTimeout(timers.get(entry.target));
      }
    }
  }, {threshold: 0.4});
  viewed.forEach(node => observer.observe(node));
}

captureAttribution();
updateTelegramLinks();
initMenu();
initTabs();
initGoals();
initConsent({onAnalytics: () => loadMetrika(updateTelegramLinks)});
initForms();
initCalc();
initObjects();
initPhotoLinks();
initContent();
