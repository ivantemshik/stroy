-- Согласие в чате до начала диалога, ключ повтора одной отправки формы, одна заявка на диалог,
-- доставка карточек по каждому получателю, первый ответ клиенту отдельно от первого действия
-- и повтор необработанных обновлений Telegram.

alter table conversations add column if not exists consent_version text;
alter table conversations add column if not exists consent_channel text;
alter table conversations add column if not exists consent_pending boolean not null default false;

alter table leads add column if not exists consent_channel text;
alter table leads add column if not exists submission_key text;
alter table leads add column if not exists first_contact_at timestamptz;
create unique index if not exists leads_submission_key_uq on leads (submission_key) where submission_key is not null;
create unique index if not exists leads_conversation_uq on leads (conversation_id) where conversation_id is not null;

-- Статус обработки обновления: processing, done, failed. Для упавших хранится само обновление,
-- плановая проверка повторяет его до трёх раз. До согласия клиента текст в нём не хранится.
alter table tg_updates add column if not exists status text not null default 'done';
alter table tg_updates add column if not exists attempts int not null default 1;
alter table tg_updates add column if not exists payload jsonb;
alter table tg_updates add column if not exists updated_at timestamptz not null default now();
create index if not exists tg_updates_failed_idx on tg_updates (status, updated_at) where status <> 'done';

-- Заметка об источнике фактов статьи базы знаний: для сотрудников, в модель не уходит.
alter table kb_articles add column if not exists source_note text;
