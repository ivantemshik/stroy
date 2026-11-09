// Админ-бот: заявки с кнопками, привязка сотрудников и группы, ответы клиентам ИИ-консультанта.
import {db} from './db.js';
import {config} from './env.js';
import {json, readJson} from './http.js';
import {tg, esc, clip} from './telegram.js';
import {getSetting, setSetting} from './settings.js';
import {audit} from './security.js';
import {LEAD_STATUSES, statusLabel, serviceLabel} from './permissions.js';
import {changeStatus, assignLead, getLead} from './lead-core.js';
import {refreshLeadMessages, leadKeyboard, leadUrl, alertError} from './notify.js';
import {enqueueForStatus} from './metrika.js';
import {claimUpdate, checkWebhookSecret, runInBackground, sendManagerReply} from './client-bot.js';
import {formatPhone} from './validate.js';
import {computeStats} from './stats.js';

const token = () => config.telegram.adminToken;
const say = (chatId, text, extra = {}) => tg(token(), 'sendMessage', {chat_id: chatId, text: clip(text), parse_mode: 'HTML', link_preview_options: {is_disabled: true}, ...extra});

export async function adminWebhook({request}) {
  checkWebhookSecret(request);
  const update = await readJson(request, 512 * 1024);
  if (!await claimUpdate('admin', update.update_id)) return json({ok: true});
  const task = handleUpdate(update).catch(error => {
    console.error('admin bot', error);
    return alertError('Админ-бот', error.message);
  });
  runInBackground(task);
  if (!process.env.VERCEL) await task;
  return json({ok: true});
}

async function staffByTelegram(tgUserId) {
  const [user] = await db()`select u.id, u.name, u.login, r.permissions from users u join roles r on r.id = u.role_id
    where u.tg_chat_id = ${tgUserId} and u.is_active`;
  return user || null;
}

async function handleUpdate(update) {
  if (update.callback_query) return handleCallback(update.callback_query);
  if (update.my_chat_member) return handleMembership(update.my_chat_member);
  const message = update.message;
  if (!message?.from || message.from.is_bot) return;
  const text = String(message.text || '').trim();
  const chatId = message.chat.id;
  const isPrivate = message.chat.type === 'private';

  if (text.startsWith('/start')) {
    const payload = text.split(/\s+/)[1] || '';
    if (payload.startsWith('link_') && isPrivate) return linkUser(message, payload.slice(5));
    const staff = await staffByTelegram(message.from.id);
    return say(chatId, staff
      ? `Здравствуйте, ${esc(staff.name)}. Сюда приходят новые заявки и сообщения клиентов.\n\n/leads открытые заявки\n/stats цифры за сегодня и неделю\n/help помощь`
      : 'Это служебный бот компании «Дом Мира». Чтобы получать заявки, откройте админку, раздел «Профиль», и нажмите «Подключить Telegram».');
  }
  if (text.startsWith('/bind')) return bindGroup(message, text.split(/\s+/)[1] || '');
  if (text.startsWith('/help')) {
    return say(chatId, 'Кнопки под заявкой: «Взять в работу» назначает вас ответственным, «Статус» меняет этап. Чтобы ответить клиенту из Telegram бота, ответьте на сообщение с его текстом.\n\n/leads открытые заявки\n/stats цифры');
  }

  const staff = await staffByTelegram(message.from.id);
  if (text.startsWith('/leads')) return staff ? listOpenLeads(chatId, staff) : say(chatId, 'Сначала привяжите аккаунт в админке.');
  if (text.startsWith('/stats')) return staff ? quickStats(chatId, staff) : say(chatId, 'Сначала привяжите аккаунт в админке.');

  // Ответ менеджера клиенту: reply на пересланное сообщение из диалога.
  const replyTo = message.reply_to_message;
  if (replyTo && text && !text.startsWith('/')) {
    const [link] = await db()`select conversation_id from relay_map where chat_id = ${chatId} and message_id = ${replyTo.message_id}`;
    if (!link) return;
    if (!staff || !staff.permissions.includes('conversations.reply')) return say(chatId, 'Отвечать клиентам могут сотрудники с привязанным аккаунтом и правом «Отвечать клиентам».', {reply_to_message_id: message.message_id});
    try {
      await sendManagerReply(link.conversation_id, text, {userId: staff.id, userName: staff.name});
      await tg(token(), 'setMessageReaction', {chat_id: chatId, message_id: message.message_id, reaction: [{type: 'emoji', emoji: '👌'}]}).catch(() =>
        say(chatId, 'Отправлено клиенту.', {reply_to_message_id: message.message_id}));
    } catch (error) {
      await say(chatId, `Не удалось отправить: ${esc(error.message)}`, {reply_to_message_id: message.message_id});
    }
  }
}

async function linkUser(message, code) {
  const sql = db();
  const [row] = await sql`delete from link_tokens where token = ${code} and purpose = 'link_user' and expires_at > now() returning user_id`;
  if (!row) return say(message.chat.id, 'Ссылка устарела. Получите новую в админке: «Профиль», «Подключить Telegram».');
  await sql`update users set tg_chat_id = null where tg_chat_id = ${message.from.id} and id <> ${row.user_id}`;
  const [user] = await sql`update users set tg_chat_id = ${message.from.id}, tg_username = ${message.from.username || null} where id = ${row.user_id} returning name`;
  await audit({userId: row.user_id, action: 'telegram_linked', details: {tg_user: message.from.id}});
  return say(message.chat.id, `Готово, ${esc(user.name)}. Теперь новые заявки будут приходить сюда.`);
}

async function bindGroup(message, code) {
  if (message.chat.type === 'private') return say(message.chat.id, 'Команду /bind нужно отправить в группе, куда добавлен бот.');
  const sql = db();
  const [row] = await sql`delete from link_tokens where token = ${code} and purpose = 'bind_group' and expires_at > now() returning user_id`;
  if (!row) return say(message.chat.id, 'Код не подошёл или устарел. Получите новый в админке, раздел «Настройки».');
  await setSetting('notify.admin_chat_id', String(message.chat.id), row.user_id);
  await audit({userId: row.user_id, action: 'group_bound', details: {chat_id: message.chat.id, title: message.chat.title}});
  return say(message.chat.id, 'Группа подключена: сюда будут приходить заявки и сообщения клиентов.');
}

async function handleMembership(update) {
  const chat = update.chat;
  const status = update.new_chat_member?.status;
  if (chat.type !== 'private' && (status === 'member' || status === 'administrator')) {
    await say(chat.id, 'Чтобы подключить эту группу к заявкам, получите код в админке (раздел «Настройки») и отправьте сюда команду /bind с кодом.').catch(() => {});
  }
  if (chat.type !== 'private' && (status === 'left' || status === 'kicked')) {
    const current = await getSetting('notify.admin_chat_id');
    if (String(current) === String(chat.id)) {
      await setSetting('notify.admin_chat_id', null);
      await alertError('Группа заявок', 'Бота удалили из группы заявок. Заявки идут только сотрудникам с привязанным Telegram.');
    }
  }
}

function statusKeyboard(leadId) {
  const rows = [];
  const statuses = LEAD_STATUSES.filter(s => s.key !== 'new');
  for (let i = 0; i < statuses.length; i += 2) {
    rows.push(statuses.slice(i, i + 2).map(s => ({text: s.label, callback_data: `st:${leadId}:${s.key}`})));
  }
  rows.push([{text: 'Назад', callback_data: `back:${leadId}`}]);
  return {inline_keyboard: rows};
}

async function handleCallback(query) {
  const data = String(query.data || '');
  const answer = (text, alert = false) => tg(token(), 'answerCallbackQuery', {callback_query_id: query.id, text, show_alert: alert}).catch(() => {});
  const staff = await staffByTelegram(query.from.id);
  if (!staff) return answer('Привяжите Telegram в админке, чтобы работать с заявками', true);
  const [action, idRaw, extra] = data.split(':');
  const leadId = Number(idRaw);
  if (!leadId) return answer('Не понял команду');
  const lead = await getLead(leadId);
  if (!lead) return answer('Заявка не найдена или удалена', true);
  const chatId = query.message?.chat?.id;
  const messageId = query.message?.message_id;
  const canEdit = staff.permissions.includes('leads.edit');

  if (action === 'take') {
    if (!canEdit) return answer('Нет права менять заявки', true);
    if (lead.manager_id && lead.manager_id !== staff.id) return answer(`Заявку уже взял ${lead.manager_name}`, true);
    await assignLead(leadId, staff.id, {userId: staff.id});
    if (lead.status === 'new') await changeStatus(leadId, 'in_progress', {userId: staff.id});
    await audit({userId: staff.id, action: 'lead_take_tg', entity: 'lead', entityId: leadId});
    await refreshLeadMessages(leadId);
    return answer('Заявка ваша');
  }
  if (action === 'sts') {
    await tg(token(), 'editMessageReplyMarkup', {chat_id: chatId, message_id: messageId, reply_markup: statusKeyboard(leadId)}).catch(() => {});
    return answer();
  }
  if (action === 'back') {
    await tg(token(), 'editMessageReplyMarkup', {chat_id: chatId, message_id: messageId, reply_markup: leadKeyboard(lead)}).catch(() => {});
    return answer();
  }
  if (action === 'st') {
    if (!canEdit) return answer('Нет права менять статус', true);
    if (extra === 'rejected') {
      const reasons = await getSetting('leads.reject_reasons');
      const rows = reasons.map((reason, index) => [{text: reason, callback_data: `rr:${leadId}:${index}`}]);
      rows.push([{text: 'Назад', callback_data: `sts:${leadId}`}]);
      await tg(token(), 'editMessageReplyMarkup', {chat_id: chatId, message_id: messageId, reply_markup: {inline_keyboard: rows}}).catch(() => {});
      return answer('Выберите причину отказа');
    }
    const updated = await changeStatus(leadId, extra, {userId: staff.id});
    if (!lead.manager_id) await assignLead(leadId, staff.id, {userId: staff.id});
    await enqueueForStatus(updated).catch(() => {});
    await audit({userId: staff.id, action: 'lead_status_tg', entity: 'lead', entityId: leadId, details: {status: extra}});
    await refreshLeadMessages(leadId);
    return answer(`Статус: ${statusLabel(extra)}`);
  }
  if (action === 'rr') {
    if (!canEdit) return answer('Нет права менять статус', true);
    const reasons = await getSetting('leads.reject_reasons');
    const reason = reasons[Number(extra)] || 'Другое';
    await changeStatus(leadId, 'rejected', {userId: staff.id, reason});
    await audit({userId: staff.id, action: 'lead_status_tg', entity: 'lead', entityId: leadId, details: {status: 'rejected', reason}});
    await refreshLeadMessages(leadId);
    return answer(`Отказ: ${reason}`);
  }
  if (action === 'dlg') {
    if (!lead.conversation_id || !staff.permissions.includes('conversations.view')) return answer('Диалога нет или нет доступа', true);
    const messages = (await db()`select role, text from messages where conversation_id = ${lead.conversation_id} and role <> 'system'
      order by created_at desc limit 16`).reverse();
    const body = messages.map(m => `<b>${m.role === 'user' ? 'Клиент' : m.role === 'manager' ? 'Менеджер' : 'Бот'}:</b> ${esc(clip(m.text, 400))}`).join('\n\n');
    const sent = await say(chatId, `Диалог по заявке №${leadId}\n\n${body}\n\n<i>Ответьте на это сообщение, чтобы написать клиенту.</i>`);
    await db()`insert into relay_map (chat_id, message_id, conversation_id) values (${chatId}, ${sent.message_id}, ${lead.conversation_id}) on conflict do nothing`;
    return answer();
  }
  return answer('Неизвестная кнопка');
}

async function listOpenLeads(chatId, staff) {
  const sql = db();
  const mine = !staff.permissions.includes('leads.view_all');
  const leads = await sql`select l.id, l.name, l.phone, l.service, l.status, l.created_at, u.name as manager_name from leads l
    left join users u on u.id = l.manager_id
    where l.status in ('new', 'in_progress', 'qualified', 'meeting', 'estimate') and not l.is_test ${mine ? sql`and l.manager_id = ${staff.id}` : sql``}
    order by l.created_at desc limit 12`;
  if (!leads.length) return say(chatId, 'Открытых заявок нет.');
  const lines = leads.map(l => `№${l.id} ${esc(statusLabel(l.status))}: ${esc(l.name || 'без имени')}, ${esc(formatPhone(l.phone) || '')}, ${esc(serviceLabel(l.service))}${l.manager_name ? `, ${esc(l.manager_name)}` : ''}\n${leadUrl(l.id)}`);
  return say(chatId, `<b>Открытые заявки</b>\n\n${lines.join('\n\n')}`);
}

async function quickStats(chatId, staff) {
  if (!staff.permissions.includes('stats.view')) return say(chatId, 'Нет доступа к статистике.');
  const now = new Date();
  const dayStart = new Date(now.getTime() - 24 * 3600 * 1000);
  const weekStart = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
  const [day, week] = await Promise.all([computeStats({from: dayStart, to: now}), computeStats({from: weekStart, to: now})]);
  const fmt = s => `заявок ${s.totals.leads}, договоров ${s.totals.contracts}, без ответа ${s.totals.unanswered}${s.totals.avg_response_min ? `, средний ответ ${Math.round(s.totals.avg_response_min)} мин` : ''}`;
  return say(chatId, `<b>За сутки:</b> ${fmt(day)}\n<b>За 7 дней:</b> ${fmt(week)}\nИсточники за неделю: ${week.by_source.slice(0, 4).map(s => `${esc(s.source)} ${s.count}`).join(', ') || 'нет данных'}\nДиалогов с ИИ за неделю: ${week.bot.conversations}, из них заявок ${week.bot.with_lead}`);
}
