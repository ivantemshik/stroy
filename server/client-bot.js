// Клиентский Telegram бот: ИИ-консультант «Дом Мира».
// Отвечает по базе знаний, уточняет задачу, собирает заявку и передаёт её в админ-бот.
import {waitUntil} from '@vercel/functions';
import {db} from './db.js';
import {config} from './env.js';
import {HttpError, json, readJson, safeEqual} from './http.js';
import {tg, esc, clip} from './telegram.js';
import {getSetting} from './settings.js';
import {rateLimited, audit} from './security.js';
import {chat, parseJsonLoose} from './ai/llm.js';
import {pickKnowledge, buildSystemPrompt} from './ai/prompt.js';
import {insertLead, getLead, addEvent} from './lead-core.js';
import {notifyNewLead, alertError, leadUrl} from './notify.js';
import {enqueueConversion} from './metrika.js';
import {pushToCrm} from './crm.js';
import {normalizePhone, normalizeService, cleanLine, cleanText} from './validate.js';
import {CONSENT_VERSION} from './leads-public.js';

const token = () => config.telegram.clientToken;
const adminToken = () => config.telegram.adminToken;

const SERVICE_BUTTONS = [
  [{text: 'Строительство дома', callback_data: 'svc:construction'}, {text: 'Отделка', callback_data: 'svc:finishing'}],
  [{text: 'Проектирование', callback_data: 'svc:design'}, {text: 'Другой вопрос', callback_data: 'svc:other'}],
  [{text: 'Позвать менеджера', callback_data: 'manager'}]
];
const SERVICE_TEXT = {
  construction: 'Интересует строительство дома',
  finishing: 'Интересует отделка дома',
  design: 'Интересует проектирование дома',
  other: 'У меня другой вопрос'
};
const FIELD_KEYS = ['name', 'phone', 'service', 'object', 'area', 'location', 'budget', 'timing', 'has_project', 'has_plot', 'material', 'notes'];

export async function claimUpdate(bot, updateId) {
  if (updateId === undefined || updateId === null) return true;
  const rows = await db()`insert into tg_updates (bot, update_id) values (${bot}, ${updateId}) on conflict do nothing returning update_id`;
  return rows.length > 0;
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
  if (!await claimUpdate('client', update.update_id)) return json({ok: true});
  const task = handleUpdate(update).catch(error => {
    console.error('client bot', error);
    return alertError('ИИ-консультант', error.message);
  });
  runInBackground(task);
  if (!process.env.VERCEL) await task;
  return json({ok: true});
}

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

async function getConversation(chatId, from) {
  const sql = db();
  const [conv] = await sql`
    insert into conversations (tg_user_id, tg_chat_id, tg_username, first_name, last_name, last_message_at)
    values (${from.id}, ${chatId}, ${from.username || null}, ${from.first_name || null}, ${from.last_name || null}, now())
    on conflict (tg_chat_id) do update set tg_username = excluded.tg_username, first_name = excluded.first_name,
      last_name = excluded.last_name, updated_at = now()
    returning *`;
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
  const site = /^s_([a-z0-9-]*)_?(\d{6,30})?$/i.exec(value);
  if (site) return {source: 'site', landing: site[1] ? `/${site[1] === 'home' ? '' : `${site[1]}/`}` : '/', clientId: site[2] || null};
  return {source: value.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40) || 'telegram'};
}

async function handleUpdate(update) {
  if (update.callback_query) return handleCallback(update.callback_query);
  const message = update.message;
  if (!message || message.chat?.type !== 'private' || !message.from || message.from.is_bot) return;
  const chatId = message.chat.id;
  const conv = await getConversation(chatId, message.from);
  if (conv.blocked) return;

  if (message.contact) return handleContact(conv, message);
  const text = cleanText(message.text || message.caption || '', 2000);
  if (!text) {
    await send(chatId, 'Я понимаю только текст. Опишите задачу словами, а фото и проект удобнее отправить менеджеру: нажмите /manager.');
    return;
  }

  if (text.startsWith('/start')) return handleStart(conv, text.split(/\s+/)[1]);
  if (text === '/manager') return handover(conv, 'клиент попросил менеджера');
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

  await saveMessage(conv.id, 'user', text, {tgMessageId: message.message_id});

  if (conv.human_mode) {
    const timeout = Number(await getSetting('ai.human_timeout_hours')) || 12;
    const since = conv.human_since ? new Date(conv.human_since).getTime() : 0;
    if (Date.now() - since < timeout * 3600 * 1000) {
      await forwardToManagers(conv, text);
      return;
    }
    await db()`update conversations set human_mode = false, human_since = null where id = ${conv.id}`;
    conv.human_mode = false;
  }
  if (!await getSetting('ai.enabled')) {
    await forwardToManagers(conv, text);
    await send(chatId, 'Спасибо! Передал сообщение менеджеру, он ответит здесь в рабочее время.');
    return;
  }
  await aiTurn(conv, text);
}

async function handleStart(conv, param) {
  const info = parseStartParam(param);
  const sql = db();
  if (!conv.start_param) {
    await sql`update conversations set start_param = ${param || null}, source = ${info.source}, landing_page = ${info.landing || null},
      ym_client_id = coalesce(ym_client_id, ${info.clientId || null}) where id = ${conv.id}`;
  } else if (info.clientId) {
    await sql`update conversations set ym_client_id = ${info.clientId} where id = ${conv.id}`;
  }
  const greeting = await getSetting('ai.greeting');
  await saveMessage(conv.id, 'assistant', greeting);
  await send(conv.tg_chat_id, greeting, {reply_markup: {inline_keyboard: SERVICE_BUTTONS}});
}

async function handleCallback(query) {
  const chatId = query.message?.chat?.id;
  const data = String(query.data || '');
  await tg(token(), 'answerCallbackQuery', {callback_query_id: query.id}).catch(() => {});
  if (!chatId || query.message.chat.type !== 'private') return;
  const conv = await getConversation(chatId, query.from);
  const sql = db();

  if (data.startsWith('svc:')) {
    const key = data.slice(4);
    const text = SERVICE_TEXT[key] || SERVICE_TEXT.other;
    if (key !== 'other') {
      const fields = {...conv.fields, service: normalizeService(key)};
      await sql`update conversations set fields = ${sql.json(fields)} where id = ${conv.id}`;
      conv.fields = fields;
    }
    await saveMessage(conv.id, 'user', text);
    return aiTurn(conv, text);
  }
  if (data === 'manager') return handover(conv, 'клиент нажал «Позвать менеджера»');
  if (data === 'consent:yes') {
    await sql`update conversations set consent_at = now() where id = ${conv.id}`;
    conv.consent_at = new Date();
    await saveMessage(conv.id, 'system', 'Клиент дал согласие на обработку персональных данных');
    await tg(token(), 'editMessageReplyMarkup', {chat_id: chatId, message_id: query.message.message_id, reply_markup: {inline_keyboard: []}}).catch(() => {});
    return createOrUpdateLead(conv, {announce: true});
  }
  if (data === 'consent:no') {
    await tg(token(), 'editMessageReplyMarkup', {chat_id: chatId, message_id: query.message.message_id, reply_markup: {inline_keyboard: []}}).catch(() => {});
    await send(chatId, 'Понял, контакты не сохраняю. Можете продолжать задавать вопросы, а написать нам можно на info@gkvesmir.ru.');
    return;
  }
  if (data === 'delete:yes') return deleteMyData(conv, query.message.message_id);
  if (data === 'delete:no') {
    await tg(token(), 'editMessageText', {chat_id: chatId, message_id: query.message.message_id, text: 'Хорошо, ничего не удаляю.'}).catch(() => {});
  }
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
  const history = (await sql`select role, text from messages where conversation_id = ${conv.id} and role in ('user', 'assistant', 'manager')
    order by created_at desc limit 14`).reverse();
  const recentUser = history.filter(m => m.role === 'user').slice(-3).map(m => m.text).join(' ');
  const knowledge = await pickKnowledge(`${recentUser} ${userText}`);
  const system = await buildSystemPrompt({knowledge, fields: conv.fields, consent: Boolean(conv.consent_at)});
  const messages = [
    {role: 'system', content: system},
    ...history.slice(0, -1).map(m => ({role: m.role === 'user' ? 'user' : 'assistant', content: clip(m.text, 700)})),
    {role: 'user', content: userText}
  ];

  let result;
  try {
    result = await chat({messages, json: true, purpose: 'consultant', maxTokens: 900});
  } catch (error) {
    await alertError('ИИ-модели', error.message);
    await send(chatId, 'Не могу ответить автоматически прямо сейчас. Передал вопрос менеджеру, он ответит здесь в рабочее время.');
    await handover(conv, 'ИИ недоступен', {silent: true});
    return;
  }

  const parsed = parseJsonLoose(result.content) || {reply: result.content};
  const reply = cleanReply(parsed.reply) || 'Уточните, пожалуйста, что именно вас интересует: строительство дома, отделка или проектирование?';
  const fields = mergeFields(conv.fields, parsed.fields);
  const phoneAdded = fields.phone && fields.phone !== conv.fields?.phone;
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
  if (parsed.ready_for_lead || phoneAdded) await createOrUpdateLead(conv, {announce: phoneAdded || parsed.ready_for_lead});
}

async function askConsent(conv) {
  const site = config.siteUrl;
  await send(conv.tg_chat_id,
    `Чтобы передать заявку менеджеру, нужно ваше согласие на обработку персональных данных (имя, телефон, переписка) по нашей политике: ${site}/privacy/ и тексту согласия: ${site}/soglasie/`,
    {reply_markup: {inline_keyboard: [[{text: 'Согласен', callback_data: 'consent:yes'}, {text: 'Не согласен', callback_data: 'consent:no'}]]}});
}

async function createOrUpdateLead(conv, {announce = false, removeKeyboard = false} = {}) {
  const sql = db();
  const fields = conv.fields || {};
  const hasContact = Boolean(fields.phone || conv.tg_username);
  if (!hasContact) {
    await send(conv.tg_chat_id, 'Оставьте, пожалуйста, телефон, чтобы инженер мог связаться и уточнить детали.', {
      reply_markup: {keyboard: [[{text: 'Отправить номер телефона', request_contact: true}]], resize_keyboard: true, one_time_keyboard: true}
    });
    return null;
  }
  if (!conv.consent_at) {
    await askConsent(conv);
    return null;
  }
  const details = {};
  for (const key of ['object', 'area', 'location', 'budget', 'timing', 'has_project', 'has_plot', 'material']) if (fields[key]) details[key] = fields[key];
  const name = fields.name || [conv.first_name, conv.last_name].filter(Boolean).join(' ') || null;
  const summary = fields.notes || null;

  if (conv.lead_id) {
    const lead = await getLead(conv.lead_id);
    if (lead) {
      const merged = {...lead.details, ...details};
      await sql`update leads set phone = coalesce(${fields.phone || null}, phone), name = coalesce(name, ${name}),
        details = ${sql.json(merged)}, message = coalesce(${summary}, message), updated_at = now() where id = ${lead.id}`;
      await addEvent(lead.id, 'note', {text: 'ИИ-консультант обновил данные заявки из диалога'});
      if (announce) await send(conv.tg_chat_id, 'Обновил заявку, менеджер увидит новые данные.', removeKeyboard ? {reply_markup: {remove_keyboard: true}} : {});
      return lead;
    }
  }
  const lead = await insertLead({
    channel: 'telegram_bot', form: 'telegram', page: conv.landing_page, landing_page: conv.landing_page,
    service: fields.service || 'other', name, phone: fields.phone || null, tg_username: conv.tg_username, tg_user_id: conv.tg_user_id,
    contact_pref: fields.phone ? 'call' : 'telegram', message: summary, details,
    utm_source: conv.source === 'site' ? 'site' : conv.source, utm_medium: 'telegram_bot', ym_client_id: conv.ym_client_id,
    consent_at: conv.consent_at, consent_version: CONSENT_VERSION, conversation_id: conv.id
  });
  await sql`update conversations set lead_id = ${lead.id} where id = ${conv.id}`;
  conv.lead_id = lead.id;
  await addEvent(lead.id, 'note', {text: 'Заявка собрана ИИ-консультантом в Telegram'});
  const fresh = await getLead(lead.id);
  const delivery = await notifyNewLead(fresh);
  if (!delivery.sent) await alertError('Доставка заявок', `Заявка №${lead.id} из бота не ушла в Telegram: ${delivery.errors.join('; ')}`);
  await enqueueConversion(fresh, 'bot_lead').catch(() => {});
  await pushToCrm(fresh).catch(() => {});
  const hours = (await db()`select value from content_blocks where key = 'contacts'`)[0]?.value?.hours || 'в рабочее время';
  await send(conv.tg_chat_id, `Готово, заявка №${lead.id} у менеджера. С вами свяжутся ${hours.toLowerCase().startsWith('ежедневно') ? hours.toLowerCase() : 'в рабочее время'}. Пока можете задавать вопросы здесь.`,
    removeKeyboard || fields.phone ? {reply_markup: {remove_keyboard: true}} : {});
  return lead;
}

// Получатели сообщений из диалогов: группа и пользователи с правом читать диалоги.
async function conversationRecipients() {
  const chats = new Set();
  const group = await getSetting('notify.admin_chat_id');
  if (group) chats.add(String(group));
  const users = await db()`select u.tg_chat_id from users u join roles r on r.id = u.role_id
    where u.is_active and u.tg_chat_id is not null and 'conversations.reply' = any(r.permissions)`;
  for (const user of users) chats.add(String(user.tg_chat_id));
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

async function forwardToManagers(conv, text) {
  for (const chatId of await conversationRecipients()) {
    await relaySend(chatId, conv, `<b>${convTitle(conv)}</b>\n\n${esc(clip(text, 3000))}\n\n<i>Ответьте на это сообщение, и ответ уйдёт клиенту.</i>`).catch(() => {});
  }
}

export async function handover(conv, reason, {silent = false} = {}) {
  const sql = db();
  await sql`update conversations set human_mode = true, human_since = now() where id = ${conv.id}`;
  conv.human_mode = true;
  const recent = (await sql`select role, text from messages where conversation_id = ${conv.id} order by created_at desc limit 8`).reverse();
  const transcript = recent.map(m => `${m.role === 'user' ? 'Клиент' : m.role === 'manager' ? 'Менеджер' : 'Бот'}: ${clip(m.text, 300)}`).join('\n');
  const fields = Object.entries(conv.fields || {}).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join('; ');
  for (const chatId of await conversationRecipients()) {
    await relaySend(chatId, conv, `<b>Нужен менеджер: ${convTitle(conv)}</b>\nПричина: ${esc(reason)}\n${fields ? `Данные: ${esc(fields)}\n` : ''}\n${esc(transcript)}\n\n<i>Ответьте на это сообщение, и ответ уйдёт клиенту.${conv.lead_id ? ` Заявка: ${leadUrl(conv.lead_id)}` : ''}</i>`).catch(() => {});
  }
  if (!silent) {
    const extra = conv.fields?.phone ? {} : {reply_markup: {keyboard: [[{text: 'Отправить номер телефона', request_contact: true}]], resize_keyboard: true, one_time_keyboard: true}};
    await send(conv.tg_chat_id, 'Передал разговор менеджеру, он ответит здесь же в рабочее время. Если удобнее звонок, отправьте номер.', extra);
  }
  if (!conv.lead_id && (conv.fields?.phone || conv.tg_username) && conv.consent_at) await createOrUpdateLead(conv);
}

export async function sendManagerReply(conversationId, text, {userId = null, userName = ''} = {}) {
  const sql = db();
  const [conv] = await sql`select * from conversations where id = ${conversationId}`;
  if (!conv) throw new HttpError(404, 'Диалог не найден');
  const message = await send(conv.tg_chat_id, text);
  await saveMessage(conv.id, 'manager', text, {tgMessageId: message.message_id, managerId: userId});
  await sql`update conversations set human_mode = true, human_since = now() where id = ${conv.id}`;
  if (conv.lead_id) {
    await addEvent(conv.lead_id, 'message', {userId, text: `Ответ клиенту в Telegram${userName ? ` (${userName})` : ''}: ${clip(text, 500)}`});
    await sql`update leads set first_response_at = coalesce(first_response_at, now()), updated_at = now() where id = ${conv.lead_id}`;
  }
  return message;
}

async function deleteMyData(conv, messageId) {
  const sql = db();
  if (conv.lead_id) {
    await sql`update leads set name = null, phone = null, email = null, tg_username = null, tg_user_id = null, message = 'Данные удалены по запросу клиента',
      details = '{}', ym_client_id = null, updated_at = now() where id = ${conv.lead_id}`;
    await addEvent(conv.lead_id, 'note', {text: 'Клиент удалил свои данные командой /delete'});
  }
  await sql`delete from conversations where id = ${conv.id}`;
  await audit({actor: `tg:${conv.tg_user_id}`, action: 'client_data_deleted', entity: 'conversation', entityId: conv.id});
  await tg(token(), 'editMessageText', {chat_id: conv.tg_chat_id, message_id: messageId, text: 'Переписка и контакты удалены из нашей базы.'}).catch(() => {});
}
