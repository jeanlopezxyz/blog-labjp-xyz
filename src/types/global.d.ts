import type { ui, locales } from '@/i18n/ui';

declare global {
  interface Window {
    __i18n: {
      t: (typeof ui)['es'];
      locale: (typeof locales)['es'];
    };
  }
}

export {};
