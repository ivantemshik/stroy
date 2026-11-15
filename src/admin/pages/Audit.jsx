import React, {useState} from 'react';
import {api, fmtDate, qs} from '../api.js';
import {useAsync, Page, Panel, Button, Field, Loading, ErrorBox} from '../ui.jsx';

const LABELS = {
  login: 'Вход', login_failed: 'Неудачный вход', logout: 'Выход', password_changed: 'Смена пароля', lead_update: 'Изменение заявки',
  lead_note: 'Запись в заявке', lead_delete: 'Удаление заявки', lead_create: 'Заявка вручную', lead_take_tg: 'Взял заявку в Telegram',
  lead_status_tg: 'Статус в Telegram', export_leads: 'Выгрузка заявок', export_stats: 'Выгрузка статистики', user_create: 'Новый сотрудник',
  user_update: 'Изменение сотрудника', role_update: 'Права роли', role_create: 'Новая роль', settings_update: 'Настройки', content_update: 'Контент сайта',
  kb_save: 'База знаний', kb_delete: 'Удаление статьи', telegram_linked: 'Привязка Telegram', group_bound: 'Подключена группа',
  conversation_reply: 'Ответ клиенту', backup_download: 'Скачана резервная копия', ai_test: 'Проверка ИИ', client_data_deleted: 'Клиент удалил данные',
  feed_token_rotated: 'Ссылки Google Таблиц', report_sent_manually: 'Отчёт вручную'
};

export default function Audit() {
  const [page, setPage] = useState(1);
  const [action, setAction] = useState('');
  const data = useAsync(() => api(`/audit${qs({page, action})}`), [page, action]);
  return (
    <Page title="Журнал действий">
      <Panel>
        <Field label="Действие">
          <select value={action} onChange={e => { setAction(e.target.value); setPage(1); }}>
            <option value="">Все</option>
            {data.data?.actions?.map(a => <option key={a} value={a}>{LABELS[a] || a}</option>)}
          </select>
        </Field>
      </Panel>
      {data.loading && !data.data ? <Loading /> : null}
      <ErrorBox error={data.error} onRetry={data.reload} />
      {data.data ? (
        <Panel>
          <div className="table-wrap">
            <table className="a-table">
              <thead><tr><th>Когда</th><th>Кто</th><th>Действие</th><th>Объект</th><th>Подробности</th></tr></thead>
              <tbody>{data.data.items.map(item => (
                <tr key={item.id}>
                  <td>{fmtDate(item.created_at)}</td>
                  <td>{item.user_name || item.actor || 'система'}</td>
                  <td>{LABELS[item.action] || item.action}</td>
                  <td>{item.entity === 'lead' && item.entity_id ? <a href={`#/leads/${item.entity_id}`}>заявка №{item.entity_id}</a> : item.entity ? `${item.entity} ${item.entity_id || ''}` : ''}</td>
                  <td><small className="mono-wrap">{Object.keys(item.details || {}).length ? JSON.stringify(item.details).slice(0, 200) : ''}</small></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <div className="pager">
            <Button kind="quiet" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Новее</Button>
            <span>Страница {page}</span>
            <Button kind="quiet" disabled={data.data.items.length < 50} onClick={() => setPage(p => p + 1)}>Старше</Button>
          </div>
        </Panel>
      ) : null}
    </Page>
  );
}
