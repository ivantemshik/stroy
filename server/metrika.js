// Офлайн конверсии в Яндекс Метрику: очередь из статусов заявок и загрузка через API.
import {db} from './db.js';
import {config} from './env.js';
import {getSetting} from './settings.js';

const STATUS_TARGETS = {qualified: 'lead_qualified', meeting: 'meeting', contract: 'contract'};

export async function enqueueConversion(lead, target, {price = null} = {}) {
  if (!lead?.ym_client_id && !lead?.yclid) return false;
  if (!await getSetting('metrika.offline_enabled')) return false;
  await db()`insert into offline_conversions (lead_id, target, client_id, yclid, happened_at, price)
    values (${lead.id}, ${target}, ${lead.ym_client_id}, ${lead.yclid}, now(), ${price})
    on conflict (lead_id, target) do nothing`;
  return true;
}

export async function enqueueForStatus(lead) {
  const target = STATUS_TARGETS[lead.status];
  if (!target) return false;
  return enqueueConversion(lead, target, {price: lead.status === 'contract' ? lead.contract_amount : null});
}

function csvFor(rows, idField) {
  const header = idField === 'yclid' ? 'Yclid,Target,DateTime,Price,Currency' : 'ClientId,Target,DateTime,Price,Currency';
  const lines = rows.map(row => [
    idField === 'yclid' ? row.yclid : row.client_id,
    row.target,
    Math.floor(new Date(row.happened_at).getTime() / 1000),
    row.price ?? '',
    row.price ? 'RUB' : ''
  ].join(','));
  return [header, ...lines].join('\n');
}

export async function pendingConversionsCsv() {
  const rows = await db()`select * from offline_conversions where uploaded_at is null and client_id is not null order by id`;
  return csvFor(rows, 'client_id');
}

export async function uploadConversions() {
  const {counterId, token} = config.metrika;
  if (!counterId || !token) return {skipped: 'нет счётчика или токена Метрики'};
  const sql = db();
  const result = {uploaded: 0, errors: []};
  for (const kind of ['client_id', 'yclid']) {
    const rows = kind === 'client_id'
      ? await sql`select * from offline_conversions where uploaded_at is null and client_id is not null order by id limit 500`
      : await sql`select * from offline_conversions where uploaded_at is null and client_id is null and yclid is not null order by id limit 500`;
    if (!rows.length) continue;
    const form = new FormData();
    form.append('file', new Blob([csvFor(rows, kind)], {type: 'text/csv'}), 'conversions.csv');
    const type = kind === 'yclid' ? 'YCLID' : 'CLIENT_ID';
    try {
      const response = await fetch(`https://api-metrika.yandex.net/management/v1/counter/${counterId}/offline_conversions/upload?client_id_type=${type}`, {
        method: 'POST', headers: {Authorization: `OAuth ${token}`}, body: form, signal: AbortSignal.timeout(20000)
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
      const ids = rows.map(row => row.id);
      await sql`update offline_conversions set uploaded_at = now(), error = null where id = any(${ids})`;
      result.uploaded += rows.length;
    } catch (error) {
      const ids = rows.map(row => row.id);
      await sql`update offline_conversions set error = ${error.message} where id = any(${ids})`;
      result.errors.push(error.message);
    }
  }
  return result;
}
