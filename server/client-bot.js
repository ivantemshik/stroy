// Клиентский Telegram бот: ИИ-консультант «Дом Мира».
// Сначала клиент отмечает согласие на обработку данных. До этого бот хранит только технические
// идентификаторы чата: не сохраняет текст и контакты, не передаёт их модели и менеджерам, не создаёт заявку.
// После согласия отвечает по базе знаний, уточняет задачу, собирает заявку и передаёт её в админ-бот.
import {waitUntil} from '@vercel/functions';
import {db} from './db.js';
import {config} from './env.js';
import {HttpError, json, readJson, safeEqual} from './http.js';
import {tg, esc, clip} from './telegram.js';
import {getSetting} from './settings.js';
import {rateLimited, audit} from './security.js';
import {chat, parseJsonLoose} from './ai/llm.js';
import {pickKnowledge, buildSystemPrompt} from './ai/prompt.js';
import {insertLead, getLead, addEvent, markFirstContact} from './lead-core.js';
import {notifyNewLead, alertError, leadUrl, refreshLeadMessages, notifyOwners} from './notify.js';
import {enqueueConversion} from './metrika.js';
import {pushToCrm} from './crm.js';
import {normalizePhone, normalizeEmail, normalizeService, cleanLine, cleanText} from './validate.js';
import {statusLabel} from './permissions.js';

const token = () => config.telegram.clientToken;
const adminToken = () => config.telegram.adminToken;

// Версия текста согласия в чате: хранится в диалоге и в заявке вместе с датой и каналом подтверждения.
export const BOT_CONSENT_VERSION = 'bot-2026-11-13';
const LEGACY_CONSENT_VERSION = '2026-11-09';
const CONSENT_TEXT = 'Даю ООО «ГК ВЕСЬ МИР» согласие на обработку моих персональных данных, включая их сбор и передачу для консультации и обработки заявки.';

const SERVICE_BUTTONS = [
  [{text: 'Строительство дома', callback_data: 'svc:construction'}, {text: 'Отделка', callback_data: 'svc:finishing'}],
  [{text: 'Проектирование', callback_data: 'svc:design'}, {text: 'Другой вопрос', callback_data: 'svc:other'}],
  [{text: 'Позвать менеджера', callback_data: 'manager'}]
];
const SERVICE_TEXT = {
  construction: 'Интересует строительство дома',
  finishing: 'Интересует отделка дома',
  design: 'Интересует проектирование дома',
  engineering: 'Интересуют инженерные системы для дома',
  landscape: 'Интересует благоустройство участка и ландшафт',
  lighting: 'Интересует архитектурное освещение дома и участка',
  furniture: 'Интересует корпусная мебель на заказ',
  other: 'У меня другой вопрос'
};
const FIELD_KEYS = ['name', 'phone', 'service', 'object', 'area', 'location', 'budget', 'timing', 'has_project', 'has_plot', 'material', 'notes'];

// ---------- Обновления Telegram ----------
// Обновление помечается processing и после обработки done. Упавшее сохраняется (failed) и повторяется
// плановой проверкой, всего не больше трёх попыток. Повтор уже взятого в работу обновления отбрасывается.
// Обновление сохраняется сразу при получении, а не только при ошибке: если обработчик остановится на полпути
// (таймаут функции, перезапуск), плановая проверка найдёт его в состоянии «в работе» и повторит.
// Повторно забрать можно упавшее или зависшее дольше 3 минут, не больше трёх попыток.
export async function claimUpdate(bot, update) {
  const updateId = update?.update_id;
  if (updateId === undefined || updateId === null) return true;
  const payload = await safePayload(bot, update);
  const rows = await db()`
    insert into tg_updates (bot, update_id, status, attempts, payload) values (${bot}, ${updateId}, 'processing', 1, ${db().json(payload)})
    on conflict (bot, update_id) do update set status = 'processing', attempts = tg_updates.attempts + 1, updated_at = now(),
      payload = coalesce(tg_updates.payload, excluded.payload)
      where (tg_updates.status = 'failed' or (tg_updates.status = 'processing' and tg_updates.updated_at < now() - interval '3 minutes'))
        and tg_updates.attempts < 3
    returning update_id`;
  return rows.length > 0;
}

// Пока клиент не дал согласие, текст, подпись и контакт из его сообщения не храним даже для повтора.
async function safePayload(bot, update) {
  if (bot !== 'client' || !update?.message) return update;
  const [conv] = await db()`select consent_at from conversations where tg_chat_id = ${update.message.chat?.id ?? 0}`.catch(() => []);
  return conv?.consent_at ? update : {...update, message: {...update.message, text: undefined, caption: undefined, contact: undefined}};
}

export async function finishUpdate(bot, updateId) {
  if (updateId === undefined || updateId === null) return;
  await db()`update tg_updates set status = 'done', payload = null, updated_at = now() where bot = ${bot} and update_id = ${updateId}`.catch(() => {});
}

// Упавшее обновление сохраняется для повтора. Пока клиент не дал согласие, текст и контакт в нём не храним.
export async function failUpdate(bot, update) {
  if (update?.update_id === undefined || update?.update_id === null) return;
  const payload = await safePayload(bot, update);
  await db()`update tg_updates set status = 'failed', payload = ${db().json(payload)}, updated_at = now()
    where bot = ${bot} and update_id = ${update.update_id}`.catch(() => {});
}

export function checkWebhookSecret(request) {
  const expected = config.telegram.webhookSecret;
  const got = request.headers.get('x-telegram-bot-api-secret-token') || '';
  if (!expected || !safeEqual(got, expected)) throw new HttpError(401, 'Неверный секрет вебхука');
}

export function runInBackground(promise) {
  try { waitUntil(promise); } catch { /* локальная разработка */ }
  return promise;
}

export async function clientWebhook({request}) {
  checkWebhookSecret(request);
  const update = await readJson(request, 512 * 1024);
  if (!await claimUpdate('client', update)) return json({ok: true});
  const task = handleUpdate(update)
    .then(() => finishUpdate('client', update.update_id))
    .catch(async error => {
      console.error('client bot', error);
      await failUpdate('client', update);
      return alertError('ИИ-консультант', error.message);
    })
    // Заодно плановая проверка (не чаще раза в 4 минуты): повтор упавших и зависших сообщений, напоминания.
    .then(() => import('./cron.js').then(cron => cron.runTick()).catch(() => {}));
  runInBackground(task);
  if (!process.env.VERCEL) await task;
  return json({ok: true});
}

// Для повтора упавших обновлений из плановой проверки.
export const handleClientUpdate = update => handleUpdate(update);

// Ошибка отправки (клиент заблокировал бота, чат удалён) не должна ронять обработку диалога и заявки.
async function send(chatId, text, extra = {}) {
  try {
    return await tg(token(), 'sendMessage', {chat_id: chatId, text: clip(text, 3900), link_preview_options: {is_disabled: true}, ...extra});
  } catch (error) {
    if (/blocked|deactivated|chat not found/i.test(error.description || '')) {
      await db()`update conversations set blocked = ${/blocked|deactivated/i.test(error.description)} where tg_chat_id = ${chatId}`.catch(() => {});
      return null;
    }
    throw error;
  }
}

// До согласия храним только технические идентификаторы чата. Имя и ник пишем после согласия.
async function getConversation(chatId, from) {
  const sql = db();
  const [conv] = await sql`
    insert into conversations (tg_user_id, tg_chat_id, last_message_at) values (${from.id}, ${chatId}, now())
    on conflict (tg_chat_id) do update set updated_at = now()
    returning *`;
  const changed = conv.tg_username !== (from.username || null) || conv.first_name !== (from.first_name || null) || conv.last_name !== (from.last_name || null);
  if (conv.consent_at && changed) {
    const [fresh] = await sql`update conversations set tg_username = ${from.username || null}, first_name = ${from.first_name || null},
      last_name = ${from.last_name || null} where id = ${conv.id} returning *`;
    return fresh;
  }
  return conv;
}

async function saveMessage(convId, role, text, meta = {}) {
  const sql = db();
  await sql`insert into messages (conversation_id, role, text, tg_message_id, provider, model, latency_ms, prompt_tokens, completion_tokens, manager_id)
    values (${convId}, ${role}, ${clip(text, 6000)}, ${meta.tgMessageId || null}, ${meta.provider || null}, ${meta.model || null},
      ${meta.latency || null}, ${meta.promptTokens || null}, ${meta.completionTokens || null}, ${meta.managerId || null})`;
  await sql`update conversations set messages_count = messages_count + 1, last_message_at = now(), updated_at = now() where id = ${convId}`;
}

// Разбирает параметр /start: s_<страница>_<ClientID Метрики> с сайта или любая метка рекламы.
export function parseStartParam(param) {
  const value = String(param || '').slice(0, 64);
  if (!value) return {source: 'telegram'};
  const landing = page => page ? `/${page === 'home' ? '' : `${page}/`}` : '/';
  const site = /^s_([a-z0-9-]*)_?(\d{6,30})?$/i.exec(value);
  if (site) return {source: 'site', landing: landing(site[1]), clientId: site[2] || null};
  // Запись из окна услуги на сайте: u_<услуга>_<страница>_<ClientID>, бот сразу начинает разговор об этой услуге.
  const service = /^u_([a-z]+)_([a-z0-9-]*)_?(\d{6,30})?$/i.exec(value);
  if (service) return {source: 'site', landing: landing(service[2]), clientId: service[3] || null, service: Object.hasOwn(SERVICE_TEXT, service[1]) ? service[1] : null};
  return {source: value.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40) || 'telegram'};
}

// ---------- Контакты в тексте клиента ----------
// Телефон и почту из сообщения сохраняем сами, а в модель отправляем текст без них:
// для ответа консультанту контакты не нужны.
const PHONE_CANDIDATE = /\+?\d[\d\s()-]{8,}\d/g;
const EMAIL_PATTERN = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;

export function extractContacts(text) {
  const out = {};
  for (const match of String(text || '').match(PHONE_CANDIDATE) || []) {
    const phone = normalizePhone(match);
    if (phone) { out.phone = phone; break; }
  }
  const email = (String(text || '').match(EMAIL_PATTERN) || [])[0];
  if (email && normalizeEmail(email)) out.email = normalizeEmail(email);
  return out;
}

export function maskContacts(text) {
  return String(text || '').replace(EMAIL_PATTERN, '[почта]').replace(PHONE_CANDIDATE, match => normalizePhone(match) ? '[телефон]' : match);
}

// ---------- Согласие ----------

const consentText = done => `${done ? '☑' : '☐'} ${CONSENT_TEXT}\n\nТекст согласия: ${config.siteUrl}/soglasie/\nПолитика обработки данных: ${config.siteUrl}/privacy/`;

async function askConsent(conv, intro = '') {
  await send(conv.tg_chat_id, `${intro ? `${intro}\n\n` : ''}${consentText(false)}`, {
    reply_markup: {inline_keyboard: [[{text: '☐ Даю согласие', callback_data: 'consent:yes'}, {text: 'Не согласен', callback_data: 'consent:no'}]]}
  });
}

async function applyStartParam(conv) {
  const info = parseStartParam(conv.start_param);
  await db()`update conversations set source = coalesce(source, ${info.source}), landing_page = coalesce(landing_page, ${info.landing || null}),
    ym_client_id = coalesce(${info.clientId || null}, ym_client_id) where id = ${conv.id}`;
}

async function handleUpdate(update) {
  if (update.callback_query) return handleCallback(update.callback_query);
  const message = update.message;
  if (!message || message.chat?.type !== 'private' || !message.from || message.from.is_bot) return;
  const chatId = message.chat.id;
  const conv = await getConversation(chatId, message.from);
  if (conv.blocked) return;

  const text = cleanText(message.text || message.caption || '', 2000);
  if (text.startsWith('/start')) return handleStart(conv, text.split(/\s+/)[1]);
  if (text === '/delete') {
    await send(chatId, 'Удалить переписку и ваши контакты из нашей базы? Это нельзя отменить.', {
      reply_markup: {inline_keyboard: [[{text: 'Да, удалить', callback_data: 'delete:yes'}, {text: 'Отмена', callback_data: 'delete:no'}]]}
    });
    return;
  }
  if (text === '/help') {
    await send(chatId, 'Задайте вопрос о строительстве, отделке или ценах. Команды: /manager позвать менеджера, /delete удалить мои данные.');
    return;
  }

  // Без согласия ничего не сохраняем и никуда не передаём, а показываем отметку согласия.
  if (!conv.consent_at) {
    if (message.contact) return askConsent(conv, 'Номер не сохранён: сначала нужно согласие на обработку данных.');
    if (text === '/manager') return askConsent(conv, 'Чтобы подключить менеджера, нужно согласие на обработку данных.');
    if (text) {
      await db()`update conversations set consent_pending = true where id = ${conv.id}`;
      return askConsent(conv, 'Чтобы ответить, нужно согласие на обработку данных. После отметки отправьте вопрос ещё раз: до согласия мы его не сохраняем.');
    }
    return askConsent(conv);
  }

  if (message.contact) return handleContact(conv, message);
  if (!text) {
    await send(chatId, 'Я понимаю только текст. Опишите задачу словами, а фото и проект удобнее отправить менеджеру: нажмите /manager.');
    return;
  }
  if (text === '/manager') return handover(conv, 'клиент попросил менеджера');

  await saveMessage(conv.id, 'user', text, {tgMessageId: message.message_id});
  await routeUserText(conv, text);
}

// Ручной режим и выключенный ИИ действуют одинаково для текста и кнопок услуг.
async function routeUserText(conv, text) {
  if (conv.human_mode) {
    const timeout = Number(await getSetting('ai.human_timeout_hours')) || 12;
    const since = conv.human_since ? new Date(conv.human_since).getTime() : 0;
    if (Date.now() - since < timeout * 3600 * 1000) {
      const delivered = await forwardToManagers(conv, text);
      if (!delivered) await send(conv.tg_chat_id, 'Сейчас не получилось передать сообщение менеджеру. Напишите нам на info@gkvesmir.ru, мы ответим в рабочее время.');
      return;
    }
    await db()`update conversations set human_mode = false, human_since = null where id = ${conv.id}`;
    conv.human_mode = false;
  }
  if (!await getSetting('ai.enabled')) {
    const delivered = await forwardToManagers(conv, text);
    await send(conv.tg_chat_id, delivered
      ? 'Спасибо! Передал сообщение менеджеру, он ответит здесь в рабочее время.'
      : 'Спасибо! Сейчас не получилось передать сообщение менеджеру. Напишите нам на info@gkvesmir.ru, мы ответим в рабочее время.');
    return;
  }
  await aiTurn(conv, text);
}

async function handleStart(conv, param) {
  const sql = db();
  if (!conv.start_param && param) {
    await sql`update conversations set start_param = ${cleanLine(param, 64)} where id = ${conv.id}`;
    conv.start_param = cleanLine(param, 64);
  }
  if (!conv.consent_at) {
    return askConsent(conv, 'Здравствуйте! Я ИИ-консультант компании «Дом Мира»: отвечу на вопросы о строительстве, отделке, проектировании и ценах. Перед началом отметьте согласие на обработку данных.');
  }
  await applyStartParam(conv);
  const service = parseStartParam(param).service;
  if (service) return startService(conv, service);
  const greeting = await getSetting('ai.greeting');
  await saveMessage(conv.id, 'assistant', greeting);
  await send(conv.tg_chat_id, greeting, {reply_markup: {inline_keyboard: SERVICE_BUTTONS}});
}

// Как нажатие кнопки услуги: услуга записывается в диалог, консультант отвечает на запрос о ней.
async function startService(conv, key) {
  if (!Object.hasOwn(SERVICE_TEXT, key)) key = 'other';
  const text = SERVICE_TEXT[key];
  if (key !== 'other') {
    const fields = {...conv.fields, service: normalizeService(key)};
    await db()`update conversations set fields = ${db().json(fields)} where id = ${conv.id}`;
    conv.fields = fields;
  }
  await saveMessage(conv.id, 'user', text);
  return routeUserText(conv, text);
}

async function handleCallback(query) {
  const chatId = query.message?.chat?.id;
  const data = String(query.data || '');
  await tg(token(), 'answerCallbackQuery', {callback_query_id: query.id}).catch(() => {});
  if (!chatId || query.message.chat.type !== 'private') return;
  const conv = await getConversation(chatId, query.from);
  const sql = db();

  if (data === 'consent:yes') {
    if (!conv.consent_at) {
      const [fresh] = await sql`update conversations set consent_at = now(), consent_version = ${BOT_CONSENT_VERSION}, consent_channel = 'telegram_button',
        tg_username = ${query.from.username || null}, first_name = ${query.from.first_name || null}, last_name = ${query.from.last_name || null}
        where id = ${conv.id} returning *`;
      Object.assign(conv, fresh);
      await applyStartParam(conv);
      await saveMessage(conv.id, 'system', `Клиент дал согласие на обработку персональных данных: кнопка в Telegram, версия ${BOT_CONSENT_VERSION}`);
    }
    await tg(token(), 'editMessageText', {chat_id: chatId, message_id: query.message.message_id, text: `${consentText(true)}\n\nСогласие получено.`,
      link_preview_options: {is_disabled: true}}).catch(() => {});
    // Диалог из прежней версии бота, где согласие спрашивали перед заявкой: сразу оформляем её.
    if (conv.fields?.phone && !conv.lead_id) return createOrUpdateLead(conv, {announce: true});
    const pending = conv.consent_pending;
    if (pending) await sql`update conversations set consent_pending = false where id = ${conv.id}`;
    // Пришёл из окна услуги на сайте: сразу разговор об этой услуге.
    const linked = parseStartParam(conv.start_param).service;
    if (!pending && linked) return startService(conv, linked);
    const greeting = await getSetting('ai.greeting');
    const reply = pending ? 'Спасибо! Теперь отправьте ваш вопрос ещё раз, до согласия мы его не сохраняли.' : greeting;
    await saveMessage(conv.id, 'assistant', reply);
    await send(chatId, reply, {reply_markup: {inline_keyboard: SERVICE_BUTTONS}});
    return;
  }
  if (data === 'consent:no') {
    await tg(token(), 'editMessageText', {chat_id: chatId, message_id: query.message.message_id, link_preview_options: {is_disabled: true},
      text: `Без согласия консультант не может принять ваши вопросы и контакты. Цены, проекты и контакты компании есть на сайте ${config.siteUrl}, написать нам можно на info@gkvesmir.ru. Если передумаете, нажмите /start.`}).catch(() => {});
    return;
  }
  if (data === 'delete:yes') return deleteMyData(conv, query.message.message_id);
  if (data === 'delete:no') {
    await tg(token(), 'editMessageText', {chat_id: chatId, message_id: query.message.message_id, text: 'Хорошо, ничего не удаляю.'}).catch(() => {});
    return;
  }

  // Кнопки услуг и «Позвать менеджера» работают только после согласия.
  if (!conv.consent_at) return askConsent(conv, data === 'manager' ? 'Чтобы подключить менеджера, нужно согласие на обработку данных.' : 'Перед началом отметьте согласие на обработку данных.');
  if (data.startsWith('svc:')) return startService(conv, data.slice(4));
  if (data === 'manager') return handover(conv, 'клиент нажал «Позвать менеджера»');
}

async function handleContact(conv, message) {
  const contact = message.contact;
  const phone = normalizePhone(contact.phone_number);
  if (!phone) {
    await send(conv.tg_chat_id, 'Не получилось прочитать номер. Напишите его, пожалуйста, текстом.');
    return;
  }
  const fields = {...conv.fields, phone};
  if (!fields.name && contact.first_name) fields.name = cleanLine(contact.first_name, 60);
  await db()`update conversations set fields = ${db().json(fields)} where id = ${conv.id}`;
  conv.fields = fields;
  await saveMessage(conv.id, 'user', `Отправил номер телефона ${phone}`, {tgMessageId: message.message_id});
  await createOrUpdateLead(conv, {announce: true, removeKeyboard: true});
}

function cleanReply(text) {
  return String(text || '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/^#+\s*/gm, '')
    .replace(/[—–]/g, '-')
    .trim()
    .slice(0, 1800);
}

function mergeFields(current, incoming) {
  const out = {...current};
  for (const key of FIELD_KEYS) {
    const raw = incoming?.[key];
    if (raw === undefined || raw === null || raw === '') continue;
    if (key === 'phone') {
      const phone = normalizePhone(raw);
      if (phone) out.phone = phone;
      continue;
    }
    if (key === 'service') { out.service = normalizeService(raw); continue; }
    out[key] = cleanLine(raw, key === 'notes' ? 400 : 120);
  }
  return out;
}

async function saveInsights(convId, insights, service) {
  if (!insights || typeof insights !== 'object') return;
  const sql = db();
  const list = value => (Array.isArray(value) ? value : []).map(v => cleanLine(v, 80).toLowerCase()).filter(Boolean).slice(0, 6);
  const [current] = await sql`select * from conversation_insights where conversation_id = ${convId}`;
  const merge = (old = [], add = []) => [...new Set([...old, ...add])].slice(0, 15);
  const row = {
    conversation_id: convId,
    segment: cleanLine(insights.segment, 40) || current?.segment || null,
    service: service || current?.service || null,
    topics: merge(current?.topics, list(insights.topics)),
    pains: merge(current?.pains, list(insights.pains)),
    objections: merge(current?.objections, list(insights.objections)),
    questions: merge(current?.questions, list(insights.questions)),
    refusal_reason: cleanLine(insights.refusal_reason, 120) || current?.refusal_reason || null
  };
  await sql`insert into conversation_insights ${sql(row)}
    on conflict (conversation_id) do update set segment = excluded.segment, service = excluded.service, topics = excluded.topics,
      pains = excluded.pains, objections = excluded.objections, questions = excluded.questions, refusal_reason = excluded.refusal_reason, updated_at = now()`;
}

async function aiTurn(conv, userText) {
  const chatId = conv.tg_chat_id;
  if (await rateLimited(`bot:${conv.tg_user_id}`, {limit: 25, windowSeconds: 600})) {
    await send(chatId, 'Слишком много сообщений подряд. Подождите пару минут, или нажмите /manager, чтобы позвать человека.');
    return;
  }
  const perDay = Number(await getSetting('ai.max_messages_per_day')) || 80;
  if (await rateLimited(`botday:${conv.tg_user_id}`, {limit: perDay, windowSeconds: 86400})) {
    await handover(conv, 'лимит сообщений ИИ на сегодня');
    return;
  }
  await tg(token(), 'sendChatAction', {chat_id: chatId, action: 'typing'}).catch(() => {});

  const sql = db();
  // Телефон и почту из сообщения сохраняем сами, в модель они не уходят.
  const before = conv.fields || {};
  const contacts = extractContacts(userText);
  let fields = {...before, ...contacts};
  const history = (await sql`select role, text from messages where conversation_id = ${conv.id} and role in ('user', 'assistant', 'manager')
    order by created_at desc limit 14`).reverse();
  const recentUser = history.filter(m => m.role === 'user').slice(-3).map(m => maskContacts(m.text)).join(' ');
  const safeText = maskContacts(userText);
  const knowledge = await pickKnowledge(`${recentUser} ${safeText}`);
  const system = await buildSystemPrompt({knowledge, fields, consent: true});
  const messages = [
    {role: 'system', content: system},
    ...history.slice(0, -1).map(m => ({role: m.role === 'user' ? 'user' : 'assistant', content: clip(maskContacts(m.text), 700)})),
    {role: 'user', content: safeText}
  ];

  let result;
  try {
    result = await chat({messages, json: true, purpose: 'consultant', maxTokens: 900});
  } catch (error) {
    await alertError('ИИ-модели', error.message);
    const delivered = await handover(conv, 'ИИ недоступен', {silent: true});
    await send(chatId, delivered
      ? 'Не могу ответить автоматически прямо сейчас. Передал вопрос менеджеру, он ответит здесь в рабочее время.'
      : 'Не могу ответить автоматически прямо сейчас. Напишите нам на info@gkvesmir.ru, мы ответим в рабочее время.');
    return;
  }

  const parsed = parseJsonLoose(result.content) || {reply: result.content};
  const reply = cleanReply(parsed.reply) || 'Уточните, пожалуйста, что именно вас интересует: строительство дома, отделка или проектирование?';
  fields = mergeFields(fields, parsed.fields);
  const contactAdded = Boolean((fields.phone && fields.phone !== before.phone) || (fields.email && fields.email !== before.email));
  await sql`update conversations set fields = ${sql.json(fields)} where id = ${conv.id}`;
  conv.fields = fields;
  await saveInsights(conv.id, parsed.insights, fields.service);

  const askContact = parsed.ask_contact && !fields.phone;
  const sent = await send(chatId, reply, askContact
    ? {reply_markup: {keyboard: [[{text: 'Отправить номер телефона', request_contact: true}]], resize_keyboard: true, one_time_keyboard: true, input_field_placeholder: 'Или напишите номер'}}
    : {});
  await saveMessage(conv.id, 'assistant', reply, {
    tgMessageId: sent?.message_id, provider: result.provider, model: result.model, latency: result.latency,
    promptTokens: result.usage?.prompt_tokens, completionTokens: result.usage?.completion_tokens
  });

  if (parsed.intent === 'manager') {
    await handover(conv, 'ИИ предложил менеджера', {silent: true});
    return;
  }
  if (parsed.ready_for_lead || contactAdded) await createOrUpdateLead(conv, {announce: contactAdded || parsed.ready_for_lead});
}

async function createOrUpdateLead(conv, {announce = false, removeKeyboard = false} = {}) {
  const sql = db();
  const fields = conv.fields || {};
  const hasContact = Boolean(fields.phone || fields.email || conv.tg_username);
  if (!hasContact) {
    await send(conv.tg_chat_id, 'Оставьте, пожалуйста, телефон, чтобы инженер мог связаться и уточнить детали.', {
      reply_markup: {keyboard: [[{text: 'Отправить номер телефона', request_contact: true}]], resize_keyboard: true, one_time_keyboard: true}
    });
    return null;
  }
  if (!conv.consent_at) {
    await askConsent(conv, 'Чтобы передать заявку менеджеру, нужно согласие на обработку данных.');
    return null;
  }
  const details = {};
  for (const key of ['object', 'area', 'location', 'budget', 'timing', 'has_project', 'has_plot', 'material']) if (fields[key]) details[key] = fields[key];
  const name = fields.name || [conv.first_name, conv.last_name].filter(Boolean).join(' ') || null;
  const summary = fields.notes || null;
  const keyboard = removeKeyboard || fields.phone ? {reply_markup: {remove_keyboard: true}} : {};

  const updateExisting = async lead => {
    const merged = {...lead.details, ...details};
    await sql`update leads set phone = coalesce(${fields.phone || null}, phone), email = coalesce(${fields.email || null}, email), name = coalesce(name, ${name}),
      details = ${sql.json(merged)}, message = coalesce(${summary}, message), updated_at = now() where id = ${lead.id}`;
    await addEvent(lead.id, 'note', {text: 'ИИ-консультант обновил данные заявки из диалога'});
    refreshLeadMessages(lead.id).catch(() => {});
    if (announce) await send(conv.tg_chat_id, 'Обновил заявку, менеджер увидит новые данные.', keyboard);
    return lead;
  };

  if (conv.lead_id) {
    const lead = await getLead(conv.lead_id);
    if (lead) return updateExisting(lead);
  }
  const lead = await insertLead({
    channel: 'telegram_bot', form: 'telegram', page: conv.landing_page, landing_page: conv.landing_page,
    service: fields.service || 'other', name, phone: fields.phone || null, email: fields.email || null,
    tg_username: conv.tg_username, tg_user_id: conv.tg_user_id,
    contact_pref: fields.phone ? 'call' : fields.email ? 'email' : 'telegram', message: summary, details,
    utm_source: conv.source === 'site' ? 'site' : conv.source, utm_medium: 'telegram_bot', ym_client_id: conv.ym_client_id,
    consent_at: conv.consent_at, consent_version: conv.consent_version || LEGACY_CONSENT_VERSION,
    consent_channel: conv.consent_channel || 'telegram_button', conversation_id: conv.id
  });
  await sql`update conversations set lead_id = ${lead.id} where id = ${conv.id}`;
  conv.lead_id = lead.id;
  // Два сообщения одного диалога одновременно: вторая попытка получает уже созданную заявку.
  if (lead.existed) return updateExisting(lead);

  await addEvent(lead.id, 'note', {text: 'Заявка собрана ИИ-консультантом в Telegram'});
  const fresh = await getLead(lead.id);
  const delivery = await notifyNewLead(fresh);
  if (!delivery.sent) await alertError('Доставка заявок', `Заявка №${lead.id} из бота не ушла в Telegram: ${delivery.errors.join('; ')}`);
  await enqueueConversion(fresh, 'bot_lead').catch(() => {});
  await pushToCrm(fresh).catch(() => {});
  const hours = (await db()`select value from content_blocks where key = 'contacts'`)[0]?.value?.hours || 'в рабочее время';
  const when = hours.toLowerCase().startsWith('ежедневно') ? hours.toLowerCase() : 'в рабочее время';
  // Говорим клиенту правду о доставке: если карточка не ушла сотрудникам, заявка всё равно сохранена.
  await send(conv.tg_chat_id, delivery.sent
    ? `Готово, заявка №${lead.id} у менеджера. С вами свяжутся ${when}. Пока можете задавать вопросы здесь.`
    : `Заявка №${lead.id} сохранена, менеджер увидит её и свяжется с вами ${when}. Пока можете задавать вопросы здесь.`, keyboard);
  return lead;
}

// Получатели сообщений из диалога: группа заявок и сотрудники с правом отвечать, которым этот диалог доступен
// (видят все заявки или отвечают за заявку этого диалога).
async function conversationRecipients(conv) {
  const chats = new Set();
  const group = await getSetting('notify.admin_chat_id');
  if (group) chats.add(String(group));
  const [lead] = conv.lead_id ? await db()`select manager_id from leads where id = ${conv.lead_id}` : [];
  const users = await db()`select u.id, u.tg_chat_id, r.permissions from users u join roles r on r.id = u.role_id
    where u.is_active and u.tg_chat_id is not null and 'conversations.reply' = any(r.permissions)`;
  for (const user of users) {
    if (user.permissions.includes('leads.view_all') || (lead && lead.manager_id === user.id)) chats.add(String(user.tg_chat_id));
  }
  return [...chats];
}

function convTitle(conv) {
  const name = [conv.first_name, conv.last_name].filter(Boolean).join(' ') || 'Клиент';
  return `${esc(name)}${conv.tg_username ? ` (@${esc(conv.tg_username)})` : ''}, диалог №${conv.id}${conv.lead_id ? `, заявка №${conv.lead_id}` : ''}`;
}

async function relaySend(chatId, conv, html) {
  const message = await tg(adminToken(), 'sendMessage', {chat_id: chatId, text: clip(html), parse_mode: 'HTML', link_preview_options: {is_disabled: true}});
  await db()`insert into relay_map (chat_id, message_id, conversation_id) values (${chatId}, ${message.message_id}, ${conv.id}) on conflict do nothing`;
  return message;
}

// Возвращает, скольким получателям сообщение действительно ушло.
async function forwardToManagers(conv, text) {
  let delivered = 0;
  for (const chatId of await conversationRecipients(conv)) {
    try {
      await relaySend(chatId, conv, `<b>${convTitle(conv)}</b>\n\n${esc(clip(text, 3000))}\n\n<i>Ответьте на это сообщение, и ответ уйдёт клиенту.</i>`);
      delivered += 1;
    } catch (error) {
      console.error('relay to managers', error.message);
    }
  }
  if (!delivered) await alertError('Доставка сообщений клиентов', `Сообщение из диалога №${conv.id} не ушло ни одному сотруднику`);
  return delivered;
}

// Передаёт разговор менеджеру. Возвращает число получателей, до которых сообщение дошло.
export async function handover(conv, reason, {silent = false} = {}) {
  if (!conv.consent_at) {
    await askConsent(conv, 'Чтобы подключить менеджера, нужно согласие на обработку данных.');
    return 0;
  }
  const sql = db();
  await sql`update conversations set human_mode = true, human_since = now() where id = ${conv.id}`;
  conv.human_mode = true;
  const recent = (await sql`select role, text from messages where conversation_id = ${conv.id} order by created_at desc limit 8`).reverse();
  const transcript = recent.map(m => `${m.role === 'user' ? 'Клиент' : m.role === 'manager' ? 'Менеджер' : 'Бот'}: ${clip(m.text, 300)}`).join('\n');
  const fields = Object.entries(conv.fields || {}).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join('; ');
  let delivered = 0;
  for (const chatId of await conversationRecipients(conv)) {
    try {
      await relaySend(chatId, conv, `<b>Нужен менеджер: ${convTitle(conv)}</b>\nПричина: ${esc(reason)}\n${fields ? `Данные: ${esc(fields)}\n` : ''}\n${esc(transcript)}\n\n<i>Ответьте на это сообщение, и ответ уйдёт клиенту.${conv.lead_id ? ` Заявка: ${leadUrl(conv.lead_id)}` : ''}</i>`);
      delivered += 1;
    } catch (error) {
      console.error('handover relay', error.message);
    }
  }
  if (!delivered) await alertError('Доставка сообщений клиентов', `Запрос менеджера из диалога №${conv.id} не ушёл ни одному сотруднику`);
  if (!silent) {
    const extra = conv.fields?.phone ? {} : {reply_markup: {keyboard: [[{text: 'Отправить номер телефона', request_contact: true}]], resize_keyboard: true, one_time_keyboard: true}};
    await send(conv.tg_chat_id, delivered
      ? 'Передал разговор менеджеру, он ответит здесь же в рабочее время. Если удобнее звонок, отправьте номер.'
      : 'Сейчас не получилось передать разговор менеджеру. Отправьте номер, и мы перезвоним, или напишите на info@gkvesmir.ru.', extra);
  }
  if (!conv.lead_id && (conv.fields?.phone || conv.fields?.email || conv.tg_username)) await createOrUpdateLead(conv);
  return delivered;
}

export async function sendManagerReply(conversationId, text, {userId = null, userName = ''} = {}) {
  const sql = db();
  const [conv] = await sql`select * from conversations where id = ${conversationId}`;
  if (!conv) throw new HttpError(404, 'Диалог не найден');
  const message = await send(conv.tg_chat_id, text);
  if (!message) throw new HttpError(409, 'Сообщение не доставлено: клиент заблокировал бота или удалил чат');
  await saveMessage(conv.id, 'manager', text, {tgMessageId: message.message_id, managerId: userId});
  await sql`update conversations set human_mode = true, human_since = now() where id = ${conv.id}`;
  if (conv.lead_id) {
    await addEvent(conv.lead_id, 'message', {userId, text: `Ответ клиенту в Telegram${userName ? ` (${userName})` : ''}: ${clip(text, 500)}`});
    await sql`update leads set first_response_at = coalesce(first_response_at, now()), updated_at = now() where id = ${conv.lead_id}`;
    await markFirstContact(conv.lead_id);
  }
  return message;
}

// Удаление по команде /delete: контакты в заявке, переписка, выводы ИИ, пересланные сотрудникам сообщения.
// Копии вне нашей базы (CRM, старые сообщения в Telegram, резервные копии) описаны в docs/data-deletion.md.
async function deleteMyData(conv, messageId) {
  const sql = db();
  const relays = await sql`select chat_id, message_id from relay_map where conversation_id = ${conv.id}`;
  for (const relay of relays) {
    await tg(adminToken(), 'deleteMessage', {chat_id: String(relay.chat_id), message_id: Number(relay.message_id)}).catch(() => {});
  }
  // Сохранённые для повтора сообщения Telegram этого чата (в них может быть телефон).
  await sql`update tg_updates set payload = null where bot = 'client' and payload is not null
    and coalesce(payload->'message'->'chat'->>'id', payload->'callback_query'->'message'->'chat'->>'id') = ${String(conv.tg_chat_id)}`;
  if (conv.lead_id) {
    await sql`update leads set name = null, phone = null, email = null, tg_username = null, tg_user_id = null, message = 'Данные удалены по запросу клиента',
      details = '{}', ym_client_id = null, yclid = null, gclid = null, ip_hash = null, user_agent = null, referrer = null, updated_at = now()
      where id = ${conv.lead_id}`;
    // В истории заявки остаются только служебные события (создана, статусы, ответственный) без переписки, контактов и комментариев.
    await sql`update lead_events set text = 'Удалено по запросу клиента', data = '{}' where lead_id = ${conv.lead_id} and type not in ('created', 'status', 'assign')`;
    const statuses = await sql`select id, data from lead_events where lead_id = ${conv.lead_id} and type = 'status'`;
    for (const event of statuses) {
      const {from, to, reason} = event.data || {};
      const text = `${statusLabel(from)} → ${statusLabel(to)}${reason ? `. Причина: ${reason}` : ''}`;
      await sql`update lead_events set text = ${text}, data = ${sql.json({from: from ?? null, to: to ?? null, reason: reason ?? null})} where id = ${event.id}`;
    }
    // Журнал действий по этой заявке: только какие поля менялись, без значений (старые записи могли их хранить).
    await sql`update audit_log set details = jsonb_build_object('fields', (select coalesce(jsonb_agg(k), '[]'::jsonb) from jsonb_object_keys(details) k))
      where entity = 'lead' and entity_id = ${String(conv.lead_id)} and details <> '{}'::jsonb and not (details ? 'fields' and (select count(*) from jsonb_object_keys(details)) = 1)`;
    await sql`update offline_conversions set client_id = null, yclid = null where lead_id = ${conv.lead_id}`;
    await addEvent(conv.lead_id, 'note', {text: 'Клиент удалил свои данные командой /delete'});
    await refreshLeadMessages(conv.lead_id).catch(() => {});
    const [lead] = await sql`select crm_status from leads where id = ${conv.lead_id}`;
    if (lead?.crm_status === 'sent') await notifyOwners(`Клиент удалил свои данные (заявка №${conv.lead_id}). Удалите эту заявку и во внешней CRM.`).catch(() => {});
  }
  await sql`delete from conversations where id = ${conv.id}`;
  await audit({actor: 'client', action: 'client_data_deleted', entity: 'conversation', entityId: conv.id});
  await tg(token(), 'editMessageText', {chat_id: conv.tg_chat_id, message_id: messageId, text: 'Переписка и контакты удалены из нашей базы.'}).catch(() => {});
}
