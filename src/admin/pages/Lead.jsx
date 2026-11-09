import React, {useState} from 'react';
import {api, fmtDate, fmtPhone, minutes, rub} from '../api.js';
import {useAsync, Page, Panel, Button, Field, Loading, ErrorBox, StatusBadge, Notice} from '../ui.jsx';
import {can, go} from '../nav.js';

const SERVICES = {construction: 'Строительство дома', finishing: 'Отделочные работы', design: 'Проектирование', engineering: 'Инженерные системы', landscape: 'Благоустройство', commercial: 'Коммерческий объект', other: 'Другое'};
const CHANNELS = {site: 'Сайт', telegram_bot: 'ИИ-консультант в Telegram', manual: 'Добавлена вручную'};
const CONTACT = {call: 'Звонок', telegram: 'Telegram', whatsapp: 'WhatsApp', max: 'Max', email: 'Почта'};
const DETAILS = {object: 'Объект', area: 'Площадь', floors: 'Этажность', material: 'Материал', has_project: 'Проект', has_plot: 'Участок', location: 'Где', budget: 'Бюджет', timing: 'Сроки', stage: 'Стадия', design_project: 'Дизайн проект', scope: 'Состав работ', estimate: 'Предварительный расчёт', rooms: 'Помещения'};
const EVENT_LABELS = {created: 'Создана', status: 'Статус', assign: 'Ответственный', note: 'Заметка', call: 'Звонок', meeting: 'Встреча', email: 'Письмо', message: 'Сообщение', delivery: 'Доставка', reminder: 'Напоминание', repeat: 'Повторная заявка', edit: 'Изменение'};

export default function Lead({id, user}) {
  const data = useAsync(() => api(`/leads/${id}`), [id]);
  const users = useAsync(() => api('/users').catch(() => ({users: []})), []);
  const [status, setStatus] = useState(null);
  const [reason, setReason] = useState('');
  const [amount, setAmount] = useState('');
  const [comment, setComment] = useState('');
  const [note, setNote] = useState({type: 'note', text: ''});
  const [reply, setReply] = useState('');
  const [message, setMessage] = useState({kind: 'info', text: ''});
  const [busy, setBusy] = useState(false);

  if (data.loading && !data.data) return <Loading />;
  if (data.error) return <ErrorBox error={data.error} onRetry={data.reload} />;
  const {lead, events, conversation, statuses, reasons} = data.data;
  const canEdit = can(user, 'leads.edit');
  const run = async (fn, ok) => {
    setBusy(true);
    setMessage({kind: 'info', text: ''});
    try {
      await fn();
      setMessage({kind: 'success', text: ok});
      await data.reload();
    } catch (err) {
      setMessage({kind: 'error', text: err.message});
    } finally {
      setBusy(false);
    }
  };
  const saveStatus = () => run(() => api(`/leads/${lead.id}`, {method: 'PATCH', body: {status, reason, amount: amount || undefined, comment}}), 'Статус обновлён').then(() => { setStatus(null); setComment(''); });
  const assign = managerId => run(() => api(`/leads/${lead.id}`, {method: 'PATCH', body: {manager_id: managerId ? Number(managerId) : null}}), 'Ответственный назначен');
  const addNote = () => run(() => api(`/leads/${lead.id}/events`, {method: 'POST', body: note}), 'Запись добавлена').then(() => setNote({type: 'note', text: ''}));
  const sendReply = () => run(() => api(`/conversations/${lead.conversation_id}/reply`, {method: 'POST', body: {text: reply}}), 'Сообщение отправлено клиенту').then(() => setReply(''));
  const remove = () => { if (confirm(`Удалить заявку №${lead.id} без возможности восстановления?`)) run(() => api(`/leads/${lead.id}`, {method: 'DELETE'}), 'Удалено').then(() => go('/leads')); };
  const responseTime = lead.first_response_at ? (new Date(lead.first_response_at) - new Date(lead.created_at)) / 60000 : null;

  return (
    <Page title={`Заявка №${lead.id}`} actions={<a className="a-link" href="#/leads">К списку заявок</a>}>
      <Notice kind={message.kind}>{message.text}</Notice>
      <div className="grid-lead">
        <div className="stack">
          <Panel title="Клиент">
            <dl className="props">
              <div><dt>Имя</dt><dd>{lead.name || 'Не указано'}</dd></div>
              {lead.phone ? <div><dt>Телефон</dt><dd><a href={`tel:${lead.phone}`}>{fmtPhone(lead.phone)}</a></dd></div> : null}
              {lead.email ? <div><dt>Почта</dt><dd><a href={`mailto:${lead.email}`}>{lead.email}</a></dd></div> : null}
              {lead.tg_username ? <div><dt>Telegram</dt><dd><a href={`https://t.me/${lead.tg_username}`} target="_blank" rel="noopener">@{lead.tg_username}</a></dd></div> : null}
              {lead.contact_pref ? <div><dt>Удобная связь</dt><dd>{CONTACT[lead.contact_pref] || lead.contact_pref}</dd></div> : null}
              <div><dt>Услуга</dt><dd>{SERVICES[lead.service] || lead.service}</dd></div>
              {Object.entries(lead.details || {}).map(([k, v]) => <div key={k}><dt>{DETAILS[k] || k}</dt><dd>{v}</dd></div>)}
            </dl>
            {lead.message ? <blockquote className="quote">{lead.message}</blockquote> : null}
          </Panel>

          {conversation ? (
            <Panel title="Переписка в Telegram" actions={<a className="a-link" href={`#/conversations/${conversation.id}`}>Открыть диалог</a>}>
              <ol className="chat">
                {conversation.messages.filter(m => m.role !== 'system').slice(-30).map(m => (
                  <li key={m.id} className={`msg msg--${m.role}`}><small>{m.role === 'user' ? 'Клиент' : m.role === 'manager' ? (m.manager_name || 'Менеджер') : 'Бот'}, {fmtDate(m.created_at)}</small><p>{m.text}</p></li>
                ))}
              </ol>
              {can(user, 'conversations.reply') ? (
                <div className="reply">
                  <Field label="Ответить клиенту в Telegram" hint="После ответа менеджера бот перестаёт отвечать сам в этом диалоге"><textarea rows="3" value={reply} onChange={e => setReply(e.target.value)} /></Field>
                  <Button busy={busy} disabled={!reply.trim()} onClick={sendReply}>Отправить</Button>
                </div>
              ) : null}
            </Panel>
          ) : null}

          <Panel title="История">
            <ol className="timeline">
              {events.map(e => (
                <li key={e.id}><small>{fmtDate(e.created_at)}{e.user_name ? `, ${e.user_name}` : ''}</small><b>{EVENT_LABELS[e.type] || e.type}</b>{e.text ? <p>{e.text}</p> : null}</li>
              ))}
            </ol>
            {canEdit ? (
              <div className="note-form">
                <Field label="Новая запись">
                  <select value={note.type} onChange={e => setNote(n => ({...n, type: e.target.value}))}>
                    <option value="note">Заметка</option><option value="call">Звонок</option><option value="meeting">Встреча</option><option value="email">Письмо</option><option value="message">Сообщение</option>
                  </select>
                </Field>
                <Field label="Текст"><textarea rows="3" value={note.text} onChange={e => setNote(n => ({...n, text: e.target.value}))} placeholder="О чём договорились, что дальше" /></Field>
                <Button busy={busy} disabled={!note.text.trim()} onClick={addNote}>Добавить в историю</Button>
              </div>
            ) : null}
          </Panel>
        </div>

        <div className="stack">
          <Panel title="Статус">
            <p><StatusBadge status={lead.status} label={statuses.find(s => s.key === lead.status)?.label} />{lead.reject_reason ? ` ${lead.reject_reason}` : ''}</p>
            {lead.contract_amount ? <p>Сумма договора: {rub(lead.contract_amount)} ₽</p> : null}
            {canEdit ? (
              <div className="stack-sm">
                <Field label="Новый статус">
                  <select value={status ?? lead.status} onChange={e => setStatus(e.target.value)}>
                    {statuses.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                  </select>
                </Field>
                {(status ?? lead.status) === 'rejected' ? (
                  <Field label="Причина отказа"><select value={reason} onChange={e => setReason(e.target.value)}><option value="">Выберите</option>{reasons.map(r => <option key={r}>{r}</option>)}</select></Field>
                ) : null}
                {(status ?? lead.status) === 'contract' ? <Field label="Сумма договора, ₽"><input inputMode="numeric" value={amount} onChange={e => setAmount(e.target.value.replace(/[^\d]/g, ''))} /></Field> : null}
                <Field label="Комментарий"><input value={comment} onChange={e => setComment(e.target.value)} /></Field>
                <Button busy={busy} disabled={status === null || status === lead.status || (status === 'rejected' && !reason)} onClick={saveStatus}>Сохранить статус</Button>
              </div>
            ) : null}
          </Panel>
          <Panel title="Ответственный">
            {can(user, 'leads.assign') ? (
              <select value={lead.manager_id || ''} onChange={e => assign(e.target.value)} aria-label="Ответственный">
                <option value="">Не назначен</option>
                {users.data?.users?.filter(u => u.is_active).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            ) : <p>{lead.manager_name || 'Не назначен'}{!lead.manager_id && canEdit ? <> <button type="button" className="a-link" onClick={() => assign(user.id)}>Взять себе</button></> : null}</p>}
          </Panel>
          <Panel title="Откуда пришла">
            <dl className="props">
              <div><dt>Создана</dt><dd>{fmtDate(lead.created_at)}</dd></div>
              <div><dt>Канал</dt><dd>{CHANNELS[lead.channel] || lead.channel}</dd></div>
              {lead.page ? <div><dt>Страница</dt><dd>{lead.page}</dd></div> : null}
              {lead.form ? <div><dt>Форма</dt><dd>{lead.form}</dd></div> : null}
              {lead.landing_page ? <div><dt>Страница входа</dt><dd>{lead.landing_page}</dd></div> : null}
              {lead.utm_source ? <div><dt>utm_source</dt><dd>{lead.utm_source}</dd></div> : null}
              {lead.utm_medium ? <div><dt>utm_medium</dt><dd>{lead.utm_medium}</dd></div> : null}
              {lead.utm_campaign ? <div><dt>utm_campaign</dt><dd>{lead.utm_campaign}</dd></div> : null}
              {lead.utm_content ? <div><dt>utm_content</dt><dd>{lead.utm_content}</dd></div> : null}
              {lead.utm_term ? <div><dt>utm_term</dt><dd>{lead.utm_term}</dd></div> : null}
              {lead.referrer ? <div><dt>Переход с</dt><dd>{lead.referrer}</dd></div> : null}
              {lead.ym_client_id ? <div><dt>ClientID Метрики</dt><dd>{lead.ym_client_id}</dd></div> : null}
              {lead.yclid ? <div><dt>yclid</dt><dd>{lead.yclid}</dd></div> : null}
              {lead.device ? <div><dt>Устройство</dt><dd>{lead.device}</dd></div> : null}
              <div><dt>Время первого ответа</dt><dd>{responseTime === null ? 'ещё нет' : minutes(responseTime)}</dd></div>
              <div><dt>Уведомление в Telegram</dt><dd>{lead.delivery_status === 'sent' ? 'доставлено' : `не доставлено${lead.delivery_error ? `: ${lead.delivery_error}` : ''}`}</dd></div>
              {lead.crm_status ? <div><dt>CRM</dt><dd>{lead.crm_status}{lead.crm_error ? `: ${lead.crm_error}` : ''}</dd></div> : null}
              {lead.consent_at ? <div><dt>Согласие на обработку</dt><dd>{fmtDate(lead.consent_at)}, редакция {lead.consent_version}</dd></div> : null}
            </dl>
          </Panel>
          {can(user, 'leads.delete') ? <Button kind="danger" onClick={remove}>Удалить заявку</Button> : null}
        </div>
      </div>
    </Page>
  );
}
