import React, {useEffect, useState} from 'react';
import {api, download, fmtDate} from '../api.js';
import {useAsync, Page, Panel, Button, Field, Loading, ErrorBox, Notice} from '../ui.jsx';
import {can} from '../nav.js';

const PROVIDERS = ['groq', 'openrouter', 'cerebras', 'yandex', 'gemini', 'mistral'];

export default function Settings({user}) {
  const data = useAsync(() => api('/settings'), []);
  const system = useAsync(() => api('/system'), []);
  const [draft, setDraft] = useState(null);
  const [message, setMessage] = useState({kind: 'info', text: ''});
  const [busy, setBusy] = useState(false);
  const [groupCode, setGroupCode] = useState(null);
  useEffect(() => { if (data.data) setDraft(structuredClone(data.data.settings)); }, [data.data]);
  if (data.loading && !draft) return <Loading />;
  if (data.error) return <ErrorBox error={data.error} onRetry={data.reload} />;
  if (!draft) return null;
  const set = (key, value) => setDraft(d => ({...d, [key]: value}));
  const save = async keys => {
    setBusy(true);
    try {
      await api('/settings', {method: 'PUT', body: {settings: Object.fromEntries(keys.map(k => [k, draft[k]]))}});
      setMessage({kind: 'success', text: 'Настройки сохранены'});
      await data.reload();
    } catch (err) {
      setMessage({kind: 'error', text: err.message});
    } finally {
      setBusy(false);
    }
  };
  const integ = data.data.integrations;
  const sys = system.data;
  const manage = can(user, 'settings.manage');
  const ai = can(user, 'ai.manage');
  const providers = draft['ai.providers'] || [];
  const setProvider = (index, patch) => set('ai.providers', providers.map((p, i) => i === index ? {...p, ...patch} : p));

  return (
    <Page title="Настройки">
      <Notice kind={message.kind}>{message.text}</Notice>

      {manage ? (
        <Panel title="Уведомления о заявках" actions={<Button busy={busy} onClick={() => save(['notify.reminder_minutes', 'notify.escalate_minutes', 'notify.working_hours', 'leads.reject_reasons', 'leads.duplicate_window_minutes'])}>Сохранить</Button>}>
          <p>Группа для заявок: <b>{sys?.group_bound ? 'подключена' : 'не подключена'}</b>. Добавьте бота @{sys?.telegram?.admin_username} в рабочую группу Telegram и отправьте в группе команду с кодом.</p>
          <div className="row-actions">
            <Button kind="quiet" onClick={async () => setGroupCode(await api('/group-code', {method: 'POST'}))}>Получить код для группы</Button>
            {groupCode ? <code className="code">{groupCode.command}</code> : null}
          </div>
          <div className="form-grid">
            <Field label="Напоминать о новой заявке через, мин"><input type="number" min="5" value={draft['notify.reminder_minutes']} onChange={e => set('notify.reminder_minutes', Number(e.target.value))} /></Field>
            <Field label="Сообщать руководителю через, мин"><input type="number" min="15" value={draft['notify.escalate_minutes']} onChange={e => set('notify.escalate_minutes', Number(e.target.value))} /></Field>
            <Field label="Рабочие часы с (МСК)"><input type="number" min="0" max="23" value={draft['notify.working_hours']?.from ?? 9} onChange={e => set('notify.working_hours', {...draft['notify.working_hours'], from: Number(e.target.value)})} /></Field>
            <Field label="до"><input type="number" min="1" max="24" value={draft['notify.working_hours']?.to ?? 21} onChange={e => set('notify.working_hours', {...draft['notify.working_hours'], to: Number(e.target.value)})} /></Field>
            <Field label="Повторная заявка с того же телефона в течение, мин" hint="Склеивается с первой, чтобы не плодить дубли"><input type="number" min="0" value={draft['leads.duplicate_window_minutes']} onChange={e => set('leads.duplicate_window_minutes', Number(e.target.value))} /></Field>
            <Field label="Причины отказа, каждая с новой строки"><textarea rows="6" value={(draft['leads.reject_reasons'] || []).join('\n')} onChange={e => set('leads.reject_reasons', e.target.value.split('\n').map(s => s.trim()).filter(Boolean))} /></Field>
          </div>
        </Panel>
      ) : null}

      {ai ? (
        <Panel title="ИИ-консультант" actions={<Button busy={busy} onClick={() => save(['ai.enabled', 'ai.providers', 'ai.temperature', 'ai.greeting', 'ai.extra_instructions', 'ai.max_messages_per_day', 'ai.human_timeout_hours'])}>Сохранить</Button>}>
          <label className="inline-check"><input type="checkbox" checked={Boolean(draft['ai.enabled'])} onChange={e => set('ai.enabled', e.target.checked)} /> ИИ отвечает клиентам (если выключить, все сообщения уходят менеджерам)</label>
          <h3 className="sub">Модели по порядку: если первая недоступна или упёрлась в лимит, отвечает следующая</h3>
          <ol className="edit-list">
            {providers.map((p, index) => (
              <li key={index} className="provider-row">
                <Field label="Провайдер"><select value={p.provider} onChange={e => setProvider(index, {provider: e.target.value})}>{PROVIDERS.map(k => <option key={k} value={k}>{k}{integ.ai[k] ? '' : ' (нет ключа)'}</option>)}</select></Field>
                <Field label="Модель"><input value={p.model} onChange={e => setProvider(index, {model: e.target.value})} /></Field>
                <label className="inline-check"><input type="checkbox" checked={p.enabled !== false} onChange={e => setProvider(index, {enabled: e.target.checked})} /> Включена</label>
                <div className="row-actions">
                  <Button kind="quiet" disabled={index === 0} onClick={() => { const list = [...providers]; [list[index - 1], list[index]] = [list[index], list[index - 1]]; set('ai.providers', list); }}>Выше</Button>
                  <Button kind="quiet" onClick={() => set('ai.providers', providers.filter((_, i) => i !== index))}>Удалить</Button>
                </div>
              </li>
            ))}
          </ol>
          <Button kind="quiet" onClick={() => set('ai.providers', [...providers, {provider: 'groq', model: '', enabled: true}])}>Добавить модель</Button>
          <div className="form-grid">
            <Field label="Температура" hint="0.2-0.5: спокойные точные ответы"><input type="number" step="0.1" min="0" max="1" value={draft['ai.temperature']} onChange={e => set('ai.temperature', Number(e.target.value))} /></Field>
            <Field label="Лимит сообщений клиента в сутки"><input type="number" min="10" value={draft['ai.max_messages_per_day']} onChange={e => set('ai.max_messages_per_day', Number(e.target.value))} /></Field>
            <Field label="Менеджер ведёт диалог, часов" hint="Потом снова отвечает ИИ"><input type="number" min="1" value={draft['ai.human_timeout_hours']} onChange={e => set('ai.human_timeout_hours', Number(e.target.value))} /></Field>
            <Field label="Приветствие"><textarea rows="3" value={draft['ai.greeting']} onChange={e => set('ai.greeting', e.target.value)} /></Field>
            <Field label="Дополнительные указания ИИ" hint="Например: сейчас действует акция до конца месяца"><textarea rows="3" value={draft['ai.extra_instructions']} onChange={e => set('ai.extra_instructions', e.target.value)} /></Field>
          </div>
          <p className="muted">Ключи подключены: {Object.entries(integ.ai).filter(([, v]) => v).map(([k]) => k).join(', ') || 'нет'}. Ключи добавляются в переменные окружения Vercel.</p>
        </Panel>
      ) : null}

      {manage ? (
        <>
          <Panel title="Внешняя CRM" actions={<Button busy={busy} onClick={() => save(['crm.enabled', 'crm.type', 'crm.webhook_url'])}>Сохранить</Button>}>
            <label className="inline-check"><input type="checkbox" checked={Boolean(draft['crm.enabled'])} onChange={e => set('crm.enabled', e.target.checked)} /> Передавать новые заявки в CRM</label>
            <div className="form-grid">
              <Field label="Тип"><select value={draft['crm.type']} onChange={e => set('crm.type', e.target.value)}><option value="generic">Вебхук (JSON)</option><option value="bitrix24">Битрикс24, входящий вебхук</option></select></Field>
              <Field label="Адрес вебхука" hint="Для Битрикс24: адрес входящего вебхука вида https://ваш.bitrix24.ru/rest/1/код/"><input value={draft['crm.webhook_url']} onChange={e => set('crm.webhook_url', e.target.value)} /></Field>
            </div>
            <Button kind="quiet" onClick={async () => { try { const r = await api('/crm-test', {method: 'POST'}); setMessage({kind: r.status === 'sent' ? 'success' : 'error', text: r.skipped ? 'Укажите адрес вебхука' : r.status === 'sent' ? 'Тестовая заявка ушла в CRM' : `Ошибка: ${r.error}`}); } catch (e) { setMessage({kind: 'error', text: e.message}); } }}>Отправить тестовую заявку</Button>
          </Panel>

          <Panel title="Отчёты, Метрика и выгрузки" actions={<Button busy={busy} onClick={() => save(['reports.weekly_enabled', 'metrika.offline_enabled'])}>Сохранить</Button>}>
            <label className="inline-check"><input type="checkbox" checked={Boolean(draft['reports.weekly_enabled'])} onChange={e => set('reports.weekly_enabled', e.target.checked)} /> Еженедельный отчёт в админ-бот по понедельникам</label>
            <label className="inline-check"><input type="checkbox" checked={Boolean(draft['metrika.offline_enabled'])} onChange={e => set('metrika.offline_enabled', e.target.checked)} /> Передавать в Метрику статусы заявок (офлайн конверсии)</label>
            <p className="muted">Счётчик Метрики: {integ.metrika_counter || 'не подключён'}. Токен для загрузки конверсий: {integ.metrika_token ? 'есть' : 'нет, используйте CSV'}. В очереди конверсий: {sys?.metrika?.pending_conversions ?? 0}.</p>
            <div className="row-actions">
              <Button kind="quiet" onClick={() => download('/metrika.csv', 'offline-conversions.csv')}>Скачать конверсии CSV</Button>
              <Button kind="quiet" onClick={async () => { await api('/feeds', {method: 'POST', body: {}}); setMessage({kind: 'success', text: 'Новые ссылки для Google Таблиц выпущены, старые перестали работать. Они на странице «Статистика».'}); }}>Выпустить ссылки для Google Таблиц</Button>
              {can(user, 'backup.download') ? <Button kind="quiet" onClick={() => download('/backup', 'dom-mira-backup.dmb')}>Скачать резервную копию</Button> : null}
            </div>
          </Panel>
        </>
      ) : null}

      {sys ? (
        <Panel title="Состояние системы">
          <dl className="props">
            <div><dt>Окружение</dt><dd>{sys.environment}, {sys.site_url}</dd></div>
            <div><dt>Админ-бот</dt><dd>@{sys.telegram.admin_username}: {sys.telegram.admin.url ? 'вебхук установлен' : 'вебхук не установлен'}{sys.telegram.admin.last_error ? `, ошибка: ${sys.telegram.admin.last_error}` : ''}</dd></div>
            <div><dt>ИИ-консультант</dt><dd>@{sys.telegram.client_username}: {sys.telegram.client.url ? 'вебхук установлен' : 'вебхук не установлен'}{sys.telegram.client.last_error ? `, ошибка: ${sys.telegram.client.last_error}` : ''}</dd></div>
            <div><dt>Резервные копии</dt><dd>{sys.backups ? 'ключ задан, копия раз в сутки уходит владельцу в Telegram' : 'не настроены'}</dd></div>
            {sys.jobs.map(job => <div key={job.name}><dt>Задача {job.name}</dt><dd>{fmtDate(job.last_run_at)} {job.last_ok === false ? `ошибка: ${job.last_error}` : job.last_ok ? 'успешно' : ''}</dd></div>)}
            {sys.ai.last_day.map(row => <div key={`${row.provider}${row.model}`}><dt>{row.provider}/{row.model}</dt><dd>за сутки {row.requests} запросов, ошибок {row.errors}, ~{row.latency} мс</dd></div>)}
          </dl>
          {sys.ai.errors.length ? <><h3 className="sub">Последние ошибки ИИ</h3><ul className="list">{sys.ai.errors.map((e, i) => <li key={i}><small>{fmtDate(e.created_at)} {e.provider}/{e.model}</small> {e.error}</li>)}</ul></> : null}
        </Panel>
      ) : null}
    </Page>
  );
}
