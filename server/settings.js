import {db} from './db.js';
import {DEFAULT_REJECT_REASONS} from './permissions.js';

export const DEFAULT_SETTINGS = {
  'notify.admin_chat_id': null,
  'notify.reminder_minutes': 15,
  'notify.escalate_minutes': 120,
  'notify.working_hours': {from: 9, to: 21},
  'leads.reject_reasons': DEFAULT_REJECT_REASONS,
  'leads.duplicate_window_minutes': 30,
  'ai.enabled': true,
  'ai.providers': [
    {provider: 'yandex', model: 'aliceai-llm', enabled: true},
    {provider: 'yandex', model: 'aliceai-llm-flash', enabled: true},
    {provider: 'groq', model: 'openai/gpt-oss-120b', enabled: true},
    {provider: 'openrouter', model: 'nvidia/nemotron-3-ultra-550b-a55b:free', enabled: true},
    {provider: 'openrouter', model: 'google/gemma-4-31b-it:free', enabled: true}
  ],
  'ai.temperature': 0.4,
  'ai.max_messages_per_day': 80,
  'ai.human_timeout_hours': 12,
  'ai.greeting': 'Здравствуйте! Я консультант компании «Дом Мира». Подскажу по строительству дома, отделке и проектированию, сориентирую по ценам и срокам. Что планируете?',
  'ai.extra_instructions': '',
  'crm.enabled': false,
  'crm.type': 'generic',
  'crm.webhook_url': '',
  'reports.weekly_enabled': true,
  'metrika.offline_enabled': true
};

let cache = {at: 0, values: null};

export async function allSettings({fresh = false} = {}) {
  if (!fresh && cache.values && Date.now() - cache.at < 15000) return cache.values;
  const rows = await db()`select key, value from settings`;
  const values = {...DEFAULT_SETTINGS};
  for (const row of rows) values[row.key] = row.value;
  cache = {at: Date.now(), values};
  return values;
}

export async function getSetting(key) {
  const values = await allSettings();
  return values[key] ?? DEFAULT_SETTINGS[key] ?? null;
}

export async function setSetting(key, value, userId = null) {
  await db()`insert into settings (key, value, updated_by) values (${key}, ${db().json(value)}, ${userId})
    on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = excluded.updated_by`;
  cache = {at: 0, values: null};
}
