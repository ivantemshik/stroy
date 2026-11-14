// Минимальный клиент Telegram Bot API без сторонних библиотек.

export class TelegramError extends Error {
  constructor(method, description, code) {
    super(`Telegram ${method}: ${description}`);
    this.code = code;
    this.description = description;
  }
}

export async function tg(token, method, payload = {}) {
  if (!token) throw new TelegramError(method, 'не задан токен бота', 0);
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15000)
  });
  const data = await response.json().catch(() => ({ok: false, description: `HTTP ${response.status}`}));
  if (!data.ok) throw new TelegramError(method, data.description || 'неизвестная ошибка', data.error_code);
  return data.result;
}

export async function sendDocument(token, chatId, {filename, data, mime = 'application/octet-stream', caption, parseMode = 'HTML'}) {
  const form = new FormData();
  form.append('chat_id', String(chatId));
  if (caption) {
    form.append('caption', caption.slice(0, 1024));
    form.append('parse_mode', parseMode);
  }
  form.append('document', new Blob([data], {type: mime}), filename);
  const response = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, {method: 'POST', body: form, signal: AbortSignal.timeout(30000)});
  const result = await response.json().catch(() => ({ok: false, description: `HTTP ${response.status}`}));
  if (!result.ok) throw new TelegramError('sendDocument', result.description, result.error_code);
  return result.result;
}

export const esc = value => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');

// Telegram ограничивает сообщение 4096 символами.
export function clip(text, max = 3900) {
  const value = String(text ?? '');
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}
