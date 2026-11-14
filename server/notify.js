// Уведомления в админ-бот: новые заявки, напоминания, ошибки.
import {db} from './db.js';
import {config} from './env.js';
import {tg, esc, clip, TelegramError} from './telegram.js';
import {getSetting} from './settings.js';
import {serviceLabel, statusLabel, CHANNELS} from './permissions.js';
import {formatPhone} from './validate.js';
import {addEvent} from './lead-core.js';

const CONTACT_LABELS = {call: 'звонок', telegram: 'Telegram', whatsapp: 'WhatsApp', max: 'Max', email: 'e-mail'};
const DETAIL_LABELS = {
  object: 'Объект', area: 'Площадь', floors: 'Этажность', material: 'Материал', has_project: 'Есть проект',
  has_plot: 'Есть участок', location: 'Где', budget: 'Бюджет', timing: 'Сроки', stage: 'Стадия',
  design_project: 'Дизайн проект', scope: 'Состав работ', estimate: 'Предварительный расчёт', rooms: 'Помещения',
  repeat_of: 'Возможный повтор заявки'
};

const adminToken = () => config.telegram.adminToken;

export function leadUrl(id) {
  return `${config.siteUrl}/admin/#/leads/${id}`;
}

export function formatLead(lead, {title} = {}) {
  const lines = [];
  lines.push(`<b>${esc(title || `Новая заявка №${lead.id}`)}</b>${lead.is_test ? ' (тест)' : ''}`);
  lines.push(`${esc(CHANNELS[lead.channel] || lead.channel)}, ${esc(serviceLabel(lead.service))}`);
  lines.push('');
  if (lead.name) lines.push(`Имя: ${esc(lead.name)}`);
  if (lead.phone) lines.push(`Телефон: ${esc(formatPhone(lead.phone))}`);
  if (lead.email) lines.push(`Почта: ${esc(lead.email)}`);
  if (lead.tg_username) lines.push(`Telegram: @${esc(lead.tg_username)}`);
  if (lead.contact_pref) lines.push(`Удобная связь: ${esc(CONTACT_LABELS[lead.contact_pref] || lead.contact_pref)}`);
  const details = lead.details || {};
  for (const [key, label] of Object.entries(DETAIL_LABELS)) {
    if (details[key]) lines.push(`${label}: ${esc(details[key])}`);
  }
  if (lead.message) lines.push('', `<i>${esc(clip(lead.message, 1200))}</i>`);
  lines.push('');
  const where = [lead.page && `страница ${lead.page}`, lead.form && `форма «${lead.form}»`].filter(Boolean).join(', ');
  if (where) lines.push(`Откуда: ${esc(where)}`);
  const source = [lead.utm_source, lead.utm_medium, lead.utm_campaign].filter(Boolean).join(' / ');
  if (source) lines.push(`Метки: ${esc(source)}`);
  else if (lead.referrer) lines.push(`Переход с: ${esc(clip(lead.referrer, 120))}`);
  if (lead.status && lead.status !== 'new') lines.push(`Статус: <b>${esc(statusLabel(lead.status))}</b>${lead.manager_name ? `, ответственный ${esc(lead.manager_name)}` : ''}`);
  else if (lead.manager_name) lines.push(`Ответственный: ${esc(lead.manager_name)}`);
  return clip(lines.join('\n'));
}

export function leadKeyboard(lead) {
  const rows = [];
  if (lead.status === 'new') rows.push([{text: 'Взять в работу', callback_data: `take:${lead.id}`}]);
  rows.push([
    {text: 'Статус', callback_data: `sts:${lead.id}`},
    {text: 'Открыть в админке', url: leadUrl(lead.id)}
  ]);
  if (lead.conversation_id) rows.push([{text: 'Диалог с клиентом', callback_data: `dlg:${lead.id}`}]);
  return {inline_keyboard: rows};
}

// Куда слать заявки: группа из настроек и привязанные пользователи с правом видеть заявки.
export async function leadRecipients(lead) {
  const chats = new Set();
  const group = await getSetting('notify.admin_chat_id');
  if (group) chats.add(String(group));
  const users = await db()`
    select u.tg_chat_id, u.id, r.permissions from users u join roles r on r.id = u.role_id
    where u.is_active and u.tg_chat_id is not null and u.notify_new_leads`;
  for (const user of users) {
    const seesAll = user.permissions.includes('leads.view_all');
    if (seesAll || user.id === lead.manager_id) chats.add(String(user.tg_chat_id));
  }
  return [...chats];
}

// Карточка новой заявки уходит каждому получателю. Результат хранится по каждому чату (tg_messages):
// повторная отправка идёт только тем, до кого карточка не дошла, а не останавливается после первого успеха.
export async function notifyNewLead(lead) {
  const sql = db();
  const chats = await leadRecipients(lead);
  if (!chats.length) {
    await sql`update leads set delivery_status = 'failed', delivery_error = 'Нет получателей: привяжите группу или пользователей к админ-боту',
      delivery_attempts = delivery_attempts + 1 where id = ${lead.id}`;
    return {sent: 0, errors: ['нет получателей']};
  }
  const already = Array.isArray(lead.tg_messages) ? lead.tg_messages : [];
  const delivered = new Set(already.map(item => String(item.chat_id)));
  const sent = [];
  const errors = [];
  for (const chatId of chats.filter(chatId => !delivered.has(String(chatId)))) {
    try {
      const message = await tg(adminToken(), 'sendMessage', {
        chat_id: chatId, text: formatLead(lead), parse_mode: 'HTML',
        reply_markup: leadKeyboard(lead), link_preview_options: {is_disabled: true}
      });
      sent.push({chat_id: chatId, message_id: message.message_id});
    } catch (error) {
      errors.push(`${chatId}: ${error.description || error.message}`);
    }
  }
  const all = [...already, ...sent];
  const status = errors.length ? (all.length ? 'partial' : 'failed') : 'sent';
  await sql`update leads set delivery_status = ${status}, delivery_error = ${errors.join('; ') || null},
    delivery_attempts = delivery_attempts + 1, tg_messages = ${sql.json(all)} where id = ${lead.id}`;
  if (sent.length || errors.length) {
    await addEvent(lead.id, 'delivery', {text: errors.length ? `Отправлено в Telegram: ${all.length}, не доставлено: ${errors.length}` : `Отправлено в Telegram: ${all.length}`, data: {sent: sent.length, errors}});
  }
  return {sent: all.length, errors};
}

// Обновляет уже отправленные карточки заявки после смены статуса или ответственного.
export async function refreshLeadMessages(leadId) {
  const [lead] = await db()`select l.*, u.name as manager_name from leads l left join users u on u.id = l.manager_id where l.id = ${leadId}`;
  if (!lead) return;
  for (const item of lead.tg_messages || []) {
    try {
      await tg(adminToken(), 'editMessageText', {
        chat_id: item.chat_id, message_id: item.message_id, text: formatLead(lead, {title: `Заявка №${lead.id}`}),
        parse_mode: 'HTML', reply_markup: leadKeyboard(lead), link_preview_options: {is_disabled: true}
      });
    } catch (error) {
      if (!(error instanceof TelegramError) || !/not modified/i.test(error.description)) console.error('edit lead message', error.message);
    }
  }
}

export async function notifyOwners(text, {permission = 'settings.manage'} = {}) {
  const users = await db()`
    select u.tg_chat_id from users u join roles r on r.id = u.role_id
    where u.is_active and u.tg_chat_id is not null and ${permission} = any(r.permissions)`;
  let delivered = 0;
  for (const user of users) {
    try {
      await tg(adminToken(), 'sendMessage', {chat_id: String(user.tg_chat_id), text: clip(text), parse_mode: 'HTML', link_preview_options: {is_disabled: true}});
      delivered += 1;
    } catch (error) {
      console.error('notify owner', error.message);
    }
  }
  if (!delivered) {
    const group = await getSetting('notify.admin_chat_id');
    if (group) await tg(adminToken(), 'sendMessage', {chat_id: String(group), text: clip(text), parse_mode: 'HTML'}).catch(() => {});
  }
  return delivered;
}

// Сообщение об ошибке не чаще раза в 30 минут на один тип.
export async function alertError(kind, message) {
  try {
    const sql = db();
    const [row] = await sql`select last_run_at from job_runs where name = ${`alert:${kind}`}`;
    if (row?.last_run_at && Date.now() - new Date(row.last_run_at).getTime() < 30 * 60 * 1000) return;
    await sql`insert into job_runs (name, last_run_at, last_ok, last_error) values (${`alert:${kind}`}, now(), false, ${message})
      on conflict (name) do update set last_run_at = now(), last_error = excluded.last_error`;
    await notifyOwners(`<b>Ошибка: ${esc(kind)}</b>\n${esc(clip(message, 1500))}`);
  } catch (error) {
    console.error('alertError failed', error.message);
  }
}

function withinWorkingHours(hours) {
  const moscowHour = (new Date().getUTCHours() + 3) % 24;
  return moscowHour >= (hours?.from ?? 9) && moscowHour < (hours?.to ?? 21);
}

// Напоминает о заявках без реакции. Повторная доставка тех, что не ушли в Telegram.
export async function processReminders() {
  const sql = db();
  const result = {retried: 0, reminded: 0, escalated: 0};

  // Спам и ручные заявки без уведомления (delivery_status = skipped) не отправляются никогда.
  const failed = await sql`select * from leads where delivery_status in ('failed', 'pending', 'partial') and status <> 'spam' and delivery_attempts < 6
    and created_at > now() - interval '2 days' and created_at < now() - interval '1 minute' order by id limit 20`;
  for (const lead of failed) {
    const {sent} = await notifyNewLead(lead);
    if (sent) result.retried += 1;
  }

  const hours = await getSetting('notify.working_hours');
  if (!withinWorkingHours(hours)) return result;
  const remindAfter = Number(await getSetting('notify.reminder_minutes')) || 15;
  const escalateAfter = Number(await getSetting('notify.escalate_minutes')) || 120;
  const waiting = await sql`select l.*, u.name as manager_name from leads l left join users u on u.id = l.manager_id
    where l.status = 'new' and not l.is_test and l.created_at < now() - make_interval(mins => ${remindAfter})
      and l.created_at > now() - interval '7 days'
      and (l.last_reminder_at is null or l.last_reminder_at < now() - make_interval(mins => ${remindAfter * 2}))
      and l.reminders_sent < 3
    order by l.created_at limit 20`;
  for (const lead of waiting) {
    const minutes = Math.round((Date.now() - new Date(lead.created_at).getTime()) / 60000);
    const text = `<b>Заявка №${lead.id} ждёт ответа ${minutes} мин</b>\n${esc(lead.name || 'Без имени')}, ${esc(formatPhone(lead.phone) || lead.tg_username || lead.email || '')}`;
    const chats = await leadRecipients(lead);
    for (const chatId of chats) {
      await tg(adminToken(), 'sendMessage', {chat_id: chatId, text, parse_mode: 'HTML', reply_markup: leadKeyboard(lead)}).catch(() => {});
    }
    if (minutes >= escalateAfter) {
      await notifyOwners(`<b>Эскалация:</b> заявка №${lead.id} без ответа больше ${Math.round(escalateAfter / 60)} ч.\n${leadUrl(lead.id)}`);
      result.escalated += 1;
    }
    await sql`update leads set reminders_sent = reminders_sent + 1, last_reminder_at = now() where id = ${lead.id}`;
    await addEvent(lead.id, 'reminder', {text: `Напоминание через ${minutes} мин`});
    result.reminded += 1;
  }
  return result;
}
