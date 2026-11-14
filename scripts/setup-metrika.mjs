// Создаёт цели Яндекс Метрики по плану research/yandex-metrika.md. Повторный запуск пропускает существующие.
// Запуск: node scripts/setup-metrika.mjs  (нужны YM_COUNTER_ID и YANDEX_METRIKA_TOKEN)
import './load-env.mjs';

const counter = process.env.YM_COUNTER_ID;
const token = process.env.YANDEX_METRIKA_TOKEN;
if (!counter || !token) throw new Error('Нужны YM_COUNTER_ID и YANDEX_METRIKA_TOKEN');
const api = async (path, {method = 'GET', body} = {}) => {
  const response = await fetch(`https://api-metrika.yandex.net/management/v1/counter/${counter}${path}`, {
    method, headers: {Authorization: `OAuth ${token}`, 'content-type': 'application/json'}, body: body ? JSON.stringify(body) : undefined
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${method} ${path}: ${response.status} ${JSON.stringify(data).slice(0, 300)}`);
  return data;
};

const action = (name, id) => ({name, type: 'action', conditions: [{type: 'exact', url: id}]});
const GOALS = [
  action('Заявка отправлена', 'lead_sent'),
  action('Открыта форма заявки', 'form_open'),
  action('Начато заполнение формы', 'form_start'),
  action('Ошибка в форме', 'form_error'),
  action('Начат расчёт стоимости', 'calc_start'),
  action('Показан расчёт', 'calc_result'),
  action('Переход в Telegram консультант', 'tg_click'),
  action('Клик по телефону', 'phone_click'),
  action('Клик по почте', 'email_click'),
  action('Просмотр цен', 'prices_view'),
  action('Открыт объект портфолио', 'portfolio_open'),
  action('Открыт вопрос FAQ', 'faq_open'),
  action('Офлайн: заявка из Telegram бота', 'bot_lead'),
  action('Офлайн: заявка целевая', 'lead_qualified'),
  action('Офлайн: встреча или выезд', 'meeting'),
  action('Офлайн: договор подписан', 'contract'),
  {name: 'Путь: форма → заявка', type: 'step', steps: [action('Открыта форма', 'form_open'), action('Заявка', 'lead_sent')]},
  {name: 'Путь: расчёт → заявка', type: 'step', steps: [action('Начат расчёт', 'calc_start'), action('Показан расчёт', 'calc_result'), action('Заявка', 'lead_sent')]}
];

const existing = (await api('/goals')).goals || [];
const names = new Set(existing.map(goal => goal.name));
for (const goal of GOALS) {
  if (names.has(goal.name)) { console.log('есть  ', goal.name); continue; }
  const created = await api('/goals', {method: 'POST', body: {goal}});
  console.log('создана', goal.name, created.goal?.id);
}

// Вебвизор: без записи содержимого полей форм (персональные данные).
const {counter: info} = await api('?field=webvisor');
const webvisor = {...(info.webvisor || {}), wv_forms: 0};
await api('', {method: 'PUT', body: {counter: {webvisor}}});
console.log('вебвизор: запись содержимого полей выключена');
console.log('всего целей:', ((await api('/goals')).goals || []).length);
