-- Правки перед приёмкой, 14 ноября 2026: доступ менеджеров, журнал без контактов, зависшие обновления Telegram.

-- Обычный менеджер видит свои и свободные заявки, чужие не видит.
-- У роли «Менеджер» право «Видеть все заявки» меняется на «Видеть только свои».
update roles
  set permissions = array_remove(array_remove(permissions, 'leads.view_all'), 'leads.view_own') || array['leads.view_own']
  where key = 'manager' and 'leads.view_all' = any(permissions);

-- Журнал действий без контактов: в старых записях об изменении заявки остаются только названия полей,
-- в записях об удалении заявки нет имени, в записях об удалении данных клиентом нет его номера в Telegram,
-- в записях о выгрузке нет поисковой строки.
update audit_log
  set details = jsonb_build_object('fields', (select coalesce(jsonb_agg(k), '[]'::jsonb) from jsonb_object_keys(details) k))
  where action = 'lead_update' and details <> '{}'::jsonb and not details ? 'fields';
update audit_log set details = '{}'::jsonb where action = 'lead_delete' and details <> '{}'::jsonb;
update audit_log set actor = 'client' where action = 'client_data_deleted' and actor like 'tg:%';
update audit_log
  set details = (details - 'query') || jsonb_build_object('search', coalesce(details->>'query', '') like '%q=%')
  where action = 'export_leads' and details ? 'query';

-- Обновления Telegram, зависшие «в работе» до этой правки без сохранённого сообщения: повторить их нельзя.
update tg_updates set status = 'dead', updated_at = now()
  where status = 'processing' and payload is null and updated_at < now() - interval '1 hour';
