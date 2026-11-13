// Общая логика заявок: создание, события истории, смена статуса, назначение.
// Используется сайтом, ИИ-консультантом, админ-ботом и веб-админкой.
import {db} from './db.js';
import {statusStage, STATUS_KEYS, statusLabel} from './permissions.js';
import {getSetting} from './settings.js';

// sql можно передать из транзакции, чтобы событие записалось вместе с изменением заявки.
export async function addEvent(leadId, type, {userId = null, text = null, data = {}, sql = db()} = {}) {
  await sql`insert into lead_events (lead_id, user_id, type, text, data) values (${leadId}, ${userId}, ${type}, ${text}, ${sql.json(data)})`;
}

// Первый настоящий контакт с клиентом (ответ в Telegram, звонок, письмо, встреча).
// Взятие заявки и смена статуса сюда не входят: они считаются первым действием (first_response_at).
export async function markFirstContact(leadId, {sql = db()} = {}) {
  await sql`update leads set first_contact_at = coalesce(first_contact_at, now()) where id = ${leadId}`;
}

// Ищет свежую заявку с тем же телефоном, чтобы не плодить дубли при повторной отправке.
export async function findRecentDuplicate({phone, email, tgUserId}) {
  const minutes = await getSetting('leads.duplicate_window_minutes');
  if (!phone && !email && !tgUserId) return null;
  const [row] = await db()`
    select id from leads
    where created_at > now() - make_interval(mins => ${minutes})
      and status not in ('spam')
      and (
        (${phone}::text is not null and phone = ${phone}) or
        (${email}::text is not null and email = ${email}) or
        (${tgUserId}::bigint is not null and tg_user_id = ${tgUserId})
      )
    order by created_at desc limit 1`;
  return row?.id || null;
}

export async function insertLead(fields) {
  const sql = db();
  const row = {
    channel: fields.channel || 'site',
    form: fields.form || null,
    page: fields.page || null,
    landing_page: fields.landing_page || null,
    service: fields.service || 'other',
    name: fields.name || null,
    phone: fields.phone || null,
    email: fields.email || null,
    tg_username: fields.tg_username || null,
    tg_user_id: fields.tg_user_id || null,
    contact_pref: fields.contact_pref || null,
    message: fields.message || null,
    details: sql.json(fields.details || {}),
    status: fields.status || 'new',
    delivery_status: fields.delivery_status || 'pending',
    utm_source: fields.utm_source || null,
    utm_medium: fields.utm_medium || null,
    utm_campaign: fields.utm_campaign || null,
    utm_content: fields.utm_content || null,
    utm_term: fields.utm_term || null,
    referrer: fields.referrer || null,
    yclid: fields.yclid || null,
    gclid: fields.gclid || null,
    ym_client_id: fields.ym_client_id || null,
    ip_hash: fields.ip_hash || null,
    user_agent: fields.user_agent || null,
    device: fields.device || null,
    consent_at: fields.consent_at || null,
    consent_version: fields.consent_version || null,
    consent_channel: fields.consent_channel || null,
    submission_key: fields.submission_key || null,
    conversation_id: fields.conversation_id || null,
    is_test: Boolean(fields.is_test)
  };
  // Одна заявка на диалог и на одну отправку формы: повтор возвращает уже созданную заявку.
  const [lead] = await sql`insert into leads ${sql(row)} on conflict do nothing returning *`;
  if (!lead) {
    const [existing] = await sql`select * from leads where (${row.conversation_id}::int is not null and conversation_id = ${row.conversation_id})
      or (${row.submission_key}::text is not null and submission_key = ${row.submission_key}) order by id limit 1`;
    if (existing) return Object.assign(existing, {existed: true});
    throw new Error('Заявка не сохранена: конфликт уникальности');
  }
  await addEvent(lead.id, 'created', {text: fields.channel === 'telegram_bot' ? 'Заявка собрана ИИ-консультантом' : 'Заявка с сайта', data: {form: lead.form, page: lead.page}});
  return lead;
}

export async function getLead(id) {
  const [lead] = await db()`
    select l.*, u.name as manager_name, u.tg_username as manager_tg
    from leads l left join users u on u.id = l.manager_id where l.id = ${id}`;
  return lead || null;
}

// Меняет статус и отмечает первое действие менеджера (для расчёта времени ответа).
export async function changeStatus(leadId, status, {userId = null, reason = null, comment = null, amount = null, sql = db()} = {}) {
  if (!STATUS_KEYS.includes(status)) throw new Error('Неизвестный статус');
  const [before] = await sql`select status, stage_reached, first_response_at from leads where id = ${leadId}`;
  if (!before) throw new Error('Заявка не найдена');
  const stage = Math.max(before.stage_reached, statusStage(status));
  const closed = ['contract', 'rejected', 'spam'].includes(status);
  const [lead] = await sql`
    update leads set
      status = ${status},
      stage_reached = ${stage},
      reject_reason = ${status === 'rejected' ? reason : null},
      contract_amount = coalesce(${amount}, contract_amount),
      first_response_at = coalesce(first_response_at, case when ${status} <> 'new' then now() end),
      closed_at = ${closed ? sql`now()` : null},
      updated_at = now()
    where id = ${leadId} returning *`;
  if (before.status !== status) {
    await addEvent(leadId, 'status', {
      sql,
      userId,
      text: `${statusLabel(before.status)} → ${statusLabel(status)}${reason ? `. Причина: ${reason}` : ''}${comment ? `. ${comment}` : ''}`,
      data: {from: before.status, to: status, reason, amount}
    });
  }
  return lead;
}

export async function assignLead(leadId, managerId, {userId = null, sql = db()} = {}) {
  const [manager] = managerId ? await sql`select id, name from users where id = ${managerId} and is_active` : [null];
  if (managerId && !manager) throw new Error('Менеджер не найден');
  const [lead] = await sql`
    update leads set manager_id = ${managerId || null}, updated_at = now(),
      first_response_at = coalesce(first_response_at, case when ${Boolean(managerId)} then now() end)
    where id = ${leadId} returning *`;
  await addEvent(leadId, 'assign', {sql, userId, text: manager ? `Ответственный: ${manager.name}` : 'Ответственный снят', data: {manager_id: managerId || null}});
  return lead;
}

// Взять свободную заявку одним действием в базе: из двух одновременных нажатий заявку получит один.
// Возвращает заявку, если она теперь у этого сотрудника, или null, если её уже взял другой.
export async function takeLead(leadId, userId) {
  const sql = db();
  const [lead] = await sql`
    update leads set manager_id = ${userId}, updated_at = now(), first_response_at = coalesce(first_response_at, now())
    where id = ${leadId} and manager_id is null returning *`;
  if (lead) {
    const [manager] = await sql`select name from users where id = ${userId}`;
    await addEvent(leadId, 'assign', {userId, text: `Ответственный: ${manager?.name || userId}`, data: {manager_id: userId}});
    return lead;
  }
  const [current] = await sql`select * from leads where id = ${leadId}`;
  return current && current.manager_id === userId ? current : null;
}

export async function addNote(leadId, text, {userId = null, type = 'note'} = {}) {
  const sql = db();
  await addEvent(leadId, type, {userId, text});
  if (userId && ['call', 'email', 'meeting', 'message'].includes(type)) await markFirstContact(leadId);
  await sql`update leads set updated_at = now(),
    first_response_at = coalesce(first_response_at, case when ${type === 'call' || type === 'note'} and ${userId}::int is not null then now() end)
    where id = ${leadId}`;
}
