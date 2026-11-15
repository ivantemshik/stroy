import React, {useState} from 'react';
import {api, fmtDate} from '../api.js';
import {useAsync, Page, Panel, Button, Field, Loading, ErrorBox, Notice} from '../ui.jsx';

export default function Users({user}) {
  const data = useAsync(() => api('/users'), []);
  const [message, setMessage] = useState({kind: 'info', text: ''});
  const [form, setForm] = useState({login: '', name: '', email: '', role_id: '', password: ''});
  const [roleDraft, setRoleDraft] = useState({});
  const [busy, setBusy] = useState(false);
  if (data.loading && !data.data) return <Loading />;
  if (data.error) return <ErrorBox error={data.error} onRetry={data.reload} />;
  const {users, roles, permissions} = data.data;

  const act = async (fn, ok) => {
    setBusy(true);
    try {
      const result = await fn();
      setMessage({kind: 'success', text: typeof ok === 'function' ? ok(result) : ok});
      await data.reload();
    } catch (err) {
      setMessage({kind: 'error', text: err.message});
    } finally {
      setBusy(false);
    }
  };
  const create = event => {
    event.preventDefault();
    act(() => api('/users', {method: 'POST', body: {...form, role_id: Number(form.role_id), password: form.password || undefined}}),
      r => r.password ? `Пользователь создан. Временный пароль: ${r.password}. Передайте его лично, после входа его нужно сменить.` : 'Пользователь создан')
      .then(() => setForm({login: '', name: '', email: '', role_id: '', password: ''}));
  };
  const patch = (id, body, ok) => act(() => api(`/users/${id}`, {method: 'PATCH', body}), r => r.password ? `Новый временный пароль: ${r.password}` : ok);
  const togglePerm = (role, perm) => {
    const current = roleDraft[role.id] || role.permissions;
    setRoleDraft(d => ({...d, [role.id]: current.includes(perm) ? current.filter(p => p !== perm) : [...current, perm]}));
  };

  return (
    <Page title="Пользователи и роли">
      <Notice kind={message.kind}>{message.text}</Notice>
      <Panel title="Сотрудники">
        <div className="table-wrap">
          <table className="a-table">
            <thead><tr><th>Имя</th><th>Логин</th><th>Роль</th><th>Telegram</th><th>Последний вход</th><th>Действия</th></tr></thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} className={u.is_active ? '' : 'row-off'}>
                  <td><b>{u.name}</b>{u.email ? <><br /><small>{u.email}</small></> : null}</td>
                  <td>{u.login}</td>
                  <td>
                    <select value={u.role_id} disabled={u.id === user.id} onChange={e => patch(u.id, {role_id: Number(e.target.value)}, 'Роль изменена')} aria-label={`Роль ${u.name}`}>
                      {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                  </td>
                  <td>{u.tg_linked ? `привязан${u.tg_username ? ` @${u.tg_username}` : ''}` : 'нет'}</td>
                  <td>{fmtDate(u.last_login_at) || 'не входил'}</td>
                  <td className="row-actions">
                    {u.id !== user.id ? <Button kind="quiet" busy={busy} onClick={() => patch(u.id, {is_active: !u.is_active}, u.is_active ? 'Доступ отключён' : 'Доступ включён')}>{u.is_active ? 'Отключить' : 'Включить'}</Button> : null}
                    <Button kind="quiet" busy={busy} onClick={() => confirm(`Сбросить пароль ${u.name}?`) && patch(u.id, {reset_password: true})}>Сбросить пароль</Button>
                    {u.tg_linked ? <Button kind="quiet" busy={busy} onClick={() => patch(u.id, {unlink_telegram: true}, 'Telegram отвязан')}>Отвязать Telegram</Button> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      <Panel title="Добавить сотрудника">
        <form className="form-grid" onSubmit={create}>
          <Field label="Имя"><input required value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} /></Field>
          <Field label="Логин" hint="Латиница, цифры, точка, дефис"><input required value={form.login} onChange={e => setForm(f => ({...f, login: e.target.value}))} /></Field>
          <Field label="Почта"><input type="email" value={form.email} onChange={e => setForm(f => ({...f, email: e.target.value}))} /></Field>
          <Field label="Роль"><select required value={form.role_id} onChange={e => setForm(f => ({...f, role_id: e.target.value}))}><option value="">Выберите</option>{roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select></Field>
          <Field label="Пароль" hint="Пусто: сгенерируем временный"><input type="text" autoComplete="new-password" value={form.password} onChange={e => setForm(f => ({...f, password: e.target.value}))} /></Field>
          <div><Button type="submit" busy={busy}>Добавить</Button></div>
        </form>
      </Panel>
      <Panel title="Права ролей">
        <div className="table-wrap">
          <table className="a-table perm-table">
            <thead><tr><th>Право</th>{roles.map(r => <th key={r.id}>{r.name}</th>)}</tr></thead>
            <tbody>
              {Object.entries(permissions).map(([perm, label]) => (
                <tr key={perm}>
                  <td>{label}</td>
                  {roles.map(r => {
                    const current = roleDraft[r.id] || r.permissions;
                    return <td key={r.id}><input type="checkbox" aria-label={`${r.name}: ${label}`} checked={current.includes(perm)} disabled={r.key === 'owner'} onChange={() => togglePerm(r, perm)} /></td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="row-actions">
          {roles.filter(r => roleDraft[r.id]).map(r => <Button key={r.id} busy={busy} onClick={() => act(() => api(`/roles/${r.id}`, {method: 'PATCH', body: {permissions: roleDraft[r.id]}}), `Права роли «${r.name}» сохранены`).then(() => setRoleDraft(d => { const n = {...d}; delete n[r.id]; return n; }))}>Сохранить роль «{r.name}»</Button>)}
          <Button kind="quiet" onClick={() => { const name = prompt('Название новой роли'); if (name) act(() => api('/roles', {method: 'POST', body: {name, permissions: ['leads.view_all']}}), 'Роль создана'); }}>Новая роль</Button>
        </div>
      </Panel>
    </Page>
  );
}
