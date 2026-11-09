import React from 'react';
import {api, fmtDate, fmtPhone, minutes, qs} from '../api.js';
import {useAsync, Page, Panel, Loading, ErrorBox, StatusBadge, DayBars, HBars} from '../ui.jsx';
import {can} from '../nav.js';

export default function Dashboard({user}) {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 86400000).toISOString().slice(0, 10);
  const today = now.toISOString().slice(0, 10);
  const stats = useAsync(() => can(user, 'stats.view') ? api(`/stats${qs({from: weekAgo, to: today})}`) : Promise.resolve(null), []);
  const fresh = useAsync(() => can(user, ['leads.view_all', 'leads.view_own']) ? api(`/leads${qs({status: 'new', per: 10})}`) : Promise.resolve(null), []);
  const system = useAsync(() => can(user, ['settings.manage', 'ai.manage']) ? api('/system') : Promise.resolve(null), []);

  const alerts = [];
  const sys = system.data;
  if (sys) {
    if (!sys.group_bound) alerts.push('Группа для заявок не подключена: заявки получают только сотрудники с привязанным Telegram. Подключите группу в разделе «Настройки».');
    if (sys.failed_leads?.length) alerts.push(`Заявок, не доставленных в Telegram за 7 дней: ${sys.failed_leads.length}. Откройте их в списке заявок.`);
    if (!sys.ai?.providers?.some(p => p.available)) alerts.push('Не подключён ни один ИИ-провайдер: консультант в Telegram передаёт все вопросы менеджерам.');
    if (sys.telegram?.admin?.last_error) alerts.push(`Админ-бот: ${sys.telegram.admin.last_error}`);
    if (sys.telegram?.client?.last_error) alerts.push(`ИИ-консультант: ${sys.telegram.client.last_error}`);
    if (!sys.metrika?.counter) alerts.push('Счётчик Яндекс Метрики не подключён к сайту.');
  }
  const t = stats.data?.totals;

  return (
    <Page title="Сводка">
      {alerts.length ? <Panel title="Требует внимания"><ul className="alerts">{alerts.map(a => <li key={a}>{a}</li>)}</ul></Panel> : null}
      {t ? (
        <div className="kpis">
          <div className="kpi"><span>Заявок за 7 дней</span><b>{t.leads}</b></div>
          <div className="kpi"><span>Без ответа сейчас</span><b>{t.unanswered}</b></div>
          <div className="kpi"><span>Среднее время ответа</span><b>{minutes(t.avg_response_min)}</b></div>
          <div className="kpi"><span>Договоров за 7 дней</span><b>{t.contracts}</b></div>
        </div>
      ) : null}
      <div className="grid-2">
        <Panel title="Новые заявки" actions={<a className="a-link" href="#/leads">Все заявки</a>}>
          {fresh.loading ? <Loading /> : <ErrorBox error={fresh.error} onRetry={fresh.reload} />}
          {fresh.data?.items?.length === 0 ? <p className="muted">Новых заявок нет.</p> : null}
          <ul className="list">
            {fresh.data?.items?.map(lead => (
              <li key={lead.id}><a href={`#/leads/${lead.id}`}><b>№{lead.id} {lead.name || 'Без имени'}</b> <span>{fmtPhone(lead.phone) || lead.tg_username || lead.email}</span></a><small>{fmtDate(lead.created_at)}</small> <StatusBadge status={lead.status} label="Новая" /></li>
            ))}
          </ul>
        </Panel>
        {stats.data ? (
          <Panel title="Заявки за неделю">
            <DayBars rows={stats.data.by_day} />
            <h3 className="sub">Источники</h3>
            <HBars rows={stats.data.by_source.slice(0, 6)} labelKey="source" />
          </Panel>
        ) : null}
      </div>
    </Page>
  );
}
