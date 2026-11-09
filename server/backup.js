// Резервные копии базы: JSON всех таблиц, сжатие и шифрование AES-256-GCM ключом BACKUP_KEY.
// Копия раз в сутки уходит владельцу в админ-бот. Восстановление: scripts/restore-backup.mjs
import {createCipheriv, createDecipheriv, createHash, randomBytes} from 'node:crypto';
import {gzipSync, gunzipSync} from 'fflate';
import {db} from './db.js';
import {config} from './env.js';
import {sendDocument} from './telegram.js';
import {requireUser} from './auth.js';
import {audit} from './security.js';
import {HttpError} from './http.js';

export const BACKUP_TABLES = ['roles', 'users', 'conversations', 'leads', 'lead_events', 'messages', 'conversation_insights', 'kb_articles',
  'content_blocks', 'settings', 'audit_log', 'offline_conversions', 'reports'];
const MAGIC = Buffer.from('DMB1');

const keyFrom = secret => createHash('sha256').update(String(secret)).digest();

export function encrypt(buffer, secret = config.backupKey) {
  if (!secret || secret.length < 16) throw new Error('Не задан BACKUP_KEY');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyFrom(secret), iv);
  const body = Buffer.concat([cipher.update(buffer), cipher.final()]);
  return Buffer.concat([MAGIC, iv, cipher.getAuthTag(), body]);
}

export function decrypt(buffer, secret = config.backupKey) {
  if (!buffer.subarray(0, 4).equals(MAGIC)) throw new Error('Это не резервная копия «Дом Мира»');
  const iv = buffer.subarray(4, 16);
  const tag = buffer.subarray(16, 32);
  const decipher = createDecipheriv('aes-256-gcm', keyFrom(secret), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(buffer.subarray(32)), decipher.final()]);
}

export async function createBackup() {
  const sql = db();
  const tables = {};
  const counts = {};
  for (const table of BACKUP_TABLES) {
    const rows = await sql`select * from ${sql(table)}`;
    tables[table] = rows;
    counts[table] = rows.length;
  }
  const payload = Buffer.from(JSON.stringify({format: 'dom-mira-backup', version: 1, created_at: new Date().toISOString(), tables}));
  const bytes = encrypt(Buffer.from(gzipSync(payload, {level: 9})));
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  return {filename: `dom-mira-backup-${stamp}.dmb`, bytes, counts};
}

export function readBackup(bytes, secret) {
  return JSON.parse(Buffer.from(gunzipSync(decrypt(bytes, secret))).toString('utf8'));
}

export async function sendBackupToOwners() {
  const owners = await db()`select u.tg_chat_id from users u join roles r on r.id = u.role_id
    where u.is_active and u.tg_chat_id is not null and 'backup.download' = any(r.permissions)`;
  if (!owners.length) return {skipped: 'нет владельцев с привязанным Telegram'};
  const {filename, bytes, counts} = await createBackup();
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  for (const owner of owners) {
    await sendDocument(config.telegram.adminToken, String(owner.tg_chat_id), {
      filename, data: bytes,
      caption: `Резервная копия базы: ${total} записей, заявок ${counts.leads}. Файл зашифрован ключом BACKUP_KEY.`
    });
  }
  return {sent: owners.length, counts};
}

export async function backupDownloadRoute({request}) {
  const user = await requireUser(request, 'backup.download');
  if (!config.backupKey) throw new HttpError(500, 'Не задан ключ шифрования резервных копий');
  const {filename, bytes} = await createBackup();
  await audit({userId: user.id, action: 'backup_download'});
  return new Response(bytes, {headers: {'content-type': 'application/octet-stream', 'content-disposition': `attachment; filename="${filename}"`, 'cache-control': 'no-store'}});
}
