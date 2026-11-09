// Еженедельный отчёт: заявки, источники, воронка, причины отказов и выводы из диалогов с ИИ.
// Уходит в админ-бот текстом и файлом Excel, сохраняется в базе и в ленте для Google Таблиц.
import {db} from './db.js';
import {config} from './env.js';
import {tg, sendDocument, esc, clip} from './telegram.js';
import {getSetting} from './settings.js';
import {computeStats} from './stats.js';
import {statsSheets, LEAD_COLUMNS} from './exports.js';
import {buildXlsx} from './xlsx.js';
import {statusLabel, serviceLabel, CHANNELS} from './permissions.js';
import {formatPhone} from './validate.js';
import {sourceExpr} from './stats.js';

const fmtDate = date => new Date(date).toLocaleDateString('ru-RU', {day: 'numeric', month: 'long', timeZone: 'Europe/Moscow'});
const delta = (now, before) => before === undefined || before === null ? '' : now === before ? ' (как неделей раньше)' : ` (неделей раньше ${before})`;
const list = (rows, key = 'item', limit = 5) => rows.slice(0, limit).map(r => `${esc(r[key])} ${r.count}`).join(', ') || 'нет данных';

// Неделя заканчивается в начале текущего дня по Москве.
export function lastWeekPeriod(now = new Date()) {
  const msk = new Date(now.getTime() + 3 * 3600 * 1000);
  const endMsk = Date.UTC(msk.getUTCFullYear(), msk.getUTCMonth(), msk.getUTCDate());
  const to = new Date(endMsk - 3 * 3600 * 1000);
  return {from: new Date(to.getTime() - 7 * 86400000), to};
}

export function reportText(stats, previous) {
  const t = stats.totals;
  const p = previous?.totals || {};
  const lines = [
    `<b>Отчёт за неделю: ${fmtDate(stats.period.from)} - ${fmtDate(new Date(new Date(stats.period.to).getTime() - 1))}</b>`,
    '',
    `Заявок: <b>${t.leads}</b>${delta(t.leads, p.leads)}`,
    `Договоров: ${t.contracts}${t.contracts_amount ? ` на ${Math.round(t.contracts_amount).toLocaleString('ru-RU')} ₽` : ''}, отказов: ${t.rejected}, спам: ${t.spam}`,
    `Без ответа сейчас: ${t.unanswered}`,
    t.avg_response_min !== null && t.avg_response_min !== undefined ? `Среднее время первого ответа: ${Math.round(t.avg_response_min)} мин` : 'Время ответа: нет данных',
    '',
    `<b>Источники:</b> ${list(stats.by_source, 'source')}`,
    `<b>Услуги:</b> ${stats.by_service.slice(0, 5).map(s => `${esc(s.label)} ${s.count}`).join(', ') || 'нет данных'}`,
    `<b>Воронка:</b> ${stats.funnel.map(f => `${esc(f.label)} ${f.count}`).join(', ')}`,
    `<b>Причины отказов:</b> ${list(stats.reject_reasons, 'reason')}`,
    '',
    `<b>ИИ-консультант:</b> диалогов ${stats.bot.conversations}, заявок из них ${stats.bot.with_lead} (${Math.round(stats.bot.conversion * 100)}%)`,
    `Частые вопросы: ${list(stats.bot.questions)}`,
    `Темы: ${list(stats.bot.topics)}`,
    `Боли: ${list(stats.bot.pains)}`,
    `Возражения: ${list(stats.bot.objections)}`,
    `Почему уходят: ${list(stats.bot.refusals, 'reason')}`
  ];
  return clip(lines.join('\n'));
}

async function weekLeads(from, to) {
  const sql = db();
  const rows = await sql`select l.*, u.name as manager_name, ${sourceExpr(sql)} as source from leads l left join users u on u.id = l.manager_id
    where l.created_at >= ${from} and l.created_at < ${to} and not l.is_test and l.status <> 'spam' order by l.created_at`;
  return rows.map(row => ({
    ...row, created_at: new Date(row.created_at), channel_label: CHANNELS[row.channel] || row.channel, service_label: serviceLabel(row.service),
    status_label: statusLabel(row.status), phone_fmt: formatPhone(row.phone),
    details_text: Object.entries(row.details || {}).map(([k, v]) => `${k}: ${v}`).join('; '),
    response_min: row.first_response_at ? Math.round((new Date(row.first_response_at) - new Date(row.created_at)) / 60000) : null,
    contract_amount: row.contract_amount === null ? null : Number(row.contract_amount)
  }));
}

async function reportRecipients() {
  const chats = new Set();
  const group = await getSetting('notify.admin_chat_id');
  if (group) chats.add(String(group));
  const users = await db()`select u.tg_chat_id from users u join roles r on r.id = u.role_id
    where u.is_active and u.tg_chat_id is not null and 'stats.view' = any(r.permissions) and r.key in ('owner', 'admin', 'analyst')`;
  for (const user of users) chats.add(String(user.tg_chat_id));
  return [...chats];
}

export async function sendWeeklyReport({force = false, now = new Date()} = {}) {
  const sql = db();
  const {from, to} = lastWeekPeriod(now);
  if (!force) {
    const [existing] = await sql`select id from reports where kind = 'weekly' and period_start = ${from} and sent_at is not null`;
    if (existing) return {skipped: 'уже отправлен'};
  }
  const [stats, previous] = await Promise.all([
    computeStats({from, to}),
    computeStats({from: new Date(from.getTime() - 7 * 86400000), to: from})
  ]);
  const [report] = await sql`insert into reports (kind, period_start, period_end, data) values ('weekly', ${from}, ${to}, ${sql.json(stats)}) returning id`;
  const xlsx = buildXlsx([...statsSheets(stats), {name: 'Заявки недели', columns: LEAD_COLUMNS, rows: await weekLeads(from, to)}]);
  const filename = `otchet-${from.toISOString().slice(0, 10)}.xlsx`;
  const text = reportText(stats, previous);
  const feed = await getSetting('feeds.token');
  const footer = feed ? `\n\nТаблица для Google: ${config.siteUrl}/api/feeds/reports.csv?token=${feed}` : '';
  let delivered = 0;
  for (const chatId of await reportRecipients()) {
    try {
      await tg(config.telegram.adminToken, 'sendMessage', {chat_id: chatId, text: text + footer, parse_mode: 'HTML', link_preview_options: {is_disabled: true}});
      await sendDocument(config.telegram.adminToken, chatId, {filename, data: xlsx, mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', caption: 'Отчёт в Excel'});
      delivered += 1;
    } catch (error) {
      console.error('weekly report', error.message);
    }
  }
  if (delivered) await sql`update reports set sent_at = now() where id = ${report.id}`;
  return {id: report.id, delivered};
}
