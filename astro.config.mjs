import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import icon from 'astro-icon';
import { satteri } from '@astrojs/markdown-satteri';
import { enlacesExternos } from './src/lib/enlaces-externos.mjs';

export default defineConfig({
  site: 'https://blog.labjp.xyz',
  i18n: {
    defaultLocale: 'es',
    locales: ['es', 'en'],
    routing: {
      prefixDefaultLocale: true,
      redirectToDefaultLocale: false,
    },
  },
  integrations: [
    react(),
    mdx(),
    sitemap({
      changefreq: 'weekly',
      priority: 0.7,
      i18n: {
        defaultLocale: 'es',
        locales: {
          es: 'es-ES',
          en: 'en-US',
        },
      },
      // Exclude the API, the unlocalized root (it's a noindex redirect
      // shell, not real content) and tag pages (thin, duplicate-ish
      // content that shouldn't compete with real posts/categories for
      // crawl budget).
      filter: (page) =>
        !page.includes('/api/') &&
        page !== 'https://blog.labjp.xyz/' &&
        !page.includes('/tags/'),
      serialize: (item) => {
        if (item.url.includes('/blog/')) {
          item.priority = 0.8;
          item.changefreq = 'weekly';
        } else if (item.url.includes('/category/')) {
          item.priority = 0.7;
          item.changefreq = 'weekly';
        } else if (item.url.includes('/about')) {
          item.priority = 0.6;
          item.changefreq = 'monthly';
        } else if (item.url === 'https://blog.labjp.xyz/es/' || item.url === 'https://blog.labjp.xyz/en/') {
          item.priority = 1.0;
          item.changefreq = 'daily';
        }
        return item;
      },
    }),
    icon(),
  ],
  vite: {
    plugins: [tailwindcss()],
    server: {
      watch: {
        ignored: ['**/dist/**', '**/node_modules/**'],
      },
    },
    optimizeDeps: {
      exclude: ['astro:content'],
    },
    cacheDir: 'node_modules/.vite',
  },
  markdown: {
    shikiConfig: {
      theme: 'github-dark',
      wrap: true,
    },
    // Los enlaces a otros sitios abren en pestaña nueva, con rel de seguridad.
    // Los internos se dejan como están: ahí romper el botón de volver molesta.
    processor: satteri({ hastPlugins: [enlacesExternos()] }),
  },
});
