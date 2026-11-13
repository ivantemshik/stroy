import postgres from 'postgres';
import {config} from './env.js';

let client;

// Локальная база без шифрования определяется по имени хоста, а не по подстроке в адресе.
function isLocalHost(url) {
  try {
    const host = new URL(url).hostname;
    return ['localhost', '127.0.0.1', '::1', '[::1]'].includes(host);
  } catch {
    return false;
  }
}

// Один пул на экземпляр функции. Neon отдаёт адрес пулера (PgBouncer),
// поэтому подготовленные запросы выключены. Для удалённой базы шифрование с проверкой
// сертификата и имени сервера (verify-full): подменить базу по дороге не получится.
export function db() {
  if (!config.databaseUrl) throw new Error('Не задан DATABASE_URL');
  if (!client) {
    client = postgres(config.databaseUrl, {
      ssl: isLocalHost(config.databaseUrl) ? false : 'verify-full',
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
