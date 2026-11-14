// Контент страниц: прайс карточками в окне «Полный прайс», счётчики работ и отзывы только из админки.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {renderList, bakeHtml, countLists} from '../src/site/content-render.js';
import {CONTENT_DEFAULTS, LIST_FIELDS} from '../server/content-defaults.js';

const ALL_PRICES = 'build.prices finish.prices engineering.prices landscape.prices design.prices';

test('прайс карточками: «от» и единица мелко, код раздела отдельно', () => {
  assert.equal(renderList('design.prices', [{code: 'ЭП', name: 'Эскизный проект', price: 'от 700 ₽/м²'}], 'cards'),
    '<li class="price-card"><span class="price-card-name"><b>ЭП</b>Эскизный проект</span><span class="price-card-value"><small>от</small> 700 <small>₽/м²</small></span></li>');
  assert.match(renderList('build.prices', [{name: '<i>x</i>', price: 'от 1 ₽/шт.'}], 'cards'), /&lt;i&gt;x&lt;\/i&gt;/);
});

test('счётчик работ подставляется при сборке', () => {
  assert.equal(countLists(CONTENT_DEFAULTS, ALL_PRICES), 65);
  assert.equal(bakeHtml('<span data-c-count="build.prices"></span>', CONTENT_DEFAULTS), '<span data-c-count="build.prices">16</span>');
  assert.equal(bakeHtml(`<span data-c-count="${ALL_PRICES}">1</span>`, CONTENT_DEFAULTS), `<span data-c-count="${ALL_PRICES}">65</span>`);
});

test('отзывы: только из админки, пока их нет, блок и ссылки «Отзывы» скрыты', () => {
  assert.deepEqual(CONTENT_DEFAULTS['home.reviews'], [], 'по умолчанию отзывов нет, выдуманных быть не должно');
  assert.deepEqual(LIST_FIELDS['home.reviews'], ['name', 'subject', 'text', 'source', 'date']);
  const html = '<section id="reviews" data-c-hide-empty="home.reviews"><div class="reviews-grid" data-c-list="home.reviews"></div></section><a href="/#reviews" data-c-hide-empty="home.reviews">Отзывы</a>';
  const empty = bakeHtml(html, CONTENT_DEFAULTS);
  assert.match(empty, /<section id="reviews" data-c-hide-empty="home.reviews" hidden>/);
  assert.match(empty, /<a href="\/#reviews" data-c-hide-empty="home.reviews" hidden>/);
  const filled = bakeHtml(html, {...CONTENT_DEFAULTS, 'home.reviews': [{name: 'Анна <b>', subject: 'Отделка', text: 'Всё сделали в срок', source: 'Яндекс Карты', date: 'ноябрь 2026'}]});
  assert.ok(!/\shidden/.test(filled), 'с отзывом блок и ссылки видны');
  assert.match(filled, /<h3>Анна &lt;b&gt;<\/h3>/);
  assert.match(filled, /<p class="review-source">Яндекс Карты, ноябрь 2026<\/p>/);
  assert.match(filled, /<span class="review-initial" aria-hidden="true">А<\/span>/);
});
