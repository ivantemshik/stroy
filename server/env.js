// Все настройки сервера берутся из переменных окружения.
// Секреты задаются в Vercel (Settings → Environment Variables) и в локальном .env.local.

const env = process.env;

export const config = {
  siteUrl: (env.SITE_URL || 'http://127.0.0.1:5173').replace(/\/$/, ''),
  databaseUrl: env.DATABASE_URL || '',
  sessionSecret: env.SESSION_SECRET || '',
  powSecret: env.POW_SECRET || env.SESSION_SECRET || '',
  ipHashSalt: env.IP_HASH_SALT || env.SESSION_SECRET || '',
  cronSecret: env.CRON_SECRET || '',
  backupKey: env.BACKUP_KEY || '',
  isProduction: env.VERCEL_ENV === 'production',
  telegram: {
    adminToken: env.TG_ADMIN_BOT_TOKEN || '',
    adminUsername: env.TG_ADMIN_BOT_USERNAME || '',
    clientToken: env.TG_CLIENT_BOT_TOKEN || '',
    clientUsername: env.TG_CLIENT_BOT_USERNAME || '',
    webhookSecret: env.TG_WEBHOOK_SECRET || ''
  },
  ai: {
    openrouterKey: env.OPENROUTER_API_KEY || '',
    groqKey: env.GROQ_API_KEY || '',
    cerebrasKey: env.CEREBRAS_API_KEY || '',
    geminiKey: env.GEMINI_API_KEY || '',
    mistralKey: env.MISTRAL_API_KEY || '',
    yandexKey: env.YANDEX_API_KEY || '',
    yandexFolder: env.YANDEX_FOLDER_ID || ''
  },
  metrika: {
    counterId: env.YM_COUNTER_ID || env.VITE_YM_ID || '',
    token: env.YANDEX_METRIKA_TOKEN || ''
  }
};

export function requireSecret(name, value) {
  if (!value || value.length < 16) throw new Error(`Не задан секрет ${name}`);
  return value;
}
