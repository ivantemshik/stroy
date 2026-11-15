-- Схема базы «Дом Мира»: заявки, админка, боты, статистика.

create table if not exists roles (
  id serial primary key,
  key text unique not null,
  name text not null,
  permissions text[] not null default '{}',
  is_system boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists users (
  id serial primary key,
  login text unique not null,
  name text not null,
  email text,
  role_id int not null references roles(id),
  password_hash text not null,
  tg_chat_id bigint unique,
  tg_username text,
  notify_new_leads boolean not null default true,
  is_active boolean not null default true,
  failed_logins int not null default 0,
  locked_until timestamptz,
  last_login_at timestamptz,
  password_changed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists sessions (
  id text primary key,
  user_id int not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  ip_hash text,
  user_agent text
);
create index if not exists sessions_user_idx on sessions(user_id);

create table if not exists conversations (
  id serial primary key,
  tg_user_id bigint not null,
  tg_chat_id bigint not null unique,
  tg_username text,
  first_name text,
  last_name text,
  source text,
  start_param text,
  ym_client_id text,
  landing_page text,
  state jsonb not null default '{}',
  fields jsonb not null default '{}',
  consent_at timestamptz,
  lead_id int,
  human_mode boolean not null default false,
  human_since timestamptz,
  blocked boolean not null default false,
  messages_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_message_at timestamptz
);

create table if not exists messages (
  id bigserial primary key,
  conversation_id int not null references conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'manager', 'system')),
  text text not null,
  tg_message_id bigint,
  provider text,
  model text,
  latency_ms int,
  prompt_tokens int,
  completion_tokens int,
  manager_id int references users(id),
  created_at timestamptz not null default now()
);
create index if not exists messages_conversation_idx on messages(conversation_id, created_at);

create table if not exists leads (
  id serial primary key,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  channel text not null default 'site',
  form text,
  page text,
  landing_page text,
  service text,
  name text,
  phone text,
  email text,
  tg_username text,
  tg_user_id bigint,
  contact_pref text,
  message text,
  details jsonb not null default '{}',
  status text not null default 'new',
  stage_reached int not null default 0,
  reject_reason text,
  manager_id int references users(id) on delete set null,
  first_response_at timestamptz,
  closed_at timestamptz,
  contract_amount numeric(14, 2),
  next_contact_at timestamptz,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  referrer text,
  yclid text,
  gclid text,
  ym_client_id text,
  ip_hash text,
  user_agent text,
  device text,
  consent_at timestamptz,
  consent_version text,
  conversation_id int references conversations(id) on delete set null,
  delivery_status text not null default 'pending',
  delivery_error text,
  delivery_attempts int not null default 0,
  tg_messages jsonb not null default '[]',
  reminders_sent int not null default 0,
  last_reminder_at timestamptz,
  crm_status text,
  crm_error text,
  is_test boolean not null default false
);
create index if not exists leads_created_idx on leads(created_at desc);
create index if not exists leads_status_idx on leads(status);
create index if not exists leads_phone_idx on leads(phone);
create index if not exists leads_manager_idx on leads(manager_id);

alter table conversations drop constraint if exists conversations_lead_fk;
alter table conversations add constraint conversations_lead_fk foreign key (lead_id) references leads(id) on delete set null;

create table if not exists lead_events (
  id bigserial primary key,
  lead_id int not null references leads(id) on delete cascade,
  created_at timestamptz not null default now(),
  user_id int references users(id) on delete set null,
  type text not null,
  text text,
  data jsonb not null default '{}'
);
create index if not exists lead_events_lead_idx on lead_events(lead_id, created_at);

create table if not exists conversation_insights (
  conversation_id int primary key references conversations(id) on delete cascade,
  segment text,
  service text,
  topics text[] not null default '{}',
  pains text[] not null default '{}',
  objections text[] not null default '{}',
  questions text[] not null default '{}',
  refusal_reason text,
  updated_at timestamptz not null default now()
);

create table if not exists kb_articles (
  id serial primary key,
  title text not null,
  body text not null,
  tags text[] not null default '{}',
  is_active boolean not null default true,
  sort int not null default 100,
  updated_at timestamptz not null default now(),
  updated_by int references users(id) on delete set null
);

create table if not exists content_blocks (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by int references users(id) on delete set null
);

create table if not exists settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by int references users(id) on delete set null
);

create table if not exists audit_log (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  user_id int references users(id) on delete set null,
  actor text,
  ip_hash text,
  action text not null,
  entity text,
  entity_id text,
  details jsonb not null default '{}'
);
create index if not exists audit_created_idx on audit_log(created_at desc);

create table if not exists rate_events (
  key text not null,
  at timestamptz not null default now()
);
create index if not exists rate_events_idx on rate_events(key, at);

create table if not exists pow_used (
  challenge text primary key,
  expires_at timestamptz not null
);

create table if not exists link_tokens (
  token text primary key,
  user_id int references users(id) on delete cascade,
  purpose text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists offline_conversions (
  id serial primary key,
  lead_id int references leads(id) on delete cascade,
  target text not null,
  client_id text,
  yclid text,
  happened_at timestamptz not null,
  price numeric(14, 2),
  uploaded_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  unique (lead_id, target)
);

create table if not exists reports (
  id serial primary key,
  kind text not null,
  period_start timestamptz not null,
  period_end timestamptz not null,
  data jsonb not null,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create table if not exists ai_usage (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  provider text not null,
  model text not null,
  purpose text,
  ok boolean not null,
  latency_ms int,
  prompt_tokens int,
  completion_tokens int,
  error text
);
create index if not exists ai_usage_created_idx on ai_usage(created_at desc);

create table if not exists job_runs (
  name text primary key,
  last_run_at timestamptz,
  last_ok boolean,
  last_error text
);
