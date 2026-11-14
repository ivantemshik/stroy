import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import {fileURLToPath} from 'node:url';
import {readFileSync, existsSync, readdirSync, statSync} from 'node:fs';
import {createHash} from 'node:crypto';
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
  privacy: 'privacy/index.html',
  consent: 'soglasie/index.html',
  cookies: 'cookies/index.html',
  notfound: '404.html',
  admin: 'admin/index.html'
};
const SITEMAP = ['/', '/otdelka/', '/privacy/', '/soglasie/', '/cookies/'];

// Общие куски страниц (шапка, подвал с контактами и окна) лежат в src/site/partials и вставляются
// на место комментария <!--#include имя флаги-->. В шапке у всех страниц есть переключатель светлой и тёмной темы,
// флаг doc делает кнопку «Обсудить проект» ссылкой на контакты главной.
const PARTIALS_DIR = `${root}src/site/partials/`;
const THEME_TOGGLE = '<button class="theme-toggle" type="button" data-theme-toggle aria-pressed="false" aria-label="Включить тёмную тему"><svg class="i-moon" viewBox="0 0 20 20" aria-hidden="true"><path d="M16.4 12.4A6.8 6.8 0 0 1 7.6 3.6a6.8 6.8 0 1 0 8.8 8.8Z"/></svg><svg class="i-sun" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="3.4"/><path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.3 4.3l1.4 1.4M14.3 14.3l1.4 1.4M4.3 15.7l1.4-1.4M14.3 5.7l1.4-1.4"/></svg></button>';
function includePartials(html) {
  const page = /<body[^>]*\sdata-page="([\w-]+)"/.exec(html)?.[1] || 'home';
  return html.replace(/<!--#include (\w+)((?: [\w-]+)*)\s*-->/g, (match, name, flagsRaw) => {
    const flags = new Set(flagsRaw.trim().split(/\s+/).filter(Boolean));
    const cta = flags.has('doc')
      ? '<a class="header-contact" href="/#contacts">Обсудить проект</a>'
      : '<button class="header-contact" data-open="quiz">Обсудить проект</button>';
    const ctaMobile = flags.has('doc') ? '<a class="mobile-menu-cta" href="/#contacts">Обсудить проект</a>' : '<button class="mobile-menu-cta" data-open="quiz">Обсудить проект</button>';
    const part = readFileSync(`${PARTIALS_DIR}${name}.html`, 'utf8')
      .replaceAll('{{page}}', page)
      .replaceAll('{{themeToggle}}', THEME_TOGGLE)
      .replaceAll('{{ctaMobile}}', ctaMobile)
      .replaceAll('{{cta}}', cta);
    return part.replaceAll(`data-nav="${page}"`, `data-nav="${page}" aria-current="page"`).trim();
  });
}

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
        let out = includePartials(html)
          .replaceAll('%SITE_URL%', siteUrl())
          .replaceAll('%ROBOTS%', indexable() ? 'index, follow' : 'noindex, nofollow')
          .replaceAll('%YM_ID%', process.env.VITE_YM_ID || process.env.YM_COUNTER_ID || '');
        if (!ctx.filename.includes(`${root}admin`)) out = bakeHtml(out, content);
        // Подтверждение прав в Яндекс Вебмастере и Google Search Console (задаётся после подключения домена).
        const verify = [
          process.env.YANDEX_VERIFICATION && `<meta name="yandex-verification" content="${process.env.YANDEX_VERIFICATION}" />`,
          process.env.GOOGLE_SITE_VERIFICATION && `<meta name="google-site-verification" content="${process.env.GOOGLE_SITE_VERIFICATION}" />`
        ].filter(Boolean).join('\n  ');
        if (verify && ctx.filename.endsWith(`${root}index.html`)) out = out.replace('</head>', `  ${verify}\n</head>`);
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

// Метка версии у адресов фото. Фото хранятся в браузере год (vercel.json), поэтому файл, заменённый
// под тем же именем, посетитель увидел бы только через год. Метка берётся из содержимого файла:
// заменили фото, и адрес сам стал новым, браузер скачает свежий файл.
const versions = new Map();
function fileVersion(rel) {
  const file = `${root}public/${rel}`;
  if (!existsSync(file)) return '';
  const {mtimeMs, size} = statSync(file);
  const key = `${rel}|${mtimeMs}|${size}`;
  if (!versions.has(key)) versions.set(key, createHash('sha1').update(readFileSync(file)).digest('hex').slice(0, 8));
  return versions.get(key);
}
const versionImages = html => html.replace(/((?:\/stroy)?\/(images\/[\w\-/.]+?\.(?:webp|png|jpe?g|svg|avif|gif)))(?![\w?])/g,
  (match, url, rel) => { const version = fileVersion(rel); return version ? `${url}?v=${version}` : url; });

// Фото объектов собираются в адреса прямо в скрипте фотоотчёта (src/site/objects.js),
// для них одна метка на всю папку: меняется, если заменили любое фото объекта.
function folderVersion(dir) {
  const hash = createHash('sha1');
  const walk = folder => readdirSync(folder, {withFileTypes: true})
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach(entry => entry.isDirectory() ? walk(`${folder}/${entry.name}`) : hash.update(entry.name).update(readFileSync(`${folder}/${entry.name}`)));
  if (existsSync(dir)) walk(dir);
  return hash.digest('hex').slice(0, 8);
}

// Метка ставится до обработки страницы сборщиком: адреса в srcset он подставляет в самом конце,
// и метка, добавленная позже, в них бы не попала.
function imageVersionPlugin() {
  return {
    name: 'dom-mira-image-version',
    transformIndexHtml: {order: 'pre', handler: versionImages}
  };
}

// В режиме разработки /api/* обслуживает тот же код, что и функция Vercel.
function devApiPlugin() {
  return {
    name: 'dom-mira-dev-api',
    configureServer(server) {
      // Правка шапки или подвала перезагружает страницы в режиме разработки.
      server.watcher.add(PARTIALS_DIR);
      server.watcher.on('change', file => { if (file.startsWith(PARTIALS_DIR)) server.ws.send({type: 'full-reload'}); });
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
  plugins: [react(), sitePlugin(), imageVersionPlugin(), devApiPlugin()],
  define: {__IMAGES_V__: JSON.stringify(folderVersion(`${root}public/images/objects`))},
  build: {
    rollupOptions: {
      input: Object.fromEntries(Object.entries(PAGES).map(([key, path]) => [key, fileURLToPath(new URL(`./${path}`, import.meta.url))]))
    }
  },
  server: {host: '127.0.0.1', port: 5173}
});
