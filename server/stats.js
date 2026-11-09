// Статистика по заявкам и ИИ-консультанту за период.
import {db} from './db.js';
import {json} from './http.js';
import {requireUser} from './auth.js';
import {LEAD_STATUSES, statusLabel, serviceLabel, CHANNELS} from './permissions.js';

export function sourceExpr(sql) {
  return sql`coalesce(nullif(l.utm_source, ''), case
    when l.channel = 'telegram_bot' then 'telegram (бот)'
    when l.channel = 'manual' then 'вручную'
    when l.yclid is not null then 'yandex (директ)'
    when l.referrer ilike '%yandex.%' or l.referrer ilike '%ya.ru%' then 'yandex (поиск)'
    when l.referrer ilike '%google.%' then 'google (поиск)'
    when l.referrer ilike '%t.me%' or l.referrer ilike '%telegram%' then 'telegram'
    when l.referrer ilike '%vk.com%' then 'vk'
    when l.referrer ilike '%avito%' then 'avito'
    when coalesce(l.referrer, '') = '' then '(прямые)'
    else 'другие сайты' end)`;
}

export function periodFrom(url) {
  const q = url.searchParams;
  const to = q.get('to') && !Number.isNaN(Date.parse(q.get('to'))) ? new Date(new Date(q.get('to')).getTime() + 86400000) : new Date();
  const from = q.get('from') && !Number.isNaN(Date.parse(q.get('from'))) ? new Date(q.get('from')) : new Date(to.getTime() - 30 * 86400000);
  return {from, to};
}

const top = (rows, limit = 10) => rows.slice(0, limit);

export async function computeStats({from, to, includeTest = false}) {
  const sql = db();
  const base = sql`l.created_at >= ${from} and l.created_at < ${to} ${includeTest ? sql`` : sql`and not l.is_test`}`;
  const real = sql`${base} and l.status <> 'spam'`;
  const source = sourceExpr(sql);

  const [
    [totals], byDay, bySource, byService, byChannel, byStatus, byPage, byForm, reasons, byManager, [stages]
  ] = await Promise.all([
    sql`
    select count(*) filter (where l.status <> 'spam')::int as leads,
      count(*) filter (where l.status = 'spam')::int as spam,
      count(*) filter (where l.status = 'contract')::int as contracts,
      count(*) filter (where l.status = 'rejected')::int as rejected,
      count(*) filter (where l.status = 'new')::int as unanswered,
      coalesce(sum(l.contract_amount) filter (where l.status = 'contract'), 0)::float as contracts_amount,
      avg(extract(epoch from (l.first_response_at - l.created_at)) / 60) filter (where l.first_response_at is not null and l.status <> 'spam')::float as avg_response_min,
      percentile_cont(0.5) within group (order by extract(epoch from (l.first_response_at - l.created_at)) / 60)
        filter (where l.first_response_at is not null and l.status <> 'spam')::float as median_response_min
    from leads l where ${base}`,
    sql`select to_char(date_trunc('day', l.created_at at time zone 'Europe/Moscow'), 'YYYY-MM-DD') as day, count(*)::int as count
    from leads l where ${real} group by 1 order by 1`,
    sql`select ${source} as source, count(*)::int as count,
      count(*) filter (where l.stage_reached >= 2)::int as qualified, count(*) filter (where l.status = 'contract')::int as contracts
    from leads l where ${real} group by 1 order by 2 desc`,
    sql`select l.service, count(*)::int as count, count(*) filter (where l.status = 'contract')::int as contracts
    from leads l where ${real} group by 1 order by 2 desc`,
    sql`select l.channel, count(*)::int as count from leads l where ${real} group by 1 order by 2 desc`,
    sql`select l.status, count(*)::int as count from leads l where ${base} group by 1`,
    sql`select coalesce(l.page, '(бот)') as page, count(*)::int as count from leads l where ${real} group by 1 order by 2 desc limit 15`,
    sql`select coalesce(l.form, '(нет)') as form, count(*)::int as count from leads l where ${real} group by 1 order by 2 desc limit 15`,
    sql`select coalesce(l.reject_reason, 'Не указана') as reason, count(*)::int as count
    from leads l where ${base} and l.status = 'rejected' group by 1 order by 2 desc`,
    sql`select coalesce(u.name, 'Не назначен') as manager, count(*)::int as count,
      count(*) filter (where l.status = 'contract')::int as contracts,
      avg(extract(epoch from (l.first_response_at - l.created_at)) / 60) filter (where l.first_response_at is not null)::float as avg_response_min
    from leads l left join users u on u.id = l.manager_id where ${real} group by 1 order by 2 desc`,
    sql`select ${sql.unsafe([0, 1, 2, 3, 4, 5].map(k => `count(*) filter (where l.stage_reached >= ${k})::int as s${k}`).join(', '))}
    from leads l where ${real}`
  ]);

  const funnelLabels = LEAD_STATUSES.filter(s => s.stage >= 0).sort((a, b) => a.stage - b.stage);
  const funnel = funnelLabels.map(s => ({
    stage: s.key, label: s.stage === 0 ? 'Все заявки' : statusLabel(s.key), count: stages[`s${s.stage}`],
    share: stages.s0 ? stages[`s${s.stage}`] / stages.s0 : 0
  }));

  const unnest = field => sql`select item, count(*)::int as count from conversation_insights i
    join conversations c on c.id = i.conversation_id, unnest(i.${sql(field)}) as item
    where c.created_at >= ${from} and c.created_at < ${to} group by 1 order by 2 desc limit 10`;
  const [[bot], topics, pains, objections, questions, refusals, aiUsage] = await Promise.all([
    sql`select count(*)::int as conversations,
      count(*) filter (where c.lead_id is not null)::int as with_lead,
      coalesce(sum(c.messages_count), 0)::int as messages
    from conversations c where c.created_at >= ${from} and c.created_at < ${to}`,
    unnest('topics'), unnest('pains'), unnest('objections'), unnest('questions'),
    sql`select i.refusal_reason as reason, count(*)::int as count from conversation_insights i
    join conversations c on c.id = i.conversation_id where c.created_at >= ${from} and c.created_at < ${to} and i.refusal_reason is not null
    group by 1 order by 2 desc limit 10`,
    sql`select provider, model, count(*)::int as requests, count(*) filter (where not ok)::int as errors,
      avg(latency_ms)::int as avg_latency, coalesce(sum(prompt_tokens), 0)::int as prompt_tokens, coalesce(sum(completion_tokens), 0)::int as completion_tokens
    from ai_usage where created_at >= ${from} and created_at < ${to} group by 1, 2 order by 3 desc`
  ]);

  return {
    period: {from, to},
    totals: {...totals, conversion_to_contract: totals.leads ? totals.contracts / totals.leads : 0},
    by_day: byDay,
    by_source: bySource,
    by_service: byService.map(row => ({...row, label: serviceLabel(row.service)})),
    by_channel: byChannel.map(row => ({...row, label: CHANNELS[row.channel] || row.channel})),
    by_status: byStatus.map(row => ({...row, label: statusLabel(row.status)})),
    by_page: byPage,
    by_form: byForm,
    reject_reasons: reasons,
    by_manager: byManager,
    funnel,
    bot: {
      ...bot,
      conversion: bot.conversations ? bot.with_lead / bot.conversations : 0,
      topics: top(topics), pains: top(pains), objections: top(objections), questions: top(questions), refusals: top(refusals)
    },
    ai_usage: aiUsage
  };
}

export async function statsRoute({request, url}) {
  await requireUser(request, 'stats.view');
  const {from, to} = periodFrom(url);
  return json(await computeStats({from, to, includeTest: url.searchParams.get('test') === '1'}));
}
