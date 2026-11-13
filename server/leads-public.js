// Приём заявок с форм сайта: POST /api/leads
import {waitUntil} from '@vercel/functions';
import {HttpError, json, readJson, clientIp, hashIp, assertSameOrigin} from './http.js';
import {verifyChallenge, honeypotTriggered, tooFast} from './antispam.js';
import {rateLimited} from './security.js';
import {cleanText, cleanLine, normalizePhone, normalizeEmail, normalizeTelegram, normalizeService, normalizeContactPref, cleanDetails, cleanAttribution, deviceFromUa, spamScore} from './validate.js';
import {insertLead, findRecentDuplicate, addEvent} from './lead-core.js';
import {notifyNewLead, alertError, formatLead} from './notify.js';
import {pushToCrm} from './crm.js';
import {config} from './env.js';
import {tg} from './telegram.js';
import {getSetting} from './settings.js';
import {runTick} from './cron.js';

export const CONSENT_VERSION = '2026-11-13';

function inBackground(promise) {
  try { waitUntil(promise); } catch { /* локальный сервер: промис и так завершится */ }
  return promise.catch(error => console.error('background task', error));
}

export async function submitLead({request}) {
  assertSameOrigin(request);
  const body = await readJson(request, 32 * 1024);
  const ip = clientIp(request);
  const ipHash = hashIp(ip);

  if (honeypotTriggered(body)) return json({ok: true});

  const powError = await verifyChallenge(body.pow);
  if (powError) throw new HttpError(400, 'Проверка формы не пройдена, отправьте ещё раз', {code: 'challenge', reason: powError});

  if (await rateLimited(`lead:${ipHash}`, {limit: 6, windowSeconds: 600})) {
    throw new HttpError(429, 'Слишком много заявок подряд. Напишите нам на почту или в Telegram');
  }

  const phone = normalizePhone(body.phone);
  const email = normalizeEmail(body.email);
  const tgUsername = normalizeTelegram(body.telegram);
  const errors = {};
  if (phone === null) errors.phone = 'Проверьте номер телефона';
  if (email === null) errors.email = 'Проверьте адрес почты';
  if (tgUsername === null) errors.telegram = 'Проверьте имя в Telegram';
  if (!phone && !email && !tgUsername && !errors.phone) errors.phone = 'Оставьте телефон, чтобы мы могли связаться';
  if (body.consent !== true) errors.consent = 'Нужно согласие на обработку персональных данных';
  const name = cleanLine(body.name, 80);
  const message = cleanText(body.message, 2000);
  if (Object.keys(errors).length) throw new HttpError(422, 'Проверьте поля формы', {errors});

  const attribution = cleanAttribution(body.attribution || {});
  const userAgent = (request.headers.get('user-agent') || '').slice(0, 300);
  const fields = {
    channel: 'site',
    form: cleanLine(body.form, 40) || 'form',
    page: cleanLine(body.page, 200) || null,
    service: normalizeService(body.service),
    name, phone: phone || null, email: email || null, tg_username: tgUsername || null,
    contact_pref: normalizeContactPref(body.contact_pref),
    message: message || null,
    details: cleanDetails(body.details),
    ...attribution,
    ip_hash: ipHash,
    user_agent: userAgent,
    device: deviceFromUa(userAgent),
    consent_at: new Date(),
    consent_version: CONSENT_VERSION,
    consent_channel: 'site_form',
    // Ключ одной отправки формы: повтор той же отправки не создаёт вторую заявку.
    submission_key: /^[A-Za-z0-9-]{16,64}$/.test(String(body.submission_key || '')) ? String(body.submission_key) : null,
    is_test: body.test === true && !config.isProduction
  };

  const suspicious = tooFast(body) || spamScore({name, message}) >= 4;
  if (suspicious) {
    fields.status = 'spam';
    fields.delivery_status = 'skipped';
  }

  // Ответ форме всегда одинаковый и без номера заявки: по нему нельзя узнать, оставлял ли кто-то
  // заявку с этим телефоном или почтой. Новое обращение с тем же контактом не дописывается в чужую
  // заявку, а становится отдельной заявкой с пометкой «возможный повтор», связь проверяет менеджер.
  let lead;
  let previousId = null;
  try {
    previousId = suspicious ? null : await findRecentDuplicate({phone: fields.phone, email: fields.email});
    if (previousId) fields.details = {...fields.details, repeat_of: `№${previousId}`};
    lead = await insertLead(fields);
    if (lead.existed) return json({ok: true});
    if (previousId) {
      await addEvent(lead.id, 'repeat', {text: `Возможный повтор заявки №${previousId}: тот же телефон или почта. Проверьте и при необходимости закройте одну из заявок.`, data: {possible_duplicate_of: previousId}});
    }
  } catch (error) {
    // База недоступна: заявка всё равно уходит в Telegram, чтобы не потерять клиента.
    console.error('lead insert failed', error);
    const chat = await getSetting('notify.admin_chat_id').catch(() => null);
    const fallback = {...fields, id: 'без номера', created_at: new Date()};
    if (chat && !suspicious) {
      try {
        await tg(config.telegram.adminToken, 'sendMessage', {chat_id: String(chat), parse_mode: 'HTML', text: `${formatLead(fallback, {title: 'Заявка (база недоступна, сохраните вручную)'})}`});
        inBackground(alertError('База данных', `Заявка не сохранена в базу: ${error.message}`));
        return json({ok: true});
      } catch { /* падаем ниже */ }
    }
    throw new HttpError(503, 'Не получилось отправить заявку. Напишите нам на почту или в Telegram');
  }

  if (!suspicious) {
    inBackground((async () => {
      const result = await notifyNewLead(lead);
      if (!result.sent) await alertError('Доставка заявок', `Заявка №${lead.id} не ушла в Telegram: ${result.errors.join('; ')}`);
      await pushToCrm(lead);
      await runTick().catch(() => {});
    })());
  }
  return json({ok: true});
}
