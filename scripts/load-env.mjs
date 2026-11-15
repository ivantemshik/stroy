// Загружает .env.local для локальных скриптов (миграции, настройка вебхуков).
import {readFileSync, existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const file = fileURLToPath(new URL('../.env.local', import.meta.url));
if (existsSync(file)) {
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1]] !== undefined) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    process.env[match[1]] = value;
  }
}
