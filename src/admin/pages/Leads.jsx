import React, {useEffect, useState} from 'react';
import {api, download, fmtDate, fmtPhone, qs} from '../api.js';
import {useAsync, Page, Panel, Button, Field, Loading, ErrorBox, StatusBadge, Pagination, Notice} from '../ui.jsx';
import {can, go} from '../nav.js';

const SERVICES = {construction: 'Строительство', finishing: 'Отделка', design: 'Проектирование', engineering: 'Инженерия', landscape: 'Благоустройство', commercial: 'Коммерческий', other: 'Другое'};
const CHANNELS = {site: 'Сайт', telegram_bot: 'Telegram бот', manual: 'Вручную'};
const STATUSES = {new: 'Новая', in_progress: 'В работе', qualified: 'Целевая', meeting: 'Встреча', estimate: 'Смета', contract: 'Договор', rejected: 'Отказ', spam: 'Спам'};

function readFilters() {
  try { return JSON.parse(sessionStorage.getItem('dm_admin_filters') || '{}'); } catch { return {}; }
}

export default function Leads({user}) {
  const [filters, setFilters] = useState(() => ({status: 'open', ...readFilters(), page: 1}));
  const [creating, setCreating] = useState(false);
  useEffect(() => { try { sessionStorage.setItem('dm_admin_filters', JSON.stringify({...filters, page: 1})); } catch { /* */ } }, [filters]);
  const users = useAsync(() => api('/users').catch(() => ({users: []})), []);
  const data = useAsync(() => api(`/leads${qs(filters)}`), [JSON.stringify(filters)]);
  const set = (key, value) => setFilters(f => ({...f, [key]: value, page: key === 'page' ? value : 1}));

  return (
    <Page title="Заявки" actions={<>
      {can(user, 'leads.edit') ? <Button kind="quiet" onClick={() => setCreating(c => !c)}>Добавить вручную</Button> : null}
      {can(user, 'leads.export') ? <Button kind="quiet" onClick={() => download(`/export/leads.xlsx${qs({...filters, page: undefined})}`, 'zayavki.xlsx')}>Выгрузить в Excel</Button> : null}
    </>}>
      {creating ? <NewLead onDone={id => { setCreating(false); go(`/leads/${id}`); }} /> : null}
      <Panel className="filters">
        <div className="filter-row">
          <Field label="Поиск"><input type="search" value={filters.q || ''} placeholder="Имя, телефон, почта, текст, номер" onChange={e => set('q', e.target.value)} /></Field>
          <Field label="Статус">
            <select value={filters.status || ''} onChange={e => set('status', e.target.value)}>
              <option value="">Все, кроме спама</option>
              <option value="open">Открытые</option>
              {Object.entries(STATUSES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
          <Field label="Услуга">
            <select value={filters.service || ''} onChange={e => set('service', e.target.value)}>
              <option value="">Все</option>
              {Object.entries(SERVICES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
          <Field label="Канал">
            <select value={filters.channel || ''} onChange={e => set('channel', e.target.value)}>
              <option value="">Все</option>
              {Object.entries(CHANNELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
          <Field label="Ответственный">
            <select value={filters.manager || ''} onChange={e => set('manager', e.target.value)}>
              <option value="">Все</option>
              <option value="none">Не назначен</option>
              {users.data?.users?.filter(u => u.is_active).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </Field>
          <Field label="Источник (utm_source)"><input value={filters.source || ''} onChange={e => set('source', e.target.value)} placeholder="yandex, site, (прямые)" /></Field>
          <Field label="С даты"><input type="date" value={filters.from || ''} onChange={e => set('from', e.target.value)} /></Field>
          <Field label="По дату"><input type="date" value={filters.to || ''} onChange={e => set('to', e.target.value)} /></Field>
        </div>
        <label className="inline-check"><input type="checkbox" checked={filters.test === '1'} onChange={e => set('test', e.target.checked ? '1' : '')} /> Показывать тестовые</label>
      </Panel>
      {data.loading && !data.data ? <Loading /> : null}
      <ErrorBox error={data.error} onRetry={data.reload} />
      {data.data ? (
        <Panel>
          <p className="muted">Найдено: {data.data.total}</p>
          <div className="table-wrap">
            <table className="a-table">
              <thead><tr><th>№</th><th>Создана</th><th>Клиент</th><th>Услуга</th><th>Статус</th><th>Ответственный</th><th>Источник</th></tr></thead>
              <tbody>
                {data.data.items.map(lead => (
                  <tr key={lead.id} onClick={() => go(`/leads/${lead.id}`)} className={lead.delivery_status !== 'sent' && lead.status !== 'spam' ? 'row-warn' : ''}>
                    <td><a href={`#/leads/${lead.id}`}>{lead.id}</a>{lead.is_test ? <small> тест</small> : null}</td>
                    <td>{fmtDate(lead.created_at)}</td>
                    <td><b>{lead.name || 'Без имени'}</b><br /><small>{fmtPhone(lead.phone) || (lead.tg_username ? `@${lead.tg_username}` : lead.email)}</small></td>
                    <td>{SERVICES[lead.service] || lead.service}<br /><small>{CHANNELS[lead.channel]}</small></td>
                    <td><StatusBadge status={lead.status} label={STATUSES[lead.status]} />{lead.reject_reason ? <><br /><small>{lead.reject_reason}</small></> : null}</td>
                    <td>{lead.manager_name || <span className="muted">нет</span>}</td>
                    <td>{lead.utm_source || <span className="muted">прямой или поиск</span>}{lead.utm_campaign ? <><br /><small>{lead.utm_campaign}</small></> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={data.data.page} per={data.data.per} total={data.data.total} onPage={p => set('page', p)} />
        </Panel>
      ) : null}
    </Page>
  );
}

function NewLead({onDone}) {
  const [form, setForm] = useState({name: '', phone: '', email: '', service: 'construction', message: '', source: '', assign_to_me: true, notify: false});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async event => {
    event.preventDefault();
    setBusy(true);
    try {
      const {lead} = await api('/leads', {method: 'POST', body: form});
      onDone(lead.id);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  const bind = key => ({value: form[key], onChange: e => setForm(f => ({...f, [key]: e.target.value}))});
  return (
    <Panel title="Новая заявка вручную">
      <form className="form-grid" onSubmit={submit}>
        <Field label="Имя"><input {...bind('name')} /></Field>
        <Field label="Телефон"><input {...bind('phone')} placeholder="+7" /></Field>
        <Field label="Почта"><input {...bind('email')} /></Field>
        <Field label="Услуга"><select {...bind('service')}>{Object.entries(SERVICES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        <Field label="Источник" hint="Например: звонок, Авито, рекомендация"><input {...bind('source')} /></Field>
        <Field label="Задача"><textarea rows="3" {...bind('message')} /></Field>
        <label className="inline-check"><input type="checkbox" checked={form.assign_to_me} onChange={e => setForm(f => ({...f, assign_to_me: e.target.checked}))} /> Назначить меня ответственным</label>
        <label className="inline-check"><input type="checkbox" checked={form.notify} onChange={e => setForm(f => ({...f, notify: e.target.checked}))} /> Отправить уведомление в Telegram</label>
        <Notice kind="error">{error}</Notice>
        <div><Button type="submit" busy={busy}>Создать заявку</Button></div>
      </form>
    </Panel>
  );
}
