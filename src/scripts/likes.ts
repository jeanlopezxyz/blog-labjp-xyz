/**
 * Client-side utilities for managing post likes
 * Import this in component scripts to avoid code duplication
 */

import { STORAGE_KEYS, type LikesStore } from '@/lib/types';

/**
 * Get all likes from localStorage
 */
function getLikes(): LikesStore {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.LIKES) || '{}');
  } catch {
    return {};
  }
}

/**
 * Save likes to localStorage
 */
function saveLikes(likes: LikesStore): void {
  localStorage.setItem(STORAGE_KEYS.LIKES, JSON.stringify(likes));
}

/**
 * Check if a post is liked
 */
export function isPostLiked(postId: string): boolean {
  return !!getLikes()[postId];
}

/**
 * Toggle like status for a post
 * @returns The new liked status
 */
export function toggleLike(postId: string): boolean {
  const likes = getLikes();
  const isLiked = !likes[postId];

  if (isLiked) {
    likes[postId] = true;
  } else {
    delete likes[postId];
  }

  saveLikes(likes);
  return isLiked;
}

/**
 * Update like button UI based on liked status
 */
export function updateLikeUI(btn: HTMLElement, isLiked: boolean): void {
  const outlineIcon = btn.querySelector('.like-icon-outline');
  const filledIcon = btn.querySelector('.like-icon-filled');

  btn.setAttribute('aria-pressed', String(isLiked));

  if (isLiked) {
    outlineIcon?.classList.add('hidden');
    filledIcon?.classList.remove('hidden');
    btn.classList.add('text-red-500');
    btn.classList.remove('text-muted-foreground');
  } else {
    outlineIcon?.classList.remove('hidden');
    filledIcon?.classList.add('hidden');
    btn.classList.remove('text-red-500');
    btn.classList.add('text-muted-foreground');
  }
}

