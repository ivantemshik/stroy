// Единая серверная функция Vercel для всех адресов /api/* (см. rewrites в vercel.json). Маршруты в server/app.js.
// OPTIONS нужен для предзапроса браузера: копия сайта на доммира.рф отправляет формы сюда (SITE_ORIGINS).
import {handle} from '../server/app.js';

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
export const HEAD = handle;
export const OPTIONS = handle;
