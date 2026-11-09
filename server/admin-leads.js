// Админка: заявки, история, заметки, диалоги.
import {db} from './db.js';
import {HttpError, json, readJson, clientIp, hashIp} from './http.js';
import {requireUser} from './auth.js';
import {audit} from './security.js';
import {can, STATUS_KEYS, LEAD_STATUSES, SERVICES, CHANNELS} from './permissions.js';
import {getLead, changeStatus, assignLead, addNote, insertLead, addEvent} from './lead-core.js';
import {refreshLeadMessages, notifyNewLead} from './notify.js';
import {enqueueForStatus} from './metrika.js';
import {cleanText, cleanLine, normalizePhone, normalizeEmail, normalizeService, cleanDetails} from './validate.js';
import {getSetting} from './settings.js';
import {sendManagerReply} from './client-bot.js';

const SORTS = {
  created_desc: 'l.created_at desc',
  created_asc: 'l.created_at asc',
  updated_desc: 'l.updated_at desc',
  status: 'l.status asc, l.created_at desc'
};

// Собирает условия фильтра. Используется списком, выгрузкой и статистикой.
export function leadFilters(sql, user, query) {
  const where = [sql`true`];
  const q = cleanLine(query.get('q'), 100);
  if (q) {
    const like = `%${q.replace(/[%_]/g, '')}%`;
    const digits = q.replace(/\D/g, '');
    where.push(sql`(l.name ilike ${like} or l.email ilike ${like} or l.message ilike ${like} or l.tg_username ilike ${like}
      ${digits.length >= 4 ? sql`or l.phone like ${`%${digits}%`}` : sql``}
      ${/^\d{1,9}$/.test(q) ? sql`or l.id = ${Number(q)}` : sql``})`);
  }
  const status = query.get('status');
  if (status && STATUS_KEYS.includes(status)) where.push(sql`l.status = ${status}`);
  else if (status === 'open') where.push(sql`l.status not in ('contract', 'rejected', 'spam')`);
  else if (status !== 'all_with_spam') where.push(sql`l.status <> 'spam'`);
  const service = query.get('service');
  if (service && SERVICES[service]) where.push(sql`l.service = ${service}`);
  const channel = query.get('channel');
  if (channel && CHANNELS[channel]) where.push(sql`l.channel = ${channel}`);
  const source = cleanLine(query.get('source'), 60);
  if (source === '(прямые)') where.push(sql`l.utm_source is null`);
  else if (source) where.push(sql`l.utm_source = ${source}`);
  const manager = query.get('manager');
  if (manager === 'none') where.push(sql`l.manager_id is null`);
  else if (/^\d+$/.test(manager || '')) where.push(sql`l.manager_id = ${Number(manager)}`);
  const from = query.get('from');
  const to = query.get('to');
  if (from && !Number.isNaN(Date.parse(from))) where.push(sql`l.created_at >= ${new Date(from)}`);
  if (to && !Number.isNaN(Date.parse(to))) where.push(sql`l.created_at < ${new Date(new Date(to).getTime() + 86400000)}`);
  if (query.get('test') !== '1') where.push(sql`not l.is_test`);
  if (!can(user, 'leads.view_all')) where.push(sql`l.manager_id = ${user.id}`);
  return where.reduce((acc, part, index) => index === 0 ? part : sql`${acc} and ${part}`);
}

export async function listLeads({request, url}) {
  const user = await requireUser(request, ['leads.view_all', 'leads.view_own']);
  const sql = db();
  const query = url.searchParams;
  const per = Math.min(Math.max(Number(query.get('per')) || 30, 5), 200);
  const page = Math.max(Number(query.get('page')) || 1, 1);
  const order = SORTS[query.get('sort')] || SORTS.created_desc;
  const where = leadFilters(sql, user, query);
  const [{total}] = await sql`select count(*)::int as total from leads l where ${where}`;
  const items = await sql`
    select l.id, l.created_at, l.updated_at, l.channel, l.form, l.page, l.service, l.name, l.phone, l.email, l.tg_username,
      l.message, l.status, l.reject_reason, l.manager_id, u.name as manager_name, l.utm_source, l.utm_medium, l.utm_campaign,
      l.delivery_status, l.first_response_at, l.next_contact_at, l.is_test, l.conversation_id, l.details
    from leads l left join users u on u.id = l.manager_id
    where ${where} order by ${sql.unsafe(order)} limit ${per} offset ${(page - 1) * per}`;
  return json({items, total, page, per});
}

async function loadLeadFor(user, id) {
  const lead = await getLead(id);
  if (!lead) throw new HttpError(404, 'Заявка не найдена');
  if (!can(user, 'leads.view_all') && lead.manager_id !== user.id) throw new HttpError(403, 'Это не ваша заявка');
  return lead;
}

export async function getLeadRoute({request, params}) {
  const user = await requireUser(request, ['leads.view_all', 'leads.view_own']);
  const lead = await loadLeadFor(user, Number(params.id));
  const sql = db();
  const events = await sql`select e.*, u.name as user_name from lead_events e left join users u on u.id = e.user_id
    where e.lead_id = ${lead.id} order by e.created_at`;
  let conversation = null;
  if (lead.conversation_id && can(user, 'conversations.view')) {
    const [conv] = await sql`select * from conversations where id = ${lead.conversation_id}`;
    const messages = await sql`select m.id, m.role, m.text, m.created_at, u.name as manager_name from messages m
      left join users u on u.id = m.manager_id where m.conversation_id = ${lead.conversation_id} order by m.created_at limit 500`;
    conversation = conv ? {...conv, messages} : null;
  }
  const {ip_hash, ...safeLead} = lead;
  return json({lead: safeLead, events, conversation, statuses: LEAD_STATUSES, reasons: await getSetting('leads.reject_reasons')});
}

export async function updateLeadRoute({request, params}) {
  const user = await requireUser(request, ['leads.edit', 'leads.assign']);
  const lead = await loadLeadFor(user, Number(params.id));
  const body = await readJson(request);
  const sql = db();
  const ipHash = hashIp(clientIp(request));
  let updated = lead;

  if (body.manager_id !== undefined) {
    if (!can(user, 'leads.assign') && !(body.manager_id === user.id && !lead.manager_id)) throw new HttpError(403, 'Нет права назначать ответственных');
    updated = await assignLead(lead.id, body.manager_id ? Number(body.manager_id) : null, {userId: user.id});
  }
  if (body.status !== undefined) {
    if (!can(user, 'leads.edit')) throw new HttpError(403, 'Нет права менять статус');
    if (!STATUS_KEYS.includes(body.status)) throw new HttpError(400, 'Неизвестный статус');
    const reason = body.status === 'rejected' ? cleanLine(body.reason, 120) || 'Другое' : null;
    const amount = body.status === 'contract' && body.amount ? Number(body.amount) : null;
    updated = await changeStatus(lead.id, body.status, {userId: user.id, reason, comment: cleanLine(body.comment, 300) || null, amount});
    await enqueueForStatus(updated).catch(() => {});
  }
  if (can(user, 'leads.edit')) {
    const patch = {};
    if (body.name !== undefined) patch.name = cleanLine(body.name, 80) || null;
    if (body.phone !== undefined) {
      const phone = normalizePhone(body.phone);
      if (phone === null) throw new HttpError(400, 'Проверьте телефон');
      patch.phone = phone || null;
    }
    if (body.email !== undefined) {
      const email = normalizeEmail(body.email);
      if (email === null) throw new HttpError(400, 'Проверьте почту');
      patch.email = email || null;
    }
    if (body.service !== undefined) patch.service = normalizeService(body.service);
    if (body.message !== undefined) patch.message = cleanText(body.message, 4000) || null;
    if (body.next_contact_at !== undefined) patch.next_contact_at = body.next_contact_at ? new Date(body.next_contact_at) : null;
    if (body.details !== undefined) patch.details = sql.json({...lead.details, ...cleanDetails(body.details)});
    if (Object.keys(patch).length) {
      [updated] = await sql`update leads set ${sql(patch)}, updated_at = now() where id = ${lead.id} returning *`;
      await addEvent(lead.id, 'edit', {userId: user.id, text: `Изменены поля: ${Object.keys(patch).join(', ')}`});
    }
  }
  await audit({userId: user.id, ipHash, action: 'lead_update', entity: 'lead', entityId: lead.id, details: body});
  refreshLeadMessages(lead.id).catch(() => {});
  return json({lead: updated});
}

export async function addLeadEventRoute({request, params}) {
  const user = await requireUser(request, 'leads.edit');
  const lead = await loadLeadFor(user, Number(params.id));
  const body = await readJson(request);
  const type = ['note', 'call', 'meeting', 'email', 'message'].includes(body.type) ? body.type : 'note';
  const textValue = cleanText(body.text, 4000);
  if (!textValue) throw new HttpError(400, 'Пустая запись');
  await addNote(lead.id, textValue, {userId: user.id, type});
  await audit({userId: user.id, action: 'lead_note', entity: 'lead', entityId: lead.id, details: {type}});
  return json({ok: true});
}

export async function deleteLeadRoute({request, params}) {
  const user = await requireUser(request, 'leads.delete');
  const id = Number(params.id);
  const [lead] = await db()`delete from leads where id = ${id} returning id, name, phone`;
  if (!lead) throw new HttpError(404, 'Заявка не найдена');
  await audit({userId: user.id, ipHash: hashIp(clientIp(request)), action: 'lead_delete', entity: 'lead', entityId: id, details: {name: lead.name}});
  return json({ok: true});
}

export async function createLeadRoute({request}) {
  const user = await requireUser(request, 'leads.edit');
  const body = await readJson(request);
  const phone = normalizePhone(body.phone);
  const email = normalizeEmail(body.email);
  if (phone === null || email === null) throw new HttpError(400, 'Проверьте телефон и почту');
  if (!phone && !email && !body.name) throw new HttpError(400, 'Укажите имя или контакт');
  const lead = await insertLead({
    channel: 'manual', form: 'manual', service: normalizeService(body.service), name: cleanLine(body.name, 80),
    phone: phone || null, email: email || null, message: cleanText(body.message, 4000) || null,
    utm_source: cleanLine(body.source, 60) || null, details: cleanDetails(body.details)
  });
  if (body.assign_to_me) await assignLead(lead.id, user.id, {userId: user.id});
  await audit({userId: user.id, action: 'lead_create', entity: 'lead', entityId: lead.id});
  if (body.notify) notifyNewLead(await getLead(lead.id)).catch(() => {});
  return json({lead});
}

export async function listConversations({request, url}) {
  await requireUser(request, 'conversations.view');
  const sql = db();
  const page = Math.max(Number(url.searchParams.get('page')) || 1, 1);
  const q = cleanLine(url.searchParams.get('q'), 60);
  const like = `%${q}%`;
  const where = q ? sql`(c.first_name ilike ${like} or c.tg_username ilike ${like} or c.last_name ilike ${like})` : sql`true`;
  const [{total}] = await sql`select count(*)::int as total from conversations c where ${where}`;
  const items = await sql`
    select c.id, c.tg_username, c.first_name, c.last_name, c.source, c.lead_id, c.human_mode, c.messages_count, c.created_at, c.last_message_at,
      i.service, i.topics, i.objections, i.refusal_reason,
      (select text from messages m where m.conversation_id = c.id order by m.created_at desc limit 1) as last_text
    from conversations c left join conversation_insights i on i.conversation_id = c.id
    where ${where} order by c.last_message_at desc nulls last limit 30 offset ${(page - 1) * 30}`;
  return json({items, total, page, per: 30});
}

export async function getConversation({request, params}) {
  await requireUser(request, 'conversations.view');
  const sql = db();
  const [conversation] = await sql`select c.*, i.topics, i.pains, i.objections, i.questions, i.refusal_reason, i.segment
    from conversations c left join conversation_insights i on i.conversation_id = c.id where c.id = ${Number(params.id)}`;
  if (!conversation) throw new HttpError(404, 'Диалог не найден');
  const messages = await sql`select m.id, m.role, m.text, m.created_at, m.provider, m.model, u.name as manager_name from messages m
    left join users u on u.id = m.manager_id where m.conversation_id = ${conversation.id} order by m.created_at limit 1000`;
  return json({conversation, messages});
}

export async function replyConversation({request, params}) {
  const user = await requireUser(request, 'conversations.reply');
  const body = await readJson(request);
  const textValue = cleanText(body.text, 3500);
  if (!textValue) throw new HttpError(400, 'Пустое сообщение');
  await sendManagerReply(Number(params.id), textValue, {userId: user.id, userName: user.name});
  await audit({userId: user.id, action: 'conversation_reply', entity: 'conversation', entityId: params.id});
  return json({ok: true});
}

export async function setHumanMode({request, params}) {
  const user = await requireUser(request, 'conversations.reply');
  const body = await readJson(request);
  const on = Boolean(body.on);
  await db()`update conversations set human_mode = ${on}, human_since = ${on ? new Date() : null} where id = ${Number(params.id)}`;
  await audit({userId: user.id, action: on ? 'conversation_human_on' : 'conversation_human_off', entity: 'conversation', entityId: params.id});
  return json({ok: true});
}
