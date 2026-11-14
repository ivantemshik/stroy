// Плановые задачи. tick: каждые 15 минут из GitHub Actions и попутно при работе админки.
// daily: раз в сутки из Vercel Cron (резервная копия, Метрика, уборка, отчёт по понедельникам).
import {db} from './db.js';
import {config} from './env.js';
import {HttpError, json, safeEqual} from './http.js';
import {processReminders, alertError} from './notify.js';
import {uploadConversions} from './metrika.js';
import {sendBackupToOwners} from './backup.js';
import {sendWeeklyReport} from './reports.js';
import {getSetting} from './settings.js';
import {tg} from './telegram.js';
import {verifyGithubActionsToken} from './github-oidc.js';

async function claimJob(name, minSeconds) {
  const sql = db();
  const rows = await sql`insert into job_runs (name, last_run_at) values (${name}, now())
    on conflict (name) do update set last_run_at = now()
    where job_runs.last_run_at is null or job_runs.last_run_at < now() - make_interval(secs => ${minSeconds})
    returning name`;
  return rows.length > 0;
}

async function finishJob(name, ok, error = null) {
  await db()`update job_runs set last_ok = ${ok}, last_error = ${error} where name = ${name}`;
}

// Повтор упавших обновлений Telegram: до трёх попыток, потом обновление снимается с повтора.
async function retryFailedUpdates(limit = 10) {
  const sql = db();
  const result = {retried: 0, failed: 0, dropped: 0};
  // Упавшие и зависшие «в работе» дольше 3 минут (обработчик остановился): после трёх попыток или без
  // сохранённого сообщения повторить уже нельзя, владелец получает уведомление.
  const dead = await sql`update tg_updates set status = 'dead', payload = null, updated_at = now()
    where (status = 'failed' or (status = 'processing' and updated_at < now() - interval '3 minutes'))
      and (attempts >= 3 or payload is null) returning bot, update_id`;
  result.dropped = dead.length;
  if (dead.length) await alertError('Обновления Telegram', `Не удалось обработать после трёх попыток: ${dead.map(d => `${d.bot} ${d.update_id}`).join(', ')}`);
  const rows = await sql`select bot, update_id, payload from tg_updates where payload is not null and attempts < 3
    and ((status = 'failed' and updated_at < now() - interval '1 minute') or (status = 'processing' and updated_at < now() - interval '3 minutes'))
    order by updated_at limit ${limit}`;
  if (!rows.length) return result;
  const client = await import('./client-bot.js');
  const admin = await import('./admin-bot.js');
  for (const row of rows) {
    if (!await client.claimUpdate(row.bot, row.payload)) continue;
    try {
      await (row.bot === 'client' ? client.handleClientUpdate(row.payload) : admin.handleAdminUpdate(row.payload));
      await client.finishUpdate(row.bot, row.update_id);
      result.retried += 1;
    } catch (error) {
      console.error('retry update', row.bot, row.update_id, error.message);
      await client.failUpdate(row.bot, row.payload);
      result.failed += 1;
    }
  }
  return result;
}

export async function runTick() {
  if (!await claimJob('tick', 240)) return {skipped: 'недавно запускался'};
  try {
    const result = await processReminders();
    result.updates = await retryFailedUpdates().catch(error => ({error: error.message}));
    await finishJob('tick', true);
    return result;
  } catch (error) {
    await finishJob('tick', false, error.message);
    await alertError('Плановая проверка', error.message);
    throw error;
  }
}

// Внешний запуск проверки (GitHub Actions или крон хостинга) только с тем же служебным ключом, что и ежедневная задача.
// Плановая проверка: по секрету CRON_SECRET или по токену GitHub Actions из сценария .github/workflows/tick.yml
// нашего репозитория (каждые 15 минут, секреты в репозитории не нужны).
export async function tickRoute({request}) {
  const auth = request.headers.get('authorization') || '';
  const bySecret = Boolean(config.cronSecret) && safeEqual(auth, `Bearer ${config.cronSecret}`);
  const byGithub = !bySecret && /^Bearer ey/.test(auth) && await verifyGithubActionsToken(auth.slice(7), {
    audience: 'dom-mira-tick', repository: process.env.GITHUB_TICK_REPO || 'ivantemshik/stroy', workflow: 'tick.yml'
  }).catch(() => false);
  if (!bySecret && !byGithub) throw new HttpError(401, 'Нет доступа');
  return json(await runTick());
}

async function checkWebhooks() {
  const problems = [];
  for (const [name, token] of [['админ-бот', config.telegram.adminToken], ['ИИ-консультант', config.telegram.clientToken]]) {
    if (!token) continue;
    try {
      const info = await tg(token, 'getWebhookInfo');
      if (!info.url) problems.push(`${name}: вебхук не установлен`);
      else if (info.last_error_date && Date.now() / 1000 - info.last_error_date < 86400) problems.push(`${name}: ${info.last_error_message}`);
      if (info.pending_update_count > 50) problems.push(`${name}: в очереди ${info.pending_update_count} обновлений`);
    } catch (error) {
      problems.push(`${name}: ${error.message}`);
    }
  }
  return problems;
}

export async function dailyRoute({request}) {
  const auth = request.headers.get('authorization') || '';
  if (!config.cronSecret || !safeEqual(auth, `Bearer ${config.cronSecret}`)) throw new HttpError(401, 'Нет доступа');
  if (!await claimJob('daily', 6 * 3600)) return json({skipped: 'уже выполнялся сегодня'});
  const sql = db();
  const result = {};
  const step = async (name, fn) => {
    try { result[name] = await fn(); } catch (error) { result[name] = {error: error.message}; await alertError(`Ежедневная задача: ${name}`, error.message); }
  };
  await step('reminders', processReminders);
  await step('metrika', uploadConversions);
  await step('backup', sendBackupToOwners);
  await step('cleanup', async () => {
    await sql`delete from rate_events where at < now() - interval '2 days'`;
    await sql`delete from pow_used where expires_at < now()`;
    await sql`delete from tg_updates where at < now() - interval '7 days'`;
    await sql`update tg_updates set payload = null where payload is not null and updated_at < now() - interval '2 days'`;
    await sql`delete from sessions where expires_at < now()`;
    await sql`delete from link_tokens where expires_at < now()`;
    await sql`delete from relay_map where created_at < now() - interval '90 days'`;
    await sql`delete from ai_usage where created_at < now() - interval '180 days'`;
    return 'ok';
  });
  await step('webhooks', async () => {
    const problems = await checkWebhooks();
    if (problems.length) await alertError('Вебхуки Telegram', problems.join('\n'));
    return problems;
  });
  const mskDay = new Date(Date.now() + 3 * 3600 * 1000).getUTCDay();
  if (mskDay === 1 && await getSetting('reports.weekly_enabled')) await step('weekly_report', () => sendWeeklyReport());
  await finishJob('daily', !Object.values(result).some(r => r && r.error));
  return json(result);
}
