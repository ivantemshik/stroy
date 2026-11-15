-- Защита от повторной обработки обновлений Telegram и связь ответов менеджеров с диалогами.
create table if not exists tg_updates (
  bot text not null,
  update_id bigint not null,
  at timestamptz not null default now(),
  primary key (bot, update_id)
);

create table if not exists relay_map (
  chat_id bigint not null,
  message_id bigint not null,
  conversation_id int not null references conversations(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (chat_id, message_id)
);
