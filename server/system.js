// Состояние системы для админки и проверка ответов ИИ без Telegram.
import {db} from './db.js';
import {config} from './env.js';
import {json, readJson, HttpError, text} from './http.js';
import {requireUser} from './auth.js';
import {tg} from './telegram.js';
import {chat, parseJsonLoose, PROVIDERS, isAvailable} from './ai/llm.js';
import {pickKnowledge, buildSystemPrompt} from './ai/prompt.js';
import {getSetting} from './settings.js';
import {sendWeeklyReport} from './reports.js';
import {pendingConversionsCsv} from './metrika.js';
import {audit} from './security.js';
import {runTick} from './cron.js';

async function webhookInfo(token) {
  if (!token) return {configured: false};
  try {
    const info = await tg(token, 'getWebhookInfo');
    return {configured: true, url: info.url ? info.url.replace(/\/\/[^/]+/, '//…') : null, pending: info.pending_update_count,
      last_error: info.last_error_message || null, last_error_at: info.last_error_date ? new Date(info.last_error_date * 1000) : null};
  } catch (error) {
    return {configured: true, error: error.message};
  }
}

export async function systemRoute({request}) {
  await requireUser(request, ['settings.manage', 'ai.manage', 'stats.view']);
  const sql = db();
  const [jobs, failedLeads, aiErrors, aiLastDay, pendingConv] = await Promise.all([
    sql`select * from job_runs where name not like 'alert:%' order by name`,
    sql`select id, created_at, delivery_error from leads where delivery_status not in ('sent', 'skipped') and status <> 'spam' and created_at > now() - interval '7 days' order by id desc limit 10`,
    sql`select created_at, provider, model, error from ai_usage where not ok order by created_at desc limit 10`,
    sql`select provider, model, count(*)::int as requests, count(*) filter (where not ok)::int as errors, avg(latency_ms)::int as latency
      from ai_usage where created_at > now() - interval '1 day' group by 1, 2 order by 3 desc`,
    sql`select count(*)::int as count from offline_conversions where uploaded_at is null`
  ]);
  const [adminHook, clientHook] = await Promise.all([webhookInfo(config.telegram.adminToken), webhookInfo(config.telegram.clientToken)]);
  const providers = Object.entries(PROVIDERS).map(([key, p]) => ({key, label: p.label, available: isAvailable(key)}));
  const chain = await getSetting('ai.providers');
  // Заодно проверяем просроченные заявки, пока админка открыта.
  runTick().catch(() => {});
  return json({
    site_url: config.siteUrl, environment: process.env.VERCEL_ENV || 'local',
    telegram: {admin: adminHook, client: clientHook, admin_username: config.telegram.adminUsername, client_username: config.telegram.clientUsername},
    group_bound: Boolean(await getSetting('notify.admin_chat_id')),
    metrika: {counter: config.metrika.counterId || null, token: Boolean(config.metrika.token), pending_conversions: pendingConv[0].count},
    backups: Boolean(config.backupKey), cron_secret: Boolean(config.cronSecret),
    jobs, failed_leads: failedLeads, ai: {providers, chain, errors: aiErrors, last_day: aiLastDay}
  });
}

// Тест ИИ: один вопрос, ответ модели и разобранный JSON, чтобы сравнивать качество моделей.
export async function aiTestRoute({request}) {
  const user = await requireUser(request, 'ai.manage');
  const body = await readJson(request);
  const question = String(body.question || '').slice(0, 1500).trim();
  if (!question) throw new HttpError(400, 'Введите вопрос');
  const only = body.provider && body.model ? {provider: String(body.provider), model: String(body.model), enabled: true} : undefined;
  const knowledge = await pickKnowledge(question);
  const system = await buildSystemPrompt({knowledge, fields: {}, consent: false});
  try {
    const result = await chat({messages: [{role: 'system', content: system}, {role: 'user', content: question}], json: true, purpose: 'admin_test', only});
    await audit({userId: user.id, action: 'ai_test', details: {provider: result.provider, model: result.model}});
    return json({ok: true, provider: result.provider, model: result.model, latency: result.latency, usage: result.usage,
      parsed: parseJsonLoose(result.content), raw: result.content, knowledge: knowledge.map(k => k.title)});
  } catch (error) {
    return json({ok: false, error: error.message, details: error.details || []});
  }
}

export async function reportNowRoute({request}) {
  const user = await requireUser(request, 'stats.view');
  const result = await sendWeeklyReport({force: true});
  await audit({userId: user.id, action: 'report_sent_manually'});
  return json(result);
}

export async function metrikaCsvRoute({request}) {
  await requireUser(request, 'stats.view');
  return text(await pendingConversionsCsv(), 200, {'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="offline-conversions.csv"'});
}

export async function publicConfig() {
  return json({
    client_bot: config.telegram.clientUsername || null,
    metrika: config.metrika.counterId || null
  }, 200, {'cache-control': 'public, max-age=300'});
}

export async function health() {
  let dbOk = false;
  try { await db()`select 1`; dbOk = true; } catch { dbOk = false; }
  return json({ok: dbOk, db: dbOk, time: new Date().toISOString()}, dbOk ? 200 : 503);
}
