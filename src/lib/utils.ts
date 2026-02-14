import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { CATEGORIES, SITE } from "./constants";
import { ui, locales, defaultLang, type Lang } from "@/i18n/ui";
import { getLocalizedPath, normalizeSlug } from "@/i18n";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: Date, lang: Lang = defaultLang): string {
  return new Intl.DateTimeFormat(locales[lang], {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

export function calculateReadingTime(content: string): number {
  const WORDS_PER_MINUTE = 200;
  const wordCount = content.trim().split(/\s+/).length;
  return Math.ceil(wordCount / WORDS_PER_MINUTE);
}

const DEFAULT_CATEGORY = {
  color: "#22c55e",
  icon: "mdi:file-document-outline",
  label: "General",
} as const;

export function getCategoryInfo(categoryId?: string) {
  const category = CATEGORIES.find((c) => c.id === categoryId);
  return {
    color: category?.color ?? DEFAULT_CATEGORY.color,
    icon: category?.icon ?? DEFAULT_CATEGORY.icon,
    label: category?.label ?? categoryId ?? DEFAULT_CATEGORY.label,
  };
}

export function getCategoryGradient(color: string, intensity = 25) {
  return `linear-gradient(145deg, ${color}${intensity}, ${color}${Math.floor(intensity / 2.5)})`;
}

export function getRelativeTime(date: Date, lang: Lang = defaultLang): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const locale = locales[lang];
  const t = ui[lang];

  if (days === 0) return t['date.today'];
  if (days === 1) return t['date.yesterday'];
  if (days < 7) return `${days}${t['date.daysAgo']}`;
  if (days < 30) return `${Math.floor(days / 7)}${t['date.week']}`;
  if (days < 365) return date.toLocaleDateString(locale, { month: "short", day: "numeric" });
  return date.toLocaleDateString(locale, { year: "numeric", month: "short", day: "numeric" });
}

export function formatShortDate(date: Date, lang: Lang = defaultLang): string {
  const locale = locales[lang];
  const month = date.toLocaleDateString(locale, { month: 'short' }).toUpperCase().replace('.', '');
  const year = date.getFullYear().toString().slice(-2);
  return `${month} ${date.getDate()}, '${year}`;
}

// Social sharing URL utilities
export function getTwitterShareUrl(title: string, url: string): string {
  return `https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(url)}`;
}

export function getLinkedInShareUrl(url: string): string {
  return `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`;
}

// Blog URL utilities

/**
 * Get the relative URL for a blog post
 */
export function getBlogPostUrl(slug: string, lang: Lang = defaultLang): string {
  return getLocalizedPath(`/blog/${normalizeSlug(slug)}`, lang);
}

/**
 * Get the full URL (with domain) for a blog post
 */
export function getFullBlogPostUrl(slug: string, lang: Lang = defaultLang): string {
  return `${SITE.url}${getBlogPostUrl(slug, lang)}`;
}
