import React, {useState} from 'react';
import {api} from '../api.js';
import {Page, Panel, Button, Field, Notice} from '../ui.jsx';

export default function Profile({user, bots, onChange}) {
  const [link, setLink] = useState(null);
  const [pwd, setPwd] = useState({current: '', next: '', repeat: ''});
  const [message, setMessage] = useState({kind: 'info', text: ''});
  const [busy, setBusy] = useState(false);

  const getLink = async () => {
    try { setLink(await api('/telegram-link', {method: 'POST'})); } catch (err) { setMessage({kind: 'error', text: err.message}); }
  };
  const changePassword = async event => {
    event.preventDefault();
    if (pwd.next !== pwd.repeat) { setMessage({kind: 'error', text: 'Новый пароль и повтор не совпадают'}); return; }
    setBusy(true);
    try {
      await api('/password', {method: 'POST', body: {current: pwd.current, next: pwd.next}});
      setMessage({kind: 'success', text: 'Пароль изменён. Другие сеансы завершены.'});
      setPwd({current: '', next: '', repeat: ''});
    } catch (err) {
      setMessage({kind: 'error', text: err.message});
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page title="Профиль">
      <Notice kind={message.kind}>{message.text}</Notice>
      <div className="grid-2">
        <Panel title={user.name}>
          <dl className="props">
            <div><dt>Логин</dt><dd>{user.login}</dd></div>
            <div><dt>Роль</dt><dd>{user.role_name}</dd></div>
            <div><dt>Telegram</dt><dd>{user.tg_chat_id ? `подключён${user.tg_username ? ` (@${user.tg_username})` : ''}` : 'не подключён'}</dd></div>
          </dl>
          <p>Подключите Telegram, чтобы получать заявки в админ-боте @{bots.admin} и работать с ними кнопками.</p>
          <div className="row-actions">
            <Button kind="quiet" onClick={getLink}>{user.tg_chat_id ? 'Подключить другой аккаунт' : 'Подключить Telegram'}</Button>
            {link ? <a className="a-btn a-btn--primary" href={link.url} target="_blank" rel="noopener" onClick={() => setTimeout(onChange, 15000)}>Открыть бота и нажать «Старт»</a> : null}
          </div>
          {link ? <p className="muted">Ссылка действует 30 минут.</p> : null}
        </Panel>
        <Panel title="Сменить пароль">
          <form className="stack-sm" onSubmit={changePassword}>
            <Field label="Текущий пароль"><input type="password" autoComplete="current-password" value={pwd.current} onChange={e => setPwd(p => ({...p, current: e.target.value}))} required /></Field>
            <Field label="Новый пароль" hint="Не короче 10 символов, буквы и цифры"><input type="password" autoComplete="new-password" value={pwd.next} onChange={e => setPwd(p => ({...p, next: e.target.value}))} required /></Field>
            <Field label="Повторите новый пароль"><input type="password" autoComplete="new-password" value={pwd.repeat} onChange={e => setPwd(p => ({...p, repeat: e.target.value}))} required /></Field>
            <div><Button type="submit" busy={busy}>Сменить пароль</Button></div>
          </form>
        </Panel>
      </div>
    </Page>
  );
}
