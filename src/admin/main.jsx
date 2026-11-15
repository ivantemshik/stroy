import React, {useEffect, useState} from 'react';
import {createRoot} from 'react-dom/client';
import './admin.css';
import {api, setUnauthorizedHandler} from './api.js';
import {Button, Field, Notice} from './ui.jsx';
import {can} from './nav.js';
import Dashboard from './pages/Dashboard.jsx';
import Leads from './pages/Leads.jsx';
import Lead from './pages/Lead.jsx';
import Conversations from './pages/Conversations.jsx';
import Stats from './pages/Stats.jsx';
import Content from './pages/Content.jsx';
import Knowledge from './pages/Knowledge.jsx';
import Settings from './pages/Settings.jsx';
import Users from './pages/Users.jsx';
import Audit from './pages/Audit.jsx';
import Profile from './pages/Profile.jsx';

const NAV = [
  {path: '/', label: 'Сводка', perm: null},
  {path: '/leads', label: 'Заявки', perm: ['leads.view_all', 'leads.view_own']},
  {path: '/conversations', label: 'Диалоги бота', perm: ['conversations.view']},
  {path: '/stats', label: 'Статистика', perm: ['stats.view']},
  {path: '/content', label: 'Контент сайта', perm: ['content.edit']},
  {path: '/kb', label: 'База знаний ИИ', perm: ['kb.edit', 'ai.manage']},
  {path: '/settings', label: 'Настройки', perm: ['settings.manage', 'ai.manage']},
  {path: '/users', label: 'Пользователи', perm: ['users.manage']},
  {path: '/audit', label: 'Журнал', perm: ['audit.view']},
  {path: '/profile', label: 'Профиль', perm: null}
];

function useHashRoute() {
  const read = () => (location.hash.replace(/^#/, '') || '/');
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const onChange = () => setRoute(read());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}


function Login({onLogin}) {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async event => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('/login', {method: 'POST', body: {login, password}});
      onLogin();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="login">
      <form className="login-card" onSubmit={submit}>
        <h1>Админка «Дом Мира»</h1>
        <p className="muted">Заявки, статистика и настройки сайта и ботов.</p>
        <Field label="Логин"><input value={login} onChange={e => setLogin(e.target.value)} autoComplete="username" required autoFocus /></Field>
        <Field label="Пароль"><input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" required /></Field>
        <Notice kind="error">{error}</Notice>
        <Button type="submit" busy={busy}>Войти</Button>
      </form>
    </main>
  );
}

function App() {
  const route = useHashRoute();
  const [session, setSession] = useState({loading: true, user: null, bots: {}});
  const [menuOpen, setMenuOpen] = useState(false);

  const load = async () => {
    try {
      const data = await api('/me');
      setSession({loading: false, user: data.user, bots: data.bots});
    } catch {
      setSession({loading: false, user: null, bots: {}});
    }
  };
  useEffect(() => { load(); setUnauthorizedHandler(() => setSession(s => ({...s, user: null}))); }, []);
  useEffect(() => { setMenuOpen(false); window.scrollTo(0, 0); }, [route]);

  if (session.loading) return <p className="boot">Загружаем...</p>;
  if (!session.user) return <Login onLogin={load} />;
  const user = session.user;

  const logout = async () => { await api('/logout', {method: 'POST'}).catch(() => {}); setSession({loading: false, user: null, bots: {}}); };
  const [base, id] = route.split('/').filter(Boolean);
  let page;
  if (!base) page = <Dashboard user={user} />;
  else if (base === 'leads' && id) page = <Lead id={id} user={user} />;
  else if (base === 'leads') page = <Leads user={user} />;
  else if (base === 'conversations') page = <Conversations user={user} id={id} />;
  else if (base === 'stats') page = <Stats user={user} />;
  else if (base === 'content') page = <Content user={user} />;
  else if (base === 'kb') page = <Knowledge user={user} />;
  else if (base === 'settings') page = <Settings user={user} />;
  else if (base === 'users') page = <Users user={user} />;
  else if (base === 'audit') page = <Audit user={user} />;
  else if (base === 'profile') page = <Profile user={user} bots={session.bots} onChange={load} />;
  else page = <p>Раздел не найден.</p>;

  return (
    <div className="shell">
      <aside className={`side ${menuOpen ? 'is-open' : ''}`}>
        <div className="side-top">
          <a className="side-brand" href="#/">Дом Мира</a>
          <button type="button" className="a-btn a-btn--quiet side-toggle" aria-expanded={menuOpen} onClick={() => setMenuOpen(o => !o)}>Меню</button>
        </div>
        <nav className="side-nav" aria-label="Разделы админки">
          {NAV.filter(item => can(user, item.perm)).map(item => {
            const active = item.path === '/' ? route === '/' : route.startsWith(item.path);
            return <a key={item.path} href={`#${item.path}`} aria-current={active ? 'page' : undefined}>{item.label}</a>;
          })}
        </nav>
        <div className="side-user">
          <span>{user.name}</span>
          <small>{user.role_name}</small>
          <button type="button" className="a-link" onClick={logout}>Выйти</button>
        </div>
      </aside>
      <main className="content">{page}</main>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
