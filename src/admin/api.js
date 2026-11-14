// Запросы админки к API. Изменяющие запросы несут служебный заголовок (защита от CSRF).

export class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

let onUnauthorized = () => {};
export function setUnauthorizedHandler(fn) { onUnauthorized = fn; }

export async function api(path, {method = 'GET', body, raw = false} = {}) {
  const response = await fetch(`/api/admin${path}`, {
    method,
    credentials: 'same-origin',
    headers: {
      'x-requested-with': 'dm-admin',
      ...(body !== undefined ? {'content-type': 'application/json'} : {})
    },
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  if (raw) {
    if (!response.ok) throw new ApiError('Не удалось скачать файл', response.status);
    return response;
  }
  const data = await response.json().catch(() => ({}));
  if (response.status === 401 && path !== '/login') onUnauthorized();
  if (!response.ok) throw new ApiError(data.error || `Ошибка ${response.status}`, response.status, data);
  return data;
}

export async function download(path, filename) {
  const response = await api(path, {raw: true});
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export const qs = params => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== null && value !== '') search.set(key, value);
  const text = search.toString();
  return text ? `?${text}` : '';
};

export const fmtDate = value => value ? new Date(value).toLocaleString('ru-RU', {day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow'}) : '';
export const fmtDay = value => value ? new Date(value).toLocaleDateString('ru-RU', {day: 'numeric', month: 'short', timeZone: 'Europe/Moscow'}) : '';
export const fmtPhone = phone => {
  const m = /^\+7(\d{3})(\d{3})(\d{2})(\d{2})$/.exec(phone || '');
  return m ? `+7 (${m[1]}) ${m[2]}-${m[3]}-${m[4]}` : phone || '';
};
export const rub = value => new Intl.NumberFormat('ru-RU').format(Math.round(Number(value) || 0));
export const minutes = value => {
  if (value === null || value === undefined) return 'нет данных';
  const m = Math.round(value);
  if (m < 60) return `${m} мин`;
  const h = Math.floor(m / 60);
  return h < 48 ? `${h} ч ${m % 60} мин` : `${Math.round(h / 24)} дн`;
};
export const pct = value => `${Math.round((Number(value) || 0) * 100)}%`;
