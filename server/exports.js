// Выгрузки в Excel и ленты CSV для Google Таблиц (функция IMPORTDATA).
import {db} from './db.js';
import {HttpError, text, safeEqual, json, readJson} from './http.js';
import {requireUser} from './auth.js';
import {audit, randomToken} from './security.js';
import {leadFilters} from './admin-leads.js';
import {computeStats, periodFrom, sourceExpr} from './stats.js';
import {buildXlsx, toCsv} from './xlsx.js';
import {statusLabel, serviceLabel, CHANNELS} from './permissions.js';
import {formatPhone} from './validate.js';
import {getSetting, setSetting} from './settings.js';
import {config} from './env.js';

export const LEAD_COLUMNS = [
  {key: 'id', title: '№', width: 7},
  {key: 'created_at', title: 'Создана', width: 17},
  {key: 'channel_label', title: 'Канал', width: 18},
  {key: 'service_label', title: 'Услуга', width: 22},
  {key: 'status_label', title: 'Статус', width: 18},
  {key: 'reject_reason', title: 'Причина отказа', width: 22},
  {key: 'manager_name', title: 'Ответственный', width: 18},
  {key: 'name', title: 'Имя', width: 18},
  {key: 'phone_fmt', title: 'Телефон', width: 18},
  {key: 'email', title: 'Почта', width: 22},
  {key: 'tg_username', title: 'Telegram', width: 16},
  {key: 'message', title: 'Задача', width: 50},
  {key: 'details_text', title: 'Детали', width: 40},
  {key: 'source', title: 'Источник', width: 18},
  {key: 'utm_medium', title: 'utm_medium', width: 12},
  {key: 'utm_campaign', title: 'utm_campaign', width: 20},
  {key: 'page', title: 'Страница', width: 18},
  {key: 'form', title: 'Форма', width: 14},
  {key: 'response_min', title: 'Время ответа, мин', width: 12},
  {key: 'contract_amount', title: 'Сумма договора', width: 14},
  {key: 'ym_client_id', title: 'ClientID Метрики', width: 22}
];

function decorateLead(row) {
  return {
    ...row,
    created_at: new Date(row.created_at),
    channel_label: CHANNELS[row.channel] || row.channel,
    service_label: serviceLabel(row.service),
    status_label: statusLabel(row.status),
    phone_fmt: formatPhone(row.phone),
    details_text: Object.entries(row.details || {}).map(([k, v]) => `${k}: ${v}`).join('; '),
    response_min: row.first_response_at ? Math.round((new Date(row.first_response_at) - new Date(row.created_at)) / 60000) : null,
    contract_amount: row.contract_amount === null ? null : Number(row.contract_amount)
  };
}

async function queryLeads(where, limit = 10000) {
  const sql = db();
  const rows = await sql`select l.*, u.name as manager_name, ${sourceExpr(sql)} as source
    from leads l left join users u on u.id = l.manager_id where ${where} order by l.created_at desc limit ${limit}`;
  return rows.map(decorateLead);
}

function xlsxResponse(bytes, filename) {
  return new Response(bytes, {headers: {
    'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'content-disposition': `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    'cache-control': 'no-store'
  }});
}

export async function exportLeadsXlsx({request, url}) {
  const user = await requireUser(request, 'leads.export');
  const sql = db();
  const rows = await queryLeads(leadFilters(sql, user, url.searchParams));
  await audit({userId: user.id, action: 'export_leads', details: {count: rows.length, query: url.search}});
  const date = new Date().toISOString().slice(0, 10);
  return xlsxResponse(buildXlsx([{name: 'Заявки', columns: LEAD_COLUMNS, rows}]), `zayavki-${date}.xlsx`);
}

export function statsSheets(stats) {
  const pct = value => Math.round(value * 1000) / 10;
  const t = stats.totals;
  return [
    {name: 'Сводка', columns: [{key: 'k', title: 'Показатель', width: 36}, {key: 'v', title: 'Значение', width: 18}], rows: [
      {k: 'Период с', v: new Date(stats.period.from)}, {k: 'Период по', v: new Date(new Date(stats.period.to).getTime() - 1)},
      {k: 'Заявок (без спама)', v: t.leads}, {k: 'Спам', v: t.spam}, {k: 'Договоров', v: t.contracts},
      {k: 'Конверсия в договор, %', v: pct(t.conversion_to_contract)}, {k: 'Сумма договоров, ₽', v: t.contracts_amount},
      {k: 'Отказов', v: t.rejected}, {k: 'Без ответа сейчас', v: t.unanswered},
      {k: 'Среднее время ответа, мин', v: t.avg_response_min === null ? null : Math.round(t.avg_response_min)},
      {k: 'Медиана времени ответа, мин', v: t.median_response_min === null ? null : Math.round(t.median_response_min)},
      {k: 'Диалогов с ИИ-консультантом', v: stats.bot.conversations}, {k: 'Заявок из диалогов', v: stats.bot.with_lead},
      {k: 'Конверсия диалога в заявку, %', v: pct(stats.bot.conversion)}
    ]},
    {name: 'Источники', columns: [{key: 'source', title: 'Источник', width: 24}, {key: 'count', title: 'Заявок'}, {key: 'qualified', title: 'Целевых'}, {key: 'contracts', title: 'Договоров'}], rows: stats.by_source},
    {name: 'Услуги', columns: [{key: 'label', title: 'Услуга', width: 26}, {key: 'count', title: 'Заявок'}, {key: 'contracts', title: 'Договоров'}], rows: stats.by_service},
    {name: 'Воронка', columns: [{key: 'label', title: 'Этап', width: 24}, {key: 'count', title: 'Заявок'}, {key: 'share_pct', title: 'Доля, %'}], rows: stats.funnel.map(f => ({...f, share_pct: pct(f.share)}))},
    {name: 'Причины отказов', columns: [{key: 'reason', title: 'Причина', width: 32}, {key: 'count', title: 'Количество'}], rows: stats.reject_reasons},
    {name: 'Менеджеры', columns: [{key: 'manager', title: 'Менеджер', width: 24}, {key: 'count', title: 'Заявок'}, {key: 'contracts', title: 'Договоров'}, {key: 'avg', title: 'Ср. ответ, мин'}],
      rows: stats.by_manager.map(m => ({...m, avg: m.avg_response_min === null ? null : Math.round(m.avg_response_min)}))},
    {name: 'По дням', columns: [{key: 'day', title: 'День', width: 14}, {key: 'count', title: 'Заявок'}], rows: stats.by_day},
    {name: 'ИИ вопросы', columns: [{key: 'kind', title: 'Тип', width: 18}, {key: 'item', title: 'Что', width: 50}, {key: 'count', title: 'Раз'}], rows: [
      ...stats.bot.topics.map(r => ({kind: 'Тема', ...r})), ...stats.bot.questions.map(r => ({kind: 'Вопрос', ...r})),
      ...stats.bot.pains.map(r => ({kind: 'Боль', ...r})), ...stats.bot.objections.map(r => ({kind: 'Возражение', ...r})),
      ...stats.bot.refusals.map(r => ({kind: 'Причина отказа', item: r.reason, count: r.count}))
    ]}
  ];
}

export async function exportStatsXlsx({request, url}) {
  const user = await requireUser(request, ['leads.export']);
  const {from, to} = periodFrom(url);
  const stats = await computeStats({from, to});
  await audit({userId: user.id, action: 'export_stats', details: {from, to}});
  return xlsxResponse(buildXlsx(statsSheets(stats)), `statistika-${from.toISOString().slice(0, 10)}.xlsx`);
}

async function checkFeedToken(url) {
  const token = String(url.searchParams.get('token') || '');
  const expected = await getSetting('feeds.token');
  if (!expected || !token || !safeEqual(token, expected)) throw new HttpError(403, 'Неверный ключ ленты');
}

const csvResponse = body => text(`﻿${body}`, 200, {'content-type': 'text/csv; charset=utf-8', 'cache-control': 'private, max-age=300'});

export async function leadsFeed({url}) {
  await checkFeedToken(url);
  const days = Math.min(Math.max(Number(url.searchParams.get('days')) || 90, 1), 730);
  const sql = db();
  const rows = await queryLeads(sql`l.created_at > now() - make_interval(days => ${days}) and not l.is_test and l.status <> 'spam'`, 5000);
  return csvResponse(toCsv(LEAD_COLUMNS, rows));
}

export async function reportsFeed({url}) {
  await checkFeedToken(url);
  const rows = await db()`select * from reports where kind = 'weekly' order by period_start desc limit 104`;
  const flat = rows.map(r => ({
    period_start: r.period_start.toISOString().slice(0, 10), period_end: r.period_end.toISOString().slice(0, 10),
    leads: r.data.totals?.leads, contracts: r.data.totals?.contracts, spam: r.data.totals?.spam,
    avg_response_min: r.data.totals?.avg_response_min ? Math.round(r.data.totals.avg_response_min) : '',
    bot_conversations: r.data.bot?.conversations, bot_leads: r.data.bot?.with_lead,
    top_source: r.data.by_source?.[0]?.source || '', top_service: r.data.by_service?.[0]?.label || '',
    top_objection: r.data.bot?.objections?.[0]?.item || '', top_refusal: r.data.reject_reasons?.[0]?.reason || ''
  }));
  const columns = Object.keys(flat[0] || {period_start: 1}).map(key => ({key, title: key}));
  return csvResponse(toCsv(columns, flat));
}

export async function feedInfo({request}) {
  await requireUser(request, 'leads.export');
  const token = await getSetting('feeds.token');
  const base = config.siteUrl;
  return json({
    enabled: Boolean(token),
    leads: token ? `${base}/api/feeds/leads.csv?token=${token}` : null,
    reports: token ? `${base}/api/feeds/reports.csv?token=${token}` : null
  });
}

export async function rotateFeedToken({request}) {
  const user = await requireUser(request, 'settings.manage');
  const body = await readJson(request);
  const token = body.disable ? null : randomToken(24);
  await setSetting('feeds.token', token, user.id);
  await audit({userId: user.id, action: token ? 'feed_token_rotated' : 'feed_disabled'});
  return feedInfo({request});
}
