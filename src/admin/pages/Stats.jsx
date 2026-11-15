import React, {useState} from 'react';
import {api, download, minutes, pct, qs, rub} from '../api.js';
import {useAsync, Page, Panel, Button, Field, Loading, ErrorBox, DayBars, HBars, Notice} from '../ui.jsx';
import {can} from '../nav.js';

const iso = date => date.toISOString().slice(0, 10);
const PRESETS = [
  {label: '7 дней', days: 7}, {label: '30 дней', days: 30}, {label: '90 дней', days: 90}, {label: 'Год', days: 365}
];

export default function Stats({user}) {
  const [period, setPeriod] = useState(() => ({from: iso(new Date(Date.now() - 30 * 86400000)), to: iso(new Date())}));
  const data = useAsync(() => api(`/stats${qs(period)}`), [period.from, period.to]);
  const feeds = useAsync(() => can(user, 'leads.export') ? api('/feeds') : Promise.resolve(null), []);
  const [note, setNote] = useState('');
  const s = data.data;

  return (
    <Page title="Статистика" actions={can(user, 'leads.export') ? <Button kind="quiet" onClick={() => download(`/export/stats.xlsx${qs(period)}`, `statistika-${period.from}.xlsx`)}>Выгрузить в Excel</Button> : null}>
      <Panel className="filters">
        <div className="filter-row">
          <Field label="С даты"><input type="date" value={period.from} onChange={e => setPeriod(p => ({...p, from: e.target.value}))} /></Field>
          <Field label="По дату"><input type="date" value={period.to} onChange={e => setPeriod(p => ({...p, to: e.target.value}))} /></Field>
          <div className="presets">{PRESETS.map(p => <Button key={p.days} kind="quiet" onClick={() => setPeriod({from: iso(new Date(Date.now() - p.days * 86400000)), to: iso(new Date())})}>{p.label}</Button>)}</div>
        </div>
      </Panel>
      {data.loading && !s ? <Loading /> : null}
      <ErrorBox error={data.error} onRetry={data.reload} />
      {s ? (
        <>
          <div className="kpis">
            <div className="kpi"><span>Заявок</span><b>{s.totals.leads}</b><small>спам отсеян: {s.totals.spam}</small></div>
            <div className="kpi"><span>Договоров</span><b>{s.totals.contracts}</b><small>конверсия {pct(s.totals.conversion_to_contract)}{s.totals.contracts_amount ? `, ${rub(s.totals.contracts_amount)} ₽` : ''}</small></div>
            <div className="kpi"><span>Первое действие сотрудника</span><b>{minutes(s.totals.avg_response_min)}</b><small>медиана {minutes(s.totals.median_response_min)}</small></div>
            <div className="kpi"><span>Первый ответ клиенту</span><b>{minutes(s.totals.avg_contact_min)}</b><small>ещё без ответа: {s.totals.without_contact ?? 0}</small></div>
            <div className="kpi"><span>Диалогов с ИИ</span><b>{s.bot.conversations}</b><small>в заявку: {s.bot.with_lead} ({pct(s.bot.conversion)})</small></div>
          </div>
          <div className="grid-2">
            <Panel title="Заявки по дням"><DayBars rows={s.by_day} /></Panel>
            <Panel title="Воронка по этапам"><HBars rows={s.funnel} extra={row => `(${pct(row.share)})`} /></Panel>
            <Panel title="Источники"><HBars rows={s.by_source} labelKey="source" extra={row => `целевых ${row.qualified}, договоров ${row.contracts}`} /></Panel>
            <Panel title="Популярные услуги"><HBars rows={s.by_service} extra={row => `договоров ${row.contracts}`} /></Panel>
            <Panel title="Причины отказов"><HBars rows={s.reject_reasons} labelKey="reason" /></Panel>
            <Panel title="Менеджеры">
              <table className="a-table"><thead><tr><th>Менеджер</th><th>Заявок</th><th>Договоров</th><th>Ср. ответ</th></tr></thead>
                <tbody>{s.by_manager.map(m => <tr key={m.manager}><td>{m.manager}</td><td>{m.count}</td><td>{m.contracts}</td><td>{minutes(m.avg_response_min)}</td></tr>)}</tbody></table>
            </Panel>
            <Panel title="Страницы и формы">
              <HBars rows={s.by_page} labelKey="page" />
              <h3 className="sub">Формы</h3>
              <HBars rows={s.by_form} labelKey="form" />
            </Panel>
            <Panel title="Каналы"><HBars rows={s.by_channel} /></Panel>
          </div>
          <Panel title="Что спрашивают и почему уходят (по диалогам с ИИ)">
            <div className="grid-3">
              <div><h3 className="sub">Частые вопросы</h3><HBars rows={s.bot.questions} labelKey="item" /></div>
              <div><h3 className="sub">Темы</h3><HBars rows={s.bot.topics} labelKey="item" /></div>
              <div><h3 className="sub">Боли</h3><HBars rows={s.bot.pains} labelKey="item" /></div>
              <div><h3 className="sub">Возражения</h3><HBars rows={s.bot.objections} labelKey="item" /></div>
              <div><h3 className="sub">Причины отказа</h3><HBars rows={s.bot.refusals} labelKey="reason" /></div>
            </div>
          </Panel>
          <Panel title="Использование ИИ-моделей">
            <table className="a-table"><thead><tr><th>Провайдер</th><th>Модель</th><th>Запросов</th><th>Ошибок</th><th>Ср. время, мс</th><th>Токены</th></tr></thead>
              <tbody>{s.ai_usage.map(a => <tr key={`${a.provider}${a.model}`}><td>{a.provider}</td><td>{a.model}</td><td>{a.requests}</td><td>{a.errors}</td><td>{a.avg_latency}</td><td>{rub(a.prompt_tokens + a.completion_tokens)}</td></tr>)}</tbody></table>
          </Panel>
        </>
      ) : null}
      {feeds.data ? (
        <Panel title="Google Таблицы">
          {feeds.data.enabled ? (
            <>
              <p>Создайте таблицу Google и вставьте в ячейку A1 формулу. Таблица будет обновляться сама примерно раз в час.</p>
              <Field label="Еженедельные отчёты (сводка без контактов)"><input readOnly value={`=IMPORTDATA("${feeds.data.reports}")`} onFocus={e => e.target.select()} /></Field>
              {feeds.data.leads ? <Field label="Заявки за 90 дней с контактами (отдельная ссылка)"><input readOnly value={`=IMPORTDATA("${feeds.data.leads}")`} onFocus={e => e.target.select()} /></Field> : null}
              <p className="muted">Ссылки секретные: не публикуйте их. Новые ссылки можно выпустить в разделе «Настройки».</p>
            </>
          ) : <p>Ленты для Google Таблиц выключены. Включить их может администратор в разделе «Настройки».</p>}
          <Notice>{note}</Notice>
          {can(user, 'stats.view') ? <Button kind="quiet" onClick={async () => { try { const r = await api('/report-now', {method: 'POST'}); setNote(`Отчёт отправлен в Telegram: ${r.delivered ?? 0} получателей`); } catch (e) { setNote(e.message); } }}>Отправить недельный отчёт сейчас</Button> : null}
        </Panel>
      ) : null}
    </Page>
  );
}
