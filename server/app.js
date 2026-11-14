// Маршруты API. Одна функция Vercel (api/[...path].js) обслуживает все адреса /api/*.
import {HttpError, json, allowedOrigin} from './http.js';
import {challengeRoute} from './antispam.js';
import {submitLead} from './leads-public.js';
import {login, logout, me, changePassword} from './auth.js';
import {listLeads, getLeadRoute, updateLeadRoute, addLeadEventRoute, deleteLeadRoute, createLeadRoute, listConversations, getConversation, replyConversation, setHumanMode} from './admin-leads.js';
import {statsRoute} from './stats.js';
import {exportLeadsXlsx, exportStatsXlsx, leadsFeed, reportsFeed, feedInfo, rotateFeedToken} from './exports.js';
import {listUsers, createUser, updateUser, updateRole, createRole, telegramLinkCode, groupBindCode, getSettings, saveSettings, testCrm, publicContent, adminContent, saveContent, listKb, saveKb, deleteKb, listAudit} from './admin-misc.js';
import {clientWebhook} from './client-bot.js';
import {adminWebhook} from './admin-bot.js';
import {tickRoute, dailyRoute} from './cron.js';
import {systemRoute, aiTestRoute, reportNowRoute, metrikaCsvRoute, publicConfig, health} from './system.js';
import {backupDownloadRoute} from './backup.js';

const routes = [];
const add = (method, path, handler) => {
  const keys = [];
  const pattern = new RegExp(`^${path.replace(/[.]/g, '\\.').replace(/:(\w+)/g, (_, key) => { keys.push(key); return '([^/]+)'; })}$`);
  routes.push({method, pattern, keys, handler});
};

add('GET', '/api/health', health);
add('GET', '/api/config', publicConfig);
add('GET', '/api/challenge', challengeRoute);
add('POST', '/api/leads', submitLead);
add('GET', '/api/content', publicContent);
add('POST', '/api/tg/client', clientWebhook);
add('POST', '/api/tg/admin', adminWebhook);
add('GET', '/api/feeds/leads.csv', leadsFeed);
add('GET', '/api/feeds/reports.csv', reportsFeed);
add('GET', '/api/cron/tick', tickRoute);
add('POST', '/api/cron/tick', tickRoute);
add('GET', '/api/cron/daily', dailyRoute);

add('POST', '/api/admin/login', login);
add('POST', '/api/admin/logout', logout);
add('GET', '/api/admin/me', me);
add('POST', '/api/admin/password', changePassword);
add('GET', '/api/admin/leads', listLeads);
add('POST', '/api/admin/leads', createLeadRoute);
add('GET', '/api/admin/leads/:id', getLeadRoute);
add('PATCH', '/api/admin/leads/:id', updateLeadRoute);
add('DELETE', '/api/admin/leads/:id', deleteLeadRoute);
add('POST', '/api/admin/leads/:id/events', addLeadEventRoute);
add('GET', '/api/admin/conversations', listConversations);
add('GET', '/api/admin/conversations/:id', getConversation);
add('POST', '/api/admin/conversations/:id/reply', replyConversation);
add('POST', '/api/admin/conversations/:id/human', setHumanMode);
add('GET', '/api/admin/stats', statsRoute);
add('GET', '/api/admin/export/leads.xlsx', exportLeadsXlsx);
add('GET', '/api/admin/export/stats.xlsx', exportStatsXlsx);
add('GET', '/api/admin/feeds', feedInfo);
add('POST', '/api/admin/feeds', rotateFeedToken);
add('GET', '/api/admin/users', listUsers);
add('POST', '/api/admin/users', createUser);
add('PATCH', '/api/admin/users/:id', updateUser);
add('POST', '/api/admin/roles', createRole);
add('PATCH', '/api/admin/roles/:id', updateRole);
add('POST', '/api/admin/telegram-link', telegramLinkCode);
add('POST', '/api/admin/group-code', groupBindCode);
add('GET', '/api/admin/settings', getSettings);
add('PUT', '/api/admin/settings', saveSettings);
add('POST', '/api/admin/crm-test', testCrm);
add('GET', '/api/admin/content', adminContent);
add('PUT', '/api/admin/content', saveContent);
add('GET', '/api/admin/kb', listKb);
add('POST', '/api/admin/kb', saveKb);
add('PUT', '/api/admin/kb/:id', saveKb);
add('DELETE', '/api/admin/kb/:id', deleteKb);
add('GET', '/api/admin/audit', listAudit);
add('GET', '/api/admin/system', systemRoute);
add('POST', '/api/admin/ai-test', aiTestRoute);
add('POST', '/api/admin/report-now', reportNowRoute);
add('GET', '/api/admin/metrika.csv', metrikaCsvRoute);
add('GET', '/api/admin/backup', backupDownloadRoute);

// Открытые адреса, к которым обращается сам сайт. Только им разрешены запросы с адресов из SITE_ORIGINS,
// админка и вебхуки работают лишь со своего домена.
const SITE_PATHS = new Set(['/api/challenge', '/api/leads', '/api/content', '/api/config']);

export async function handle(request) {
  const url = new URL(request.url);
  // На Vercel все адреса /api/* переписываются на /api/handler?__path=..., восстанавливаем исходный путь.
  const forced = url.searchParams.get('__path');
  if (forced !== null) {
    url.pathname = `/api/${forced}`;
    url.searchParams.delete('__path');
  }
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const cors = SITE_PATHS.has(path) ? allowedOrigin(request) : null;
  if (request.method === 'OPTIONS') {
    const headers = cors ? {'access-control-allow-origin': cors, 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': 'content-type', 'access-control-max-age': '600', vary: 'Origin'} : {};
    return new Response(null, {status: cors ? 204 : 403, headers});
  }
  const response = await dispatch(request, url, path);
  if (cors) {
    response.headers.set('access-control-allow-origin', cors);
    response.headers.append('vary', 'Origin');
  }
  return response;
}

async function dispatch(request, url, path) {
  try {
    let methodMismatch = false;
    for (const route of routes) {
      const match = route.pattern.exec(path);
      if (!match) continue;
      if (route.method !== request.method && !(route.method === 'GET' && request.method === 'HEAD')) { methodMismatch = true; continue; }
      const params = Object.fromEntries(route.keys.map((key, i) => [key, decodeURIComponent(match[i + 1])]));
      return await route.handler({request, url, params});
    }
    if (methodMismatch) throw new HttpError(405, 'Метод не поддерживается');
    throw new HttpError(404, 'Не найдено');
  } catch (error) {
    if (error instanceof HttpError) return json({error: error.message, ...(error.extra || {})}, error.status);
    console.error('API error', request.method, path, error);
    return json({error: 'Внутренняя ошибка сервера'}, 500);
  }
}
