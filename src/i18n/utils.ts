import { ui, defaultLang, languages, locales } from './ui';

/**
 * Regex pattern to match language prefixes in paths (e.g., /en/, /es/)
 * Built dynamically from the languages object for extensibility
 */
export const LANG_PREFIX_PATTERN = `^/(${Object.keys(languages).join('|')})`;
export const LANG_PREFIX_REGEX = new RegExp(LANG_PREFIX_PATTERN);

/**
 * Regex to match language prefixes in slugs (e.g., en/, es/)
 * For normalizing content slugs
 */
export const SLUG_LANG_PREFIX_REGEX = new RegExp(`^(${Object.keys(languages).join('|')})/`);

/**
 * Removes language prefix from a slug
 */
export function normalizeSlug(slug: string): string {
  return slug.replace(SLUG_LANG_PREFIX_REGEX, '');
}

/**
 * Converts a slug to a post ID for DOM data attributes
 * Normalizes the slug and replaces slashes with dashes
 */
export function slugToPostId(slug: string): string {
  return normalizeSlug(slug).replace(/\//g, '-');
}

export function getLangFromUrl(url: URL) {
  const [, lang] = url.pathname.split('/');
  if (lang in ui) return lang as keyof typeof ui;
  return defaultLang;
}

export function useTranslations(lang: keyof typeof ui) {
  return function t(key: keyof (typeof ui)[typeof defaultLang]) {
    return ui[lang][key] || ui[defaultLang][key];
  };
}

/** Returns all translations and locale for client-side use */
export function getClientI18n(lang: keyof typeof ui) {
  return {
    t: ui[lang],
    locale: locales[lang],
  };
}

export function getLocalizedPath(path: string, lang: keyof typeof ui) {
  // Always use language prefix for all languages (including default)
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `/${lang}${cleanPath === '/' ? '' : cleanPath}`;
}

export function getAlternateLinks(currentPath: string) {
  return Object.keys(languages).map((lang) => ({
    lang,
    href: getLocalizedPath(currentPath.replace(LANG_PREFIX_REGEX, ''), lang as keyof typeof ui),
  }));
}

/**
 * Check if a post belongs to the specified language based on its slug/id
 * Posts are organized in folders: content/blog/es/, content/blog/en/
 */
export function isPostForLang(postId: string, lang: keyof typeof ui): boolean {
  return postId.startsWith(`${lang}/`);
}

export { languages, defaultLang };
