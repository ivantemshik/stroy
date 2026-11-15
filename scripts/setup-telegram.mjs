// Настройка ботов: вебхуки на сайт, команды и описания. Запуск: npm run tg:setup -- --url=https://site
import './load-env.mjs';
import {tg} from '../server/telegram.js';

const args = Object.fromEntries(process.argv.slice(2).map(a => a.replace(/^--/, '').split('=')).map(([k, ...v]) => [k, v.join('=')]));
const base = (args.url || process.env.SITE_URL || '').replace(/\/$/, '');
const secret = process.env.TG_WEBHOOK_SECRET;
if (!/^https:\/\//.test(base)) throw new Error('Нужен адрес сайта с https: --url=https://...');
if (!secret) throw new Error('Не задан TG_WEBHOOK_SECRET');

const admin = process.env.TG_ADMIN_BOT_TOKEN;
const client = process.env.TG_CLIENT_BOT_TOKEN;

await tg(admin, 'setWebhook', {url: `${base}/api/tg/admin`, secret_token: secret, allowed_updates: ['message', 'callback_query', 'my_chat_member'], drop_pending_updates: false});
await tg(admin, 'setMyCommands', {commands: [
  {command: 'leads', description: 'Открытые заявки'},
  {command: 'stats', description: 'Цифры за сутки и неделю'},
  {command: 'help', description: 'Как работать с ботом'}
]});
await tg(admin, 'setMyDescription', {description: 'Служебный бот «Дом Мира»: заявки с сайта и от ИИ-консультанта. Доступ только для сотрудников.'});
await tg(admin, 'setMyShortDescription', {short_description: 'Заявки «Дом Мира» для сотрудников'});
console.log('Админ-бот настроен');

await tg(client, 'setWebhook', {url: `${base}/api/tg/client`, secret_token: secret, allowed_updates: ['message', 'callback_query'], drop_pending_updates: false});
await tg(client, 'setMyCommands', {commands: [
  {command: 'start', description: 'Начать разговор'},
  {command: 'manager', description: 'Позвать менеджера'},
  {command: 'delete', description: 'Удалить мои данные'},
  {command: 'help', description: 'Помощь'}
]});
await tg(client, 'setMyDescription', {description: 'Консультант «Дом Мира»: строительство домов под ключ и отделка в Москве и Московской области. Отвечу о ценах, материалах и сроках, помогу оставить заявку на бесплатный расчёт сметы. Отвечает ИИ, менеджер подключится по запросу.'});
await tg(client, 'setMyShortDescription', {short_description: 'Строительство домов и отделка: цены, сроки, расчёт сметы'});
console.log('ИИ-консультант настроен');

for (const [name, token] of [['admin', admin], ['client', client]]) {
  const info = await tg(token, 'getWebhookInfo');
  console.log(name, info.url, info.last_error_message || 'без ошибок');
}
