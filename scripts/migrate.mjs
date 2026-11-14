// Применяет SQL миграции из db/migrations по порядку. Запуск: npm run db:migrate
import './load-env.mjs';
import {readdirSync, readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {db, closeDb} from '../server/db.js';

const dir = fileURLToPath(new URL('../db/migrations/', import.meta.url));
const sql = db();

try {
  await sql`create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())`;
  const applied = new Set((await sql`select name from schema_migrations`).map(row => row.name));
  const files = readdirSync(dir).filter(name => name.endsWith('.sql')).sort();
  for (const name of files) {
    if (applied.has(name)) continue;
    const body = readFileSync(dir + name, 'utf8');
    await sql.begin(async tx => {
      await tx.unsafe(body);
      await tx`insert into schema_migrations (name) values (${name})`;
    });
    console.log(`Применена миграция ${name}`);
  }
  console.log('База в актуальном состоянии');
} finally {
  await closeDb();
}
