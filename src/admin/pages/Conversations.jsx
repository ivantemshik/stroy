import React, {useState} from 'react';
import {api, fmtDate, qs} from '../api.js';
import {useAsync, Page, Panel, Button, Field, Loading, ErrorBox, Pagination, Notice} from '../ui.jsx';
import {can} from '../nav.js';

export default function Conversations({user, id}) {
  if (id) return <Conversation id={id} user={user} />;
  return <ConversationList />;
}

function ConversationList() {
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const data = useAsync(() => api(`/conversations${qs({page, q})}`), [page, q]);
  return (
    <Page title="Диалоги ИИ-консультанта">
      <Panel>
        <Field label="Поиск по имени или нику"><input type="search" value={q} onChange={e => { setQ(e.target.value); setPage(1); }} /></Field>
      </Panel>
      {data.loading && !data.data ? <Loading /> : null}
      <ErrorBox error={data.error} onRetry={data.reload} />
      {data.data ? (
        <Panel>
          <div className="table-wrap">
            <table className="a-table">
              <thead><tr><th>Клиент</th><th>Последнее сообщение</th><th>Тема</th><th>Заявка</th><th>Сообщений</th></tr></thead>
              <tbody>
                {data.data.items.map(c => (
                  <tr key={c.id} onClick={() => { location.hash = `/conversations/${c.id}`; }}>
                    <td><a href={`#/conversations/${c.id}`}><b>{[c.first_name, c.last_name].filter(Boolean).join(' ') || 'Без имени'}</b></a>{c.tg_username ? <><br /><small>@{c.tg_username}</small></> : null}{c.human_mode ? <><br /><span className="badge badge--work">менеджер</span></> : null}</td>
                    <td><small>{fmtDate(c.last_message_at)}</small><br />{(c.last_text || '').slice(0, 120)}</td>
                    <td>{(c.topics || []).slice(0, 3).join(', ')}{c.refusal_reason ? <><br /><small>Отказ: {c.refusal_reason}</small></> : null}</td>
                    <td>{c.lead_id ? <a href={`#/leads/${c.lead_id}`}>№{c.lead_id}</a> : <span className="muted">нет</span>}</td>
                    <td>{c.messages_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={data.data.page} per={data.data.per} total={data.data.total} onPage={setPage} />
        </Panel>
      ) : null}
    </Page>
  );
}

function Conversation({id, user}) {
  const data = useAsync(() => api(`/conversations/${id}`), [id]);
  const [text, setText] = useState('');
  const [message, setMessage] = useState({kind: 'info', text: ''});
  const [busy, setBusy] = useState(false);
  if (data.loading && !data.data) return <Loading />;
  if (data.error) return <ErrorBox error={data.error} onRetry={data.reload} />;
  const {conversation: c, messages} = data.data;
  const act = async (fn, ok) => {
    setBusy(true);
    // Возвращает, получилось ли: текст ответа стираем только после успешной отправки.
    try { await fn(); setMessage({kind: 'success', text: ok}); await data.reload(); return true; } catch (err) { setMessage({kind: 'error', text: err.message}); return false; } finally { setBusy(false); }
  };
  return (
    <Page title={`Диалог: ${[c.first_name, c.last_name].filter(Boolean).join(' ') || 'клиент'}`} actions={<a className="a-link" href="#/conversations">Все диалоги</a>}>
      <Notice kind={message.kind}>{message.text}</Notice>
      <div className="grid-lead">
        <Panel title="Переписка">
          <ol className="chat">
            {messages.map(m => (
              <li key={m.id} className={`msg msg--${m.role}`}><small>{m.role === 'user' ? 'Клиент' : m.role === 'manager' ? (m.manager_name || 'Менеджер') : m.role === 'system' ? 'Система' : `Бот${m.model ? `, ${m.provider}/${m.model}` : ''}`}, {fmtDate(m.created_at)}</small><p>{m.text}</p></li>
            ))}
          </ol>
          {can(user, 'conversations.reply') ? (
            <div className="reply">
              <Field label="Ответить клиенту"><textarea rows="3" value={text} onChange={e => setText(e.target.value)} /></Field>
              <Button busy={busy} disabled={!text.trim()} onClick={() => act(() => api(`/conversations/${c.id}/reply`, {method: 'POST', body: {text}}), 'Отправлено').then(sent => { if (sent) setText(''); })}>Отправить</Button>
            </div>
          ) : null}
        </Panel>
        <div className="stack">
          <Panel title="Режим">
            <p>{c.human_mode ? 'Отвечает менеджер, бот молчит.' : 'Отвечает ИИ-консультант.'}</p>
            {can(user, 'conversations.reply') ? <Button kind="quiet" busy={busy} onClick={() => act(() => api(`/conversations/${c.id}/human`, {method: 'POST', body: {on: !c.human_mode}}), 'Режим изменён')}>{c.human_mode ? 'Вернуть ИИ-консультанта' : 'Перевести на менеджера'}</Button> : null}
          </Panel>
          <Panel title="Что известно">
            <dl className="props">
              {c.tg_username ? <div><dt>Telegram</dt><dd><a href={`https://t.me/${c.tg_username}`} target="_blank" rel="noopener">@{c.tg_username}</a></dd></div> : null}
              <div><dt>Источник</dt><dd>{c.source || 'telegram'}{c.landing_page ? `, страница ${c.landing_page}` : ''}</dd></div>
              {Object.entries(c.fields || {}).filter(([, v]) => v).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
              <div><dt>Согласие</dt><dd>{c.consent_at ? fmtDate(c.consent_at) : 'не давал'}</dd></div>
              {c.lead_id ? <div><dt>Заявка</dt><dd><a href={`#/leads/${c.lead_id}`}>№{c.lead_id}</a></dd></div> : null}
            </dl>
          </Panel>
          <Panel title="Выводы ИИ из диалога">
            <dl className="props">
              <div><dt>Сегмент</dt><dd>{c.segment || 'нет'}</dd></div>
              <div><dt>Темы</dt><dd>{(c.topics || []).join(', ') || 'нет'}</dd></div>
              <div><dt>Боли</dt><dd>{(c.pains || []).join(', ') || 'нет'}</dd></div>
              <div><dt>Возражения</dt><dd>{(c.objections || []).join(', ') || 'нет'}</dd></div>
              <div><dt>Вопросы</dt><dd>{(c.questions || []).join(', ') || 'нет'}</dd></div>
              <div><dt>Причина отказа</dt><dd>{c.refusal_reason || 'нет'}</dd></div>
            </dl>
          </Panel>
        </div>
      </div>
    </Page>
  );
}
