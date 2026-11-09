// Единая серверная функция Vercel для всех адресов /api/* (см. rewrites в vercel.json). Маршруты в server/app.js.
import {handle} from '../server/app.js';

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
export const HEAD = handle;
