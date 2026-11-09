import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import {fileURLToPath} from 'node:url';
import {readFileSync, existsSync} from 'node:fs';
import {bakeHtml} from './src/site/content-render.js';
import {CONTENT_DEFAULTS} from './server/content-defaults.js';

const root = fileURLToPath(new URL('.', import.meta.url));

// Локальные секреты для режима разработки и сборки.
if (existsSync(`${root}.env.local`)) {
  for (const line of readFileSync(`${root}.env.local`, 'utf8').split('\n')) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2].replace(/^["']|["']$/g, '');
  }
}

const PAGES = {
  main: 'index.html',
  otdelka: 'otdelka/index.html',
  design: 'proektirovanie/index.html',
  privacy: 'privacy/index.html',
  consent: 'soglasie/index.html',
  cookies: 'cookies/index.html',
  notfound: '404.html',
  admin: 'admin/index.html'
};
const SITEMAP = ['/', '/otdelka/', '/proektirovanie/', '/privacy/', '/soglasie/', '/cookies/'];

const siteUrl = () => (process.env.PUBLIC_SITE_URL || process.env.SITE_URL || 'http://127.0.0.1:5173').replace(/\/$/, '');
const indexable = () => process.env.SITE_INDEXABLE === 'true';

async function loadContent() {
  if (!process.env.DATABASE_URL) return CONTENT_DEFAULTS;
  try {
    const {db, closeDb} = await import('./server/db.js');
    const rows = await db()`select key, value from content_blocks`;
    await closeDb();
    return {...CONTENT_DEFAULTS, ...Object.fromEntries(rows.map(row => [row.key, row.value]))};
  } catch (error) {
    console.warn('Контент из базы не загружен, используются значения по умолчанию:', error.message);
    return CONTENT_DEFAULTS;
  }
}

function sitePlugin() {
  let content = CONTENT_DEFAULTS;
  return {
    name: 'dom-mira-site',
    async buildStart() { content = await loadContent(); },
    transformIndexHtml: {
      order: 'pre',
      handler(html, ctx) {
        let out = html
          .replaceAll('%SITE_URL%', siteUrl())
          .replaceAll('%ROBOTS%', indexable() ? 'index, follow' : 'noindex, nofollow')
          .replaceAll('%YM_ID%', process.env.VITE_YM_ID || process.env.YM_COUNTER_ID || '');
        if (!ctx.filename.includes(`${root}admin`)) out = bakeHtml(out, content);
        if (process.env.GITHUB_PAGES) {
          out = out.replace(/(href|src)="\/(?!\/)/g, '$1="/stroy/').replace(/(srcset|imagesrcset)="([^"]+)"/g, (m, attr, value) =>
            `${attr}="${value.replace(/(^|,\s*)\/(?!\/)/g, '$1/stroy/')}"`);
        }
        return out;
      }
    },
    generateBundle() {
      const base = siteUrl();
      this.emitFile({type: 'asset', fileName: 'robots.txt', source: indexable()
        ? `User-agent: *\nDisallow: /admin/\nDisallow: /api/\n\nUser-agent: Yandex\nDisallow: /admin/\nDisallow: /api/\nClean-param: utm_source&utm_medium&utm_campaign&utm_content&utm_term&yclid&gclid&ysclid&_ym_debug\n\nSitemap: ${base}/sitemap.xml\n`
        : 'User-agent: *\nDisallow: /\n'});
      const today = new Date().toISOString().slice(0, 10);
      this.emitFile({type: 'asset', fileName: 'sitemap.xml', source: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${SITEMAP.map(path =>
        `  <url><loc>${base}${path}</loc><lastmod>${today}</lastmod><priority>${path === '/' ? '1.0' : path.length < 14 ? '0.9' : '0.3'}</priority></url>`).join('\n')}\n</urlset>\n`});
    }
  };
}

// В режиме разработки /api/* обслуживает тот же код, что и функция Vercel.
function devApiPlugin() {
  return {
    name: 'dom-mira-dev-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url.startsWith('/api/')) return next();
        try {
          const {handle} = await server.ssrLoadModule('/server/app.js');
          const chunks = [];
          for await (const chunk of req) chunks.push(chunk);
          const headers = new Headers();
          for (const [key, value] of Object.entries(req.headers)) if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(', ') : value);
          const request = new Request(`http://${req.headers.host}${req.url}`, {
            method: req.method, headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks)
          });
          const response = await handle(request);
          res.statusCode = response.status;
          response.headers.forEach((value, key) => { if (key !== 'set-cookie') res.setHeader(key, value); });
          const cookies = response.headers.getSetCookie?.() || [];
          if (cookies.length) res.setHeader('set-cookie', cookies.map(c => c.replace(/; Secure/, '')));
          res.end(Buffer.from(await response.arrayBuffer()));
        } catch (error) {
          console.error(error);
          res.statusCode = 500;
          res.end('dev api error');
        }
      });
    }
  };
}

export default defineConfig({
  base: process.env.GITHUB_PAGES ? '/stroy/' : '/',
  plugins: [react(), sitePlugin(), devApiPlugin()],
  build: {
    rollupOptions: {
      input: Object.fromEntries(Object.entries(PAGES).map(([key, path]) => [key, fileURLToPath(new URL(`./${path}`, import.meta.url))]))
    }
  },
  server: {host: '127.0.0.1', port: 5173}
});
