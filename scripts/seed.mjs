// Начальные данные: роли, владелец админки, база знаний ИИ. Повторный запуск ничего не ломает.
// Запуск: npm run db:seed -- --login=owner --name="Имя"
import './load-env.mjs';
import {appendFileSync, readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {db, closeDb} from '../server/db.js';
import {DEFAULT_ROLES} from '../server/permissions.js';
import {KB_DEFAULTS} from '../server/kb-defaults.js';
import {hashPassword, randomToken} from '../server/security.js';

const args = Object.fromEntries(process.argv.slice(2).map(a => a.replace(/^--/, '').split('=')).map(([k, ...v]) => [k, v.join('=')]));
const sql = db();
const envFile = fileURLToPath(new URL('../.env.local', import.meta.url));

try {
  for (const role of DEFAULT_ROLES) {
    await sql`insert into roles (key, name, permissions, is_system) values (${role.key}, ${role.name}, ${role.permissions}, true)
      on conflict (key) do update set permissions = case when roles.key = 'owner' then excluded.permissions else roles.permissions end`;
  }
  console.log('Роли готовы');

  const login = (args.login || 'owner').toLowerCase();
  const [exists] = await sql`select id from users where login = ${login}`;
  if (!exists) {
    const password = `${randomToken(10)}9k`;
    const [owner] = await sql`select id from roles where key = 'owner'`;
    await sql`insert into users (login, name, role_id, password_hash) values (${login}, ${args.name || 'Владелец'}, ${owner.id}, ${await hashPassword(password)})`;
    const current = readFileSync(envFile, 'utf8');
    if (!current.includes(`ADMIN_LOGIN_${login.toUpperCase()}=`)) {
      appendFileSync(envFile, `\n# Первый вход в админку (смените пароль в профиле)\nADMIN_LOGIN_${login.toUpperCase()}=${login}\nADMIN_PASSWORD_${login.toUpperCase()}=${password}\n`);
    }
    console.log(`Создан владелец «${login}». Пароль записан в .env.local`);
  } else {
    console.log(`Пользователь «${login}» уже есть`);
  }

  const [{count}] = await sql`select count(*)::int as count from kb_articles`;
  if (!count) {
    for (const article of KB_DEFAULTS) {
      await sql`insert into kb_articles (title, body, tags, sort, source_note) values (${article.title}, ${article.body}, ${article.tags}, ${article.sort}, ${article.source || null})`;
    }
    console.log(`База знаний: добавлено статей ${KB_DEFAULTS.length}`);
  } else {
    console.log(`База знаний уже заполнена (${count})`);
  }
} finally {
  await closeDb();
}
