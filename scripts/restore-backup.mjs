// Расшифровка и восстановление резервной копии (файл .dmb из админ-бота или админки).
// Проверка без изменений:   node scripts/restore-backup.mjs путь/к/файлу.dmb
// Сохранить в JSON:          node scripts/restore-backup.mjs файл.dmb --json=backup.json
// Восстановить в пустую базу: node scripts/restore-backup.mjs файл.dmb --apply   (нужен DATABASE_URL новой базы)
import './load-env.mjs';
import {readFileSync, writeFileSync} from 'node:fs';
import {readBackup, BACKUP_TABLES} from '../server/backup.js';

const [file, ...flags] = process.argv.slice(2);
if (!file) throw new Error('Укажите файл резервной копии');
const args = Object.fromEntries(flags.map(f => f.replace(/^--/, '').split('=')));
const data = readBackup(readFileSync(file), args.key || process.env.BACKUP_KEY);
console.log(`Копия от ${data.created_at}`);
for (const table of BACKUP_TABLES) console.log(`  ${table}: ${data.tables[table]?.length ?? 0}`);

if (args.json) {
  writeFileSync(args.json, JSON.stringify(data, null, 1));
  console.log(`Сохранено в ${args.json}. В файле персональные данные: храните его защищённо и удалите после работы.`);
}

if ('apply' in args) {
  const {db, closeDb} = await import('../server/db.js');
  const sql = db();
  const [{count}] = await sql`select count(*)::int as count from leads`;
  if (count > 0 && !('force' in args)) throw new Error('В базе уже есть заявки. Восстанавливайте в пустую базу после npm run db:migrate или добавьте --force');
  const SERIAL = new Set(['roles', 'users', 'conversations', 'leads', 'lead_events', 'messages', 'kb_articles', 'audit_log', 'offline_conversions', 'reports']);
  await sql.begin(async tx => {
    for (const table of [...BACKUP_TABLES].reverse()) await tx`delete from ${tx(table)}`;
    const leadLinks = [];
    for (const table of BACKUP_TABLES) {
      for (const source of data.tables[table] || []) {
        const row = {...source};
        // Диалоги ссылаются на заявки, а заявки на диалоги: связь восстанавливаем после вставки заявок.
        if (table === 'conversations' && row.lead_id) { leadLinks.push([row.id, row.lead_id]); row.lead_id = null; }
        for (const [key, value] of Object.entries(row)) if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) row[key] = tx.json(value);
        await tx`insert into ${tx(table)} ${tx(row)}`;
      }
      if (SERIAL.has(table)) await tx`select setval(pg_get_serial_sequence(${table}, 'id'), coalesce((select max(id) from ${tx(table)}), 1))`;
    }
    for (const [conversationId, leadId] of leadLinks) await tx`update conversations set lead_id = ${leadId} where id = ${conversationId}`;
  });
  console.log('Восстановлено');
  await closeDb();
}
