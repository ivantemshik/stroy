// Адрес сервера заявок. На Vercel переменная пустая, запросы идут на тот же сайт.
// Копия сайта на хостинге Beget (доммира.рф) собирается с VITE_API_BASE=https://dom-mira.vercel.app,
// а сервер разрешает ей запросы через переменную SITE_ORIGINS (server/env.js).
const base = (import.meta.env.VITE_API_BASE || '').replace(/\/+$/, '');

export const api = path => `${base}${path}`;
