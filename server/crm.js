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

export async function pushToCrm(lead, {force = false} = {}) {
  const settings = await allSettings();
  if (!force && !settings['crm.enabled']) return {skipped: true};
  const url = String(settings['crm.webhook_url'] || '');
  if (!/^https:\/\//.test(url)) return {skipped: true};
  const isBitrix = settings['crm.type'] === 'bitrix24';
  const target = isBitrix ? `${url.replace(/\/$/, '')}/crm.lead.add.json` : url;
  let status = 'sent';
  let error = null;
  try {
    const response = await fetch(target, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify(isBitrix ? bitrixPayload(lead) : payloadFor(lead)),
      signal: AbortSignal.timeout(10000)
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
  } catch (err) {
    status = 'failed';
    error = err.message;
  }
  if (lead.id) await db()`update leads set crm_status = ${status}, crm_error = ${error} where id = ${lead.id}`;
  return {status, error};
}
