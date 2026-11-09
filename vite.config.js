import {defineConfig} from 'vite';
import {fileURLToPath} from 'node:url';

export default defineConfig({
  base: process.env.GITHUB_PAGES ? '/stroy/' : '/',
  plugins: [{
    name: 'github-pages-routes',
    transformIndexHtml(html) {
      if (!process.env.GITHUB_PAGES) return html;
      return html
        .replaceAll('href="/stroitelstvo-domov/"', 'href="/stroy/stroitelstvo-domov/"')
        .replaceAll('href="/proektirovanie/"', 'href="/stroy/proektirovanie/"')
        .replaceAll('href="/"', 'href="/stroy/"')
        .replaceAll('href="/#', 'href="/stroy/#');
    }
  }],
  build:{
    rollupOptions:{
      input:{
        main:fileURLToPath(new URL('./index.html',import.meta.url)),
        construction:fileURLToPath(new URL('./stroitelstvo-domov/index.html',import.meta.url)),
        design:fileURLToPath(new URL('./proektirovanie/index.html',import.meta.url))
      }
    }
  }
});
