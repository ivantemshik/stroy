import postgres from 'postgres';
import {config} from './env.js';

let client;

// Один пул на экземпляр функции. Neon отдаёт адрес пулера (PgBouncer),
// поэтому подготовленные запросы выключены.
export function db() {
  if (!config.databaseUrl) throw new Error('Не задан DATABASE_URL');
  if (!client) {
    client = postgres(config.databaseUrl, {
      ssl: config.databaseUrl.includes('localhost') ? false : 'require',
      max: 6,
      idle_timeout: 20,
      connect_timeout: 10,
      prepare: false,
      transform: {undefined: null},
      onnotice: () => {}
    });
  }
  return client;
}

export async function closeDb() {
  if (client) await client.end({timeout: 5});
  client = undefined;
}
