/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

// Global i18n interface for client-side scripts
interface I18nGlobal {
  t: Record<string, string>;
  locale: string;
}

declare global {
  interface Window {
    __i18n: I18nGlobal;
  }
}

export {};
