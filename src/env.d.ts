/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

import type { ui, locales } from '@/i18n/ui';

// Global i18n interface for client-side scripts
declare global {
  interface Window {
    __i18n: {
      t: (typeof ui)['es'];
      locale: (typeof locales)['es'];
    };
  }
}

export {};
