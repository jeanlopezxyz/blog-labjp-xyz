/**
 * Client-side utilities for loading and displaying post stats
 */

import { API_ENDPOINTS, type PostStats } from '@/lib/types';

export type { PostStats };

/**
 * Load stats for a single post
 */
async function loadPostStats(slug: string): Promise<PostStats | null> {
  try {
    const response = await fetch(`${API_ENDPOINTS.STATS}?slug=${slug}`);
    if (!response.ok) return null;

    const stats = await response.json() as Record<string, PostStats>;
    return stats[slug] || null;
  } catch {
    // Silently fail - stats will show defaults
    return null;
  }
}

/**
 * Load stats for multiple posts
 */
async function loadMultiplePostStats(slugs: string[]): Promise<Record<string, PostStats>> {
  if (slugs.length === 0) return {};

  try {
    const response = await fetch(`${API_ENDPOINTS.STATS}?slugs=${slugs.join(',')}`);
    if (!response.ok) return {};

    return await response.json() as Record<string, PostStats>;
  } catch {
    // Silently fail - stats will show defaults
    return {};
  }
}

/**
 * Update stats display in a container
 */
function updateStatsDisplay(
  container: Element,
  stats: PostStats,
  selectors = { likes: '.like-count', comments: '.comment-count' }
): void {
  const likeCount = container.querySelector(selectors.likes);
  const commentCount = container.querySelector(selectors.comments);

  if (likeCount) likeCount.textContent = String(stats.likes || 0);
  if (commentCount) commentCount.textContent = String(stats.comments || 0);
}

/**
 * Initialize stats for containers with data-post-stats attribute
 * Works for both single post (data-post-header-stats) and multiple posts (data-post-stats)
 */
export async function initPostStats(options?: {
  singleSelector?: string;
  multipleSelector?: string;
}): Promise<void> {
  const {
    singleSelector = '[data-post-header-stats]',
    multipleSelector = '[data-post-stats]'
  } = options || {};

  // Handle single post stats (e.g., in PostHeader)
  const singleContainer = document.querySelector(singleSelector) as HTMLElement;
  if (singleContainer) {
    const slug = singleContainer.dataset.postHeaderStats;
    if (slug) {
      const stats = await loadPostStats(slug);
      if (stats) {
        updateStatsDisplay(singleContainer, stats);
      }
    }
  }

  // Handle multiple post stats (e.g., in HomePage)
  const multipleContainers = document.querySelectorAll(multipleSelector);
  if (multipleContainers.length > 0) {
    const slugs = Array.from(multipleContainers)
      .map(el => (el as HTMLElement).dataset.postStats)
      .filter((slug): slug is string => !!slug);

    if (slugs.length > 0) {
      const allStats = await loadMultiplePostStats(slugs);

      multipleContainers.forEach((container) => {
        const slug = (container as HTMLElement).dataset.postStats;
        if (slug && allStats[slug]) {
          updateStatsDisplay(container, allStats[slug]);
        }
      });
    }
  }
}
