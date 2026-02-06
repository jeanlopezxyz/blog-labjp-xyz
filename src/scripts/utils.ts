/**
 * Client-side utility functions
 * Shared across components for consistency
 */

/**
 * Escape HTML to prevent XSS attacks
 */
export function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Format a date string relative to now
 * Uses translations from window.__i18n
 */
export function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  const { t, locale } = window.__i18n || { t: {}, locale: 'es-ES' };

  if (days === 0) return t['date.today'] || 'Hoy';
  if (days === 1) return t['date.yesterday'] || 'Ayer';
  if (days < 7) return `${days}${t['date.daysAgo'] || 'd'}`;
  if (days < 30) return `${Math.floor(days / 7)}${t['date.week'] || 'sem'}`;
  return date.toLocaleDateString(locale);
}

/**
 * Format a date for display (full format)
 */
export function formatDateFull(dateStr: string): string {
  const { locale } = window.__i18n || { locale: 'es-ES' };
  return new Date(dateStr).toLocaleDateString(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}
