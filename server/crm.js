// Передача заявок во внешнюю CRM: обычный вебхук (JSON) или входящий вебхук Битрикс24.
import {db} from './db.js';
import {allSettings} from './settings.js';
import {serviceLabel} from './permissions.js';
import {formatPhone} from './validate.js';
import {leadUrl} from './notify.js';

function payloadFor(lead) {
  return {
    id: lead.id,
    created_at: lead.created_at,
    channel: lead.channel,
    service: lead.service,
    service_label: serviceLabel(lead.service),
    name: lead.name,
    phone: lead.phone,
    email: lead.email,
    telegram: lead.tg_username,
    message: lead.message,
    details: lead.details,
    page: lead.page,
    form: lead.form,
    utm: {source: lead.utm_source, medium: lead.utm_medium, campaign: lead.utm_campaign, content: lead.utm_content, term: lead.utm_term},
    ym_client_id: lead.ym_client_id,
    admin_url: leadUrl(lead.id)
  };
}

function bitrixPayload(lead) {
  const comments = [lead.message, ...Object.entries(lead.details || {}).map(([k, v]) => `${k}: ${v}`), `Админка: ${leadUrl(lead.id)}`]
    .filter(Boolean).join('\n');
  return {
    fields: {
      TITLE: `Заявка №${lead.id}: ${serviceLabel(lead.service)}`,
      NAME: lead.name || 'Без имени',
      PHONE: lead.phone ? [{VALUE: formatPhone(lead.phone), VALUE_TYPE: 'WORK'}] : undefined,
      EMAIL: lead.email ? [{VALUE: lead.email, VALUE_TYPE: 'WORK'}] : undefined,
      COMMENTS: comments,
      SOURCE_ID: lead.channel === 'telegram_bot' ? 'OTHER' : 'WEB',
      UTM_SOURCE: lead.utm_source || undefined,
      UTM_MEDIUM: lead.utm_medium || undefined,
      UTM_CAMPAIGN: lead.utm_campaign || undefined,
      UTM_CONTENT: lead.utm_content || undefined,
      UTM_TERM: lead.utm_term || undefined
    },
    params: {REGISTER_SONET_EVENT: 'Y'}
  };
}

// Заявки с контактами уходят только на утверждённые адреса: Битрикс24, amoCRM/Kommo и хосты из
// переменной CRM_ALLOWED_HOSTS (через запятую, можно *.domain.ru). Только https, без внутренних адресов.
const DEFAULT_CRM_HOSTS = ['*.bitrix24.ru', '*.bitrix24.com', '*.bitrix24.kz', '*.bitrix24.by', '*.bitrix24.ua', '*.bitrix24.de', '*.bitrix24.eu',
  '*.amocrm.ru', '*.amocrm.com', '*.kommo.com'];

const hostMatches = (host, rule) => rule.startsWith('*.') ? host.endsWith(rule.slice(1)) && host.length > rule.length - 1 : host === rule;

export function crmUrlProblem(value) {
  let url;
  try { url = new URL(String(value || '')); } catch { return 'Неверный адрес CRM'; }
  if (url.protocol !== 'https:') return 'Адрес CRM должен начинаться с https://';
  const host = url.hostname.toLowerCase();
  if (/^(localhost|.*\.local|.*\.internal)$/.test(host) || /^[\d.]+$/.test(host) || host.includes(':')) return 'Внутренние адреса и IP для CRM запрещены';
  const extra = String(process.env.CRM_ALLOWED_HOSTS || '').split(',').map(h => h.trim().toLowerCase()).filter(Boolean);
  if (![...DEFAULT_CRM_HOSTS, ...extra].some(rule => hostMatches(host, rule))) {
    return `Адрес ${host} не в списке разрешённых CRM. Добавьте его в переменную CRM_ALLOWED_HOSTS в настройках хостинга`;
  }
  return null;
}

export async function pushToCrm(lead, {force = false} = {}) {
  const settings = await allSettings();
  if (!force && !settings['crm.enabled']) return {skipped: true};
  const url = String(settings['crm.webhook_url'] || '');
  if (!url) return {skipped: true};
  const problem = crmUrlProblem(url);
  if (problem) {
    if (lead.id) await db()`update leads set crm_status = 'failed', crm_error = 'адрес CRM не разрешён' where id = ${lead.id}`;
    return {status: 'failed', error: problem};
  }
  const isBitrix = settings['crm.type'] === 'bitrix24';
  const target = isBitrix ? `${url.replace(/\/$/, '')}/crm.lead.add.json` : url;
  let status = 'sent';
  let error = null;
  try {
    const response = await fetch(target, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify(isBitrix ? bitrixPayload(lead) : payloadFor(lead)),
      // Переадресацию не выполняем: данные клиента не должны уйти на другой адрес.
      redirect: 'manual',
      signal: AbortSignal.timeout(10000)
    });
    if (response.type === 'opaqueredirect' || (response.status >= 300 && response.status < 400)) throw Object.assign(new Error(), {code: 'переадресация запрещена'});
    if (!response.ok) throw Object.assign(new Error(), {code: `HTTP ${response.status}`});
  } catch (err) {
    // В журнал и уведомления идёт только код ошибки: без адреса вебхука, контактов и ответа CRM.
    status = 'failed';
    error = err.code || (err.name === 'TimeoutError' || err.name === 'AbortError' ? 'нет ответа за 10 секунд' : 'ошибка сети');
  }
  if (lead.id) await db()`update leads set crm_status = ${status}, crm_error = ${error} where id = ${lead.id}`;
  return {status, error};
}
