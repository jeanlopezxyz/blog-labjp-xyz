/**
 * Client-side utilities for visitor identification
 */

import { STORAGE_KEYS, API_ENDPOINTS } from '@/lib/types';

/**
 * Get or create a unique visitor ID
 */
function getVisitorId(): string {
  let id = localStorage.getItem(STORAGE_KEYS.VISITOR_ID);

  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(STORAGE_KEYS.VISITOR_ID, id);
  }

  return id;
}

/**
 * Send a like to the API
 */
export async function sendLikeToAPI(slug: string): Promise<void> {
  try {
    await fetch(API_ENDPOINTS.LIKES, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug, visitorId: getVisitorId() }),
    });
  } catch {
    // Silently fail - like is already saved locally
  }
}
